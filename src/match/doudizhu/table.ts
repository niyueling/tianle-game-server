// @ts-ignore
import {pick} from 'lodash'
import GameRecorder, {IGameRecorder} from '../../match/GameRecorder'
import alg from '../../utils/algorithm'
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "../serializeDecorator"
import {AuditPdk} from "./auditPdk";
import Card, {CardTag, CardType} from "./card"
import {CardManager} from "./cardManager";
import {groupBy, IPattern, lengthFirstThenPointGroupComparator, PatterNames, patternCompare} from "./patterns/base"
import PlayerState from './player_state'
import {PlayManager} from "./playManager";
import Room from './room'
import Rule from './Rule'
import GameCardRecord from "../../database/models/gameCardRecord";
import {GameType, shopPropType, TianleErrorCode} from "@fm/common/constants";
import enums from "./enums";
import GameCategory from "../../database/models/gameCategory";
import GoodsProp from "../../database/models/GoodsProp";
import PlayerProp from "../../database/models/PlayerProp";
import RoomTimeRecord from "../../database/models/roomTimeRecord";
import * as config from "../../config"

const stateWaitMultiple = 2 // 翻倍
const stateWaitDa = 3 // 对局中
export const stateGameOver = 4 // 不在对局中

class Status {
  current = {seatIndex: 0, step: 1}
  lastCards: Card[] = []
  lastPattern: IPattern = null
  lastIndex: number = -1
  lastPlayerMode: string = 'unknown'
  // 出牌玩家位置
  from: number
  winOrder = 0
}

abstract class Table implements Serializable {

  restJushu: number
  turn: number

  cards: Card[]
  @serialize
  players: PlayerState[]
  zhuang: PlayerState

  rule: Rule
  room: Room
  @autoSerialize
  state: number

  @autoSerialize
  status: Status

  onRoomEmpty: () => void
  onReconnect: (player: any, index: number) => void

  recorder: IGameRecorder

  @serialize
  stateData: any

  @autoSerialize
  tableState: string = ''

  cardManager: CardManager;

  playManager: PlayManager;

  // 结算
  @serialize
  audit: AuditPdk;

  // 本局倍数
  @autoSerialize
  multiple: number = 1

  // 发牌参数(记录防止重新发牌参数丢失)
  @autoSerialize
  startParams: object = {}

  // 不叫地主重复发牌次数
  resetCount: number = 0;

  // 本局明牌用户
  openCardPlayers: any[] = [];

  // 明牌倍数
  openCardMultiple: number = 1;

  // 叫地主或抢地主
  callLandlord: number = 0;

  // 全部操作完并且有多人选择抢地主
  callLandlordStatus: boolean = false;

  // 地主牌
  landlordCards: any[] = [];

  // 地主
  landload: string = null;
  protected constructor(room, rule, restJushu) {
    this.restJushu = restJushu
    this.rule = rule
    this.room = room
    this.status = new Status()
    this.listenRoom(room);

    this.initPlayers();
    this.setGameRecorder(new GameRecorder(this));
    this.cardManager = new CardManager(rule.playerCount);
    this.playManager = new PlayManager(rule);
    this.audit = new AuditPdk(rule);
    this.resetCount = 0;
    this.callLandlord = 0;
    this.multiple = 1;
    this.callLandlordStatus = false;
    this.openCardPlayers = [];
    this.openCardMultiple = 1;
    // 结算玩家
    for (const p of this.players) {
      this.audit.initData(p.model.shortId);
    }
    // console.warn("juIndex-%s, status-%s", this.room.game.juIndex, JSON.stringify(this.status));
  }

  toJSON() {
    return serializeHelp(this)
  }

  resume(tableStateJson) {
    const keys = autoSerializePropertyKeys(this)
    Object.assign(this, pick(tableStateJson.gameState, keys))
    // 还原 audit
    this.audit.recoverFromJson(tableStateJson.gameState.audit);
    if (this.status.lastCards) {
      this.status.lastCards = this.status.lastCards.map(c => Card.from(c))
    }
    if (this.status.lastPattern) {
      this.status.lastPattern.cards = this.status.lastPattern.cards.map(c => Card.from(c))
    }

    this.stateData = {}

    for (const [i, p] of this.players.entries()) {
      p.resume(tableStateJson.gameState.players[i])
    }
  }

  abstract name()
  abstract start(payload)
  abstract startStateUpdate()

  initPlayers() {
    const room = this.room;
    const rule = this.rule;
    const players = room.playersOrder.map(playerSocket => new PlayerState(playerSocket, room, rule));

    players[0].zhuang = true;
    this.zhuang = players[0];
    players.forEach(p => this.listenPlayer(p));
    this.players = players;
  }

  shuffle() {
    alg.shuffle(this.cards);
    this.turn = 1;
  }

  // 发牌
  async fapai(payload) {
    this.startParams = payload;
    this.cardManager = new CardManager(this.room.game.rule.playerCount);
    // 下一轮
    this.audit.startNewRound();

    if (payload && payload.cards) {
      payload.cards = this.cardManager.getCardValueByType(payload.cards);
    }

    const allPlayerCards = this.cardManager.genCardForEachPlayer(this.room.isPublic && !this.rule.test, payload.cards || [], this.rule.test, this.players);
    this.cards = this.cardManager.allCards();
    this.stateData = {}
    const needShuffle = this.room.shuffleData.length > 0;
    for (let i = 0; i < this.players.length; i++) {
      const initCards = this.cardManager.getCardTypesFromTag(allPlayerCards[i]);
      const p = this.players[i];
      this.audit.saveRemainCards(p.model.shortId, initCards);
      await GameCardRecord.create({
        player: p._id, shortId: p.model.shortId, username: p.model.name, cardLists: initCards, createAt: new Date(),
        room: this.room._id, juIndex: this.room.game.juIndex, game: GameType.ddz
      });
      // 判断是否使用记牌器
      const cardRecorderStatus = await this.getCardRecorder(p);
      p.onShuffle(this.restJushu, initCards, i, this.room.game.juIndex, needShuffle, allPlayerCards, cardRecorderStatus);
    }

    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }
  }

  async getCardRecorder(player) {
    const cardRecorder = await GoodsProp.findOne({propType: shopPropType.jiPaiQi}).lean();
    if (!cardRecorder || !this.rule.useRecorder) {
      return {status: false, day: 0};
    }

    let isHave = false;
    let times = 0;

    const playerProp = await PlayerProp.findOne({playerId: player._id.toString(), propId: cardRecorder.propId});

    if (playerProp) {
      // 用户是否拥有该道具
      isHave = playerProp.times === -1 || playerProp.times >= new Date().getTime();
      // 道具有效期
      times = playerProp.times === -1 || playerProp.times >= new Date().getTime() ? playerProp.times : null;
    }

    return {status: !!(isHave && times), day: times}
  };

  removeRoomListener() {
    this.room.removeListener('reconnect', this.onReconnect);
    this.room.removeListener('empty', this.onRoomEmpty);
  }

  get empty() {
    return this.players.filter(p => p).length === 0;
  }

  get playerCount() {
    return this.players.filter(p => p).length;
  }

  listenPlayer(player: PlayerState) {
    player.on(enums.da, msg => this.onPlayerDa(player, msg))
    player.on(enums.chooseMode, async msg => await this.onPlayerChooseMode(player, msg));
    player.on(enums.chooseMultiple, msg => this.onPlayerChooseMultiple(player, msg))
    player.on(enums.openDeal, msg => this.onPlayerOpenCard(player, msg))
    player.on(enums.waitForDa, async () => this.depositForPlayer(player))
    player.on(enums.waitForPlayerChooseMode, async () => this.depositForPlayerChooseMode(player))
    player.on(enums.waitForPlayerChooseMultiple, async () => this.depositForPlayerChooseMultiple(player))
    player.on(enums.guo, async () => await this.onPlayerGuo(player))
    player.on(enums.cancelDeposit, () => this.onCancelDeposit(player))
    player.on(enums.refresh, async () => {
      player.sendMessage('room/refreshReply', {ok: true, data: await this.restoreMessageForPlayer(player)});
    })
  }

  onCancelDeposit(player: PlayerState) {
    player.cancelDeposit()
    // 取消托管状态
    this.room.robotManager.disableRobot(player._id)
  }

  moveToNext(deposit = false) {
    let nextSeatIndex = this.currentPlayerStep
    // console.warn("nextSeatIndex-%s", nextSeatIndex);

    let findNext = false
    while (!findNext) {
      nextSeatIndex = (nextSeatIndex + 1) % this.rule.playerCount
      const playerState = this.players[nextSeatIndex]
      // console.warn("nextSeatIndex-%s, from-%s, playerCount-%s, status-%s", nextSeatIndex, this.status.from, this.rule.playerCount, JSON.stringify(this.room.gameState.status));

      // 转了一圈，没有更大的了
      if (nextSeatIndex === this.status.from) {
        this.status.lastPattern = null
        this.status.lastCards = []
        if (playerState.cards.length === 0 && playerState.foundFriend) {
          nextSeatIndex = playerState.teamMate
          this.cleanCards(playerState)
          findNext = true
        }
      }

      if (playerState.cards.length > 0) {
        findNext = true
      } else {
        this.cleanCards(playerState)
      }
    }
    this.status.current.seatIndex = nextSeatIndex
    this.status.current.step += 1

    // 设置下家托管
    if (deposit) {
      this.players[this.status.current.seatIndex].emitter.emit('waitForDa');
    }
  }

  cleanCards(player: PlayerState) {
    if (player.cleaned) {
      return
    }
    this.room.broadcast('game/cleanCards', {ok: true, data: {index: player.index}})
    player.cleaned = true
  }

  get currentPlayerStep() {
    return this.status.current.seatIndex
  }

  isCurrentStep(player) {
    return this.currentPlayerStep === player.seatIndex
  }

  daPaiFail(player, info = TianleErrorCode.systemError) {
    player.sendMessage('game/daCardReply', {ok: false, info, data: {roomId: this.room._id, deposit: player.onDeposit}})
  }

  guoPaiFail(player, info = TianleErrorCode.systemError) {
    player.sendMessage('game/guoCardReply', {ok: false, info})
  }

  abstract findFullMatchedPattern(cards: Card[]): IPattern

  async onPlayerDa(player: PlayerState, {cards: plainCards}) {
    if (!this.isCurrentStep(player)) {
      return;
    }
    // 转换成 Card 类型
    const cards = plainCards.map(Card.from);
    const currentPattern = this.playManager.getPatternByCard(cards, player.cards);
    this.status.lastIndex = this.currentPlayerStep
    this.status.lastPlayerMode = player.mode;
    // 检查最后几张
    if (player.tryDaPai(cards.slice()) && patternCompare(currentPattern, this.status.lastPattern) > 0) {
      await this.daPai(player, cards, currentPattern)
    } else {
      // console.warn("tryDaPai-%s, currentPattern-%s, this.status.lastPattern-%s, patternCompare-%s", player.tryDaPai(cards.slice()), JSON.stringify(currentPattern), JSON.stringify(this.status.lastPattern), patternCompare(currentPattern, this.status.lastPattern));
      this.cannotDaPai(player, cards, this.playManager.noPattern)
    }
  }

  async daPai(player: PlayerState, cards: Card[], pattern: IPattern) {
    player.daPai(cards.slice(), pattern);
    // if (player.isGuoDeposit) {
    //   player.onDeposit = false;
    //   player.isGuoDeposit = false;
    //   player.depositTime = 15;
    // }

    // 出牌次数+1
    this.audit.addPlayTime(player.model.shortId, cards);
    const remains = player.remains
    this.status.from = this.status.current.seatIndex
    this.status.lastPattern = pattern
    this.status.lastCards = cards
    if (pattern.name === PatterNames.bomb) {
      player.recordBomb(pattern);
      // 添加炸弹次数
      this.audit.addBoomTime(player.model.shortId);
      this.players.map(p => {
        p.multiple *= 2;
        p.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: p.index, multiple: p.multiple, changeMultiple: 2}});
      });
      const usedJoker = pattern.cards.filter(c => c.type === CardType.Joker).length
      player.unusedJokers -= usedJoker;
    }
    let teamMateCards = [];
    if (remains === 0) {
      player.winOrder = this.status.winOrder++;
      teamMateCards = this.teamMateCards(player)
    }
    this.moveToNext(true)
    player.sendMessage('game/daCardReply', {ok: true, data: {remains, teamMateCards, onDeposit: player.onDeposit}})
    const isGameOver = this.isGameOver()
    const nextPlayer = isGameOver ? -1 : this.currentPlayerStep

    this.room.broadcast('game/otherDa', {ok: true, data: {
        cards,
        remains,
        index: player.seatIndex,
        next: nextPlayer,
        pattern: this.status.lastPattern,
        bomb: this.bombScorer(pattern),
        newBombScore: player.bombScore(this.bombScorer)
      }})
    this.notifyTeamMateWhenTeamMateWin(player, cards)

    if (this.players[nextPlayer]) {
      const nextPlayerState = this.players[nextPlayer];
      // const checkNextPlayerDa = await this.checkNextPlayerDa(nextPlayer);
      // console.warn("index-%s, status-%s", nextPlayer, checkNextPlayerDa);
      // if (!checkNextPlayerDa && !nextPlayerState.onDeposit) {
      //   nextPlayerState.depositTime = 5;
      //   nextPlayerState.isGuoDeposit = true;
      // }

      nextPlayerState.emitter.emit('waitForDa');
    }
    if (isGameOver) {
      this.showGameOverPlayerCards()
      this.room.game.saveLastWinner(player.model.shortId);
      this.status.current.seatIndex = -1
      await this.gameOver()
    }
  }

  async checkNextPlayerDa(index) {
    const nextPlayerState = this.players[index];
    const prompts = this.playManager.getPlayerCardByPattern(this.status.lastPattern, nextPlayerState.cards);
    return prompts.length > 0;
  }

  async restoreMessageForPlayer(player: PlayerState) {
    const index = this.atIndex(player)
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();
    const pushMsg = {
      index, status: [],
      category,
      currentPlayer: this.status.current.seatIndex,
      lastPattern: this.status.lastPattern,
      lastIndex: this.status.lastIndex,
      from: this.status.from,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
    }
    for (let i = 0; i < this.players.length; i++) {
      if (i === index) {
        pushMsg.status.push(await this.players[i].statusForSelf(this))
      } else {
        pushMsg.status.push(await this.players[i].statusForOther(this))
      }
    }

    return pushMsg;
  }

  showGameOverPlayerCards() {
    const playersCard = []
    this.players.forEach(p => {
      if (p.cards.length > 0) {
        playersCard.push({index: p.index, cards: p.cards})
      }
    })
    this.room.broadcast('game/gameOverPlayerCards', {ok: true, data: {
        playersCard
      }})
  }

  abstract findMatchedPatternByPattern(currentPattern: IPattern, cards: Card[]): Card[][];

  // 托管出牌
  depositForPlayer(nextPlayerState: PlayerState) {
    nextPlayerState.deposit(async () => {
      if (this.currentPlayerStep !== nextPlayerState.index || nextPlayerState.isRobot) {
        return ;
      }

      const prompts = this.playManager.getCardByPattern(this.status.lastPattern, nextPlayerState.cards, nextPlayerState.mode, this.status.lastPlayerMode);
      if (prompts.length > 0) {
        //如果是自己出牌，过滤下牌型
        const newPrompts = this.status.lastPattern ? prompts : this.filterPromptsCards(nextPlayerState, prompts);
        await this.onPlayerDa(nextPlayerState, {cards: newPrompts[0]})
      } else {
        await this.onPlayerGuo(nextPlayerState)
      }
    })
  }

  // 根据情况过滤不合适的牌型
  filterPromptsCards(nextPlayerState, prompts) {
    const newPrompts = [];
    // 如果是地主出牌，直接返回
    if (nextPlayerState.mode === enums.landlord) {
      return prompts;
    }

    // 如果自己只剩最后一手牌，则直接出牌
    const nextPlayerPrompt = prompts.filter(prompt => prompt.length === nextPlayerState.cards.length);
    if (nextPlayerPrompt.length) {
      console.warn("index %s cards %s prompts %s nextPlayerPrompt %s can finish game", nextPlayerState.seatIndex, JSON.stringify(nextPlayerState.cards), JSON.stringify(prompts), JSON.stringify(nextPlayerPrompt));
      return nextPlayerPrompt;
    }

    // 判断队友
    const famerIndex = this.players.findIndex(p => p.mode === enums.farmer && p._id.toString() !== nextPlayerState._id.toString());
    console.warn("famerIndex-%s", famerIndex);
    if (famerIndex !== -1) {
      const famer = this.players[famerIndex];

      // 计算队友单张数量
      const famerSingleCards = groupBy(famer.cards.filter(c => c), card => card.point)
        .filter(g => g.length === 1)
        .sort(lengthFirstThenPointGroupComparator)
        .map(grp => {
          return [grp[0]]
        });

      // 计算队友对子数量
      const famerDoubleCards = groupBy(famer.cards.filter(c => c), card => card.point)
        .filter(g => g.length === 2)
        .sort(lengthFirstThenPointGroupComparator)
        .map(grp => {
          return [grp[0], grp[1]]
        });

      console.warn("famer index %s mode %s singleCardCount %s doubleCardCount %s", famer.seatIndex, famer.mode,
        JSON.stringify(famerSingleCards), JSON.stringify(famerDoubleCards));

      // 如果队友只剩一张牌，打出队友可以单吃的单牌
      if (famerSingleCards.length === 1 && famer.cards.length === 1) {
        for (let i = 0; i < prompts.length; i++) {
          if (prompts[i].length === 1 && prompts[i][0].point < famerSingleCards[0][0].point) {
            return [prompts[i]];
          }
        }
      }

      // 如果队友只剩一个对子，打出队友可以单吃的对子
      if (famerDoubleCards.length === 1 && famer.cards.length === 2) {
        for (let i = 0; i < prompts.length; i++) {
          if (prompts[i].length === 2 && prompts[i][0].point < famerDoubleCards[0][0].point) {
            return [prompts[i]];
          }
        }
      }
    }

    // 查找到地主
    const landloadIndex = this.players.findIndex(p => p.mode === enums.landlord);
    const landload = this.players[landloadIndex];

    // 计算地主单张数量
    const singleCards = groupBy(landload.cards.filter(c => c), card => card.point)
      .filter(g => g.length === 1)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => {
        return [grp[0]]
      });

    // 计算地主对子数量
    const doubleCards = groupBy(landload.cards.filter(c => c), card => card.point)
      .filter(g => g.length === 2)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => {
        return [grp[0], grp[1]]
      });

    // 如果地主只剩一张牌，则过滤掉所有比地主小的单牌
    if (landload.cards.length === 1) {
      for (let i = 0; i < prompts.length; i++) {
        if (prompts[i].length > 1 || (prompts[i].length === 1 && prompts[i][0].point >= landload.cards[0].point)) {
          newPrompts.push(prompts[i]);
        }
      }
    }

    // 如果地主只剩一个对子，则过滤掉所有对子
    if (doubleCards.length === 1 && landload.cards.length === 2) {
      for (let i = 0; i < prompts.length; i++) {
        if (prompts[i].length !== 2) {
          newPrompts.push(prompts[i]);
        }
      }

      // 如果过滤后没有合适的出牌，则出一个单张
      if (!newPrompts.length) {
        newPrompts.push([prompts[0][0]]);
      }
    }

    console.warn(" nextPlayerIndex %s mode %s singleCardCount %s doubleCardCount %s prompts %s newPrompts %s", nextPlayerState.seatIndex, nextPlayerState.mode,
      JSON.stringify(singleCards), JSON.stringify(doubleCards), JSON.stringify(prompts), JSON.stringify(newPrompts));

    // 如果没有可以出牌的牌型，则按照原牌型出牌
    if (!newPrompts.length) {
      return prompts;
    }

    return newPrompts;
  }

  broadcastLandlordAndPlayer() {
    // 庄家成为地主
    this.zhuang.mode = enums.landlord;

    // 修改地主倍数
    this.zhuang.multiple = this.multiple * 2;
    this.zhuang.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: this.zhuang.index, multiple: this.zhuang.multiple, changeMultiple: 2}});

    // 将地主牌发给用户
    const cards = this.cardManager.getLandlordCard();
    this.landlordCards = cards;
    this.zhuang.cards = [...this.zhuang.cards, ...cards];
    this.room.broadcast("game/openLandlordCard", {ok: true, data: {seatIndex: this.zhuang.index, landlordCards: cards, cards: this.zhuang.cards}});

    // 设置用户为不托管
    this.players.map(p => p.onDeposit = false);

    const startDaFunc = async() => {
      this.status.current.seatIndex = this.zhuang.index;

      // 设置状态为选择翻倍
      this.state = 2;

      // 下发开始翻倍消息
      this.room.broadcast('game/startChooseMultiple', {ok: true, data: {}});

      // 托管状态自动选择不翻倍
      this.players.map(p => this.depositForPlayerChooseMultiple(p));
    }

    setTimeout(startDaFunc, 1000);
  }

  async onPlayerChooseMode(player, msg) {
    if (this.currentPlayerStep !== player.index || this.state === stateGameOver) {
      return;
    }

    let mode = msg.mode;
    if (mode === enums.landlord) {
      // 如果用户已经选择叫地主，则重置其他用户为农民
      if (player.mode !== enums.unknown) {
        for (let i = 0; i < this.players.length; i++) {
          if (this.players[i]._id.toString() !== player._id.toString()) {
            this.players[i].mode = enums.farmer;
          }
        }
      }

      // 判断是叫地主还是抢地主，叫地主不翻倍，抢地主翻倍
      if (this.callLandlord) {
        this.multiple *= 2;
        this.players.map((p) => {
          p.multiple = this.multiple;

          // 如果是农民，倍数减半
          if (p.mode === enums.farmer && this.callLandlordStatus) {
            p.multiple = p.multiple / 2;
          }

          p.sendMessage("game/multipleChange", {
            ok: true,
            data: {seatIndex: p.index, multiple: p.multiple, changeMultiple: 2}
          });
        })
      }

      this.callLandlord++;
    }

    player.mode = mode;
    this.room.broadcast("game/chooseModeReply", {
      ok: true,
      data: {seatIndex: player.index, mode: player.mode, multiple: this.multiple, deposit: false}
    });

    // 如果所有人都选择模式
    let cIndex = this.players.findIndex(p => p.mode === enums.unknown);
    let landlordCount = this.players.filter(p => p.mode === enums.landlord).length;
    // 找到第一个选择地主重新选择
    let firstLandlordIndex = this.players.findIndex(p => p.mode === enums.landlord);
    let nextPlayer = (player.index + 1) % this.rule.playerCount;
    this.status.current.seatIndex = nextPlayer;

    // 所有人都选择模式，并且只有一个人选择地主, 则从地主开始打牌
    if (cIndex === -1 && (landlordCount === 1 || (landlordCount > 1 && player.zhuang))) {
      // 如果倍数=1，表示无人抢地主，倍数翻倍
      if (this.callLandlord === 1) {
        this.multiple *= 2;
        this.players.map((p) => {
          p.multiple = (p.mode === enums.landlord ? this.multiple : this.multiple / 2);
          p.sendMessage("game/multipleChange", {
            ok: true,
            data: {seatIndex: p.index, mode: p.mode, multiple: p.multiple, changeMultiple: 2}
          });
        })
      }

      // 进入第二轮抢地主，并且用户选择农民，地主翻倍
      if (msg.mode === enums.farmer && this.callLandlordStatus) {
        this.players.map((p) => {
          p.multiple = (p.mode === enums.landlord ? this.multiple * 2 : this.multiple);
          p.sendMessage("game/multipleChange", {
            ok: true,
            data: {seatIndex: p.index, mode: p.mode, multiple: p.multiple, changeMultiple: 2}
          });
        })
      }

      // 如果地主有多位，选择最后一位作为地主
      if (landlordCount > 1) {
        const landlord = this.players.filter(p => p.mode === enums.landlord);
        firstLandlordIndex = this.players[landlord.length - 1].index;
      }

      // 将地主牌发给用户
      const cards = this.cardManager.getLandlordCard();
      this.landlordCards = cards;
      this.players[firstLandlordIndex].cards = [...this.players[firstLandlordIndex].cards, ...cards];
      this.landload = this.players[firstLandlordIndex]._id;
      this.players[firstLandlordIndex].landloadCount++;
      this.room.broadcast("game/openLandlordCard", {
        ok: true,
        data: {
          seatIndex: this.players[firstLandlordIndex].index,
          landlordCards: cards,
          multiple: this.players[firstLandlordIndex].multiple
        }
      });

      if (this.rule.allowDouble) {
        //设置状态为选择翻倍
        this.state = stateWaitMultiple;
        // 设置用户为不托管
        this.players.map(p => p.onDeposit = false);

        const startDaFunc = async () => {
          this.status.current.seatIndex = this.players[firstLandlordIndex].index;

          // 下发开始翻倍消息
          this.room.broadcast('game/startChooseMultiple', {ok: true, data: {}});

          // 托管状态自动选择不翻倍
          this.players.map(p => p.emitter.emit(enums.waitForPlayerChooseMultiple));
        }

        setTimeout(startDaFunc, 500);
      } else {
        //设置状态为对局中
        this.state = stateWaitDa;
        // 设置用户为不托管
        this.players.map(p => p.onDeposit = false);

        const startDaFunc = async () => {
          this.status.current.seatIndex = this.players[firstLandlordIndex].index;

          this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}})
          this.players[this.currentPlayerStep].emitter.emit('waitForDa');
        }

        setTimeout(startDaFunc, 500);
      }

      return;
    }

    // 所有人都选择模式，并且没人选择地主,则重新发牌
    if (cIndex === -1 && landlordCount === 0) {
      if (this.resetCount === 2) {
        return this.broadcastLandlordAndPlayer();
      }

      this.resetCount++;
      this.players.map(p => {
        this.resetPlayerConfig(p);
      });
      this.state = stateGameOver;
      this.start(this.startParams);
      return;
    }

    // 有多人选择地主,让第一个用户重新选择模式
    if (cIndex === -1 && landlordCount > 1) {
      if (firstLandlordIndex !== -1) {
        nextPlayer = firstLandlordIndex;
        this.callLandlordStatus = true;
      }
    }

    if (this.players[nextPlayer]) {
      const nextPlayerState = this.players[nextPlayer];
      this.room.broadcast('game/startChooseMode', {ok: true, data: {index: nextPlayer}})
      nextPlayerState.emitter.emit(enums.waitForPlayerChooseMode);
    }
  }

  resetPlayerConfig(player) {
    player.mode = enums.unknown;
    player.openMultiple = 1;
    player.onDeposit = false;
    player.isOpenCard = false;
    player.multiple = 1;
    this.multiple = 1;
  }

  onPlayerChooseMultiple(player, msg) {
    if (this.currentPlayerStep === -1) {
      return ;
    }

    player.isMultiple = true;
    player.double = msg.double;
    let addMultiple = 0;
    this.room.broadcast("game/chooseMultipleReply", {ok: true, data: {seatIndex: player.index, isMultiple: player.isMultiple, double: player.double}});

    if (player.double > 1) {
      addMultiple = player.multiple * player.double - player.multiple;
      player.multiple *= player.double;
      player.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: player.index, multiple: player.multiple, changeMultiple: msg.double}});

      // 翻倍用户为农民，地主跟着加翻倍倍数
      if (player.mode === enums.farmer) {
        const playerIndex = this.players.findIndex(p => p.mode === enums.landlord);
        if (playerIndex !== -1) {
          const p = this.players[playerIndex];
          p.multiple += addMultiple;
          p.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: p.index, multiple: p.multiple, changeMultiple: -1}});
        }
      }

      // 翻倍用户为地主，所有农民跟着翻倍
      if (player.mode === enums.landlord) {
        for (let i = 0; i < this.players.length; i++) {
          const p = this.players[i];
          if (p.mode === enums.farmer) {
            p.multiple *= msg.double;
            p.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: p.index, multiple: p.multiple, changeMultiple: p.double}});
          }
        }
      }
    }

    const isAllChoose = this.players.filter(value => value.isMultiple).length >= this.rule.playerCount;

    if (isAllChoose) {
      const startDa = async() => {
        //设置状态为对局中
        this.state = stateWaitDa;
        // 设置用户为不托管
        this.players.map(p => p.onDeposit = false);

        this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}})
        this.players[this.currentPlayerStep].emitter.emit('waitForDa');
        // this.depositForPlayer(this.players[this.currentPlayerStep]);
      }

      setTimeout(startDa, 2000);
    }
  }

  onPlayerOpenCard(player, msg) {
    if (this.currentPlayerStep === -1) {
      return ;
    }
    if (!this.rule.allowOpenCard) {
      player.sendMessage("game/openDealReply", {ok: false, info: TianleErrorCode.systemError});
    }

    player.isOpenCard = true;
    player.openMultiple = msg.multiple;

    // 如果明牌用户倍数更高，则设置对局倍数
    if (msg.multiple > this.openCardMultiple) {
      this.multiple *= msg.multiple;
      this.openCardMultiple = msg.multiple;
      this.players.map((p) => {
        p.multiple *= msg.multiple;
        p.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: p.index, multiple: p.multiple, changeMultiple: msg.multiple}});
      })
    }

    this.openCardPlayers.push(player.index);

    this.room.broadcast("game/openDealReply", {ok: true, data: {index: player.index, isOpenCard: player.isOpenCard, multiple: player.openMultiple, cards: player.cards}});
  }

  async checkChooseLandload(player) {
    // 双王/4个二必叫
    const jokerCount = player.cards.filter(c => c.type === CardType.Joker).length;
    const twoCount = player.cards.filter(c => c.point === 15).length;
    const aCount = player.cards.filter(c => c.point === 14).length;
    const kCount = player.cards.filter(c => c.point === 13).length;
    const qCount = player.cards.filter(c => c.point === 12).length;

    // 计算用户拥有的炸弹
    const bombs = [];
    for (let i = CardTag.ha; i <= CardTag.hk; i++) {
      const cardCount = player.cards.filter(c => c.value === i).length;
      if (cardCount === 4) {
        bombs.push(i);
      }
    }

    if (jokerCount === 2) {
      bombs.push(14);
    }

    // 好友房规则设置双王，4个2必叫
    if (this.rule.mustCallLandlord && (jokerCount === 2 || twoCount === 4)) {
      return true;
    }

    // 如果手上有2个炸弹或者王炸或者4个2必叫
    if (bombs.length >= 2 || jokerCount === 2 || twoCount === 4) {
      return true;
    }

    // 3个2带1个炸弹必叫
    if (twoCount === 3 && bombs.length === 1) {
      return true;
    }

    // 3个2带3个A必叫
    if (twoCount === 3 && aCount === 3) {
      return true;
    }

    // 2个2带A炸必叫
    if (twoCount === 2 && aCount === 4) {
      return true;
    }

    // 4个A+3个K必叫
    if (aCount === 4 && kCount === 3) {
      return true;
    }

    // 2个2+3个A+3个K必叫
    if (twoCount === 2 && aCount === 3 && kCount === 3) {
      return true;
    }

    // 单炸+3个A+3个K必叫
    if (bombs.length === 1 && aCount === 3 && kCount === 3) {
      return true;
    }

    // 单炸+3个A+3个Q必叫
    if (bombs.length === 1 && aCount === 3 && qCount === 3) {
      return true;
    }

    return false;
  }

  // 托管选择地主
  depositForPlayerChooseMode(player: PlayerState) {
    player.deposit(async () => {
      if (this.currentPlayerStep !== player.index || this.state === stateGameOver) {
        return ;
      }

      player.onDeposit = false;
      let mode = enums.farmer;

      const landloadStatus = await this.checkChooseLandload(player);

      if (player.mode !== enums.farmer && landloadStatus) {
        mode = enums.landlord;
        this.callLandlord++;

        // 如果用户已经选择叫地主，则重置其他用户为农民
        if (player.mode !== enums.unknown) {
          for (let i = 0; i < this.players.length; i++) {
            if (this.players[i]._id.toString() !== player._id.toString()) {
              this.players[i].mode = enums.farmer;
            }
          }
        }
      }

      player.mode = mode;
      this.room.broadcast("game/chooseModeReply", {ok: true, data: {seatIndex: player.index, mode: player.mode, multiple: this.multiple, deposit: true}});
      this.moveToNext();

      // 如果所有人都选择模式
      let cIndex = this.players.findIndex(p => p.mode === enums.unknown);
      let landlordCount = this.players.filter(p => p.mode === enums.landlord).length;
      // 找到第一个选择地主重新选择
      let firstLandlordIndex = this.players.findIndex(p => p.mode === enums.landlord);
      let nextPlayer = this.currentPlayerStep;

      // console.warn("unknownCount-%s, landlordCount-%s, firstLandlordIndex-%s, nextPlayer-%s", cIndex, landlordCount, firstLandlordIndex, nextPlayer);

      // 所有人都选择模式，并且只有一个人选择地主, 则从地主开始打牌
      if (cIndex === -1 && (landlordCount === 1 || (landlordCount > 1 && player.zhuang))) {
        // 如果倍数=1，表示无人抢地主，倍数翻倍
        if (this.callLandlord === 1) {
          this.multiple *= 2;
          this.players.map((p) => {
            p.multiple = (p.mode === enums.landlord ? this.multiple : this.multiple / 2);
            p.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: p.index, multiple: p.multiple, changeMultiple: 2}});
          })
        }

        // 进入第二轮抢地主，并且用户选择农民，地主翻倍
        if (mode === enums.farmer && this.callLandlordStatus) {
          this.players.map((p) => {
            p.multiple = (p.mode === enums.landlord ? this.multiple * 2 : this.multiple);
            p.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: p.index, mode: p.mode, multiple: p.multiple, changeMultiple: 2}});
          })
        }

        // 如果地主有多位，选择最后一位作为地主
        if (landlordCount > 1) {
          const landlord = this.players.filter(p => p.mode === enums.landlord);
          firstLandlordIndex = this.players[landlord.length - 1].index;
        }

        // 将地主牌发给用户
        const cards = this.cardManager.getLandlordCard();
        this.landlordCards = cards;
        this.players[firstLandlordIndex].cards = [...this.players[firstLandlordIndex].cards, ...cards];
        this.landload = this.players[firstLandlordIndex]._id;
        this.players[firstLandlordIndex].landloadCount++;
        this.room.broadcast("game/openLandlordCard", {ok: true, data: {seatIndex: this.players[firstLandlordIndex].index, multiple: this.players[firstLandlordIndex].multiple, landlordCards: cards}});

        if (this.rule.allowDouble) {
          //设置状态为选择翻倍
          this.state = stateWaitMultiple;
          // 设置用户为不托管
          this.players.map(p => p.onDeposit = false);

          const startDaFunc = async() => {
            this.status.current.seatIndex = this.players[firstLandlordIndex].index;

            // 下发开始翻倍消息
            this.room.broadcast('game/startChooseMultiple', {ok: true, data: {}});

            // 托管状态自动选择不翻倍
            this.players.map(p => p.emitter.emit(enums.waitForPlayerChooseMultiple));
          }

          setTimeout(startDaFunc, 500);
        } else {
          //设置状态为对局中
          this.state = stateWaitDa;
          // 设置用户为不托管
          this.players.map(p => p.onDeposit = false);

          const startDaFunc = async() => {
            this.status.current.seatIndex = this.players[firstLandlordIndex].index;

            this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}})
            this.players[this.currentPlayerStep].emitter.emit('waitForDa');
          }

          setTimeout(startDaFunc, 500);
        }

        return ;
      }

      // 所有人都选择模式，并且没人选择地主,则重新发牌
      if (cIndex === -1 && landlordCount === 0) {
        if (this.resetCount === 2) {
          return this.broadcastLandlordAndPlayer();
        }

        this.resetCount++;
        this.players.map(p => {
          this.resetPlayerConfig(p);
        });
        this.state = stateGameOver;
        this.start(this.startParams);
        return ;
      }

      // 有多人选择地主,让第一个用户重新选择模式
      if (cIndex === -1 && landlordCount > 1) {
        if (firstLandlordIndex !== -1) {
          nextPlayer = firstLandlordIndex;
          this.status.current.seatIndex = nextPlayer;
          this.callLandlordStatus = true;
        }
      }

      if (this.players[nextPlayer]) {
        const nextPlayerState = this.players[nextPlayer];
        this.room.broadcast('game/startChooseMode', {ok: true, data: {index: nextPlayer}})
        nextPlayerState.emitter.emit(enums.waitForPlayerChooseMode);

        console.warn("deposit nextPlayer-%s currentPlayerStep-%s", nextPlayer, this.currentPlayerStep);
      }
    })
  }

  // 托管选择翻倍
  depositForPlayerChooseMultiple(player: PlayerState) {
    player.deposit(async () => {
      if (player.isMultiple || this.state === stateGameOver) {
        return ;
      }

      // 计算用户拥有的炸弹
      const jokerCount =   player.cards.filter(c => c.type === CardType.Joker).length;
      const bombs = [];
      for (let i = CardTag.ha; i <= CardTag.hk; i++) {
        const cardCount = player.cards.filter(c => c.value === i).length;
        if (cardCount === 4) {
          bombs.push(i);
        }
      }

      if (jokerCount === 2) {
        bombs.push(14);
      }

      player.isMultiple = true;
      player.onDeposit = false;
      const double = bombs.length >= 2 ? 2 : 1;
      player.double = double;
      let addMultiple = 0;
      this.room.broadcast("game/chooseMultipleReply", {ok: true, data: {seatIndex: player.index, isMultiple: player.isMultiple, double: player.double}});

      if (player.double > 1) {
        addMultiple = player.multiple * player.double - player.multiple;
        player.multiple *= double;
        player.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: player.index, multiple: player.multiple, changeMultiple: double}});

        // 翻倍用户为农民，地主跟着加翻倍倍数
        if (player.mode === enums.farmer) {
          const playerIndex = this.players.findIndex(p => p.mode === enums.landlord);
          if (playerIndex !== -1) {
            const p = this.players[playerIndex];
            p.multiple += addMultiple;
            p.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: p.index, multiple: p.multiple, changeMultiple: -1}});
          }
        }

        // 翻倍用户为地主，所有农民跟着翻倍
        if (player.mode === enums.landlord) {
          for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i];
            if (p.mode === enums.farmer) {
              p.multiple *= double;
              p.sendMessage("game/multipleChange", {ok: true, data: {seatIndex: p.index, multiple: p.multiple, changeMultiple: -1}});
            }
          }
        }
      }

      const isAllChoose = this.players.filter(value => value.isMultiple).length >= this.rule.playerCount;

      if (isAllChoose) {
        const startDa = async() => {
          //设置状态为选择翻倍
          this.state = stateWaitDa;
          // 设置用户为不托管
          this.players.map(p => p.onDeposit = false);

          this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}})
          this.players[this.currentPlayerStep].emitter.emit('waitForDa');
          // this.depositForPlayer(this.players[this.currentPlayerStep]);
        }

        setTimeout(startDa, 2000);
      }
    })
  }

  abstract isGameOver(): boolean

  cannotDaPai(player, cards, noPattern) {
    player.sendMessage('game/daCardReply', {
      ok: false,
      info: TianleErrorCode.cardDaError,
      data: {index: player.index, daCards: cards, inHandle: player.cards, noPattern}

    })
  }

  canGuo(): boolean {
    return this.status.lastPattern !== null
  }

  async onPlayerGuo(player) {
    if (!this.isCurrentStep(player)) {
      return
    }

    if (!this.canGuo()) {
      player.sendMessage("game/guoCardReply", {ok: false, info: TianleErrorCode.guoError});
      return
    }

    this.guoPai(player)

    const nextPlayer = this.currentPlayerStep

    if (this.players[nextPlayer]) {
      const nextPlayerState = this.players[nextPlayer]
      // const checkNextPlayerDa = await this.checkNextPlayerDa(nextPlayer);
      // console.warn("index-%s, status-%s", nextPlayer, checkNextPlayerDa);
      // if (!checkNextPlayerDa && !nextPlayerState.onDeposit) {
      //   nextPlayerState.depositTime = 5;
      //   nextPlayerState.isGuoDeposit = true;
      // }

      nextPlayerState.emitter.emit('waitForDa');
    }
  }

  guoPai(player: PlayerState) {
    player.guo()
    // if (player.isGuoDeposit) {
    //   player.onDeposit = false;
    //   player.isGuoDeposit = false;
    //   player.depositTime = 15;
    // }

    player.sendMessage("game/guoCardReply", {ok: true, data: {}})
    this.moveToNext(true)
    this.room.broadcast("game/otherGuo", {ok: true, data: {
        index: player.seatIndex,
        next: this.currentPlayerStep,
        pattern: this.status.lastPattern,
      }})
  }

  abstract bombScorer(bomb: IPattern): number;

  atIndex(player: PlayerState) {
    return this.players.findIndex(p => p._id === player._id)
  }

  async gameOver() {
    // this.audit.print();
    const states = this.players.map(p => {
      const auditInfo = this.audit.currentRound[p.model.shortId];
      return {
        model: p.model,
        index: p.index,
        score: p.balance,
        multiple: p.multiple,
        detail: p.detailBalance,
        // 统计信息
        audit: {
          remainCards: auditInfo.remainCards,
          orderList: auditInfo.orderList,
          springScore: auditInfo.springScore,
          antSpringScore: auditInfo.antSpringScore,
          boomTimes: auditInfo.boomTimes,
        },
      }
    })

    const gameOverMsg = {
      states,
      gameType: GameType.ddz,
      juShu: this.restJushu,
      isPublic: this.room.isPublic,
      juIndex: this.room.game.juIndex,
      creator: this.room.creator.model._id,
    }
    this.room.broadcast('game/gameOveReply', {ok: true, data: gameOverMsg})
    this.stateData.gameOver = gameOverMsg

    let firstPlayer = this.players.find(p => p.cards.length === 0)

    await this.roomGameOver(states, firstPlayer._id);
  }

  async roomGameOver(states, nextStarterIndex: string) {
    await this.room.gameOver(states, nextStarterIndex)
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      let m = await RoomTimeRecord.findOne({ roomId: this.room._id });
      if (m) {
        const currentTime = new Date().getTime();
        const startTime = Date.parse(m.createAt);

        console.warn("startTime %s currentTime %s", startTime, currentTime);

        if (currentTime - startTime > config.game.dissolveTime) {
          return await this.room.forceDissolve();
        }
      }

      const player = this.players[index];
      this.replaceSocketAndListen(player, playerMsgDispatcher);
      const content = await this.reconnectContent(index, player);
      player.sendMessage('game/reconnect', {ok: true, data: content});
    })

    room.once('empty',
      this.onRoomEmpty = async () => {
        await this.room.forceDissolve();
      })
  }

  replaceSocketAndListen(player, playerMsgDispatcher) {
    player.reconnect(playerMsgDispatcher)
    this.listenPlayer(player)
  }

  async reconnectContent(index, reconnectPlayer: PlayerState): Promise<any> {
    const state = this.state
    const stateData = this.stateData
    const juIndex = this.room.game.juIndex

    const status = this.players.map(async player => {
      return player._id.toString() === reconnectPlayer._id.toString() ? await player.statusForSelf(this) : await player.statusForOther(this)
    })

    return {
      index,
      landlordCards: this.landlordCards,
      state,
      juIndex,
      stateData,
      status
    }
  }

  setGameRecorder(recorder) {
    this.recorder = recorder
    for (const p of this.players) {
      p.setGameRecorder(recorder)
    }
  }

  // removeListeners(player) {
  //   player.removeListenersByNames(this.listenerOn)
  // }

  destroy() {
    this.removeRoomListener()
    this.players = [];
  }

  private notifyTeamMateWhenTeamMateWin(player: PlayerState, daCards: Card[]) {
    const teamMate = this.players[player.teamMate]
    if (teamMate && teamMate.cards.length === 0) {
      teamMate.sendMessage('game/teamMateCards', {ok: true, data: {cards: player.cards, daCards}})
    }
  }

  teamMateCards(player: PlayerState): Card[] {
    if (player.cards.length > 0) {
      return []
    }

    const teamMate = this.players[player.teamMate]
    if (teamMate) {
      return teamMate.cards
    }
    return []
  }

  // 根据出牌模式出牌
  promptWithPattern(player: PlayerState) {
    // 下家保单, 出最大的牌
    if (this.isNextPlayerHasOneCard(player) &&
      this.status.lastPattern.name === PatterNames.single) {
      const card = player.cards.sort((c1, c2) => c2.point - c1.point)[0];
      const cards = [card];
      if (patternCompare(this.playManager.getPatternByCard(cards, player.cards),
        this.room.gameState.status.lastPattern) > 0) {
        // 比它大,可以出
        return cards;
      }
    } else {
      const cardList = this.playManager.getCardByPattern(this.status.lastPattern, player.cards, player.mode, this.status.lastPlayerMode)
      if (cardList.length > 0) {
        for (const cards of cardList) {
          if (patternCompare(this.playManager.getPatternByCard(cards, player.cards),
            this.room.gameState.status.lastPattern) > 0) {
            // 比它大,可以出
            return cards;
          }
        }
      }
    }
    return [];
  }

  // 下家保单
  isNextPlayerHasOneCard(player: PlayerState) {
    const nextIndex = (player.index + 1) % this.players.length
    const nextPlayer = this.players[nextIndex];
    return nextPlayer && nextPlayer.cards.length === 1
  }
}

export default Table

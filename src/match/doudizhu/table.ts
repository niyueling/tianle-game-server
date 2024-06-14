// @ts-ignore
import {pick} from 'lodash'
import GameRecorder, {IGameRecorder} from '../../match/GameRecorder'
import alg from '../../utils/algorithm'
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "../serializeDecorator"
import {AuditPdk} from "./auditPdk";
import Card, {CardType} from "./card"
import {CardManager} from "./cardManager";
import {IPattern, PatterNames, patternCompare} from "./patterns/base"
import PlayerState from './player_state'
import {PlayManager} from "./playManager";
import Room from './room'
import Rule from './Rule'
import GameCardRecord from "../../database/models/gameCardRecord";
import {GameType, TianleErrorCode} from "@fm/common/constants";
import enums from "./enums";
import GameCategory from "../../database/models/gameCategory";

class Status {
  current = {seatIndex: 0, step: 1}
  lastCards: Card[] = []
  lastPattern: IPattern = null
  lastIndex: number = -1
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
  state: string

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

  constructor(room, rule, restJushu) {
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
    // 结算玩家
    for (const p of this.players) {
      this.audit.initData(p.model.shortId);
    }
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

  abstract start()

  abstract startStateUpdate()

  initPlayers() {
    const room = this.room
    const rule = this.rule
    const players = room.playersOrder
      .map(playerSocket => new PlayerState(playerSocket, room, rule))

    players[0].zhuang = true;
    this.zhuang = players[0];
    players.forEach(p => this.listenPlayer(p));
    this.players = players;
  }

  shuffle() {
    alg.shuffle(this.cards)
    this.turn = 1
  }

  // 发牌
  async fapai() {
    // 下一轮
    this.audit.startNewRound();

    const allPlayerCards = this.cardManager.genCardForEachPlayer();
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
      p.onShuffle(this.restJushu, initCards, i, this.room.game.juIndex, needShuffle)
    }
  }

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
    player.on(enums.chooseMode, msg => this.onPlayerChooseMode(player, msg));
    player.on(enums.chooseMultiple, msg => this.onPlayerChooseMultiple(player, msg))
    player.on(enums.guo, () => this.onPlayerGuo(player))
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

  moveToNext() {
    let nextSeatIndex = this.currentPlayerStep

    let findNext = false
    while (!findNext) {
      nextSeatIndex = (nextSeatIndex + 1) % this.playerCount
      const playerState = this.players[nextSeatIndex]

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
    player.sendMessage('game/daCardReply', {ok: false, info})
  }

  guoPaiFail(player, info = TianleErrorCode.systemError) {
    player.sendMessage('game/guoCardReply', {ok: false, info})
  }

  abstract findFullMatchedPattern(cards: Card[]): IPattern

  async onPlayerDa(player: PlayerState, {cards: plainCards}) {
    if (!this.isCurrentStep(player)) {
      this.daPaiFail(player, TianleErrorCode.notDaRound);
      return;
    }
    // 转换成 Card 类型
    const cards = plainCards.map(Card.from);
    const currentPattern = this.playManager.getPatternByCard(cards, player.cards);
    this.status.lastIndex = this.currentPlayerStep
    // 检查最后几张
    // if (player.cards.length === cards.length && !currentPattern) {
    //   currentPattern = triplePlusXMatcher.verify(cards) || straightTriplesPlusXMatcher.verify(cards)
    // }
    if (player.tryDaPai(cards.slice()) && patternCompare(currentPattern, this.status.lastPattern) > 0) {
      await this.daPai(player, cards, currentPattern)
    } else {
      this.cannotDaPai(player, cards)
    }
  }

  async daPai(player: PlayerState, cards: Card[], pattern: IPattern) {
    player.daPai(cards.slice(), pattern);
    // 出牌次数+1
    this.audit.addPlayTime(player.model.shortId, cards);
    const remains = player.remains
    this.status.from = this.status.current.seatIndex
    this.status.lastPattern = pattern
    this.status.lastCards = cards
    if (pattern.name === PatterNames.bomb) {
      player.recordBomb(pattern)
      // 添加炸弹次数
      this.audit.addBoomTime(player.model.shortId);
      const usedJoker = pattern.cards.filter(c => c.type === CardType.Joker).length
      player.unusedJokers -= usedJoker
    }
    let teamMateCards = []
    if (remains === 0) {
      player.winOrder = this.status.winOrder++
      teamMateCards = this.teamMateCards(player)
    }
    this.moveToNext()
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
      this.depositForPlayer(nextPlayerState)
    }
    if (isGameOver) {
      this.showGameOverPlayerCards()
      this.room.game.saveLastWinner(player.model.shortId);
      this.status.current.seatIndex = -1
      await this.gameOver()
    }
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
        pushMsg.status.push(this.players[i].statusForSelf(this))
      } else {
        pushMsg.status.push(this.players[i].statusForOther(this))
      }
    }

    return pushMsg
  }

  showGameOverPlayerCards() {
    const playersCard = []
    this.players.forEach(p => {
      if (p.cards.length > 0) {
        playersCard.push([p.seatIndex, p.cards])
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
      const prompts = this.playManager.getCardByPattern(this.status.lastPattern, nextPlayerState.cards);
      // console.warn("prompts-%s", JSON.stringify(prompts));
      if (prompts.length > 0) {
        await this.onPlayerDa(nextPlayerState, {cards: prompts[0]})
      } else {
        this.onPlayerGuo(nextPlayerState)
      }
    })
  }

  onPlayerChooseMode(player, msg) {
    // console.warn("index-%s, msg-%s", player.index, JSON.stringify(msg));
    let mode = msg.mode;
    if (mode === enums.landlord) {
      this.multiple *= 2;

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
    this.room.broadcast("game/chooseModeReply", {ok: true, data: {seatIndex: player.index, mode: player.mode, multiple: this.multiple}});
    this.moveToNext();

    // 如果所有人都选择模式
    let cIndex = this.players.findIndex(p => p.mode === enums.unknown);
    let landlordCount = this.players.filter(p => p.mode === enums.landlord).length;
    // 找到第一个选择地主重新选择
    const firstLandlordIndex = this.players.findIndex(p => p.mode === enums.landlord);
    let nextPlayer = this.currentPlayerStep;

    // 所有人都选择模式，并且只有一个人选择地主, 则从地主开始打牌
    if (cIndex === -1 && landlordCount === 1) {
      // 将地主牌发给用户
      const cards = this.cardManager.getLandlordCard();
      this.players[firstLandlordIndex].cards = [...this.players[firstLandlordIndex].cards, ...cards];
      this.room.broadcast("game/openLandlordCard", {ok: true, data: {seatIndex: this.players[firstLandlordIndex].index, landlordCards: cards, cards: this.players[firstLandlordIndex].cards}});

      const startDaFunc = async() => {
        this.status.current.seatIndex = this.players[firstLandlordIndex].index;

        // 下发开始翻倍消息
        this.room.broadcast('game/startChooseMultiple', {ok: true, data: {}});

        // 托管状态自动选择不翻倍
        this.players.map(p => this.depositForPlayerChooseMultiple(p));
      }

      setTimeout(startDaFunc, 500);
      return ;
    }

    // 所有人都选择模式，并且没人选择地主,则重新发牌
    if (cIndex === -1 && landlordCount === 0) {
      this.players.map(p => p.mode = enums.unknown);
      this.start();
      return ;
    }

    // 有多人选择地主,让第一个用户重新选择模式
    if (cIndex === -1 && landlordCount > 1) {
      if (firstLandlordIndex !== -1) {
        nextPlayer = firstLandlordIndex;
      }
    }

    if (this.players[nextPlayer]) {
      const nextPlayerState = this.players[nextPlayer];
      this.room.broadcast('game/startChooseMode', {ok: true, data: {index: nextPlayer}})
      this.depositForPlayerChooseMode(nextPlayerState);
    }
  }

  onPlayerChooseMultiple(player, msg) {

  }

  // 托管选择地主
  depositForPlayerChooseMode(player: PlayerState) {
    player.deposit(async () => {
      let mode = enums.farmer;
      const index = this.players.findIndex(p => p.mode === enums.landlord);
      if (player.mode !== enums.farmer && index === -1) {
        mode = enums.landlord;
        this.multiple *= 2;

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
      this.room.broadcast("game/chooseModeReply", {ok: true, data: {seatIndex: player.index, mode: player.mode, multiple: this.multiple}});
      this.moveToNext();

      // 如果所有人都选择模式
      let cIndex = this.players.findIndex(p => p.mode === enums.unknown);
      let landlordCount = this.players.filter(p => p.mode === enums.landlord).length;
      // 找到第一个选择地主重新选择
      const firstLandlordIndex = this.players.findIndex(p => p.mode === enums.landlord);
      let nextPlayer = this.currentPlayerStep;

      console.warn("unknownCount-%s, landlordCount-%s, firstLandlordIndex-%s, nextPlayer-%s", cIndex, landlordCount, firstLandlordIndex, nextPlayer);

      // 所有人都选择模式，并且只有一个人选择地主, 则从地主开始打牌
      if (cIndex === -1 && landlordCount === 1) {
        // 将地主牌发给用户
        const cards = this.cardManager.getLandlordCard();
        this.players[firstLandlordIndex].cards = [...this.players[firstLandlordIndex].cards, ...cards];
        this.room.broadcast("game/openLandlordCard", {ok: true, data: {seatIndex: this.players[firstLandlordIndex].index, landlordCards: cards, cards: this.players[firstLandlordIndex].cards}});

        const startDaFunc = async() => {
          this.status.current.seatIndex = this.players[firstLandlordIndex].index;

          // 下发开始翻倍消息
          this.room.broadcast('game/startChooseMultiple', {ok: true, data: {}});

          // 托管状态自动选择不翻倍
          this.players.map(p => this.depositForPlayerChooseMultiple(p));
        }

        setTimeout(startDaFunc, 500);
        return ;
      }

      // 所有人都选择模式，并且没人选择地主,则重新发牌
      if (cIndex === -1 && landlordCount === 0) {
        this.players.map(p => p.mode = enums.unknown);
        this.start();
        return ;
      }

      // 有多人选择地主,让第一个用户重新选择模式
      if (cIndex === -1 && landlordCount > 1) {
        if (firstLandlordIndex !== -1) {
          nextPlayer = firstLandlordIndex;
        }
      }

      console.warn("nextPlayerIndex-%s", nextPlayer);
      if (this.players[nextPlayer]) {
        const nextPlayerState = this.players[nextPlayer];
        this.room.broadcast('game/startChooseMode', {ok: true, data: {index: nextPlayer}})
        this.depositForPlayerChooseMode(nextPlayerState);
      }
    })
  }

  // 托管选择翻倍
  depositForPlayerChooseMultiple(player: PlayerState) {
    player.deposit(async () => {
      player.isMultiple = true;
      player.double = false;
      this.room.broadcast("game/chooseMultipleReply", {ok: true, data: {seatIndex: player.index, multiple: this.multiple, isMultiple: player.isMultiple, double: player.double}});

      const isAllChoose = this.players.filter(value => value.isMultiple).length >= this.rule.playerCount;

      if (isAllChoose) {
        const startDa = async() => {
          this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}})
          this.depositForPlayer(this.players[this.currentPlayerStep]);
        }

        setTimeout(startDa, 500);
      }
    })
  }

  abstract isGameOver(): boolean

  cannotDaPai(player, cards) {
    player.sendMessage('game/daCardReply', {
      ok: false,
      info: TianleErrorCode.cardDaError,
      data: {daCards: cards, inHandle: player.cards}

    })
  }

  canGuo(): boolean {
    return this.status.lastPattern !== null
  }

  onPlayerGuo(player) {
    if (!this.isCurrentStep(player)) {
      this.guoPaiFail(player, TianleErrorCode.notDaRound)
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
      this.depositForPlayer(nextPlayerState)
    }
  }

  guoPai(player: PlayerState) {
    player.guo()
    player.sendMessage("game/guoCardReply", {ok: true, data: {}})
    this.moveToNext()
    if (!this.status.lastPattern) {
      const zhuaFenPlayer = this.players[this.status.from]

      // this.room.broadcast('game/zhuaFen', {ok: true, data: {
      //     index: this.status.from,
      //     zhuaFen: zhuaFenPlayer.zhuaFen
      //   }})

    }
    this.room.broadcast("game/otherGuo", {ok: true, data: {
        index: player.seatIndex,
        next: this.currentPlayerStep,
        pattern: this.status.lastPattern,
      }})
  }

  get isLastMatch() {
    return this.restJushu === 0
  }

  abstract bombScorer(bomb: IPattern): number;

  calcExtraBomb() {
    for (const winner of this.players) {
      const allBombScore = winner.bombScore(this.bombScorer)
      for (const loser of this.players) {
        winner.winFrom(loser, allBombScore, 'bomb')
      }
    }
  }

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

  getScoreBy(playerId) {
    return this.room.getScoreBy(playerId)
  }

  async roomGameOver(states, nextStarterIndex: string) {
    await this.room.gameOver(states, nextStarterIndex)
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = (playerMsgDispatcher, index) => {
      const player = this.players[index]
      this.replaceSocketAndListen(player, playerMsgDispatcher)
      const content = this.reconnectContent(index, player)
      player.sendMessage('game/reconnectReply', {ok: true, data: content})
    })

    room.once('empty',
      this.onRoomEmpty = () => {
        console.log('empty room')
      })
  }

  replaceSocketAndListen(player, playerMsgDispatcher) {
    player.reconnect(playerMsgDispatcher)
    this.listenPlayer(player)
  }

  reconnectContent(index, reconnectPlayer: PlayerState): any {
    const state = this.state
    const stateData = this.stateData
    const juIndex = this.room.game.juIndex

    const status = this.players.map(player => {
      return player._id.toString() === reconnectPlayer._id.toString() ? player.statusForSelf(this) : player.statusForOther(this)
    })

    return {
      index,
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
    // this.removeAllPlayerListeners()
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

  // 第一次出牌
  promptWithFirstPlay(player: PlayerState) {
    const cards = this.playManager.firstPlayCard(player.cards);
    if (cards.length === 1 && this.isNextPlayerHasOneCard(player)) {
      // 下家保单, 出最大的牌
      const card = player.cards.sort((c1, c2) => c2.point - c1.point)[0];
      return [card];
    }
    return cards;
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
      const cardList = this.playManager.getCardByPattern(this.status.lastPattern, player.cards)
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

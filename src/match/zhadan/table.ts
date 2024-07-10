import {pick, remove} from 'lodash'
import * as winston from 'winston'
import PlayerModel from "../../database/models/player";
import PlayerHelpDetail from "../../database/models/playerHelpModel";
import RateRecordModel from "../../database/models/rateRecord";
import {RedPocketRecordModel} from "../../database/models/redPocketRecord";
import TreasureBox from "../../database/models/treasureBox";
import GameRecorder from '../../match/GameRecorder'
import {service} from "../../service/importService";
import algorithm from "../../utils/algorithm";
import alg from "../../utils/algorithm";
import {eqlModelId} from "../modelId"
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "../serializeDecorator"
import Card, {CardType} from "./card"
import {manager} from "./cardManager";
import Enums from "./enums";
import {
  findFullMatchedPattern,
  findMatchedPatternByPattern,
  firstPlayCard,
  isGreaterThanPattern,
  isGreaterThanPatternForPlainCards,
  publicRoomFirstPlayCard
} from "./patterns"
import {groupBy, IPattern, PatterNames, patternCompare} from "./patterns/base"
import BombMatcher from './patterns/BombMatcher'
import TriplePlusXMatcher from "./patterns/TriplePlusXMatcher"
import PlayerState from './player_state'
import Room from './room'
import Rule from './Rule'

const logger = new winston.Logger({
  level: 'debug',
  transports: [new winston.transports.Console()]
})

const stateWaitCommit = 'stateWaitCommit'
const stateGameOver = 'stateGameOver'

export enum Team {
  HomeTeam = 0,
  AwayTeam = 1,
  NoTeam = 2,
}

export const genFullyCards = (useJoker: boolean = true) => {
  const types = [CardType.Club, CardType.Diamond, CardType.Heart, CardType.Spades]
  const cards = []

  types.forEach((type: CardType) => {
    for (let v = 1; v <= 13; v += 1) {
      cards.push(new Card(type, v), new Card(type, v))
    }
  })

  if (useJoker) {
    cards.push(new Card(CardType.Joker, 16), new Card(CardType.Joker, 16))
    cards.push(new Card(CardType.Joker, 17), new Card(CardType.Joker, 17))
  }
  return cards
}

class Status {
  current = {seatIndex: 0, step: 1}
  lastCards: Card[] = []
  lastPattern: IPattern = null
  lastIndex: number = -1
  from: number
  winOrder = 0
  fen = 0
}

export function cardChangeDebugger<T extends new (...args: any[]) => {
    room: any
    listenPlayer(p: PlayerState): void
    listenerOn: string[]
  }>(constructor: T) {

  return class TableWithDebugger extends constructor {

    constructor(...args) {
      super(...args)
    }

    listenPlayer(player: PlayerState) {
      super.listenPlayer(player)
      this.listenerOn.push('game/changePlayerCards')

      player.msgDispatcher.on('game/changePlayerCards', msg => this.changePlayerCards(player, msg.cards))
    }

    changePlayerCards(player, cards) {
      const tempCards = cards.map(card => Card.from(card))
      player.cards = tempCards
      this.room.broadcast('game/changeCards', {index: player.seatIndex, cards: tempCards})
      player.sendMessage('game/changePlayerCardsReply', {ok: true, info: '换牌成功！'})
    }
  }
}

const triplePlusXMatcher = new TriplePlusXMatcher()

abstract class Table implements Serializable {

  restJushu: number
  turn: number

  cards: Card[]

  @autoSerialize
  remainCards: number

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

  @serialize
  recorder: GameRecorder

  @autoSerialize
  listenerOn: string[]

  @serialize
  stateData: any

  @autoSerialize
  soloPlayerIndex: number = -1

  isHelp: boolean = false

  @autoSerialize
  mode: 'solo' | 'teamwork' | 'unknown' = 'unknown'

  @autoSerialize
  foundFriend: boolean = false

  @autoSerialize
  friendCard: Card = null

  @autoSerialize
  tableState: string

  @autoSerialize
  autoCommitStartTime: number

  @autoSerialize
  shuffleDelayTime: number = Date.now()
  bombScorer: (bomb: IPattern) => number
  private autoCommitTimer: NodeJS.Timer

  constructor(room, rule, restJushu) {
    this.restJushu = restJushu
    this.rule = rule
    this.room = room
    this.status = new Status()
    this.listenRoom(room)

    this.initCards()
    this.initPlayers()
    this.setGameRecorder(new GameRecorder(this))
  }

  get empty() {
    return this.players.filter(p => p).length === 0
  }

  get playerCount() {
    return this.players.filter(p => p).length
  }

  get currentPlayerStep() {
    return this.status.current.seatIndex
  }

  get isLastMatch() {
    return this.restJushu === 0
  }

  toJSON() {
    return serializeHelp(this)
  }

  resume(tableStateJson) {
    const keys = autoSerializePropertyKeys(this)
    Object.assign(this, pick(tableStateJson.gameState, keys))
    if (this.status.lastCards) {
      this.status.lastCards = this.status.lastCards.map(c => Card.from(c))
    }
    if (this.status.lastPattern) {
      this.status.lastPattern.cards = this.status.lastPattern.cards.map(c => Card.from(c))
    }

    if (this.friendCard) {
      this.friendCard = Card.from(this.friendCard)
    }

    if (tableStateJson.gameState.recorder) {
      this.recorder.resume(tableStateJson.gameState.recorder)
    }

    this.stateData = {}

    for (const [i, p] of this.players.entries()) {
      p.resume(tableStateJson.gameState.players[i])
    }

    if (this.tableState === 'selectMode') {
      this.autoModeTimeFunc()
    }
    this.autoCommitFunc()
  }

  abstract name()

  abstract async start()

  abstract autoModeTimeFunc()

  async initPlayers() {
    const room = this.room
    const rule = this.rule

    const players = room.playersOrder
      .map(playerSocket => new PlayerState(playerSocket, room, rule))

    players[0].zhuang = true
    this.zhuang = players[0]
    players.forEach(p => this.listenPlayer(p))

    this.players = players
  }

  public setFirstDa(startPlayerIndex: number) {
    // console.log('set first da', startPlayerIndex);
    this.status.current.seatIndex = startPlayerIndex
  }

  initCards() {
    this.cards = genFullyCards(this.rule.useJoker)
    if (this.rule.jokerCount === 6) {
      const canReplaceIndex = [];
      let allIndex = 0;

      this.cards.forEach(c => {
        if (c.value === 3) {
          canReplaceIndex.push(allIndex);
        }
        allIndex++;
      })

      alg.shuffleForZhadan(canReplaceIndex)
      this.cards[canReplaceIndex.shift()] = new Card(CardType.Joker, 16);
      this.cards[canReplaceIndex.shift()] = new Card(CardType.Joker, 17);
    }

    this.remainCards = this.cards.length
  }

  shuffle() {
    alg.shuffleForZhadan(this.cards)
    this.turn = 1
    this.remainCards = this.cards.length
  }

  consumeCard() {
    const cardIndex = --this.remainCards
    return this.cards[cardIndex]
  }

  takeQuarterCards(p) {
    const cards = []
    for (let i = p.cards.length; i < this.getQuarterCount(); i++) {
      cards.push(this.consumeCard());
    }
    return cards;
  }

  getQuarterCount() {
    return this.rule.useJoker ? 27 : 26;
  }

  async executeShuffle(): Promise<void> {
    await this.helpPlayers();
  }

  async helpPlayers(): Promise<void> {
    const tasks = this.players.map((p: any) => {
      return this.checkPlayerHelper(p);
    });

    await Promise.all(tasks);
  }

  async checkPlayerHelper(p): Promise<void> {
    const player = await PlayerModel.findOne({_id: p._id}).lean();

    const helpInfo = await PlayerHelpDetail.findOne({
      player: p._id,
      isHelp: 1,
      $and: [
        {
          type: {$in: [1, 2]},
        },
        {
          $or: [
            {type: 2, game: "zhadan"},
            {type: 1},
          ],
        },
      ],
    }).sort({estimateLevel: -1, type: -1}).lean();
    if (!helpInfo) return;

    if (!this.room.gameState.isHelp) {
      const PlayerHelpRank = 1 / helpInfo.juCount;
      const randWithSeed = algorithm.randomBySeed();

      if (randWithSeed > PlayerHelpRank && helpInfo.juCount > helpInfo.count) {
        await PlayerHelpDetail.findByIdAndUpdate(helpInfo._id, {juCount: helpInfo.juCount - 1});
        return;
      }

      logger.info(`${new Date()}：${player.shortId}救助概率${PlayerHelpRank},随机种子概率：${randWithSeed}`);
      logger.info(`${new Date()}：${player.shortId}补助${helpInfo.estimateLevel}星`)
      this.room.gameState.isHelp = true;
      await this.priorityFapai(helpInfo.estimateLevel, p, helpInfo, helpInfo.coolingcycle);
    }
  }

  async priorityFapai(star, p, helpInfo, coolingcycle): Promise<void> {
    let cards = [];
    let useCards = [];
    const cardNums = [];

    let jokerCount = 0;
    const num = this.getCardNum();
    let maxJokerCount = 0;
    const userOtherCard = this.calcPlayerCardNums(p.cards, num);
    const userJokerCard = this.calcPlayerCardNums(p.cards, 16) + this.calcPlayerCardNums(p.cards, 17);
    const userJokerCardLists = [...this.calcPlayerCardLists(p.cards, 16), ...this.calcPlayerCardLists(p.cards, 17)];
    useCards = [...this.calcPlayerCardLists(p.cards, num), ...userJokerCardLists];
    // 是否需要生成大小王
    if (this.rule.useJoker) {
      // 判断生成joker数量
      jokerCount = this.getJokerNum(star);
      maxJokerCount = Math.max(userJokerCard, jokerCount);
      logger.info(`${new Date()}：${p.model.shortId}持有joker数量：${maxJokerCount}`);
      jokerCount = userJokerCard >= jokerCount ? 0 : jokerCount - userJokerCard;
      const jokerCard = this.createJokerCard(jokerCount);
      // 生成指定张数的大小王
      if (jokerCount > 0 && jokerCard.length > 0) cards = [...cards, ...jokerCard];
      else jokerCount = 0;
    }

    // 剩余需要救助的张数
    const redidueOtherNum = star - maxJokerCount;
    const residueNum = (redidueOtherNum >= 7 ? 7 : (redidueOtherNum > 4 ? redidueOtherNum : 4));
    logger.info(`${new Date()}：${p.model.shortId}预计生成特殊牌:${num}数量：${residueNum}，用户持有特殊牌:${num}数量：${userOtherCard}`);
    const cardOtherNum = userOtherCard >= residueNum ? 0 : residueNum - userOtherCard;
    logger.info(`${new Date()}：${p.model.shortId}最终生成特殊牌:${num}数量：${cardOtherNum}`);
    cardNums.push(num);

    // 生成剩余救助牌
    const otherCard = this.createOtherCard(cardOtherNum, num, p);
    cards = [...cards, ...otherCard];

    if (!p.cards) p.cards = [];
    // 从其他用户手中换牌
    await this.changePlayerCards(cards, p, cardNums);

    p.cards = [...p.cards, ...cards];

    // 生成救助记录
    await RateRecordModel.create({
      player: p._id, recordId: helpInfo._id, cardLists: cards, jokerCount: this.rule.jokerCount,
      useJoker: this.rule.useJoker, coolingcycle, createAt: new Date(), level: helpInfo.estimateLevel,
      room: this.room._id, cards: p.cards, useCards, juIndex: this.room.game.juIndex, game: "zhadan"
    });

    const treasure = await TreasureBox.findOne({level: helpInfo.treasureLevel}).lean();
    await PlayerHelpDetail.findByIdAndUpdate(helpInfo._id, {
      count: helpInfo.count - 1,
      juCount: helpInfo.count > 1 ? treasure.juCount : 0,
      isHelp: helpInfo.count > 1
    });
  }

  calcPlayerCardNums(cards, value) {
    let nums = 0;
    cards.map((card: any) => {
      if (card.value === value) nums++;
    })

    return nums;
  }

  calcPlayerCardLists(cards, value) {
    const lists = [];
    cards.map((card: any) => {
      if (card.value === value) lists.push(card);
    })

    return lists;
  }

  changePlayerCards(cards, p, cardNums) {
    const promises = [];
    for (let i = 0; i < cards.length; i++) {
      const card0 = this.popUserCard(p, cardNums);
      if (!card0) return;
      promises.push(this.changeCards(cards[i], card0, p));
    }
    return Promise.all(promises);
  }

  popUserCard(p, cardNums) {
    const index = p.cards.findIndex(card => ![...[16, 17], ...cardNums].includes(card.value));
    return index !== -1 ? p.cards.splice(index, 1)[0] : {};
  }

  async changeCards(card, card0, p) {
    for (let i = 0; i < this.players.length; i++) {
      // 不从自己手上换牌
      if (this.players[i]._id === p._id) continue;

      const user = this.players[i];
      const index = user.cards.findIndex(c => c.value === card.value && c.type === card.type);
      if (index !== -1) {
        user.cards.splice(index, 1);
        user.cards.push(card0);
        break;
      }
    }
  }

  createOtherCard(residueNum, num, p) {
    const cardTypes = this.createCardTypes(num, p);
    const usedCards = [];
    const cards = [];
    for (let i = 0; i < residueNum; i++) {
      const card = cardTypes.find((card1: any) => card1.count < 2);
      if (!card) this.createOtherCard(residueNum, num, p);
      const index = this.cards.findIndex(c => c.value === num && c.type === card.type);
      if (index !== -1) {
        usedCards.push(...this.cards.splice(index, 1));
        cards.push(new Card(card.type, num));
        card.count += 1;
      }
    }
    this.cards.push(...usedCards);

    return cards;
  }

  createCardTypes(num, p) {
    const cardTypes = [{type: CardType.Club, count: 0}, {type: CardType.Diamond, count: 0}, {
      type: CardType.Heart,
      count: 0
    }, {type: CardType.Spades, count: 0}];
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i]._id !== p._id) continue;

      this.players[i].cards.map(c => {
        if (c.value === num) {
          const index = cardTypes.findIndex(c1 => c1.type === c.type);
          if (index !== -1) cardTypes[index].count++;
        }
      })
    }

    return cardTypes;
  }

  getCardNum() {
    const num = Math.floor(Math.random() * 13) + 1;
    if ([2, 3].includes(num)) return this.getCardNum();

    return num;
  }

  createJokerCard(jokerCount) {
    const cards = [];
    const cardType = [{type: 16, count: 0}, {type: 17, count: 0}];
    for (let i = 0; i < jokerCount; i++) {
      const card = cardType.find((card1: any) => card1.count < (this.rule.jokerCount === 6 ? 3 : 2));
      if (!card) this.createJokerCard(jokerCount);
      const index = this.cards.findIndex(c => c.value === card.type && c.type === CardType.Joker);
      if (index !== -1) {
        const joker = this.cards.splice(index, 1)[0];
        cards.push(new Card(joker.type, card.type));
        card.count += 1;
      }
    }

    return cards;
  }

  getJokerNum(star) {
    const jokerNum = this.rule.useJoker ? this.rule.jokerCount : 0;
    let minJokerNum = 0;
    if (star > 7) minJokerNum = star - 7;
    const num = Math.floor(Math.random() * jokerNum);
    const min = Math.min(num, star - 4, 3);
    return Math.max(min, minJokerNum);
  }

  async fourJokersReward() {

    const fourJokerReward = this.rule.specialReward
    if (!fourJokerReward || fourJokerReward <= 0) {
      return
    }
    if (this.room.game.juIndex > 1) {
      this.players.forEach(async p => {
        if (this.haveFourJokers(p)) {
          await PlayerModel.findByIdAndUpdate(p._id,
            {$inc: {redPocket: fourJokerReward}},
            {new: true})

          await RedPocketRecordModel.create({
            player: p._id, amountInFen: fourJokerReward,
            createAt: new Date(), from: `四王奖励 room:${this.room._id}`
          })
          const playerIndex = this.atIndex(p)
          this.room.broadcast('room/fourJokersReward', {
            playerId: p._id,
            playerName: p.model.name,
            index: playerIndex,
            amountInFen: fourJokerReward
          })
        }
      })
    }
  }

  async fapai() {

    await this._fapai()

    if (this.players.some(p => this.haveFourJokers(p)) && this.rollReshuffle()) {
      this._fapai()
    }

    const isZhadanOpen = await service.utils.getGlobalConfigByName("zhadanHelp");
    if (!this.room.rule.isPublic && Number(isZhadanOpen) === 1) await this.executeShuffle();

    this.players[0].team = this.players[2].team = Team.HomeTeam
    this.players[1].team = this.players[3].team = Team.AwayTeam
  }

  // 公共房发牌
  async publicRoomFapai() {
    this.stateData = {};
    this.turn = 1;
    this.cards = manager.withJokerCards(8);
    const playerCards = manager.makeCards(this.cards);
    this.remainCards = this.cards.length;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.cards = playerCards[i].map(value => value.card);
      // p.cards = [...p.cards, ...this.takeQuarterCards(p)];
    }

    // 分配队友
    this.players[0].team = this.players[2].team = Team.HomeTeam
    this.players[1].team = this.players[3].team = Team.AwayTeam
  }

  evictPlayer(evictPlayer: PlayerState) {
    remove(this.players, p => eqlModelId(p, evictPlayer))
    this.removeRoomListenerIfEmpty()
  }

  removeRoomListenerIfEmpty() {
    if (this.empty) {
      this.removeRoomListener()
    }
  }

  removeRoomListener() {
    this.room.removeListener('reconnect', this.onReconnect)
    this.room.removeListener('empty', this.onRoomEmpty)
  }

  listenPlayer(player: PlayerState) {
    this.listenerOn = ['game/da', 'game/guo', 'game/cancelDeposit', 'game/refresh']

    player.msgDispatcher.on('game/da', msg => this.onPlayerDa(player, msg))
    player.msgDispatcher.on('game/guo', msg => this.onPlayerGuo(player))
    player.msgDispatcher.on('game/cancelDeposit', msg => this.onCancelDeposit(player))
    // 手动刷新
    player.msgDispatcher.on('game/refresh', async () => {
      player.sendMessage('room/refresh', await this.restoreMessageForPlayer(player));
    })
  }

  onCancelDeposit(player: PlayerState) {
    player.cancelDeposit()
    this.room.robotManager.disableRobot(player._id)
    this.autoCommitFunc()
  }

  autoCommitForPlayers() {
    const player = this.players.find(x => x.seatIndex === this.currentPlayerStep)
    if (!player || player.msgDispatcher.isRobot()) {
      // 忽略机器人
      return
    }

    player.onDeposit = true
    if (!this.canGuo()) {
      const card = player.cards.sort((x, y) => x.point - y.point)[0]
      this.onPlayerDa(player, {cards: [card]})
      return
    }

    this.guoPai(player)
  }

  moveToNext() {
    let nextSeatIndex = this.currentPlayerStep

    let findNext = false
    while (!findNext) {
      nextSeatIndex = (nextSeatIndex + 1) % this.playerCount
      const playerState = this.players[nextSeatIndex]

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

    this.room.broadcast('game/cleanCards', {index: player.index})
    player.cleaned = true

  }

  isCurrentStep(player) {
    return this.currentPlayerStep === player.seatIndex
  }

  daPaiFail(player) {
    player.sendMessage('game/daReply', {ok: false, info: '不是您的阶段'})
  }

  guoPaiFail(player) {
    player.sendMessage('game/guoReply', {ok: false, info: '不是您的阶段'})
  }

  autoCommitFunc(playerIsOndeposit = false) {
    // 不托管
    return;
    // if (this.rule.autoCommit) {
    //   clearTimeout(this.autoCommitTimer)
    //   this.autoCommitStartTime = Date.now();
    //   const primaryDelayTime = playerIsOndeposit ? 1000 : this.rule.autoCommit * 1000
    //   const delayTime = primaryDelayTime - (Date.now() - this.autoCommitStartTime)
    //   this.autoCommitTimer = setTimeout(() => {
    //     this.autoCommitForPlayers()
    //   }, delayTime)
    // }
  }

  onPlayerDa(player, {cards: plainCards}, onDeposit?) {
    if (Date.now() - this.shuffleDelayTime < 0) {
      player.sendMessage('game/daReply', {
        ok: false,
        info: '错误',
      })
      return
    }
    if (!this.isCurrentStep(player)) {
      this.daPaiFail(player)
      return
    }
    const cards = plainCards.map(Card.from)

    this.status.lastIndex = this.currentPlayerStep

    const currentPattern = isGreaterThanPatternForPlainCards(plainCards, this.status.lastPattern, player.cards.length);

    if (player.tryDaPai(cards.slice()) && patternCompare(currentPattern, this.status.lastPattern) > 0) {
      this.daPai(player, cards, currentPattern, onDeposit)
    } else {
      this.cannotDaPai(player, cards)
    }
  }

  daPai(player: PlayerState, cards: Card[], pattern: IPattern, onDeposit?) {

    player.daPai(cards.slice(), pattern)
    const remains = player.remains

    this.status.from = this.status.current.seatIndex

    this.status.lastPattern = pattern
    this.status.lastCards = cards
    this.status.fen += this.fenInCards(cards)

    if (pattern.name === PatterNames.bomb) {
      player.recordBomb(pattern)
      const usedJoker = pattern.cards.filter(c => c.type === CardType.Joker).length
      player.unusedJokers -= usedJoker
    }

    let teamMateCards = []
    if (remains === 0) {
      player.winOrder = this.status.winOrder++
      teamMateCards = this.teamMateCards(player)
    }

    this.moveToNext()
    player.sendMessage('game/daReply', {
      ok: true, remains, teamMateCards,
      onDeposit: player.onDeposit || !!onDeposit
    })

    const isGameOver = this.isGameOver()
    const nextPlayer = isGameOver ? -1 : this.currentPlayerStep

    this.room.broadcast('game/otherDa', {
      cards,
      remains,
      index: player.seatIndex,
      next: nextPlayer,
      pattern: this.status.lastPattern,
      fen: this.status.fen,
      bomb: this.bombScorer(pattern),
      newBombScore: player.bombScore(this.bombScorer.bind(this))
    })
    this.notifyTeamMateWhenTeamMateWin(player, cards)
    if (this.players[nextPlayer]) {
      this.autoCommitFunc(this.players[nextPlayer].onDeposit)
    }
    if (isGameOver) {
      this.showGameOverPlayerCards()
      player.zhua(this.status.fen)
      this.status.current.seatIndex = -1
      console.log('game over set seatIndex -1');
      this.gameOver()
    }
  }

  async restoreMessageForPlayer(player: PlayerState) {
    const index = this.atIndex(player)
    const soloPlayer = this.players[this.soloPlayerIndex]
    const lastRecord = await service.rubyReward.getLastRubyRecord(this.room.uid);
    let roomRubyReward = 0;
    if (lastRecord) {
      // 奖池
      roomRubyReward = lastRecord.balance;
    }
    const pushMsg = {
      index, status: [],
      mode: this.mode,
      currentPlayer: this.status.current.seatIndex,
      soloPlayerIndex: this.soloPlayerIndex,
      soloPlayerName: soloPlayer && soloPlayer.model.name,
      lastPattern: this.status.lastPattern,
      lastIndex: this.status.lastIndex,
      friendCard: this.friendCard,
      fen: this.status.fen,
      from: this.status.from,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
      foundFriend: this.foundFriend,
    }
    for (let i = 0; i < this.players.length; i++) {
      if (i === index) {
        pushMsg.status.push({
          ...this.players[i].statusForSelf(this),
          roomRubyReward,
          teamMateCards: this.teamMateCards(this.players[i])
        })
      } else {
        pushMsg.status.push({
          ...this.players[i].statusForOther(this),
          roomRubyReward,
        })
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
    this.room.broadcast('game/gameOverPlayerCards', {
      playersCard
    })
  }

  homeTeamPlayers(): PlayerState[] {
    return this.players.filter(p => p.team === Team.HomeTeam)
  }

  awayTeamPlayers(): PlayerState[] {
    return this.players.filter(p => p.team === Team.AwayTeam)
  }

  // depositForPlayer(nextPlayerState: PlayerState) {
  //   nextPlayerState.deposit(() => {
  //     const prompts = findMatchedPatternByPattern(this.status.lastPattern, nextPlayerState.cards)
  //
  //     if (prompts.length > 0) {
  //       this.onPlayerDa(nextPlayerState, {cards: prompts[0]})
  //     } else {
  //       this.onPlayerGuo(nextPlayerState)
  //     }
  //
  //   })
  // }

  isGameOver(): boolean {
    const homeTeamCards = this.homeTeamPlayers().reduce((cards, p) => {
      return p.cards.length + cards
    }, 0)

    const awayTeamCards = this.awayTeamPlayers().reduce((cards, p) => {
      return p.cards.length + cards
    }, 0)

    return homeTeamCards === 0 || awayTeamCards === 0
  }

  cannotDaPai(player, cards) {
    player.sendMessage('game/daReply', {
      ok: false,
      info: '打牌错误',
      daCards: cards,
      inHandle: player.cards
    })
  }

  canGuo(): boolean {
    return this.status.lastPattern !== null
  }

  onPlayerGuo(player) {
    if (!this.isCurrentStep(player)) {
      this.guoPaiFail(player)
      return
    }

    if (!this.canGuo()) {
      player.sendMessage("game/guoReply", {ok: false, info: '不能过'})
      return
    }

    this.guoPai(player)
  }

  guoPai(player: PlayerState, onDeposit?) {

    player.guo()
    player.sendMessage("game/guoReply", {ok: true, onDeposit: player.onDeposit || !!onDeposit})

    this.moveToNext()

    if (!this.status.lastPattern) {
      const zhuaFenPlayer = this.players[this.status.from]
      zhuaFenPlayer.zhua(this.status.fen)

      this.room.broadcast('game/zhuaFen', {
        index: this.status.from,
        win: this.status.fen,
        zhuaFen: zhuaFenPlayer.zhuaFen
      })

      this.status.fen = 0
    }
    this.room.broadcast("game/otherGuo", {
      index: player.seatIndex,
      next: this.currentPlayerStep,
      pattern: this.status.lastPattern,
      fen: this.status.fen
    })

    const isGameOver = this.isGameOver()
    const nextPlayer = isGameOver ? -1 : this.currentPlayerStep

    if (this.players[nextPlayer]) {
      this.autoCommitFunc(this.players[nextPlayer].onDeposit)
    }
  }

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

  getPlayerUnUsedBombs(player: PlayerState) {

    const jokers = player.cards.filter(c => c.type === CardType.Joker)

    const unUsedBombs = groupBy(player.cards.filter(c => c.type !== CardType.Joker), c => c.value)
      .filter(g => g.length >= 4)
      .sort((g1, g2) => new BombMatcher().verify(g2).score - new BombMatcher().verify(g1).score)

    if (unUsedBombs.length > 0 && jokers.length < 4) {
      unUsedBombs[0] = [...jokers, ...unUsedBombs[0]]
    } else if (jokers.length >= 4) {
      if (unUsedBombs.length > 0) {
        if (this.bombScorer(findFullMatchedPattern(
          [...jokers, ...unUsedBombs[0]])) > this.bombScorer(findFullMatchedPattern(jokers))
        ) {
          unUsedBombs[0] = [...jokers, ...unUsedBombs[0]]
        } else {
          unUsedBombs.push(jokers)
        }
      } else {
        unUsedBombs.push(jokers)
      }
    }

    return unUsedBombs
  }

  getPlayerUnUsedJokers(player: PlayerState) {
    const jokersInHand = player.cards.filter(c => c.type === CardType.Joker).length

    const unusedJokers = player.unusedJokers
    if (jokersInHand >= 4) {
      return 0
    }

    const unUsedBombs = groupBy(player.cards, c => c.value)
      .filter(g => g.length >= 4)

    if (unUsedBombs.length > 0) {
      return unusedJokers - jokersInHand
    }
    return unusedJokers
  }

  drawGameTableState() {
    if (this.rule.ro.jieSanSuanFen) {
      for (const winner of this.players) {
        for (const loser of this.players) {
          winner.winFrom(loser, 0)
          winner.winFrom(loser, this.drawGameBombScore(winner), 'bomb')
        }
      }

      if (this.mode === 'solo' && !this.rule.shaoJi) {
        console.log('ignore solo')
      } else {
        for (const winner of this.players) {
          for (const loser of this.players) {
            winner.winFrom(loser, this.getPlayerUnUsedJokers(loser), 'joker')
          }
        }
      }

    }

    const states = this.players.map(p => {
      return {
        model: p.model,
        index: p.index,
        score: p.balance,
        detail: p.detailBalance
      }
    })
    return states
  }

  async gameOver() {
    // clearTimeout(this.autoCommitTimer)
    // const playersInWinOrder = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder)
    //
    // const teamOrder = playersInWinOrder.map(p => p.team)
    //
    // const winTeam = teamOrder[0]
    // let score = 0
    // if (teamOrder[0] === teamOrder[1]) {
    //   score = 2
    //   if (playersInWinOrder.slice(2).some(loser => loser.zhuaFen > 100)) {
    //     score = 1
    //   }
    // } else {
    //   const firstTeamZhuaFen = this.players.filter(p => p.team === winTeam)
    //     .reduce((fen, p) => p.zhuaFen + fen, 0)
    //
    //   if (firstTeamZhuaFen > 100) {
    //     score = 1
    //   } else {
    //     score = -1
    //   }
    //
    // }
    //
    // const winTeamPlayers = this.players.filter(p => p.team === winTeam)
    // const loseTeamPlayers = this.players.filter(p => p.team !== winTeam)
    //
    // for (let i = 0; i < 2; i++) {
    //   const winner = winTeamPlayers[i]
    //   const loser = loseTeamPlayers[i]
    //   winner.winFrom(loser, score)
    // }
    //
    // const states = this.players.map(p => {
    //   return {
    //     model: p.model,
    //     index: p.index,
    //     score: p.balance,
    //     detail: p.detailBalance
    //   }
    // })
    //
    // const gameOverMsg = {
    //   states,
    //   juShu: this.restJushu,
    //   isPublic: this.room.isPublic,
    //   ruleType: this.rule.ruleType,
    //   juIndex: this.room.game.juIndex,
    //   creator: this.room.creator.model._id,
    // }
    //
    // this.room.broadcast('game/game-over', gameOverMsg)
    // this.stateData.gameOver = gameOverMsg
    // this.roomGameOver(states, '')
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
      player.sendMessage('game/reconnect', content)
    })

    room.once('empty', this.onRoomEmpty = () => {
      console.log('room empty');
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
      return player === reconnectPlayer ? player.statusForSelf(this) : player.statusForOther(this)
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

  removeListeners(player) {
    player.removeListenersByNames(this.listenerOn)
  }

  removeAllPlayerListeners() {
    this.players.forEach(p => p.removeListenersByNames(this.listenerOn))
  }

  destroy() {
    clearTimeout(this.autoCommitTimer)
    this.removeRoomListener()
    this.removeAllPlayerListeners()
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
    // if (this.room.gameRule.isPublic) {
    //   const result = publicRoomFirstPlayCard(player.cards);
    //   if (result) {
    //     return result;
    //   }
    // }
    const anotherTeam = this.getAnotherTeam(player.team);
    const count = anotherTeam.filter(p => p.cards.length === 1).length;
    const excludePattern = [];
    const groups = groupBy(player.cards, (card: Card) => card.point)
      .filter(group => group.length >= 2);
    if (count > 0 && groups.length > 0) {
      // 对手只剩一张，且有非单张的牌，不出单张
      excludePattern.push(PatterNames.single);
    }
    return firstPlayCard(player.cards, excludePattern);
  }

  // 根据出牌模式出牌
  promptWithPattern(player: PlayerState) {
    let flag = true;
    // 跳过炸弹
    let skipBomb = false;
    const probability = this.getProbability();
    // 检查是不是队友,
    if (this.status.lastPattern.name !== PatterNames.bomb) {
      // 普通队友牌能吃必吃
      if (player.index === this.players[this.status.lastIndex].teamMate) {
        if (this.foundFriend) {
          // 已经显示队友，如果剩下的牌数跟出牌数一样，那就出
          if (this.players[this.status.lastIndex].cards.length <= 3) {
            // 不压
            flag = false;
          } else {
            flag = this.status.lastPattern.cards.length === player.cards.length;
          }
        } else {
          // 没显示队友，跳过炸弹压制
          flag = true;
          skipBomb = true;
        }
      } else {
        flag = true;
      }
    } else {
      if (player.index === this.players[this.status.lastIndex].teamMate) {
        // 同队友，不吃炸弹
        return []
      } else {
        // 不是同队友
        if (this.foundFriend) {
          // 显示队友，必出
          flag = true;
        } else {
          // 有50%概率吃
          if (!probability) {
            return [];
          }
        }
      }
    }
    const matcher = new BombMatcher();
    const bombPattern = {
      name: PatterNames.bomb,
      score: 0,
      cards: Array.from({ length: 4 }),
    };
    const bombCard = matcher.promptWithPattern( bombPattern as IPattern, player.cards);
    // 没有炸弹卡
    const noBomb = bombCard.length === 0;
    const cardList = findMatchedPatternByPattern(this.status.lastPattern, player.cards, flag)
    for (const cards of cardList) {
      const bombResult = matcher.verify(cards);
      if (bombResult && skipBomb) {
        // 跳过炸弹
        continue;
      }
      if (!noBomb) {
        // 有炸弹，普通牌不能带鬼牌
        const jokerCount = cards.filter(value => value.type === CardType.Joker).length;
        if (jokerCount > 0) {
          // 检查card是不是炸弹
          if (!bombResult) {
            // 不是炸弹不能带鬼牌
            continue;
          }
          if (jokerCount >= 4) {
            const point = {
              // 4炸1000分
              4: 1000,
              // 5炸 2000
              5: 2000,
              // 6炸 3000
              6: 3000,
            }
            if (point[jokerCount] > this.status.lastPattern.score && point[jokerCount] !== bombResult.score) {
              // 单独的王炸也能大
              continue;
            }
          }
        }
      }
      const isOk = isGreaterThanPattern(cards, this.status.lastPattern)
      if (isOk) {
        return cards;
      }
    }
    return [];
  }

  protected fenInCards(cards: Card[]): number {
    return cards.reduce((fen, card) => {
      return fen + card.fen()
    }, 0)
  }

  private async _fapai() {
    this.initCards()
    this.shuffle()
    this.stateData = {}

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]
      p.cards = [...p.cards, ...this.takeQuarterCards(p)];
    }
  }

  private haveFourJokers(p: PlayerState) {
    return p.cards.filter(c => c.type === CardType.Joker).length >= 4
  }

  private rollReshuffle() {
    return Math.random() < 0.83
  }

  private drawGameBombScore(player: PlayerState): number {
    const unUsedBombs = this.getPlayerUnUsedBombs(player);

    const usedBombScore = player.usedBombs.reduce((score, b) => this.bombScorer(b) + score, 0)

    const unUsedBombScore = unUsedBombs.map(cards => findFullMatchedPattern(cards))
      .reduce((score, bomb) => this.bombScorer(bomb) + score, 0)

    return usedBombScore + unUsedBombScore
  }

  private notifyTeamMateWhenTeamMateWin(player: PlayerState, daCards: Card[]) {
    const teamMate = this.players[player.teamMate]
    if (teamMate && teamMate.cards.length === 0) {
      teamMate.sendMessage('game/teamMateCards', {cards: player.cards, daCards})
    }
  }

  private getProbability() {
    return Math.random() < 0.5;
  }

  // 查找队友
  getFriendPlayer(playerId, team) {
    for (const p of this.players) {
      if (p && p.team === team) {
        if (p.model._id !== playerId) {
          return p;
        }
      }
    }
    // 没找到队友
    return null;
  }

  // 查找对手
  getAnotherTeam(team) {
    return this.players.filter(p => p && p.team !== team)
  }
}

export default Table
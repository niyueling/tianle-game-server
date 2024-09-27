import * as EventEmitter from 'events'
// @ts-ignore
import {pick} from 'lodash'
import {DummyRecorder, IGameRecorder} from '../GameRecorder'
import {autoSerialize, autoSerializePropertyKeys, Serializable, serializeHelp} from "../serializeDecorator"
import Card, {CardType} from './card'
import Timer = NodeJS.Timer;
import {findFullMatchedPattern, findMatchedPatternByPattern} from "./patterns"
import {IPattern, PatterNames} from "./patterns/base"
import Room from './room'
import Rule from './Rule'
import {default as Table, Team} from "./table"

const removeCard = (src, odst) => {
  const dst = odst.slice()
  return src
    .filter(c =>
      !dst.some((daCard, idx) => {
        const equal = c.equal(daCard)
        if (equal) {
          dst.splice(idx, 1)
        }
        return equal
      }))
}

class DetailBalance {

  addScore(score: number, cate: string) {
    if (this[cate]) {
      this[cate] += score
    } else {
      this[cate] = score
    }
  }
}

class PlayerState implements Serializable {
  timeoutTask: Timer
  canDeposit: boolean = false

  @autoSerialize
  lastAction: 'da' | 'guo' = null

  room: Room

  @autoSerialize
  zhuang: boolean = false

  @autoSerialize
  ip: string

  @autoSerialize
  cards: Card[]
  emitter: EventEmitter

  @autoSerialize
  events: any
  recorder: IGameRecorder
  record: (event: string, cards?: Card[]) => void
  rule: Rule
  // model: any
  disconnectCallBack: (args) => void
  score: number
  msgDispatcher: any
  onDeposit: boolean = false
  msgHook: any
  isOperated: boolean

  @autoSerialize
  winOrder = 99

  balance = 0
  isBroke = false
  detailBalance: DetailBalance = new DetailBalance()

  @autoSerialize
  unusedJokers: number = 0

  @autoSerialize
  index = 0

  @autoSerialize
  team = Team.NoTeam

  @autoSerialize
  teamMate: number = -1
  // foundTeamMate: boolean = false;

  @autoSerialize
  zhuaFen = 0

  @autoSerialize
  mode: "teamwork" | "solo" | "unknown" = 'unknown'

  @autoSerialize
  usedBombs: IPattern[] = []

  @autoSerialize
  lastPattern: IPattern = null

  @autoSerialize
  cleaned: boolean = false

  @autoSerialize
  isHelp: boolean = false

  @autoSerialize
  helpInfo: object = {}

  @autoSerialize
  rateLevel: object = {}

  @autoSerialize
  foundFriend: boolean = false

  // 已经出掉的牌
  @autoSerialize
  dropped: any[]


  constructor(userSocket, room, rule, isHelp = false) {
    this.room = room
    this.zhuang = false
    this.rule = rule
    this.isHelp = isHelp
    this.ip = userSocket && userSocket.getIpAddress() || '127.0.0.1'
    // this.model = userSocket.model
    this.emitter = new EventEmitter()
    this.helpInfo = {}
    this.rateLevel = {}
    this.cards = []
    this.dropped = [];
    this.score = room.getScoreBy(userSocket)
    this.disconnectCallBack = player => {
      if (player === this.msgDispatcher) {
        this.onDisconnect()
      }
    }
    this.listenDispatcher(userSocket)
    this.msgDispatcher = userSocket
    this.events = {}

    this.isOperated = false
    this.recorder = new DummyRecorder()
  }

  get model() {
    return this.msgDispatcher.model;
  }

  getCardsArray(): Card[] {
    return this.cards
  }

  listenDispatcher(socket?) {
    return;
  }

  setGameRecorder(r) {
    this.recorder = r
    this.record = (event, cards?) => this.recorder.recordUserEvent(this, event, cards)
    return this
  }

  toJSON() {
    const playerStatJson = serializeHelp(this)
    playerStatJson._id = this.model._id
    return playerStatJson
  }

  resume(tableStateJson) {
    const keys = autoSerializePropertyKeys(this)
    Object.assign(this, pick(tableStateJson, keys))

    if (this.cards) {
      this.cards = this.cards.map(card => Card.from(card))
    }
  }

  onShuffle(remainCards, juShu, cards: Card[], seatIndex, juIndex, needShuffle = false) {
    this.cards = cards
    this.index = seatIndex

    this.recorder.recordUserEvent(this, 'shuffle')
    this.unusedJokers = this.cards.filter(c => c.type === CardType.Joker).length

    this.sendMessage('game/ShuffleCards', {ok: true, data: {juShu, cards, remainCards, juIndex, needShuffle}})
  }

  tryDaPai(daCards) {
    const cardCopy = this.cards.slice()
    const originLength = cardCopy.length

    const afterRemoveCards = removeCard(cardCopy, daCards)

    return originLength - afterRemoveCards.length === daCards.length
  }

  daPai(daCards: Card[], pattern: IPattern) {
    this.cards = removeCard(this.cards, daCards)
    this.lastPattern = pattern
    this.lastAction = 'da'
    this.dropped.push(daCards)
    this.clearDepositTask()
    this.record('da', daCards)
  }

  get remains() {
    return this.cards.length
  }

  get seatIndex() {
    return this.index
  }

  on(event, callback) {
    this.emitter.on(event, callback)
  }

  onDisconnect() {
    this.removeAllListeners()
  }

  removeAllListeners() {
    if (this.msgDispatcher) {
      const allNames = Object.keys(this.msgDispatcher.getGameMsgHandler())
      this.removeListenersByNames(allNames)
      this.msgDispatcher.removeListener('disconnect', this.disconnectCallBack)
    }
  }

  removeListenersByNames(names) {
    if (this.msgDispatcher) {
      names.forEach(name => this.msgDispatcher.removeAllListeners(name))
    }
  }

  sendMessage(name, data) {
    this.msgDispatcher.sendMessage(name, data)
    return data
  }

  reconnect(msgDispatcher) {
    this.msgDispatcher = msgDispatcher
    this.onDeposit = false
    this.clearDepositTask()
    this.listenDispatcher(msgDispatcher)
  }

  get _id(): string {
    return this.model._id
  }

  zhua(fen: number) {
    this.zhuaFen += fen
  }

  winFrom(loser: PlayerState, score: number, cate: string = 'base') {
    if (this.room.preventTimes[loser.model.shortId] > 0) {
      // 记录免输
      loser.detailBalance.addScore(score, 'noLoss')
    }
    this.balance += score
    loser.balance -= score
    this.detailBalance.addScore(score, cate)
    loser.detailBalance.addScore(-score, cate)
  }

  // 金豆房奖池
  winFromReward(score) {
    this.balance += score
    this.detailBalance.addScore(score, 'rubyReward')
  }

  recordBomb(pattern: IPattern) {
    this.usedBombs.push(pattern)
  }

  bombScore(scorer: (bomb: IPattern) => number) {
    return this.usedBombs.reduce((score, bomb) => {
      return score + scorer(bomb)
    }, 0)
  }

  private baseStatus(table: Table) {
    return {
      model: this.model,
      index: this.index,
      zhuaFen: this.zhuaFen,
      ip: this.ip,
      droppedCards: this.dropped,
      score: this.room.getScoreBy(this._id),
      remains: this.cards.length,
      lastPattern: this.lastPattern,
      lastAction: this.lastAction,
      mode: this.mode,
      team: this.team,
      bombScore: this.bombScore(table.bombScorer)
    }
  }

  statusForSelf(table: Table) {
    const base = this.baseStatus(table)
    return {
      ...base,
      pukerCards: this.cards,
    }
  }

  statusForOther(table: Table) {
    return this.baseStatus(table)
  }

  guo() {
    this.lastAction = 'guo'
    this.record('guo')
    this.clearDepositTask()
  }

  clearCards() {
    if (!this.cleaned) {
      this.cleaned = true
      this.sendMessage('game/clearCards', {ok: true, data: {}})
    }
  }

  getTeamMate() {
    return this.teamMate
  }

  clearDepositTask() {
    clearTimeout(this.timeoutTask)
  }

  deposit(callback) {
    let minutes = 15 * 1000

    // if (!this.canDeposit) {
    //   return
    // }

    if (!this.msgDispatcher) {
      return
    }

    if (!this.room.isPublic && !this.rule.ro.autoCommit) {
      return ;
    }
    if (!this.room.isPublic && this.rule.ro.autoCommit) {
      minutes = (this.rule.ro.autoCommit + 1) * 1000
    }

    if (!this.onDeposit) {
      this.timeoutTask = setTimeout(() => {
        this.onDeposit = true
        this.sendMessage('game/startDeposit', {ok: true, data: {}})
        callback()
        this.timeoutTask = null
      }, minutes)
    } else {
      const isRobot = this.msgDispatcher.isRobot()

      this.timeoutTask = setTimeout(() => {
        callback()
        this.timeoutTask = null
      }, isRobot ? 1000 : 3000)
    }
  }

  cancelDeposit() {
    this.onDeposit = false
    const cards = this.cards
    this.clearDepositTask()
    this.sendMessage('game/cancelDepositReply', {ok: true, data: {cards}})
  }

  unusedBombs(): IPattern[] {

    const cardsExcludeJoker = this.cards.filter(c => c.type !== CardType.Joker)
    const jokers = this.cards.filter(c => c.type === CardType.Joker)
    const bombs = findMatchedPatternByPattern({name: PatterNames.bomb, score: 1, cards: []}, cardsExcludeJoker)

    const maxLengthGroup = bombs[bombs.length - 1] || []

    const groupOf2 = bombs.find( cards => cards[0].value === 2) || []

    const maxLength = Math.max(maxLengthGroup.length, groupOf2.length + 1)

    if (jokers.length === 4 && maxLength < 6) {
      bombs.push(jokers)
    } else {
      if (maxLengthGroup.length > groupOf2.length + 1) {
        maxLengthGroup.push(...jokers)
      } else {
        groupOf2.push(...jokers)
      }
    }

    return bombs.map(cs => findFullMatchedPattern(cs))
  }

  unusedBombsScore(bombScorer: (bomb: IPattern) => number) {
    return this.unusedBombs().reduce((score, bomb) => bombScorer(bomb) + score, 0)
  }
}

export default PlayerState

import * as EventEmitter from 'events'
// @ts-ignore
import {pick} from 'lodash'
import {DummyRecorder, IGameRecorder} from '../GameRecorder'
import {autoSerialize, autoSerializePropertyKeys, Serializable, serializeHelp} from "../serializeDecorator"
import Card, {CardType} from './card'
import Timer = NodeJS.Timer;
import {arraySubtract, IPattern} from "./patterns/base"
import Room from './room'
import Rule from './Rule'
import {default as Table, Team} from "./table"

const removeCard = (src, odst) => {
  try {
    const dst = odst.slice()
    return src
      .filter(c =>
        !dst.some((daCard, idx) => {
          const equal = c.equal(daCard);
          if (equal) {
            dst.splice(idx, 1);
          }
          return equal;
        }))
  } catch (e) {
    console.warn("src %s odst %s", JSON.stringify(src), JSON.stringify(odst));
  }

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
  mode = "teamwork";

  @autoSerialize
  isChooseMode = false;

  @autoSerialize
  multiple: number = 1

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
  foundFriend: boolean = true

  @autoSerialize
  payTributeState: boolean = false

  @autoSerialize
  returnTributeState: boolean = false

  @autoSerialize
  payTributeCard: Card

  @autoSerialize
  returnTributeCard: Card

  @autoSerialize
  payTributeIndex: number = -1

  @autoSerialize
  returnTributeIndex: number = -1

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
      if (player._id.toString() === this.msgDispatcher._id.toString()) {
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
    return this.cards.sort((a, b) => a.point - b.point);
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

  onShuffle(remainCards, juShu, cards: Card[], seatIndex, juIndex, needShuffle = false, cardRecorderStatus, levelCardArray) {
    this.cards = cards
    this.index = seatIndex

    this.recorder.recordUserEvent(this, 'shuffle')
    this.unusedJokers = this.cards.filter(c => c.type === CardType.Joker).length

    this.sendMessage('game/ShuffleCards', {ok: true, data: {juShu, cards, remainCards, juIndex, needShuffle, cardRecorderStatus, levelCardArray, team: this.team}})
  }

  tryDaPai(daCards) {
    const cardCopy = this.cards.slice()
    const originLength = cardCopy.length

    const afterRemoveCards = arraySubtract(cardCopy, daCards);

    return originLength - afterRemoveCards.length === daCards.length
  }

  daPai(daCards: Card[], pattern: IPattern) {
    this.cards = arraySubtract(this.cards, daCards)
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

  private async baseStatus(table: Table) {
    // 判断是否使用记牌器
    const cardRecorderStatus = await this.room.gameState.getCardRecorder(this);
    return {
      model: this.model,
      index: this.index,
      ip: this.ip,
      cardRecorderStatus,
      droppedCards: this.dropped,
      score: this.room.getScoreBy(this._id),
      remains: this.cards.length,
      lastPattern: this.lastPattern,
      lastAction: this.lastAction,
      mode: this.mode,
      team: this.team,
      teamMate: [this.index, this.teamMate],
      payTributeState: this.payTributeState,
      payTributeCard: this.payTributeCard,
      payTributeIndex: this.payTributeIndex,
      returnTributeState: this.returnTributeState,
      returnTributeCard: this.returnTributeCard,
      returnTributeIndex: this.returnTributeIndex,
    }
  }

  async statusForSelf(table: Table) {
    const base = await this.baseStatus(table)
    return {
      ...base,
      pukerCards: this.cards,
    }
  }

  async statusForOther(table: Table) {
    return await this.baseStatus(table)
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
    let minutes = 5 * 1000;

    if (this.room.gameState.tableState !== 'selectMode') {
      minutes = 15;
    }

    console.warn("1 tableState %s isPublic %s autoCommit %s", this.room.gameState.tableState, this.room.isPublic, this.rule.ro.autoCommit);

    if (!this.msgDispatcher) {
      return ;
    }

    if (!this.room.isPublic && !this.rule.ro.autoCommit) {
      return ;
    }
    if (!this.room.isPublic && this.rule.ro.autoCommit) {
      minutes = (this.rule.ro.autoCommit + 1) * 1000
    }

    console.warn("1 tableState %s minutes %s", this.room.gameState.tableState, minutes);

    if (!this.onDeposit) {
      this.timeoutTask = setTimeout(async () => {
        console.warn("2 tableState %s minutes %s", this.room.gameState.tableState, minutes);
        // 如果是选择加倍，默认选择不加倍
        if (this.room.gameState.tableState === 'selectMode') {
          await this.room.gameState.onSelectMode(this, 1);
        } else {
          this.onDeposit = true
          this.sendMessage('game/startDeposit', {ok: true, data: {}})
          callback()
          this.timeoutTask = null
        }

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
}

export default PlayerState

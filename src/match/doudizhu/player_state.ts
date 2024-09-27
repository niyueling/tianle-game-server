import * as EventEmitter from 'events'
// @ts-ignore
import {pick, random} from 'lodash'
import {IGameRecorder} from '../GameRecorder'
import {DummyRecorder} from '../GameRecorder'
import Timer = NodeJS.Timer;
import {autoSerialize, autoSerializePropertyKeys, Serializable, serializeHelp} from "../serializeDecorator"
import Card, {CardType} from './card'
import {IPattern} from "./patterns/base";
import Room from './room'
import Rule from './Rule'
import {default as Table} from "./table";
import enums from "./enums";
import Enums from "../xmmajiang/enums";
import {genCardArray} from "../xmmajiang/player_state";

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
  timeoutTask: Timer;

  canDeposit: boolean = true;

  @autoSerialize
  lastAction: 'da' | 'guo' = null;

  room: Room

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
  model: any
  disconnectCallBack: (anyData: any) => void
  score: number
  msgDispatcher: any
  onDeposit: boolean = false
  isOperated: boolean

  winOrder = 99

  balance = 0

  detailBalance: DetailBalance = new DetailBalance()
  unusedJokers: number = 0

  @autoSerialize
  index = 0

  teamMate: number = -1;
  mode = 'unknown';
  private usedBombs: IPattern[] = [];

  @autoSerialize
  lastPattern: IPattern = null
  cleaned: boolean = false;
  foundFriend: boolean = false;

  // 是否操作翻倍选择
  isMultiple: boolean = false;
  // 用户是否选择翻倍
  double: number = 1;
  // 是否明牌
  isOpenCard: boolean = false;
  // 明牌倍数
  openMultiple: number = 1;
  // 小局倍数
  multiple: number = 1;
  // 是否机器人
  isRobot: boolean = false;
  // 托管时间
  depositTime: number = 15;
  // 是否过牌托管
  isGuoDeposit: boolean = false;

  // 已经出掉的牌
  @autoSerialize
  dropped: any[]

  constructor(userSocket, room, rule) {
    this.room = room
    this.zhuang = false
    this.rule = rule
    this.ip = userSocket && userSocket.getIpAddress()
    this.model = userSocket.model
    this.emitter = new EventEmitter()
    this.cards = []
    this.dropped = [];
    this.score = room.getScoreBy(userSocket)
    this.disconnectCallBack = player => {
      if (player._id.toString() === this.msgDispatcher._id.toString()) {
        this.onDisconnect()
      }
    }
    this.listenDispatcher(userSocket)
    this.isRobot = !!userSocket.isRobot();
    this.msgDispatcher = userSocket
    this.events = {}

    this.isOperated = false
    this.recorder = new DummyRecorder()
    this.onDeposit = false;
    this.mode = 'unknown';
    this.isMultiple = false;
    this.double = 1;
    this.isOpenCard = false;
    this.openMultiple = 1;
    this.multiple = 1;
  }

  getCardsArray(): Card[] {
    return this.cards
  }

  listenDispatcher(socket) {
    socket.on('game/guo', msg => {
      this.emitter.emit(enums.guo, msg)
    })
    socket.on('game/da', msg => {
      this.emitter.emit(enums.da, msg)
    })
    socket.on('game/openDeal', msg => {
      this.emitter.emit(enums.openDeal, msg)
    })
    socket.on('game/cancelDeposit', msg => {
      this.emitter.emit(enums.cancelDeposit, msg);
    })
    socket.on('game/callLandload', msg => {
      this.emitter.emit(enums.chooseMode, msg);
    })
    socket.on('game/refresh', msg => {
      this.emitter.emit(enums.refresh, msg);
    })
    socket.on('game/chooseMultiple', msg => {
      this.emitter.emit(enums.chooseMultiple, msg);
    })
  }

  setGameRecorder(r) {
    this.recorder = r
    this.record = (event, cards?) => this.recorder.recordUserEvent(this, event, cards)
    return this
  }

  onShuffle(juShu, cards: Card[], seatIndex, juIndex, needShuffle: boolean, allPlayerCards, cardRecorderStatus) {
    this.cards = cards
    this.index = seatIndex

    this.recorder.recordUserEvent(this, 'shuffle')
    this.unusedJokers = this.cards.filter(c => c.type === CardType.Joker).length
    this.sendMessage('game/ShuffleCards', {ok: true, data: {juShu, cards, juIndex, needShuffle: !!needShuffle, allPlayerCards, cardRecorderStatus }})
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

  // 防止客户端未更新, 出牌数对不上
  tryDaPai(daCards) {
    // // TODO 先用 tag 判断
    // const isOk = this.isCardExists(daCards);
    // if (isOk) {
    //   return true;
    // }
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
      Object.keys(this.msgDispatcher.getGameMsgHandler()).forEach(x => {
        this.msgDispatcher.removeAllListeners(x)
      })
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

  winFrom(loser: PlayerState, score: number, cate: string = 'base') {
    this.balance += score
    loser.balance -= score
    this.detailBalance.addScore(score, cate)
    loser.detailBalance.addScore(-score, cate)
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
      mode: this.mode,
      multiple: this.multiple,
      droppedCards: this.dropped,
      index: this.index,
      score: this.room.getScoreBy(this._id),
      remains: this.cards.length,
      lastPattern: this.lastPattern,
      lastAction: this.lastAction,
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
      this.sendMessage('game/clearCards', {})
    }
  }

  getTeamMate() {
    return this.teamMate
  }

  clearDepositTask() {
    clearTimeout(this.timeoutTask)
  }

  // 托管
  deposit(callback) {
    if (this.room.gameState.currentPlayerStep === -1) {
      console.warn(this.room.gameState.currentPlayerStep);
      return;
    }

    const randomNumber = Math.floor(Math.random() * 4) + 2;
    let minutes = this.isRobot ? randomNumber * 1000 : 5 * 1000;

    // 好友房设置不托管
    if (!this.room.isPublic && !this.rule.ro.autoCommit) {
      return ;
    }

    // 游戏结束不进入托管
    if (this.room.gameState && this.room.gameState.state === 4) {
      return;
    }

    if (!this.room.isPublic && this.rule.ro.autoCommit && this.room.gameState && this.room.gameState.state === 3) {
      minutes = (this.rule.ro.autoCommit + 1) * 1000;
    }

    if (this.room.isPublic && this.room.gameState && this.room.gameState.state === 3) {
      minutes = 15 * 1000;
    }

    this.cancelTimeout()

    if (!this.onDeposit) {
      this.timeoutTask = setTimeout(() => {
        if (this.room.gameState && this.room.gameState.currentPlayerStep === this.index) {
          this.onDeposit = true
          if (this.room.gameState && this.room.gameState.state === 3) {
            this.sendMessage('game/startDepositReply', {ok: true, data: {}})
          }
        }

        callback()
        this.timeoutTask = null
      }, minutes)
    } else {
      const isRobot = this.msgDispatcher.isRobot()

      this.timeoutTask = setTimeout(() => {
        callback()
        this.timeoutTask = null
      }, isRobot ? random(500, 1500) : 1000)
    }
  }

  cancelTimeout() {
    if (this.timeoutTask != null) {
      clearTimeout(this.timeoutTask)
      this.timeoutTask = null
    }
  }

  cancelDeposit() {
    if (this.room.gameState.currentPlayerStep === -1) {
      return;
    }

    this.onDeposit = false;
    const cards = this.cards
    this.clearDepositTask();
    this.sendMessage('game/cancelDepositReply', {ok: true, data: {cards}});

    console.warn("current-%s, seatIndex-%s", this.room.gameState.status.current.seatIndex, this.index);
    if (this.room.gameState.status.current.seatIndex === this.index) {
      this.emitter.emit('waitForDa');
    }
  }

  // // 是否存在该卡
  // isCardExists(cardList: Card[]) {
  //   for (const card of this.cards) {
  //     for (let i = 0; i < cardList.length; i++) {
  //       const target = cardList[i];
  //       if (card.tag === target.tag) {
  //         // 找到了
  //         cardList.splice(i, 1);
  //         break;
  //       }
  //     }
  //   }
  //   return cardList.length === 0;
  // }
}

export default PlayerState

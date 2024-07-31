import * as EventEmitter from 'events'
import {pick} from 'lodash'
import {SimplePlayer} from "../IRoom"
import {autoSerialize, autoSerializePropertyKeys, Serializable, serializeHelp} from "../serializeDecorator"
import Analyzer from "./analyzer"
import Card from './card'
import {Suit} from "./combiner";
import Combo from "./combo";
import {DummyRecorder, IGameRecorder} from './GameRecorder'
import Room from './room'
import Rule from './Rule'
import GameCheckRecord from "../../database/models/gameCheckRecord";

interface BasicCommit {
  head: Card[],
  middle: Card[],
  tail: Card[],
  score: number
  isQiPai?: false
}

interface QiPaiCommit {
  head: Card[],
  middle: Card[],
  tail: Card[]
  isQiPai: true,
  name: string
  score: number
}

export type Commit = BasicCommit | QiPaiCommit

class PlayerState implements SimplePlayer, Serializable {

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
  record: (event: string, card: number) => void
  rule: Rule
  model: any
  disconnectCallBack: (anyArgs) => void

  @autoSerialize
  score: number
  msgDispatcher: any

  @autoSerialize
  onDeposit: any
  msgHook: any

  @autoSerialize
  seatIndex: number

  @autoSerialize
  // tslint:disable-next-line:variable-name
  _id: string
  lastConfirm: boolean

  @autoSerialize
  isZhuang: boolean

  @autoSerialize
  isOperated: boolean

  @autoSerialize
  isQiangZhuang: boolean

  @autoSerialize
  suit: Suit = null

  constructor(userSocket, room, rule) {
    this.room = room;
    this.zhuang = false;
    this.rule = rule;
    this.ip = userSocket && userSocket.getIpAddress();
    this.model = userSocket.model;
    this.emitter = new EventEmitter();
    this.cards = []
    this.score = room.getScoreBy(userSocket);
    this.disconnectCallBack = () => {
      this.onDisconnect();
    };
    this.listenDispatcher(userSocket);
    this.msgDispatcher = userSocket
    this.events = {}

    this.isOperated = false
    this.recorder = new DummyRecorder()
  }

  toJSON() {
    return serializeHelp(this)
  }

  resume(tableStateJson) {
    const keys = autoSerializePropertyKeys(this)
    Object.assign(this, pick(tableStateJson, keys))

    if (this.cards) {
      this.cards = this.cards.map(card => Card.from(card))
    }
  }

  setQiangZhuang(qiang: boolean) {
    this.isOperated = true
    this.isQiangZhuang = qiang
  }

  setZhuang() {
    this.isZhuang = true
  }

  getCardsArray(): Card[] {
    return this.cards
  }

  get committed(): boolean {
    return this.suit !== null
  }

  get maPaiCount(): number {
    return this.cards.filter(card => this.rule.maPaiArray.findIndex(ma => ma.equal(card)) > -1).length
  }

  setLastConfirm() {
    this.lastConfirm = true
  }

  analyze(commit: Commit): Suit {
    if (commit.isQiPai) {
      const r = this.qiPaiCheck(commit.name)
      return Suit.qiPai(r.sorted, commit.name, commit.score)
    }

    return this.analyzeSuit(commit)
  }

  isRobot() {
    return false;
  }

  addGold() {
    return;
  }

  analyzeSuit(commit) {
    const max = (combos: Combo[]) => combos.sort((a, b) => b.score - a.score)[0]

    const head = max(new Analyzer(commit.head).analyze())
    const middle = max(new Analyzer(commit.middle).analyze())
    const tail = max(new Analyzer(commit.tail).analyze())

    head.cards = commit.head
    middle.cards = commit.middle
    tail.cards = commit.tail

    return Suit.notQiPai(head, middle, tail)
  }

  setCommit(commit: Commit) {
    this.suit = this.analyze(commit)
  }

  formatCheck(ci: Commit) {
    return ci.head.length === 3
      && ci.middle.length === 5
      && ci.tail.length === 5
  }

  integrityCheck(commit: Commit) {
    const {head, middle, tail} = commit
    const array: Card[] = [...head, ...middle, ...tail]
      .map(Card.from)

    const eqlCount = array
      .map(ciCard => this.inCards(ciCard))
      .filter(bool => bool)
      .length;

    const check = eqlCount === this.cards.length;

    if (!check) {
      console.warn("commit-%s, array-%s, eqlCount-%s, cardCount-%s", JSON.stringify(commit),
        JSON.stringify(array), eqlCount, this.cards.length);
    }

    return check;
  }

  increaseCheck(commit: Commit) {
    const suit = this.analyze(commit)
    return suit.tail.score >= suit.middle.score
      && suit.middle.score > suit.head.score
  }

  async verify(commit: Commit) {
    const data = {
      player: this.model._id,
      commit,
      roomId: this.room._id,
      juIndex: this.room.game.juIndex,
      isQiPai: false,
      formatCheck: false,
      integrityCheck: false,
      increaseCheck: false,
      qiPaiCheck: {}
    }
    if (commit.isQiPai) {
      data.isQiPai = commit.isQiPai;
      const verifyResult = this.qiPaiCheck(commit.name)
      data.qiPaiCheck = verifyResult;
      await GameCheckRecord.create(data);
      return verifyResult.verify && verifyResult.score === commit.score
    }

    data.formatCheck = this.formatCheck(commit);
    data.integrityCheck = this.integrityCheck(commit);
    data.increaseCheck = this.increaseCheck(commit);

    if (!data.formatCheck || !data.integrityCheck || !data.increaseCheck) {
      console.log(JSON.stringify(data));
    }

    await GameCheckRecord.create(data);

    return data.formatCheck
      && data.integrityCheck
      && data.increaseCheck
  }

  qiPaiCheck(name) {
    return new Analyzer(this.cards).verifyQiPai(name)
  }

  inCards(tester: Card) {
    return this.cards.findIndex(card => card.equal(tester)) !== -1
  }

  listenDispatcher(playerSocket) {
    playerSocket.on('disconnect', this.disconnectCallBack)
  }

  setGameRecorder(r) {
    this.recorder = r
    this.record = (event, card) => this.recorder.recordUserEvent(this, event, card)
    return this
  }

  onShuffle(remainCards, juShu, cards: Card[], seatIndex, juIndex, needShuffle?: boolean) {
    this.cards = cards
    this.seatIndex = seatIndex

    this.recorder.recordUserEvent(this, 'shuffle')
    this.sendMessage('game/Shuffle', {juShu, cards, remainCards, juIndex, needShuffle: !!needShuffle});
  }

  on(event, callback) {
    this.emitter.on(event, callback);
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
    this.listenDispatcher(msgDispatcher)
  }
}

export default PlayerState

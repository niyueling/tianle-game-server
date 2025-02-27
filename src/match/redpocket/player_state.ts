/**
 * Created by Color on 2016/7/7.
 */
import * as EventEmitter from 'events'
// @ts-ignore
import {pick, random} from 'lodash'
import {autoSerialize, autoSerializePropertyKeys, Serializable, serializeHelp} from "../serializeDecorator"
import basicAi, {playerAi} from './ai'
import Enums from './enums'
import {DummyRecorder, IGameRecorder} from './GameRecorder'
import HuPaiDetect from './HuPaiDetect'
import Room from './room'
import Rule from './Rule'
import {manager} from "./cardManager";
import roomRecord from "../../database/models/roomRecord";
import {GameType} from "@fm/common/constants";

export class SourceCardMap extends Array<number> {
  first: boolean
  haiDi: boolean
  takeSelfCard: boolean
  lastTakeCard: number
  gang: boolean
  qiaoXiang: boolean
  caiShen: number[]
  turn: number
  alreadyTakenCard?: boolean
  qiangGang?: boolean

}

export const genCardArray = cards => {
  const cardArray = []
  const pushN = (c, n) => {
    for (let i = 0; i < n; i++) {
      cardArray.push(c)
    }
  }

  cards.forEach((v, c) => {
    pushN(c, v)
  })

  return cardArray
}

interface iAi {
  getUseLessCard(cards: any, currentCard: number): number;

  onWaitForDa(actions: any, cards: any): string;

  onCanDoSomething(actions: any, cards: any, card: any): string;
}

function triggerAfterAction(target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const ret = originalMethod.apply(this, args);
    if (ret) {
      if (this.onAfterAction) {
        this.onAfterAction()
        delete this.onAfterAction
      }
    }
    return ret
  };

  return descriptor;
}

function recordChoiceAfterTakeCard(target, key, propDesc: PropertyDescriptor) {
  const takeCard = propDesc.value

  propDesc.value = function (...args) {
    const message = takeCard.apply(this, args)

    if (!message) return

    if (message.chi || message.peng || message.hu || message.gang) {
      this.record('choice', args[1], message)
    }

    return message
  }
}

class PlayerState implements Serializable {
  ai: iAi
  room: Room

  @autoSerialize
  zhuang: boolean = false

  @autoSerialize
  ip: string

  @autoSerialize
  cards: SourceCardMap

  @autoSerialize
  dropped: number[]

  @autoSerialize
  huCards: number[]

  emitter: EventEmitter

  @autoSerialize
  lastDa: boolean = false

  @autoSerialize
  events: any

  recorder: IGameRecorder

  record: (event: string, card: number, choice?: any) => void

  rule: Rule
  model: any
  disconnectCallBack: (anyArgs) => void
  @autoSerialize
  score: number

  contactCounter: { [playerId: string]: number }

  msgDispatcher: any
  onDeposit: any

  timeoutTask: any
  msgHook: any
  takeCardStash: any

  pengForbidden: any[]

  @autoSerialize
  huForbiddenCards: number[]
  @autoSerialize
  huForbiddenFan: number
  lastOptions: any
  lastCardToken: number

  @autoSerialize
  huInfo: any
  @autoSerialize
  turn: number

  @autoSerialize
  hadQiaoXiang: boolean = false

  @autoSerialize
  tingPai: boolean = false

  @autoSerialize
  caiShen: number[]
  lockMsg: boolean = false

  @autoSerialize
  locked: boolean = false

  @autoSerialize
  seatIndex: number

  @autoSerialize
  _id: string
  takeLastCard: boolean

  @autoSerialize
  base: number
  @autoSerialize
  canDeposit: boolean = false
  @autoSerialize
  alreadyTakenCard: boolean = false

  @autoSerialize
  gang: boolean

  @autoSerialize
  freeCard: number

  @autoSerialize
  forbidCards: number[]

  @autoSerialize
  extra: number

  gangFrom: this[] = []

  @autoSerialize
  gangForbid: number[] = []

  @autoSerialize
  balance: number = 0

  @autoSerialize
  niaoCount: number = 0

  @autoSerialize
  niaoCards: number[] = []

  buyer: any[] = []

  onAfterAction: () => void

  @autoSerialize
  fangGangCount: number = 0
  // 是否破产
  isBroke: boolean = false
  // 金豆奖励
  rubyReward: number = 0

  // 本局积分
  juScore = 0

  // 是否计算对局
  isCalcJu = false

  // 明牌加分
  openCardScore: number = 1

  isMingCard = false

  // 巅峰对决摸到的牌
  competiteCards: any[] = []

  // 巅峰对决前的手牌
  oldCards: any[] = []

  // 开局是否打牌
  isGameDa: boolean = false;

  // 用户最后一次操作类型，1打牌，2碰牌，3杠牌，4胡牌
  lastOperateType: number = null;

  // 用户是否杠后打牌
  isGangHouDa: boolean = false

  // 序数牌相加
  numberCount: number = 0

  // 是否地胡
  isDiHu: boolean = true;

  // 是否机器人
  isRobot: boolean = false;

  constructor(userSocket, room, rule) {
    this.room = room
    this.zhuang = false
    this.rule = rule
    this.ip = userSocket && userSocket.getIpAddress()
    this.model = userSocket.model
    this.emitter = new EventEmitter()
    this.cards = new SourceCardMap(61).fill(0)
    this.balance = 0
    this.score = room.getScore(userSocket)
    this.disconnectCallBack = player => {
      if (player === this.msgDispatcher) {
        this.onDisconnect()
      }
    }
    this._id = this.model._id.toString()
    this.listenDispatcher(userSocket)
    this.msgDispatcher = userSocket
    this.events = {}
    this.dropped = []
    this.huCards = []
    this.lastDa = false
    // 不激活旧的机器人托管
    this.onDeposit = false
    this.ai = userSocket.isRobot() ? basicAi : playerAi
    this.isRobot = !!userSocket.isRobot();

    this.timeoutTask = null
    this.msgHook = {}
    this.takeCardStash = {}
    this.contactCounter = {}

    this.pengForbidden = []
    this.huForbiddenCards = []
    this.huForbiddenFan = 0
    this.lastOptions = {}
    this.recorder = new DummyRecorder()
    this.alreadyTakenCard = false
    this.isMingCard = false;
    this.competiteCards = [];
    this.oldCards = [];
    this.isGameDa = false;
    this.isGangHouDa = false;
    this.numberCount = 0;
    this.openCardScore = 1;
    this.isDiHu = true;
  }

  setGameRecorder(r) {
    this.recorder = r
    this.record = (event, card) => this.recorder.recordUserEvent(this, event, card)
    return this
  }

  recordContact(player) {
    const playerId = player.model._id
    if (this.contactCounter[playerId]) {
      this.contactCounter[playerId] += 1
    } else {
      this.contactCounter[playerId] = 1
    }
  }

  toJSON() {
    const playerStatJson = serializeHelp(this)
    playerStatJson._id = this.model._id
    return playerStatJson
  }

  resume(tableStateJson) {
    const keys = autoSerializePropertyKeys(this)
    Object.assign(this, pick(tableStateJson, keys))
  }

  @triggerAfterAction
  guoOption(card) {

    if (this.lastOptions.peng) {
      this.pengForbidden.push(card)
    }

    if (this.lastOptions.hu) {
      this.cards.lastTakeCard = card
      this.turn = this.cards.turn = this.room.gameState.turn
      this.cards.takeSelfCard = false
      this.cards[card]++
      const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
      this.cards[card]--

      this.huForbiddenFan = checkResult.fan
    }
  }

  contacted(player: PlayerState) {
    return 0
  }

  yaoHaiDi(turn: number, card: number) {
    this.lastCardToken = card
    this.cards[card]++
    const msg = {card, turn, hu: false}
    const huResult = this.checkZiMo()
    if (huResult.hu) {
      msg.hu = true
    }
    return this.sendMessage('game/takeHaiDiCard', msg)
  }

  // 杠完取牌
  gangTakeCard(turn, card, huType) {
    return this.takeCard(turn, card, true, false, huType)
  }

  stashPopTakeCard() {
    if (this.takeCardStash) {
      const {turn, card, gangGuo} = this.takeCardStash
      this.takeCard(turn, card, gangGuo, true, {})
      this.takeCardStash = null
    }
  }

  mayQiaoXiang() {
    this.emitter.emit('mayQiaoXiang')
    this.deposit(() => {
      this.stashPopTakeCard()
    })
  }

  @recordChoiceAfterTakeCard
  takeCard(turn: number, card: number, gangGuo: boolean = false, afterQiaoXiang = false, huType, send = true) {
    // this.gang = gangGuo  // fanmeng 计算杠上开花
    let canTake = true
    this.emitter.emit('willTakeCard', () => {
      canTake = false
    })
    if (!canTake) {
      return null
    }

    this.huForbiddenCards = []

    this.lastCardToken = card
    this.cards[card]++
    const msg = {card, turn, gang: null, hu: false, huInfo: null, huType: {}}
    this.recorder.recordUserEvent(this, 'moPai', card)

    if (!this.hadQiaoXiang) {
      for (let i = 1; i < 61; i++) {
        if (this.gangForbid.indexOf(i) >= 0) continue

        if (this.caiShen.includes(i)) continue

        if (this.cards[i] === 4) {
          if (!msg.gang) {
            msg.gang = [[i, 'anGang']]
          } else {
            msg.gang.push([i, 'anGang'])
          }
        }
        if (this.cards[i] === 1 && this.events.peng && this.events.peng.contains(i) && !this.isForbidForGang(i)) {
          this.gangForbid.push(card)
          if (!msg.gang) {
            msg.gang = [[i, 'buGang']]
          } else {
            msg.gang.push([i, 'buGang'])
          }
        }
      }

      if (msg.gang) {
        msg.gang.forEach(gangOpt => {
          if (gangOpt[1] === 'mingGang') {
            this.gangForbid.push(gangOpt[0])
          }
        })
      }
    }

    let huResult = this.checkZiMo()
    if (huResult.hu) {
      msg.huType = huType;
      if (this.hadQiaoXiang) {
        // 不用选择 直接胡
        if (send) {
          this.sendMessage('game/TakeCard', {ok: true, data: msg})
        }
        this.emitter.emit('waitForDa', msg)
        this.room.gameState.stateData.card = card
        return this.emitter.emit(Enums.hu, this.turn, card)
      }

      if (this.rule.useCaiShen && (this.rule.keJiePao || !this.rule.keJiePao && this.rule.hzlz_option === 'qidui')) {
        huResult = {
          qiDui: huResult.qiDui || huResult.haoQi
        }
      }
      msg.huInfo = huResult
      msg.hu = true
      this.huForbiddenCards = []
    }
    if (gangGuo) {
      this.freeCard = card
    }

    let ret = msg;

    if (send) {
      this.sendMessage('game/TakeCard', {ok: true, data: msg})
    }
    // 禁止触发旧麻将机器人
    this.emitter.emit('waitForDa', msg)

    this.alreadyTakenCard = true

    return ret
  }

  @recordChoiceAfterTakeCard
  async takeCompetiteCard(turn: number, card: number, huType, cards) {
    let canTake = true;
    this.emitter.emit('willTakeCard', () => {
      canTake = false;
    })
    if (!canTake) {
      return null;
    }

    this.huForbiddenCards = [];

    this.lastCardToken = card;
    this.cards[card]++;
    const msg = {card, turn, gang: null, hu: false, huInfo: null, huType: {}};
    this.recorder.recordUserEvent(this, 'moPai', card);

    if (!this.hadQiaoXiang) {
      for (let i = 1; i < 61; i++) {
        if (this.gangForbid.indexOf(i) >= 0) continue;

        if (this.caiShen.includes(i)) continue;

        if (this.cards[i] === 4) {
          if (!msg.gang) {
            msg.gang = [[i, 'anGang']];
          } else {
            msg.gang.push([i, 'anGang']);
          }
        }
        if (this.cards[i] === 1 && this.events.peng && this.events.peng.contains(i) && !this.isForbidForGang(i)) {
          this.gangForbid.push(card);
          if (!msg.gang) {
            msg.gang = [[i, 'buGang']];
          } else {
            msg.gang.push([i, 'buGang']);
          }
        }
      }

      if (msg.gang) {
        msg.gang.forEach(gangOpt => {
          if (gangOpt[1] === 'mingGang') {
            this.gangForbid.push(gangOpt[0]);
          }
        })
      }
    }

    let huResult = this.checkZiMo();
    if (huResult.hu) {
      msg.huType = huType;
      if (this.hadQiaoXiang) {
        this.emitter.emit('waitForDa', msg);
        this.room.gameState.stateData.card = card;
        return this.emitter.emit(Enums.hu, this.turn, card);
      }

      if (this.rule.useCaiShen && (this.rule.keJiePao || !this.rule.keJiePao && this.rule.hzlz_option === 'qidui')) {
        huResult = {
          qiDui: huResult.qiDui || huResult.haoQi
        }
      }
      msg.huInfo = huResult;
      msg.hu = true;
      this.huForbiddenCards = [];
    }

    let ret = msg;

    // 禁止触发旧麻将机器人
    this.emitter.emit('waitForDa', msg);

    this.alreadyTakenCard = true;

    this.cards[card]--;

    return ret;
  }

  checkTingPai(gangCard) {
    const count = this.cards[gangCard]
    if (count === 4) {
      this.recordGameEvent(Enums.anGang, gangCard)
    } else if (count === 3) {
      this.recordGameEvent(Enums.mingGang, gangCard)
    } else if (count === 1) {
      this.recordGameEvent(Enums.mingGang, gangCard)
      this.removeGameEvent(Enums.peng, gangCard)
    }
    this.cards[gangCard] = 0
    const ting = HuPaiDetect.checkTingPai(this.cards, this.events, this.rule)
    this.cards[gangCard] = count
    if (count === 4) {
      this.removeGameEvent(Enums.anGang, gangCard)
    } else if (count === 3) {
      this.removeGameEvent(Enums.mingGang, gangCard)
    } else if (count === 1) {
      this.removeGameEvent(Enums.mingGang, gangCard)
      this.recordGameEvent(Enums.peng, gangCard)
    }
    return ting
  }

  checkChi(card, check) {
    const list = manager.isCanChi(card, this.cards);
    if (list.length > 0) {
      check[Enums.chi] = this;
      check.chiCombol = list;
    }

    return check
  }

  checkPengGang(card, map) {
    if (this.caiShen.includes(card)) {
      return map
    }

    if (this.hadQiaoXiang) {
      return map
    }

    if (this.pengForbidden.indexOf(card) >= 0) {
      return map
    }

    const refMap = map
    const c = this.cards[card]

    if (c >= 2) {
      refMap[Enums.pengGang] = this
      refMap.peng = this
      if (c >= 3) {
        refMap.gang = this
      }
    }

    return refMap
  }

  checkGangShangGang(card, map) {
    const refMap = map
    if (this.cards[card] === 3 || (this.events.peng && this.events.peng.contains(card))) {
      // if (this.checkTingPai(card)) {
      refMap[Enums.pengGang] = this
      refMap.gang = this
      // }
    }
    return refMap
  }

  getGangKind(card, isSelf) {
    const c = this.cards[card]
    if (c === 3 && isSelf) {
      return 'anGang'
    }
    return 'mingGang'
  }

  markJiePao(card, map, ignore = false) {
    if (this.caiShen.includes(card)) return false

    let check = this.checkHuState(card)
    let canHu;

    let newHuForbidCards = []
    if (ignore && check.hu) {
      canHu = true
    } else if (this.rule.keJiePao) {
      canHu = check.fan > 1 && check.fan > this.huForbiddenFan
    } else {
      canHu = check.hu && check.fan > this.huForbiddenFan
    }

    if (canHu) {
      const refMap = map
      if (refMap.hu) {
        refMap.hu.push(this)
      } else {
        refMap.hu = [this]
      }
      if (this.rule.useCaiShen && (this.rule.keJiePao || !this.rule.keJiePao && this.rule.hzlz_option === 'qidui')) {
        check = {
          qiDui: check.qiDui || check.haoQi
        }
      }
      refMap.check = check

      return refMap
    } else {
      newHuForbidCards = this.huForbiddenCards
    }

    this.onAfterAction = () => {
      this.huForbiddenCards = newHuForbidCards
    }
    this.huForbiddenCards = newHuForbidCards

    return false
  }

  checkJiePao(card, ignore = false) {
    if (this.caiShen.includes(card)) return false

    const checkResult = this.checkHuState(card);

    if (ignore && checkResult.hu) {
      return true
    }

    if (!this.rule.keJiePao) {
      return checkResult.fan > 1
    }

    return checkResult.hu && checkResult.fan > this.huForbiddenFan
  }

  checkHuState(card) {
    this.cards.lastTakeCard = card
    this.turn = this.cards.turn = this.room.gameState.turn
    this.cards.takeSelfCard = false
    this.cards.first = this.turn === 2

    this.cards.alreadyTakenCard = this.alreadyTakenCard
    this.cards[card]++
    const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
    this.cards[card]--

    return checkResult
  }

  checkZiMo() {
    this.cards.lastTakeCard = this.lastCardToken
    if (this.room && this.room.gameState && this.room.gameState.turn) {
      this.turn = this.cards.turn = this.room.gameState.turn
    } else {
      this.turn = this.cards.turn = 1;
    }

    this.cards.takeSelfCard = true
    this.cards.qiaoXiang = this.hadQiaoXiang
    this.cards.first = this.turn === 2
    const huResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex);
    if (this.seatIndex === 0) {
      // console.warn("roomId-%s, cards-%s, seatIndex-%s, caiShen-%s, huResult-%s", this.room._id, JSON.stringify(this.getCardList(this.cards)), this.seatIndex, JSON.stringify(this.caiShen), JSON.stringify(huResult));
    }
    return huResult
  }

  checkCompetiteZiMo(cards) {
    cards.lastTakeCard = this.lastCardToken
    if (this.room && this.room.gameState && this.room.gameState.turn) {
      this.turn = cards.turn = this.room.gameState.turn
    } else {
      this.turn = cards.turn = 1;
    }

    cards.takeSelfCard = true
    cards.qiaoXiang = this.hadQiaoXiang
    cards.first = this.turn === 2
    return HuPaiDetect.check(cards, this.events, this.rule, this.seatIndex)
  }

  onShuffle(remainCards, caiShen, juShu, cards, seatIndex, juIndex, needShuffle: boolean, zhuangIndex: number) {
    cards.forEach(x => {
      this.cards[x]++;
    })
    this.caiShen = caiShen;
    this.cards['caiShen'] = caiShen;
    this.seatIndex = seatIndex;

    this.recorder.recordUserEvent(this, 'shuffle');
    this.sendMessage('game/Shuffle', {ok: true, data: {juShu, cards, caiShen, remainCards, juIndex, needShuffle: !!needShuffle, zhuang: zhuangIndex}});
  }

  @triggerAfterAction
  chiPai(card, otherCard1, otherCard2, daPlayer) {
    if (this.cards[otherCard1] > 0 && this.cards[otherCard2] > 0) {
      this.cards.gang = false;
      this.cards[otherCard1]--;
      this.cards[otherCard2]--;
      const cards = [card, otherCard1, otherCard2].sort((a, b) => a - b);
      // 将新牌添加到排序后数组的末尾
      const cardsWithNewCard = [...cards, card];
      // 最后插入card，记录吃牌
      this.recordGameEvent(Enums.chi, cardsWithNewCard);
      if (daPlayer) {
        daPlayer.consumeDropped()
      }
      this.emitter.emit('waitForDa')
      this.recordContact(daPlayer)
      this.record('chi', card)

      if (Math.abs(otherCard1 - otherCard2) === 2) {
        this.forbidCards = [card]
      } else {
        this.forbidCards = []
        const maxCard = Math.max(otherCard1, otherCard2)
        const minCard = Math.min(otherCard1, otherCard2)
        if (maxCard % 10 < 9) {
          this.forbidCards.push(maxCard + 1)
        }
        if (minCard % 10 > 1) {
          this.forbidCards.push(minCard - 1)
        }
      }

      this.alreadyTakenCard = true
      this.huForbiddenFan = 0
      this.huForbiddenCards = []

      return true
    }
    return false
  }

  @triggerAfterAction
  pengPai(card, daPlayer) {
    if (this.cards[card] >= 2) {
      this.cards[card] -= 2
      this.recordGameEvent(Enums.peng, card)
      if (daPlayer) {
        daPlayer.consumeDropped(card)
      }
      this.recordContact(daPlayer)
      this.record('peng', card)
      this.emitter.emit('waitForDa')
      this.alreadyTakenCard = true
      this.huForbiddenFan = 0
      this.huForbiddenCards = []
      return true
    }
    return false
  }

  @triggerAfterAction
  gangByPlayerDa(card: number, daPlayer: this) {
    if (this.cards[card] >= 3) {
      this.cards[card] -= 3
      this.recordGameEvent(Enums.mingGang, card)
      daPlayer.consumeDropped()
      daPlayer.recordGameEvent(Enums.dianGang, card)
      this.recordContact(daPlayer)
      this.record('gang', card)
      this.gangFrom.push(daPlayer)

      this.room.recordPlayerEvent('jieGang', this.model._id)
      this.room.recordPlayerEvent('fangGang', daPlayer.model._id)
      daPlayer.fangGangCount += 1
      return true
    }
    return false
  }

  gangBySelf(card, info) {
    // const info = info_
    if (this.events.peng && this.events.peng.contains(card)) {
      if (this.cards[card] === 1) {
        this.cards[card] = 0
        this.removeGameEvent(Enums.peng, card)
        this.recordGameEvent(Enums.mingGang, card)
        this.recordGameEvent(Enums.buGang, card)
        info.type = 1
        this.emitter.emit('recordMingGangSelf', card)
        this.room.recordPlayerEvent('buGang', this.model._id)
        this.record('gang', card)
        return true
      }
    } else {
      if (this.cards[card] === 4) {
        this.cards[card] = 0
        info.type = 3
        this.recordGameEvent(Enums.anGang, card)
        this.emitter.emit('recordAnGang', card)
        this.record('gang', card)
        this.room.recordPlayerEvent('anGang', this.model._id)
        return true
      }
    }
    return false
  }

  gangShangGang(card, self, info) {
    // const info = info_
    if (this.events.peng && this.events.peng.contains(card)) {
      if (this.cards[card] === 0) {
        this.removeGameEvent(Enums.peng, card)
        this.recordGameEvent(Enums.mingGang, card)
        info.type = 1
        return true
      }
    } else {
      if (this.cards[card] === 3) {
        this.cards[card] = 0
        if (self) {
          this.recordGameEvent(Enums.anGang, card)
          info.type = 3
        } else {
          this.recordGameEvent(Enums.mingGang, card)
          info.type = 2
        }
        return true
      }
    }
    return false
  }

  buBySelf(card, info) {
    return this.gangBySelf(card, info)
  }

  isTing() {
    const caiShen = this.caiShen

    this.cards.caiShen = caiShen
    this.cards[caiShen[0]]++
    const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
    this.cards[caiShen[0]]--

    return checkResult.hu
  }

  isRobotTing(cards) {
    const caiShen = this.caiShen

    cards.caiShen = caiShen
    cards[caiShen[0]]++
    const checkResult = HuPaiDetect.check(cards, this.events, this.rule, this.seatIndex)
    cards[caiShen[0]]--

    return checkResult
  }

  jiePao(card, first, haiDi, dianPaoPlayer) {
    this.cards[card]++
    this.cards.first = first
    this.cards.haiDi = haiDi
    this.cards.takeSelfCard = false
    this.cards.alreadyTakenCard = this.alreadyTakenCard
    const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
    this.cards[card]--

    if (checkResult.hu) {
      checkResult.zhuang = this.zhuang || dianPaoPlayer.zhuang
      this.recordGameEvent(Enums.jiePao, card)
      this.recordGameEvent(Enums.huCards, card)
      this.recordGameEvent(Enums.hu, checkResult)

      this.room.recordPlayerEvent(`fan${checkResult.fan}`, this.model._id)
      this.room.recordPlayerEvent('jiePao', this.model._id)
      this.room.recordPlayerEvent('dianPao', dianPaoPlayer.model._id)

      this.record('jiePao', card)
      return true
    }
    return false
  }

  zimo(card, first, haiDi) {
    if (this.cards[card] > 0) {
      this.cards.first = first
      this.cards.haiDi = haiDi
      this.cards.takeSelfCard = true
      this.cards.gang = this.gang
      this.cards.qiaoXiang = this.hadQiaoXiang
      this.cards.alreadyTakenCard = this.alreadyTakenCard

      const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
      if (checkResult.hu) {
        checkResult.zhuang = this.zhuang

        this.recordGameEvent(Enums.huCards, card)
        this.recordGameEvent(Enums.hu, checkResult)
        this.recordGameEvent(Enums.zimo, card)
        this.emitter.emit('recordZiMo', checkResult)
        this.room.recordPlayerEvent('ziMo', this.model._id)
        this.room.recordPlayerEvent(`fan${checkResult.fan}`, this.model._id)

        this.record('ziMo', card)
        return true
      }
    }

    return false
  }

  getCardList(cards) {
    const cardArray = []
    const pushN = (c, n) => {
      for (let i = 0; i < n; i++) {
        cardArray.push(c)
      }
    }

    cards.forEach((v, c) => {
      pushN(c, v)
    })

    return cardArray
  }

  competiteZimo(card, first, haiDi) {
    if (this.cards[card] > 0) {
      this.cards.first = first;
      this.cards.haiDi = haiDi;
      this.cards.takeSelfCard = true;
      this.cards.gang = this.gang
      this.cards.qiaoXiang = this.hadQiaoXiang
      this.cards.alreadyTakenCard = this.alreadyTakenCard

      const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
      if (checkResult.hu) {
        checkResult.zhuang = this.zhuang

        this.recordGameEvent(Enums.huCards, card)
        this.recordGameEvent(Enums.hu, checkResult)
        this.recordGameEvent(Enums.zimo, card)
        this.emitter.emit('recordZiMo', checkResult)
        this.room.recordPlayerEvent('ziMo', this.model._id)
        this.room.recordPlayerEvent(`fan${checkResult.fan}`, this.model._id)

        this.record('ziMo', card)
        return true;
      } else {
        console.warn("checkResult-%s", JSON.stringify(checkResult));
        return true;
      }
    }

    console.warn(`zimo error card %s count %s`, card, this.cards[card]);
    return false;
  }

  daPai(card) {
    if (this.cards[card] > 0) {
      this.cards[card]--;
      this.dropped.push(card);
      this.lastDa = true;
      this.pengForbidden = [];
      this.huForbiddenFan = 0;
      this.huForbiddenCards = [];
      this.forbidCards = [];
      this.freeCard = Enums.slotNoCard;

      this.emitter.emit('lastDa')
      this.record('da', card)
      return true
    }

    console.warn("cards-%s", JSON.stringify(this.getCardsArray()));

    return false
  }

  daHuPai(card, daPlayer) {
    // 1.如果是接炮，从打牌用户打出的牌移除这张牌
    if (daPlayer) {
      daPlayer.consumeDropped(card);
    } else {
      // 2. 如果是自摸，则从自己的牌堆移除这张牌
      if (this.cards[card] > 0) {
        this.cards[card]--;

        this.lastDa = true
        this.pengForbidden = []
        this.huForbiddenFan = 0
        this.huForbiddenCards = []
        this.forbidCards = []
        this.freeCard = Enums.slotNoCard

        this.emitter.emit('lastDa')
        this.record('hu', card)
      }
    }

    // 3. 将这张牌加入用户的胡牌牌堆中
    this.huCards.push(card);

    return true;
  }

  on(event, callback) {
    this.emitter.on(event, callback)
  }

  listenDispatcher(playerSocket) {
    playerSocket.on('game/da', msg => {
      console.log('game/da', msg)
      this.emitter.emit(Enums.da, msg.turn, msg.card)
    })
    playerSocket.on('game/guo', msg => {
      console.log('game/guo', msg)
      this.cancelTimeout()
      this.emitter.emit(Enums.guo, msg.turn, msg.card)
    })
    playerSocket.on('game/qiaoXiang', msg => {

      this.emitter.emit('qiaoXiang', msg)
    })
    playerSocket.on('game/gangBySelf', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.gangBySelf, msg.turn, msg.card)
    })
    playerSocket.on('game/gangByOtherDa', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.gangByOtherDa, msg.turn, msg.card)
    })
    playerSocket.on('game/gangShangKaiHua', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangKaiHua', msg.turn)
    })
    playerSocket.on('game/changePlayerCards', msg => {
      this.emitter.emit('changePlayerCards', msg.cards)
    })
    playerSocket.on('game/changeNextCards', msg => {
      this.emitter.emit('changeNextCards', msg.cards)
    })
    playerSocket.on('game/gangShangPao', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangPao', msg.turn)
    })
    playerSocket.on('game/gangShangGuo', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangGuo', msg.turn)
    })
    playerSocket.on('game/gangShangKaiHuaGuo', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangKaiHuaGuo', msg.turn)
    })
    playerSocket.on('game/gangShangChi', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangChi', msg.turn, msg.card, msg.combol)
    })
    playerSocket.on('game/gangShangPeng', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangPeng', msg.turn, msg.card)
    })

    playerSocket.on('game/gangShangGang', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangGang', msg.turn, msg.card)
    })

    playerSocket.on('game/gangShangGangSelf', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangGangSelf', msg.turn, msg.card)
    })

    playerSocket.on('game/gangShangBu', msg => {
      this.cancelTimeout()
      this.emitter.emit('gangShangBu', msg.turn, msg.card)
    })

    playerSocket.on('game/buBySelf', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.buBySelf, msg.turn, msg.card)
    })
    playerSocket.on('game/buByOtherDa', msg => {
      this.cancelTimeout()
      this.emitter.emit('buByOtherDa', msg.turn, msg.card)
    })
    playerSocket.on('game/peng', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.peng, msg.turn, msg.card)
    })
    playerSocket.on('game/hu', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.hu, msg.turn, msg.card, msg.huType)
    })
    playerSocket.on('game/competiteHu', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.competiteHu, msg)
    })
    playerSocket.on('game/chi', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.chi, msg)
    })
    playerSocket.on('game/broke', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.broke)
    })
    playerSocket.on('game/openCard', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.openCard)
    })
    playerSocket.on('game/huTakeCard', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.huTakeCard, msg)
    })
    playerSocket.on('game/restoreGame', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.restoreGame)
    })
    playerSocket.on('game/multipleHu', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.multipleHu)
    })
    playerSocket.on('game/startDeposit', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.startDeposit)
    })
    playerSocket.on('game/yaoHaiDi', msg => {
      this.cancelTimeout()
      this.emitter.emit('yaoHaiDi', msg.turn)
    })
    playerSocket.on('game/buYaoHaiDi', msg => {
      this.cancelTimeout()
      this.emitter.emit('buYaoHaiDi', msg.turn)
    })
    playerSocket.on('game/haiDiLaoYue', msg => {
      this.cancelTimeout()
      this.emitter.emit('haiDiLaoYue', msg.turn)
    })
    playerSocket.on('game/daHaiDi', msg => {
      this.cancelTimeout()
      this.emitter.emit('daHaiDi', msg.turn)
    })
    playerSocket.on('game/haiDiJiePao', msg => {
      this.cancelTimeout()
      this.emitter.emit('haiDiJiePao', msg.turn)
    })
    playerSocket.on('game/guoHaiDiPao', msg => {
      this.cancelTimeout()
      this.emitter.emit('guoHaiDiPao', msg.turn)
    })
    playerSocket.on('disconnect', this.disconnectCallBack)
    playerSocket.on('game/cancelDeposit', () => {
      this.onDeposit = false
      const cards = genCardArray(this.cards)
      this.cancelTimeout()
      this.sendMessage('game/cancelDepositReply', {ok: true, data: {cards}})

      const daPlayer = this.room.gameState.stateData[Enums.da];
      if (daPlayer && daPlayer._id.toString() === this._id.toString()) {
        this.emitter.emit('waitForDa', this.room.gameState.stateData.msg);
      }
    })
    playerSocket.on('game/refreshQuiet', () => {
      this.emitter.emit('refreshQuiet', playerSocket, this.seatIndex)
    })
  }

  checkQiaoXiang() {
    let caiCount = 0;
    for (let i = 0; i < this.caiShen.length; i++) {
      caiCount += this.cards[this.caiShen[i]];
    }
    if (caiCount) {
      if (HuPaiDetect.checkQiaoXiang(this.cards)) {
        return true
      }
    }
    return false
  }

  mayCaiShenTou(card) {
    this.cards[card]++
    const pass = HuPaiDetect.mayCaiShenTou(this.cards)
    this.cards[card]--
    return pass
  }

  setQiaoXiang() {
    this.hadQiaoXiang = true
  }

  gameOver() {
    this.cancelTimeout()
    this.removeListeners()
  }

  removeListeners() {
    if (this.msgDispatcher) {
      Object.keys(this.msgDispatcher.getGameMsgHandler()).forEach(x => {
        this.msgDispatcher.removeAllListeners(x)
      })
      this.msgDispatcher.removeListener('disconnect', this.disconnectCallBack)
    }
  }

  recordGameEvent(key, info) {
    const oldTbl = this.events[key]
    if (oldTbl) {
      oldTbl.push(info)
    } else {
      // console.warn(`recordGameEvent:key=${key},value=${info}`)
      this.events[key] = [info]
    }
    if (key === 'chi' || key === 'peng' || key === 'mingGang' || key === 'anGang') {
      if (this.events.chiPengGang) {
        this.events.chiPengGang.push([key, info])
      } else {
        this.events.chiPengGang = [[key, info]]
      }
    }
  }

  removeGameEvent(key, info) {
    if (this.events[key]) {
      this.events[key].remove(info)
    }
    if (key === 'chi' || key === 'peng' || key === 'mingGang' || key === 'anGang') {
      if (this.events.chiPengGang) {
        this.events.chiPengGang.removeFilter(x => x[0] === key && x[1] === info)
      }
    }
  }

  consumeDropped() {
    this.dropped.splice(this.dropped.length - 1, 1)
    this.lastDa = false
  }

  clearLastDaFlag() {
    this.lastDa = false
  }

  sendMessage(name, data) {
    if (this.msgHook[name]) {
      this.msgHook[name](data)
    }

    if (name === 'game/canDoSomething') {
      this.lastOptions = data
    }

    if (!this.lockMsg && this.msgDispatcher) {
      this.msgDispatcher.sendMessage(name, data)
    }
    return data
  }

  lockMessage() {
    this.lockMsg = true
  }

  unlockMessage() {
    this.lockMsg = false
  }

  winScore(diFen: number = 1): number {
    let score = 0

    const oppoCount = (this.rule.playerCount - 1)
    if (this.events[Enums.jiePao]) {
      const result = this.events.hu[0]
      const base = result.fan === 1 ? 1 : oppoCount
      score = result.fan * base
    }

    if (this.events[Enums.zimo]) {
      const result = this.events.hu[0]

      score = 2 * result.fan
      return score
    }

    return score * diFen
  }

  genGameStatus(index, scoreFan = 1) {
    const cards = []
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]
      for (let j = 0; j < c; j++) {
        cards.push(i)
      }
    }

    return {
      index,
      score: this.balance,
      cards,
      jieGangCount: this.gangFrom.length,
      anGangCount: this.eventCount('anGang'),
      buGangCount: this.eventCount('buGang'),
      fangGangCount: this.fangGangCount,
      events: {chiPengGang: this.events.chiPengGang},
      model: this.model
    }
  }

  eventCount(eventName: string): number {
    if (this.events[eventName]) {
      return this.events[eventName].length
    }
    return 0
  }

  genSelfStates(index) {
    const cards = []
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]
      for (let j = 0; j < c; j++) {
        cards.push(i)
      }
    }

    this.events.huCards = this.huCards.slice();

    return {
      index,
      cards,
      tingPai: this.tingPai,
      locked: this.locked,
      dropped: this.dropped,
      huCards: this.huCards,
      events: {chiPengGang: this.events.chiPengGang, huCards: this.events.huCards},
      model: this.model,
      ip: this.ip,
      lastDa: this.lastDa,
      score: this.score,
      base: this.room.currentBase,
      caiShen: this.caiShen,
      rule: this.rule,
      room: this.room._id
    }
  }

  genOppoStates(index) {
    const cardCount = HuPaiDetect.remain(this.cards);
    this.events.huCards = this.huCards.slice();
    return {
      index,
      cardCount,
      tingPai: this.tingPai,
      locked: this.locked,
      huCards: this.huCards,
      events: {chiPengGang: this.events.chiPengGang, huCards: this.events.huCards},
      model: this.model,
      dropped: this.dropped,
      lastDa: this.lastDa,
      ip: this.ip,
      score: this.score,
      base: this.room.currentBase,
      caiShen: this.caiShen,
      rule: this.rule,
      room: this.room._id
    }
  }

  isHu() {
    return this.events.hu != null
  }

  onDisconnect() {
    // this.onDeposit = true;
    this.removeListeners()
    // this.msgDispatcher = null;
  }

  reconnect(msgDispatcher) {
    this.msgDispatcher = msgDispatcher
    this.onDeposit = false
    this.listenDispatcher(msgDispatcher)
  }

  deposit(callback) {
    let minutes = 15 * 1000;


    if (!this.msgDispatcher) {
      return ;
    }
    this.cancelTimeout()

    // console.warn("shortId-%s onDeposit-%s", this.model.shortId, this.onDeposit);

    if (!this.onDeposit) {
      this.timeoutTask = setTimeout(() => {
        this.onDeposit = true
        this.sendMessage('game/startDepositReply', {ok: true, data: {}})
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

  registerHook(name, callback) {
    this.msgHook[name] = callback
  }

  deleteHook(name) {
    delete this.msgHook[name]
  }

  getDianPaoNum() {
    const dp = this.events[Enums.dianPao]
    if (!dp) {
      return 0
    }
    return dp.length
  }

  huPai() {
    return this.events.hu != null
  }

  suoPai() {
    this.locked = true
  }

  getCardsArray() {
    const cards = []
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]
      for (let j = 0; j < c; j++) {
        cards.push(i)
      }
    }
    return cards
  }

  isForbidForGang(card: number) {
    return this.gangForbid.indexOf(card) >= 0
  }

  getAvailableGangs() {
    const gangs = []
    for (const pengCard of this.events.peng || []) {
      if (this.cards[pengCard] > 0 && !this.isForbidForGang(pengCard)) {
        gangs.push([pengCard, 'mingGang'])
      }
    }

    for (let card = 1; card <= Enums.bai; card++) {
      if (this.cards[card] === 4) {
        gangs.push([card, 'anGang'])
      }
    }
    return gangs
  }

  requestAction(action: string, ...params) {
    this.emitter.emit(action, ...params)
  }

  winFrom(loser: this, score) {
    if (this.room.preventTimes[loser.model.shortId]) {
      // 本局有免输次数，实际不扣
      return;
    }
    this.balance += score
    loser.balance -= score
    this.buyer.forEach(x => {
      x.niaoWin(loser, score)
    })
    loser.buyer.forEach(x => {
      this.niaoWin(x, score)
    })
  }

  niaoWin(loser: this, score) {
    this.balance += score

    loser.balance -= score
  }

  winFromReward(ruby) {
    this.balance += ruby;
    this.rubyReward = ruby;
  }
}

export default PlayerState

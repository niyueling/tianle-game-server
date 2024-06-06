/**
 * Created by Color on 2016/7/7.
 */
import * as EventEmitter from 'events'
// @ts-ignore
import {pick, random} from 'lodash'
import {autoSerialize, autoSerializePropertyKeys, Serializable, serializeHelp} from "../serializeDecorator"
import basicAi, {playerAi} from './ai'
import {manager} from "./cardManager";
import Enums from './enums'
import {GameAction} from "./gameAction";
import {DummyRecorder, IGameRecorder} from './GameRecorder'
import HuPaiDetect from './HuPaiDetect'
import Room from './room'
import Rule from './Rule'

export class SourceCardMap extends Array<number> {
  first: boolean
  // 海底捞
  haiDi: boolean
  takeSelfCard: boolean
  lastTakeCard: number
  // 杠
  gang: boolean
  qiaoXiang: boolean
  // 财神
  caiShen: number
  turn: number
  alreadyTakenCard?: boolean
  // 抢杠
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

// tslint:disable-next-line:class-name
interface iAi {
  getUseLessCard(cards: any, currentCard: number): number;

  onWaitForDa(actions: any, cards: any): string;

  onCanDoSomething(actions: any, cards: any, card: any): string;
}

function triggerAfterAction(target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<any>) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const ret = await originalMethod.apply(this, args);
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

  propDesc.value = async function (...args) {
    const message = await takeCard.apply(this, args)

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

  // 已经出掉的牌
  @autoSerialize
  dropped: number[]

  emitter: EventEmitter

  @autoSerialize
  lastDa: boolean = false

  @autoSerialize
  events: any

  recorder: IGameRecorder

  // record: (event: string, card: number, choice?: any) => void

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
  caiShen: number
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

  // 不能打的牌(吃进的牌)
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

  // 初始发牌摸到的花牌
  flowerList: any[] = [];

  // 可以吃的牌
  chiCombol: any[] = [];

  // 番数
  fanShu: number = 0;

  // 上一局番数
  lastFanShu: number = 0;

  // 水数
  shuiShu: number = 0;

  // 最终盘数
  panShu: number = 0;

  // 结算盘数详细信息
  panInfo: object = {}

  // 初始携带积分
  juScore: number = 0;

  // 坐庄次数
  zhuangCount: number = 0;

  constructor(userSocket, room, rule) {
    this.room = room
    this.zhuang = false
    this.rule = rule
    this.ip = userSocket && userSocket.getIpAddress()
    this.model = userSocket.model
    this.emitter = new EventEmitter()
    this.cards = new SourceCardMap(Enums.finalCard).fill(0)
    this.disconnectCallBack = player => {
      if (player === this.msgDispatcher) {
        this.onDisconnect()
      }
    }
    this._id = this.model._id
    this.listenDispatcher(userSocket)
    this.msgDispatcher = userSocket
    this.events = {}
    this.dropped = []
    this.lastDa = false
    // 不激活旧的机器人托管
    this.onDeposit = false
    this.ai = userSocket.isRobot() ? basicAi : playerAi

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
    this.flowerList = [];
    this.chiCombol = [];
    this.fanShu = 0;
    this.shuiShu = 0;
    this.panShu = 0;
    this.panInfo = {};
    this.lastFanShu = 0;
    this.score = room.getScore(userSocket)
    this.zhuangCount = 0;
  }

  get youJinTimes() {
    return this.events[Enums.youJinTimes] && this.events[Enums.youJinTimes] || 0
  }

  setGameRecorder(r) {
    this.recorder = r
    return this
  }

  record(event: string, card: number, choice?: any) {
    if (this.recorder) {
      return this.recorder.recordUserEvent(this, event, card)
    }
    console.error('no recorder');
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
  async guoOption(card) {

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
    return this.sendMessage('game/takeHaiDiCard', {ok: true, data: msg})
  }

  // 杠完取牌
  async gangTakeCard(turn, card) {
    return this.takeCard(turn, card)
  }

  async stashPopTakeCard() {
    if (this.takeCardStash) {
      const {turn, card, gangGuo} = this.takeCardStash
      await this.takeCard(turn, card, gangGuo)
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
  async takeCard(turn: number, card: number, gangGuo: boolean = false, send = true) {
    // this.gang = gangGuo  // fanmeng 计算杠上开花
    let canTake = true
    this.emitter.emit('willTakeCard', () => {
      canTake = false
    })
    if (!canTake) {
      return null
    }
    await this.room.auditManager.playerTakeCard(this.model._id, card);
    this.huForbiddenCards = []
    // 敲响check
    // if (!afterQiaoXiang && !this.hadQiaoXiang && this.checkQiaoXiang()) {
    //   this.takeCardStash = {turn, card, gangGuo}
    //   this.mayQiaoXiang()
    //   return {};
    // }

    this.lastCardToken = card
    if (!this.room.gameState.isFlower(card)) {
      this.cards[card]++
    }

    const msg = {card, turn, gang: null, hu: false, huInfo: null, qiangJin: false, bigCardList: []}
    this.recorder.recordUserEvent(this, 'moPai', card)
    this.recordGameSingleEvent(Enums.lastPlayerTakeCard, card);

    if (!this.hadQiaoXiang) {
      for (let i = 1; i < 38; i++) {
        if (this.gangForbid.indexOf(i) >= 0) continue

        if (i === this.caiShen) continue

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

    const huResult = this.checkZiMo()
    if (huResult.hu) {
      msg.huInfo = huResult
      msg.hu = true
      this.huForbiddenCards = []
    }
    if (gangGuo) {
      this.freeCard = card
    }

    // 判断是否有大牌需要先打
    msg.bigCardList = await this.room.auditManager.getBigCardByPlayerId(this._id, this.seatIndex, this.cards);

    if (send) {
      this.sendMessage('game/TakeCard', {ok: true, data: msg})

      if (this.room.gameState.isFlower(card)) {
        const takeFlower = async() => {
          this.room.broadcast('game/takeFlower', {ok: true, data: {card, seatIndex: this.seatIndex, remainCards: this.room.gameState.remainCards}})
        }
        setTimeout(takeFlower, 500);
      }
    }

    this.emitter.emit('waitForDa', msg)

    this.alreadyTakenCard = true

    return msg
  }

  checkChi(card, check) {
    const list = manager.isCanChi(card, this.caiShen, this.cards);
    if (list.length > 0) {
      // 可以吃
      check[Enums.chi] = this;
      check.chiCombol = list;
    }
    return check
  }

  checkPengGang(card, map) {
    if (card === this.caiShen)
      return map

    if (card === Enums.bai) {
      card = this.caiShen
    }

    if (this.hadQiaoXiang)
      return map

    if (this.pengForbidden.indexOf(card) >= 0) {
      return map
    }

    const caiCount = this.cards[this.caiShen]
    this.cards[this.caiShen] = 0
    this.cards[this.caiShen] = this.cards[Enums.bai]
    this.cards[Enums.bai] = 0

    const refMap = map
    const c = this.cards[card]

    if (c >= 2) {
      refMap[Enums.pengGang] = this
      refMap.peng = this
      if (c >= 3) {
        refMap.gang = this
      }
    }

    this.cards[Enums.bai] = this.cards[this.caiShen]
    this.cards[this.caiShen] = caiCount

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
    if (card === this.caiShen) return false

    const check = this.checkHuState(card)
    let canHu;
    let newHuForbidCards = []
    if (ignore && check.hu && this.cards[this.caiShen] === 0) {
      canHu = true
    } else {
      canHu = check.hu && check.fan > this.huForbiddenFan && this.cards[this.caiShen] === 0
    }
    // 检查金牌是不是大于2
    const isHu = this.isDoubleGoldCardForYouJin(check);
    if (canHu && isHu) {
      const refMap = map
      if (refMap.hu) {
        refMap.hu.push(this)
      } else {
        refMap.hu = [this]
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
    if (card === this.caiShen) return false

    const checkResult = this.checkHuState(card);

    if (ignore && checkResult.hu) {
      return true
    }

    if (!this.rule.keJiePao) {
      return checkResult.fan > 1
    }

    return checkResult.hu && checkResult.fan > this.huForbiddenFan && this.cards[this.caiShen] === 0
  }

  checkHuState(card) {
    this.cards.lastTakeCard = card
    this.turn = this.cards.turn = this.room.gameState.turn
    this.cards.takeSelfCard = false
    this.cards.first = this.turn === 2

    this.cards.alreadyTakenCard = this.alreadyTakenCard
    this.cards[card]++
    this.cards.turn = this.room.gameState.turn;
    const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
    this.cards[card]--

    return checkResult
  }

  checkZiMo() {
    this.cards.lastTakeCard = this.lastCardToken
    this.turn = this.cards.turn = this.room.gameState.turn
    this.cards.takeSelfCard = true
    this.cards.qiaoXiang = this.hadQiaoXiang
    this.cards.first = this.turn === 2
    const result = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex);
    result.hu = this.isDoubleGoldCardForYouJin(result);
    return result;
  }

  // 添加花牌
  onShuffle(remainCards, caiShen, juShu, cards, seatIndex, juIndex, needShuffle, flowerList, allFlowerList) {
    if (juIndex === 1) {
      this.fanShu = this.zhuang ? 16 : 8;
    }
    cards.forEach(x => {
      if (!this.room.gameState.isFlower(x)) {
        this.cards[x]++;
      }
    });
    this.caiShen = caiShen
    this.cards['caiShen'] = caiShen
    this.seatIndex = seatIndex
    this.recorder.recordUserEvent(this, 'shuffle')
    this.sendMessage('game/Shuffle', {ok: true, data: {
        juShu, cards, caiShen: [caiShen], remainCards, juIndex,
        needShuffle: !!needShuffle, flowerList, allFlowerList
      }})
  }

  @triggerAfterAction
  async chiPai(card, otherCard1, otherCard2, daPlayer) {
    if (this.cards[otherCard1] > 0 && this.cards[otherCard2] > 0) {
      this.cards[otherCard1]--
      this.cards[otherCard2]--
      // 第一张是被吃的，记录吃牌
      this.recordGameEvent(Enums.chi, [card, otherCard1, otherCard2])
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
  async pengPai(card, daPlayer) {
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
  // gangByOtherDa
  async gangByPlayerDa(card: number, daPlayer: this) {
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
      await this.room.auditManager.recordGangZi(this._id, card, daPlayer._id, Enums.mingGang);
      return true
    }
    return false
  }

  async gangBySelf(card, info) {
    // const info = info_
    if (this.events.peng && this.events.peng.contains(card)) {
      // 补杠
      if (this.cards[card] === 1) {
        this.cards[card] = 0
        this.removeGameEvent(Enums.peng, card)
        this.recordGameEvent(Enums.mingGang, card)
        this.recordGameEvent(Enums.buGang, card)
        info.type = 1
        this.emitter.emit('recordMingGangSelf', card)
        this.room.recordPlayerEvent('buGang', this.model._id)
        this.record('gang', card)
        await this.room.auditManager.recordGangZi(this._id, card, this._id, Enums.buGang);
        return true
      }
    } else {
      if (this.cards[card] === 4) {
        // 暗杠
        this.cards[card] = 0
        info.type = 3
        this.recordGameEvent(Enums.anGang, card)
        this.emitter.emit('recordAnGang', card)
        this.record('gang', card)
        this.room.recordPlayerEvent('anGang', this.model._id)
        await this.room.auditManager.recordGangZi(this._id, card, this._id, Enums.anGang);
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

  async buBySelf(card, info) {
    return this.gangBySelf(card, info)
  }

  isTing() {
    const caiShen = this.caiShen

    this.cards.caiShen = caiShen;
    this.cards[caiShen]++
    this.cards.turn = this.room.gameState.turn;
    const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex);
    this.cards[caiShen]--;
    let huState = checkResult.hu;
    if (checkResult.hu && checkResult.huType === Enums.qiShouSanCai && this.cards[this.caiShen] === 2) {
      huState = false;
    }

    return huState;
  }

  isRobotTing(cards) {
    const caiShen = this.caiShen

    cards.caiShen = caiShen
    cards[caiShen]++
    cards.turn = this.room.gameState.turn;
    const checkResult = HuPaiDetect.check(cards, this.events, this.rule, this.seatIndex)
    cards[caiShen]--

    return checkResult
  }

  // Enums.hu 胡牌
  jiePao(card, first, haiDi, dianPaoPlayer) {
    this.cards[card]++
    this.cards.first = first
    this.cards.haiDi = haiDi
    this.cards.takeSelfCard = false
    this.cards.alreadyTakenCard = this.alreadyTakenCard
    // 第几轮出牌
    this.cards.turn = this.room.gameState.turn;
    const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
    this.cards[card]--
    const isHu = this.isDoubleGoldCardForYouJin(checkResult);
    if (checkResult.hu && isHu && this.cards[this.caiShen] === 0) {
      checkResult.zhuang = this.zhuang || dianPaoPlayer.zhuang
      this.recordGameEvent(Enums.jiePao, card)
      this.recordGameEvent(Enums.hu, checkResult)

      this.room.recordPlayerEvent(`fan${checkResult.fan}`, this.model._id)
      this.room.recordPlayerEvent('jiePao', this.model._id)
      this.room.recordPlayerEvent('dianPao', dianPaoPlayer.model._id)
      this.record('jiePao', card)
      return true
    }
    return false
  }

  // Enums.hu 胡牌
  zimo(card, first, haiDi) {
    if (this.cards[card] > 0) {
      this.cards.first = first
      this.cards.haiDi = haiDi
      this.cards.takeSelfCard = true
      this.cards.gang = this.gang
      this.cards.qiaoXiang = this.hadQiaoXiang
      this.cards.alreadyTakenCard = this.alreadyTakenCard
      this.cards.turn = this.room.gameState.turn;
      const checkResult = HuPaiDetect.check(this.cards, this.events, this.rule, this.seatIndex)
      const isHu = this.isDoubleGoldCardForYouJin(checkResult);
      if (checkResult.hu && isHu) {
        checkResult.zhuang = this.zhuang
        this.recordGameEvent(Enums.hu, checkResult)
        this.recordGameEvent(Enums.zimo, card)
        this.emitter.emit('recordZiMo', checkResult)
        this.room.recordPlayerEvent('ziMo', this.model._id)
        this.room.recordPlayerEvent(`fan${checkResult.fan}`, this.model._id)

        // 如果是游金，记录游金
        // console.warn("zimo checkResult-%s", JSON.stringify(checkResult));
        if (checkResult.isYouJin && checkResult.youJinTimes === 1) {
          this.room.recordPlayerEvent('youJin', this.model._id);
        }

        if (checkResult.isYouJin && checkResult.youJinTimes === 2) {
          this.room.recordPlayerEvent('shuangYou', this.model._id);
        }

        if (checkResult.isYouJin && checkResult.youJinTimes === 3) {
          this.room.recordPlayerEvent('sanYou', this.model._id);
        }

        this.record('ziMo', card)
        return true
      }
    }
    return false
  }

  async daPai(card) {
    const forbidCards = this.forbidCards || []
    if (this.getCardsArray().length > 2) {
      if (forbidCards.indexOf(card) !== -1 && this.cards[card] < 1 && card !== this.freeCard) {
        console.warn("自己吃的牌，且手里没有相同的牌，不能打")
        // 自己吃的牌，且手里没有相同的牌，不能打
        return false;
      }
    }
    // 获取大牌
    const bigCardList = await this.room.auditManager.getBigCardByPlayerId(this._id, this.seatIndex, this.cards);
    if (bigCardList.length > 0 && bigCardList.indexOf(card) === -1) {
      // 没出大牌
      console.warn('要先出', JSON.stringify(bigCardList));
      return false;
    }
    if (this.cards[card] > 0) {
      this.cards[card]--
      this.dropped.push(card)
      this.lastDa = true
      this.pengForbidden = []
      this.huForbiddenFan = 0
      this.huForbiddenCards = []
      this.forbidCards = []
      this.freeCard = Enums.slotNoCard
      this.emitter.emit('lastDa')
      this.record('da', card)
      this.recordGameSingleEvent(Enums.lastPlayerDaCard, card);

      if (!this.events[Enums.youJinTimes]) {
        this.recordGameSingleEvent(Enums.youJinTimes, 0);
      }

      // 检查是否是游金
      const isOk = manager.isCanYouJin(this.cards, this.caiShen);
      if (isOk) {
        if (card === this.caiShen) {
          // 如果起手双金，打出金牌则是双游
          if (this.cards[card] > 0 && this.events[Enums.youJinTimes] === 0) {
            this.recordGameSingleEvent(Enums.youJinTimes, this.events[Enums.youJinTimes] + 1);
          }
          // 打的金牌,游金次数 + 1
          this.recordGameSingleEvent(Enums.youJinTimes, this.events[Enums.youJinTimes] + 1);

          // console.warn("card-%s, caiShen-%s, isYouJin-%s, youJinTimes", card, this.caiShen, isOk, this.events[Enums.youJinTimes]);
        } else {
          // 第一次游金
          this.recordGameSingleEvent(Enums.youJinTimes, 1);
        }
      } else {
        // 非游金，重置次数
        this.recordGameSingleEvent(Enums.youJinTimes, 0);
      }
      // console.debug('check you jin 检查游金', isOk, 'times', this.events[Enums.youJinTimes], 'shortId', this.model.shortId);
      return true
    }
    console.warn('no such card', card)
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

    return true;
  }

  on(event, callback) {
    this.emitter.on(event, callback)
  }

  listenDispatcher(playerSocket) {
    // playerSocket.on('game/da', msg => {
    //   // TODO drop emit
    //   // this.emitter.emit(Enums.da, msg.turn, msg.card)
    //   const instance = this.getAction();
    //   return instance.onGameDa(this, { turn: msg.turn, card: msg.card });
    // })
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
    playerSocket.on('game/guo', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.guo, msg.turn, msg.card)
    })
    playerSocket.on('game/da', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.da, msg.turn, msg.card)
    })
    playerSocket.on('game/hu', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.hu, msg.turn, msg.card, msg.huType)
    })
    playerSocket.on('game/chi', msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.chi, msg.turn, msg.card, msg.combol)
    })
    playerSocket.on(Enums.qiangJinHu, msg => {
      this.cancelTimeout()
      this.emitter.emit(Enums.qiangJinHu)
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
    })
    // playerSocket.on('game/refreshQuiet', () => {
    //   this.emitter.emit('refreshQuiet', playerSocket, this.seatIndex)
    // })
  }

  // checkQiaoXiang() {
  //   const caiCount = this.cards[this.caiShen]
  //   if (caiCount) {
  //     if (HuPaiDetect.checkQiaoXiang(this.cards)) {
  //       return true
  //     }
  //   }
  //   return false
  // }

  // mayCaiShenTou(card) {
  //   this.cards[card]++
  //   const pass = HuPaiDetect.mayCaiShenTou(this.cards)
  //   this.cards[card]--
  //   return pass
  // }

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

  recordGameSingleEvent(key, info) {
    this.events[key] = info;
  }

  recordGameEvent(key, info) {
    const oldTbl = this.events[key]
    if (oldTbl) {
      oldTbl.push(info)
    } else {
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
    let score;
    diFen = this.room.auditManager.calculateDiFen(this, diFen);
    const oppoCount = (this.rule.playerCount - 1)
    if (this.events[Enums.jiePao]) {
      const result = this.events.hu[0]
      const base = result.fan === 1 ? 1 : oppoCount
      score = result.fan * base
    }

    if (this.events[Enums.zimo]) {
      const result = this.events.hu[0];
      score = 2 * result.fan;
      return score * diFen;
    }

    return score * diFen;
  }

  genGameStatus(index) {
    const cards = []
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]
      for (let j = 0; j < c; j++) {
        if (i < 40) {
          cards.push(i)
        }
      }
    }

    // 排序吃牌
    const events = Object.assign({}, this.events);
    if (events.chi) {
      for (const list of events.chi) {
        list.sort();
      }
    }
    if (events.chiPengGang) {
      for (const item of events.chiPengGang) {
        if (item[0] === 'chi') {
          item[1].sort();
        }
      }
    }
    return {
      index,
      score: 0,
      residueScore: this.score,
      cards,
      huaCardCount: this.flowerList.length,
      flowerList: this.flowerList,
      jieGangCount: this.gangFrom.length,
      anGangCount: this.eventCount('anGang'),
      buGangCount: this.eventCount('buGang'),
      fangGangCount: this.fangGangCount,
      events,
      fanShu: this.lastFanShu,
      model: this.model,
      isBroke: false,
      panInfo: this.panInfo
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
      if (this.room.gameState.isFlower(i)) {
        continue;
      }
      for (let j = 0; j < this.cards[i]; j++) {
        cards.push(i)
      }
    }
    // 排序吃牌
    const events = Object.assign({}, this.events);
    if (events.chi) {
      for (const list of events.chi) {
        list.sort();
      }
    }
    if (events.chiPengGang) {
      for (const item of events.chiPengGang) {
        if (item[0] === 'chi') {
          item[1].sort();
        }
      }
    }
    // 删除游金次数
    delete events.youJinTimes;
    return {
      index,
      cards,
      tingPai: this.tingPai,
      locked: this.locked,
      dropped: this.dropped,
      events,
      model: this.model,
      ip: this.ip,
      lastDa: this.lastDa,
      score: this.score,
      base: this.room.currentBase,
      caiShen: [this.caiShen],
      rule: this.rule,
      room: this.room._id,
      flowerList: this.room.auditManager.getFlowerList(this.model._id),
    }
  }

  genOppoStates(index) {
    const cardCount = HuPaiDetect.remain(this.cards)
    // 排序吃牌
    const events = Object.assign({}, this.events);
    // 删除游金次数
    delete events.youJinTimes;
    return {
      index,
      cardCount,
      tingPai: this.tingPai,
      locked: this.locked,
      events,
      model: this.model,
      dropped: this.dropped,
      lastDa: this.lastDa,
      ip: this.ip,
      score: this.score,
      base: this.room.currentBase,
      caiShen: [this.caiShen],
      rule: this.rule,
      room: this.room._id,
      flowerList: this.room.auditManager.getFlowerList(this.model._id),
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
    this.onDeposit = false;
    this.listenDispatcher(msgDispatcher)
  }

  deposit(callback) {
    let minutes = 15 * 1000

    // if (!this.room.isPublic) {
    //   return
    // }
    if (!this.room.isPublic && this.rule.ro.autoCommit) {
      minutes = (this.rule.ro.autoCommit + 1) * 1000
    }

    if (!this.msgDispatcher) {
      return
    }
    this.cancelTimeout()
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

  // 是否不要添加暗杠
  getAvailableGangs(isNoAnGang?) {
    const gangs = []
    for (const pengCard of this.events.peng || []) {
      if (this.cards[pengCard] > 0 && !this.isForbidForGang(pengCard)) {
        gangs.push([pengCard, 'mingGang'])
      }
    }
    // 碰牌，不加暗杠
    if (isNoAnGang) {
      return gangs;
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

  getAction() {
    return new GameAction(this.room);
  }

  // 双金是否只能游金
  isDoubleGoldCardForYouJin(huResult) {
    // 检查金牌是不是大于2
    const count = this.room.auditManager.getGoldCount(this.model._id);
    const isOnlyYouJin = count === 2 && this.room.gameRule.doubleGoldYouJin;
    if (huResult.hu && !huResult.isYouJin && isOnlyYouJin) {
      // 不能胡非游金
      return false;
    }
    return huResult.hu;
  }
}

export default PlayerState

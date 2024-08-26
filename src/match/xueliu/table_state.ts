/**
 * Created by Color on 2016/7/6.
 */
// @ts-ignore
import {isNaN, pick, random} from 'lodash'
import * as logger from "winston";
import * as winston from "winston";
import Player from "../../database/models/player";
import {service} from "../../service/importService";
import alg from "../../utils/algorithm";
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "../serializeDecorator"
import Enums from "./enums";
import GameRecorder, {IGameRecorder} from './GameRecorder'
import PlayerState from './player_state'
import Room from './room'
import Rule from './Rule'
import {ConsumeLogType, GameType, RobotStep, TianleErrorCode} from "@fm/common/constants";
import CardTypeModel from "../../database/models/CardType";
import RoomGoldRecord from "../../database/models/roomGoldRecord";
import CombatGain from "../../database/models/combatGain";
import GameCategory from "../../database/models/gameCategory";
import PlayerMedal from "../../database/models/PlayerMedal";
import PlayerHeadBorder from "../../database/models/PlayerHeadBorder";
import PlayerCardTable from "../../database/models/PlayerCardTable";
import PlayerCardTypeRecord from "../../database/models/playerCardTypeRecord";
import RoomGangRecord from "../../database/models/roomGangRecord";

const stateWaitDa = 1
const stateWaitAction = 2
export const stateGameOver = 3
const stateWaitGangShangHua = 4
const stateWaitGangShangAction = 5
const stateQiangHaiDi = 6
const stateWaitDaHaiDi = 7
const stateWaitHaiDiPao = 8
const stateQiangGang = 9

class HuCheck {
  hu?: any[]
  card: number
  chiCombol?: any[]
  bu?: any
  huInfo?: any
}

interface StateData {
  card?: number
  da?: PlayerState
  player?: PlayerState
  turn?: number
  current?: number
  msg?: any
  hu?: any
  currentIndex?: number[]
  lastMsg?: any[]
  hangUp?: any
  moreCanDoSomeThing?: any
  pengGang?: PlayerState
  HangUpPeng?: PlayerState
  checks?: HuCheck
  checkReduce?: any
  cards?: number[]
  gangPlayer?: PlayerState
  hangUpBu?: PlayerState
  HangUpGang?: PlayerState
  cancelQiang?: boolean
  whom?: PlayerState
  who?: PlayerState
  chiCombol?: any
  HangUpChi?: PlayerState,
  event?: string
  bu?: any
  huInfo?: any
}

const generateCards = function () {
  const cards = []
  const addSpan = function (start, end) {
    for (let c = start; c <= end; c += 1) {
      cards.push(c)
      cards.push(c)
      cards.push(c)
      cards.push(c)
    }
  }

  addSpan(Enums.wanzi1, Enums.wanzi9)
  addSpan(Enums.shuzi1, Enums.shuzi9)
  addSpan(Enums.tongzi1, Enums.tongzi9)
  addSpan(Enums.zhong, Enums.zhong);

  return cards
}
type Action = 'hu' | 'peng' | 'gang' | 'chi'

interface ActionOption {
  who: PlayerState,
  action: Action,
  state: 'waiting' | 'try' | 'cancel',
  onResolve?: () => void,
  onReject?: () => void,
  option?: any
}

export interface IActionCheck {
  card?: number,
  chi?: PlayerState,
  chiCombol?: any[][],
  peng?: PlayerState,
  hu?: PlayerState[],
  pengGang?: PlayerState
}

interface ActionEnv {
  card: number,
  from: number,
  turn: number
}

export class ActionResolver implements Serializable {
  @autoSerialize
  actionsOptions: ActionOption[] = []

  next: () => void
  @autoSerialize
  env: ActionEnv

  constructor(env: ActionEnv, next: () => void) {
    this.next = next
    this.env = env
  }

  toJSON() {
    return serializeHelp(this)
  }


  appendAction(player: PlayerState, action: Action, extra?: any) {
    if (action === 'chi' || action === 'hu' || action === 'gang') {
      this.actionsOptions.push(
        {who: player, action, state: 'waiting', option: extra}
      )
    } else {
      this.actionsOptions.push(
        {who: player, action, state: 'waiting'}
      )
    }
  }

  requestAction(player: PlayerState, action: Action, resolve: () => void, reject: () => void) {
    this.actionsOptions.filter(ao => ao.who === player)
      .forEach(ao => {
        ao.state = 'cancel'
      })
    const actionOption = this.actionsOptions.find(ao => ao.who === player && ao.action === action)
    actionOption.state = 'try'

    actionOption.onResolve = resolve
    actionOption.onReject = reject
  }

  cancel(player: PlayerState) {
    this.actionsOptions.filter(ao => ao.who === player)
      .forEach(ao => {
        ao.state = 'cancel'
      })
  }

  tryResolve() {
    for (const ao of this.actionsOptions) {
      if (ao.state === 'waiting') return;

      if (ao.state === 'cancel') continue;

      if (ao.state === 'try') {
        this.notifyWaitingPlayer();
        ao.onResolve();
        this.fireAndCleanAllAfterAction();
        return;
      }
    }

    this.next();
  }

  notifyWaitingPlayer() {

    const notified = {}

    this.actionsOptions.filter(ao => ao.state === 'waiting')
      .forEach(ao => {
        if (!notified[ao.who._id]) {
          ao.who.sendMessage('game/actionClose', {})
          notified[ao.who._id] = true
        }
      })
  }

  allOptions(player: PlayerState) {
    const oas = this.actionsOptions.filter(ao => ao.who === player && ao.state === 'waiting')

    if (oas.length === 0) {
      return null
    }

    const message = {}
    oas.forEach(ao => {
      message[ao.action] = true

      if (ao.action === 'hu') {
        message['huInfo'] = ao.option
      }

      if (ao.action === 'gang') {
        message['gangInfo'] = ao.option
      }
    })

    return {...message, ...this.env}
  }

  private fireAndCleanAllAfterAction() {
    for (const otherAO of this.actionsOptions) {
      if (otherAO.who.onAfterAction) {
        otherAO.who.onAfterAction()
        otherAO.who.onAfterAction = null
      }
    }
  }

}

class TableState implements Serializable {

  @autoSerialize
  restJushu: number
  @autoSerialize
  turn: number

  @autoSerialize
  cards: number[]

  @autoSerialize
  remainCards: number
  @autoSerialize
  caishen: (number)[]

  @serialize
  players: PlayerState[]

  @autoSerialize
  zhuang: PlayerState

  @autoSerialize
  lastDa: PlayerState | null

  rule: Rule
  room: Room

  @autoSerialize
  state: number

  logger: winston.LoggerInstance
  @autoSerialize
  sleepTime: number

  @autoSerialize
  stateData: StateData

  onRoomEmpty: () => void
  onReconnect: (anyArgs, index: number) => void

  recorder: IGameRecorder

  @autoSerialize
  niaos: any[] = []

  @autoSerialize
  actionResolver: ActionResolver

  // 最后拿到的牌
  @autoSerialize
  lastTakeCard: number

  // 最后接炮的牌
  @autoSerialize
  lastHuCard: number

  // 本局是否结束
  isGameOver: boolean = false;

  // 破产用户人数
  brokeCount: number = 0;

  // 破产用户人数
  brokeList: any[] = [];

  // 胡牌类型
  cardTypes: {
    cardId: any;
    cardName: any;
    multiple: number;
  }

  // 是否等待复活
  waitRecharge: boolean = false;

  // 判断是否打牌
  isGameDa: boolean = false;

  // 是否一炮多响
  isManyHu: boolean = false;
  // 一炮多响每个用户的胡牌信息
  manyHuArray: any[] = [];
  // 一炮多响操作完成的用户
  manyHuPlayers: any[] = [];
  // 一炮多响可以胡牌的用户
  canManyHuPlayers: any[] = [];
  // 是否正在执行一炮多响
  isRunMultiple: boolean = false;

  // 打出的牌
  gameDaCards: any[] = [];

  // 记录庄家摸的牌
  zhuangCard: number = 0;

  // 摸牌9张牌
  testMoCards: any[] = [];

  // 牌局摸牌状态
  gameMoStatus: {
    state: boolean;
    from: number;
    type: number;
    index: number;
  }

  // 等待复活人数
  waitRechargeCount: number = 0;

  // 已经复活人数
  alreadyRechargeCount: number = 0;

  constructor(room: Room, rule: Rule, restJushu: number) {
    this.restJushu = restJushu
    this.rule = rule
    const players = room.players.map(playerSocket => new PlayerState(playerSocket, room, rule));
    players[0].zhuang = true

    this.cards = generateCards()
    this.room = room
    this.listenRoom(room)
    this.remainCards = this.cards.length
    this.players = players
    this.zhuang = players[0]
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      this.listenPlayer(p)
    }
    this.turn = 1
    this.state = stateWaitAction
    this.lastDa = null

    const transports = []
    this.logger = new winston.Logger({transports})

    this.setGameRecorder(new GameRecorder(this))
    this.stateData = {}
    this.cardTypes = new CardTypeModel()
    this.isGameOver = false;
    this.brokeCount = 0;
    this.brokeList = [];
    this.waitRecharge = false;
    this.isGameDa = false;
    this.gameDaCards = [];
    this.zhuangCard = 0;
    this.gameMoStatus = {
      state: false,
      from: 0,
      type: 1,
      index: 0
    }
  }

  toJSON() {
    return serializeHelp(this)
  }

  destroy() {
    return;
  }

  resume(tableStateJson) {
    const keys = autoSerializePropertyKeys(this)
    Object.assign(this, pick(tableStateJson.gameState, keys))

    for (const [i, p] of this.players.entries()) {
      p.resume(tableStateJson.gameState.players[i])
      if (this.lastDa && this.lastDa._id.toString() === p._id.toString()) {
        this.lastDa = p;
      }
      if (this.zhuang && this.zhuang._id.toString() === p._id.toString()) {
        this.lastDa = p;
      }

      const stateDataName = ['player', 'pengGang', 'HangUpPeng', 'gangPlayer', 'hangUpBu', 'HangUpGang', 'whom',
        'who', 'HangUpChi']
      for (const name of stateDataName) {
        if (this.stateData[name] && this.stateData[name]._id.toString() === p._id.toString()) {
          this.stateData[name] = p;
        }
      }
      const stateDataArrayNames = [Enums.hu, Enums.pengGang, Enums.chi, Enums.peng]
      for (const name of stateDataArrayNames) {
        if (this.stateData[name]) {
          for (let j = 0; j < this.stateData[name].length; j++) {
            if (this.stateData[name][j]._id.toString() === p._id.toString())
              console.log(name, ` <= name ${p.model.nickname}, shortId  `, p.model.shortId)
            if (this.stateData[name][j]._id.toString() === p._id.toString()) {
              this.stateData[name][j] = p
            }
          }
        }
      }

    }
  }

  shuffle() {
    alg.shuffle(this.cards)
    this.turn = 1
    this.remainCards = this.cards.length
  }

  async consumeCard(playerState: PlayerState) {
    const player = playerState;
    const count = --this.remainCards;

    if (this.remainCards < 0) {
      this.remainCards = 0;
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()
      await this.gameAllOver(states, [], nextZhuang);
      return
    }

    let cardIndex = count;
    let card = this.cards[cardIndex];
    if (cardIndex === 0 && player) {
      player.takeLastCard = true
    }

    // 20%概率摸到刻牌
    const pengIndex = await this.getPlayerPengCards(player);
    if (pengIndex && Math.random() < 0.2) {
      const moIndex = this.cards.findIndex(card => card === pengIndex);
      if (moIndex !== -1) {
        cardIndex = moIndex;
        card = this.cards[moIndex];
      }
    }

    // 20%概率摸到对牌
    const duiIndex = await this.getPlayerDuiCards(player);
    if (duiIndex && Math.random() < 0.2) {
      const moIndex = this.cards.findIndex(card => card === duiIndex);
      if (moIndex !== -1) {
        cardIndex = moIndex;
        card = this.cards[moIndex];
      }
    }

    // 50%概率摸到定缺牌重新摸牌
    if (!player.checkCardIsDingQue(card) && Math.random() < 0.8) {
      const index = Math.floor(Math.random() * this.cards.length);
      cardIndex = index;
      card = this.cards[index];
    }

    if (this.testMoCards.length > 0) {
      const moIndex = this.cards.findIndex(card => card === this.testMoCards[0]);
      if (moIndex !== -1) {
        cardIndex = moIndex;
        card = this.cards[moIndex];
        this.testMoCards.splice(0, 1);
      }
    }

    this.cards.splice(cardIndex, 1);
    this.lastTakeCard = card;

    // 计算序数牌相加
    if (card <= Enums.wanzi9) {
      player.numberCount += card;
    }

    return card;
  }

  async getPlayerPengCards(p) {
    const cards = p.cards.slice();
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] === 3) {
        return i;
      }
    }

    return false;
  }

  async getPlayerDuiCards(p) {
    const cards = p.cards.slice();
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] === 2) {
        return i;
      }
    }

    return false;
  }

  async consumeSimpleCard(p: PlayerState) {
    const cardIndex = --this.remainCards;
    const card = this.cards[cardIndex];
    this.cards.splice(cardIndex, 1);
    this.lastTakeCard = card;

    return card;
  }

  async consumeGangOrKeCard(cardNum?) {
    const isGang = Math.random() < 0.1;

    const cardNumber = isGang && !cardNum ? 4 : (!cardNum && Math.random() < 0.1 ? 2 : 3);
    let cards = [];
    this.remainCards -= cardNumber;
    const counter = {};

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (counter[card]) {
        counter[card]++;
      } else {
        counter[card] = 1;
      }
    }

    const result = Object.keys(counter).filter(num => counter[num] >= cardNumber && Number(num) !== Enums.zhong);
    const randomNumber = Math.floor(Math.random() * result.length);

    for (let i = 0; i < cardNumber; i++) {
      const index = this.cards.findIndex(card => card === Number(result[randomNumber]));

      if (index !== -1) {
        const card = this.cards[index];
        cards.push(card);
        this.cards.splice(index, 1);
        this.lastTakeCard = card;
      }
    }

    return cards;
  }

  async take13Cards(player: PlayerState) {
    let cards = []
    const consumeCards = await this.consumeGangOrKeCard();
    cards = [...cards, ...consumeCards];

    const cardCount = 13 - cards.length;

    for (let i = 0; i < cardCount; i++) {
      cards.push(await this.consumeSimpleCard(player));
    }

    return cards;
  }

  async onSelectMode(player: PlayerState, mode: string) {
    player.mode = mode;
    this.room.broadcast("game/selectMode", {ok: true, data: {mode, index: this.atIndex(player)}});
  }

  async start(payload) {
    await this.fapai(payload);
  }

  async fapai(payload) {
    this.shuffle()
    this.sleepTime = 1500;
    this.caishen = this.rule.useCaiShen ? [Enums.zhong] : [Enums.slotNoCard]
    const restCards = this.remainCards - (this.rule.playerCount * 13);
    if (this.rule.test && payload.moCards && payload.moCards.length > 0) {
      this.testMoCards = payload.moCards;
    }
    const needShuffle = this.room.shuffleData.length > 0;
    let zhuangIndex = 0;
    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      const p = this.players[i];
      const cards13 = this.rule.test && payload.cards && payload.cards[i].length === 13 ? payload.cards[i] : await this.take13Cards(p);

      // 如果客户端指定发牌
      if (this.rule.test && payload.cards && payload.cards[i].length === 13) {
        for (let j = 0; j < payload.cards[i].length; j++) {
          const cardIndex = this.cards.findIndex(c => c === payload.cards[i][j]);
          this.remainCards--;
          const card = this.cards[cardIndex];
          this.cards.splice(cardIndex, 1);
          this.lastTakeCard = card;
        }
      }

      for (let i = 0; i < cards13.length; i++) {
        // 计算序数牌相加
        if (cards13[i] <= Enums.wanzi9) {
          p.numberCount += cards13[i];
        }
      }

      if (p.zhuang) {
        zhuangIndex = i;
        p.isDiHu = false;
      }

      p.onShuffle(restCards, this.caishen, this.restJushu, cards13, i, this.room.game.juIndex, needShuffle, zhuangIndex)
    }

    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }

    const nextDo = async () => {
      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
      const nextCard = await this.consumeCard(this.zhuang);
      this.zhuang.cards[nextCard]++;
      this.cardTypes = await this.getCardTypes(this.zhuang, 1);
      this.zhuang.cards[nextCard]--;
      const msg = this.zhuang.takeCard(this.turn, nextCard, false, false,
        {
          id: this.cardTypes.cardId,
          multiple: this.cardTypes.multiple * conf.base * conf.Ante * this.zhuang.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * this.zhuang.mingMultiple
        }, true, true);

      this.zhuangCard = nextCard;

      const index = this.atIndex(this.zhuang);
      this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard, msg}}, this.zhuang.msgDispatcher)
      this.state = stateWaitDa
      this.stateData = {msg, da: this.zhuang, card: nextCard}

      // 下发开始定缺牌消息
      this.room.broadcast("game/startSelectMode", {ok: true, data: {room: this.room._id}});
      await this.room.robotManager.setCardReady();
    }

    if (this.sleepTime === 0) {
      nextDo()
    } else {
      setTimeout(nextDo, this.sleepTime)
    }
  }

  async getCardTypes(player, type, dianPaoPlayer = null, isGame = true) {
    return await this.getCardTypesByHu(player, type, dianPaoPlayer, isGame);
  }

  async getCardTypesByHu(player, type = 1, dianPaoPlayer, isGame) {
    const cardTypes = await CardTypeModel.find({gameType: GameType.xueliu}).sort({cardId: 1});
    let cardType = { ...cardTypes[0] }; // 创建一个新的对象，其属性与cardTypes[0]相同
    cardType.multiple = type === 1 ? 2 : 1;
    cardType.cardId = -1;
    cardType.cardName = "平胡";

    for (let i = 0; i < cardTypes.length; i++) {
      // console.warn("cardId-%s, cardName-%s, multiple-%s, type-%s, isGame-%s", cardTypes[i].cardId, cardTypes[i].cardName, cardTypes[i].multiple, type, isGame);
      // 根(胡牌时，手中含有某特定牌张的全部4张(未杠出，不计红中))
      if (cardTypes[i].cardId === 91 && isGame) {
        const status = await this.checkGen(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      if (cardTypes[i].cardId === 90 && isGame) {
        const status = await this.checkQiangGangHu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 绝张(牌河中已出现过多枚，胡牌时仅剩当前胡牌张的和牌)
      if (cardTypes[i].cardId === 89 && isGame) {
        const status = await this.checkJueZhang(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 杠上炮(胡其他家杠牌后打出的牌)
      if (cardTypes[i].cardId === 88 && type === 2) {
        const status = await this.checkGangShangPao(player, dianPaoPlayer);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          // console.warn("index-%s, from-%s", this.atIndex(player), this.atIndex(dianPaoPlayer));
          cardType = cardTypes[i];
        }
      }

      // 海底捞月(剩余牌张数位0的胡其他家点炮的牌)
      if (cardTypes[i].cardId === 87 && type === 2 && isGame) {
        const status = await this.checkHaiDiLaoYue(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 妙手回春(剩余牌张数位0的自摸)
      if (cardTypes[i].cardId === 86 && type === 1 && isGame) {
        const status = await this.checkMiaoShouHuiChun(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 边张(胡牌时，仅能以12胡3或89胡7的特定单面听胡)
      if (cardTypes[i].cardId === 85 && isGame) {
        const status = await this.checkBianZhang(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 坎张(胡牌时，仅能胡一组顺子中间的一张牌)
      if (cardTypes[i].cardId === 84 && isGame) {
        const status = await this.checkKanZhang(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 双同刻(含有两种花色的同一序数牌刻(杠)的和牌)
      if (cardTypes[i].cardId === 83) {
        const status = await this.checkShuangTongKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 双暗刻(含有2组暗刻(暗杠)的和牌)
      if (cardTypes[i].cardId === 82) {
        const status = await this.checkShuangAnKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 断么九(仅由序数牌2到8组成的和牌)
      if (cardTypes[i].cardId === 81) {
        const status = await this.checkDuanYaoJiu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 门清(没有碰和明杠的情况下，胡其他家点炮的牌)
      if (cardTypes[i].cardId === 80 && type === 2) {
        const status = await this.checkMenQing(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 老少副(同一花色的两组顺子123和789)
      if (cardTypes[i].cardId === 79) {
        const status = await this.checkLaoShaoFu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 对对胡(由4组刻(杠)加一对将组成的和牌)
      if (cardTypes[i].cardId === 78) {
        const status = await this.checkDuiDuiHu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 不求人(没有碰和明杠的自摸胡)
      if (cardTypes[i].cardId === 77 && type === 1) {
        const status = await this.checkBuQiuRen(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 推不倒(仅由1234589筒和245689条组成的和牌)
      if (cardTypes[i].cardId === 76) {
        const status = await this.checkTuiBuDao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 杠上开花(用开杠后的补牌胡牌)
      if (cardTypes[i].cardId === 75 && type === 1 && isGame) {
        const status = await this.checkGangShangHua(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 清龙(含有同一花色123、456、789三组顺子的和牌)
      if (cardTypes[i].cardId === 74) {
        const status = await this.checkQingLong(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 清一色(仅由同一种花色序数牌组成的和牌)
      if (cardTypes[i].cardId === 73) {
        const status = await this.checkQingYiSe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 七对(由7个对子组成的特殊和牌型)
      if (cardTypes[i].cardId === 72) {
        const status = await this.checkQiDui(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 三暗刻(含有3组暗刻(暗杠)的和牌)
      if (cardTypes[i].cardId === 71) {
        const status = await this.checkSanAnKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 小于五(仅由序数牌12345组成的和牌)
      if (cardTypes[i].cardId === 70) {
        const status = await this.checkXiaoYuWu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 大于五(仅由序数牌6789组成的和牌)
      if (cardTypes[i].cardId === 69) {
        const status = await this.checkDaYuWu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 百万石(胡牌时，手中的万字牌序数相加大于等于100)
      if (cardTypes[i].cardId === 68) {
        const status = await this.checkBaiWanShi(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 金钩钩(胡牌时，手上只有1张牌，其余牌均被碰·杠出。不计对对胡)
      if (cardTypes[i].cardId === 67) {
        const status = await this.checkJinGouGou(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 三节高(含有同一花色中3组序数相连刻(杠)的和牌)
      if (cardTypes[i].cardId === 66) {
        const status = await this.checkSanJieGao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全双刻(仅由序数牌2468组成的对对胡)
      if (cardTypes[i].cardId === 65) {
        const status = await this.checkQuanShuangKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 十二金钗(含有3组杠的和牌)
      if (cardTypes[i].cardId === 64) {
        const status = await this.checkShiErJinChai(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 四暗刻(含有4组暗刻(暗杠)的和牌，不计对对胡)
      if (cardTypes[i].cardId === 63) {
        const status = await this.checkSiAnKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 四节高(含有同一花色中4组序数相连刻(杠)的和牌)
      if (cardTypes[i].cardId === 62) {
        const status = await this.checkSiJieGao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全小(仅由序数牌123组成的和牌)
      if (cardTypes[i].cardId === 61) {
        const status = await this.checkHunXiao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全中(仅由序数牌456组成的和牌)
      if (cardTypes[i].cardId === 60) {
        const status = await this.checkHunZhong(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全大(仅由序数牌789组成的和牌)
      if (cardTypes[i].cardId === 59) {
        const status = await this.checkHunDa(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 十八罗汉(含有4组杠的和牌)
      if (cardTypes[i].cardId === 58) {
        const status = await this.checkShiBaLuoHan(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 地胡(非庄家摸到的第一张牌胡牌(每一家的碰·杠·胡等操作均会使地胡不成立))
      if (cardTypes[i].cardId === 57 && !player.zhuang && type === 1) {
        const status = await this.checkDiHu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 绿一色(仅由23468条组成的和牌，不计清一色)
      if (cardTypes[i].cardId === 56) {
        const status = await this.checkLvYiSe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 天胡(庄家起手时直接胡牌)
      if (cardTypes[i].cardId === 55 && isGame) {
        const status = await this.checkTianHu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 九莲宝灯(由同一花色的序数牌1112345678999组成特定听牌型后的和牌)
      if (cardTypes[i].cardId === 54) {
        const status = await this.checkJiuLianBaoDeng(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 一色双龙会(含同一花色的两组老少副(123+789),且由该花色的序数牌5做将的特定和牌型，不计7对)
      if (cardTypes[i].cardId === 61) {
        const status = await this.checkYiSeShuangLongHui(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 连七对(由同一花色的序数牌组成序数相连的7个对子的和牌)
      if (cardTypes[i].cardId === 52) {
        const status = await this.checkLianQiDui(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 清幺九(仅由序数牌1和9组成的和牌)
      if (cardTypes[i].cardId === 51) {
        const status = await this.checkQingYaoJiu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }
    }

    return cardType;
  }

  async checkQingYaoJiu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const cardList = [1, 9, 11, 19, 21, 29];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (!cardList.includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkLianQiDui(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < 3; i++) {
      for (let j = 1; j <= 3; j++) {
        const cardList = [0, 0, 0, 0, 0, 0, 0];
        let zhongCount = cards[Enums.zhong];
        let state = true;
        for (let k = 0; k < cardList.length; k++) {
          cardList[k] = cards[i * 10 + j + k];
        }

        // 如果牌有缺失，用红中补缺失牌
        for (let k = 0; k < cardList.length; k++) {
          if (cardList[k] < 2 && zhongCount >= 2 - cardList[k]) {
            const count = 2 - cardList[k];
            cardList[k] += count;
            zhongCount -= count;
          }
        }

        // 判断序数牌牌型是否符合规则
        for (let k = 0; k < cardList.length; k++) {
          if (cardList[k] < 2) {
            state = false;
          }
        }

        if (state) {
          // console.warn("index-%s, start-%s, end-%s, zhongCount-%s, cardList-%s, cards-%s, state-%s", this.atIndex(player),
          //   i * 10 + j, i * 10 + j + 6, zhongCount, JSON.stringify(cardList), JSON.stringify(this.getCardArray(cards)), state);
          flag = state;
          break;
        }
      }
    }

    // 如果有碰杠，直接false
    if (gangList.length > 0) {
      flag = false;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkYiSeShuangLongHui(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let huCard = [1, 2, 3, 5, 7, 8, 9];
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();

    for (let i = 0; i < 3; i++) {
      const cardList = [0, 0, 0, 0, 0, 0, 0];
      let zhongCount = cards[Enums.zhong];
      let state = true;

      // 计算序数牌1-9的数量
      for (let j = 1; j <= 9; j++) {
        const index = huCard.findIndex(c => c === j);
        if (index !== -1) {
          cardList[index] = cards[i * 10 + j];
        }
      }

      // 如果牌有缺失，用红中补缺失牌
      for (let k = 0; k < cardList.length; k++) {
        if ([0, 1, 2, 4, 5, 6].includes(k) && cardList[k] < 2 && zhongCount >= 2 - cardList[k]) {
          const count = 2 - cardList[k];
          cardList[k] += count;
          zhongCount -= count;
        }

        if (k === 5 && cardList[k] === 0 && zhongCount > 0) {
          cardList[k]++;
          zhongCount--;
        }
      }

      // 判断序数牌牌型是否符合规则
      for (let k = 0; k < cardList.length; k++) {
        if ([0, 1, 2, 4, 5, 6].includes(k) && cardList[k] < 2) {
          state = false;
        }

        if (k === 5 && cardList[k] < 1) {
          state = false;
        }
      }

      if (state) {
        flag = state;
      }
    }

    // 如果有碰杠，直接false
    if (gangList.length > 0) {
      flag = false;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkJiuLianBaoDeng(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();

    for (let i = 0; i < 3; i++) {
      const cardList = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      let zhongCount = cards[Enums.zhong];
      let state = true;

      // 计算序数牌1-9的数量
      for (let j = 1; j <= 9; j++) {
        cardList[j - 1] = cards[i * 10 + j];
      }

      // 如果牌有缺失，用红中补缺失牌
      for (let k = 0; k < cardList.length; k++) {
        if ([0, cardList.length - 1].includes(k) && cardList[k] < 3 && zhongCount >= 3 - cardList[k]) {
          const count = 3 - cardList[k];
          cardList[k] += count;
          zhongCount -= count;
        }

        if (k > 0 && k < cardList.length - 1 && cardList[k] === 0 && zhongCount >= 1) {
          cardList[k]++;
          zhongCount--;
        }
      }

      // 判断序数牌牌型是否符合规则
      for (let k = 0; k < cardList.length; k++) {
        if ([0, cardList.length - 1].includes(k) && cardList[k] < 3) {
          state = false;
        }

        if (k > 0 && k < cardList.length - 1 && cardList[k] < 1) {
          state = false;
        }
      }

      if (state) {
        flag = state;
      }
    }

    // 如果有碰杠，直接false
    if (gangList.length > 0) {
      flag = false;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkLvYiSe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [12, 13, 14, 16, 18];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (!cardList.includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkBaiWanShi(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang];
    let numberCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] <= Enums.wanzi9) {
        numberCount += gangList[i] * 4;
      }
    }

    for (let i = 0; i < peng.length; i++) {
      if (peng[i] <= Enums.wanzi9) {
        numberCount += peng[i] * 3;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.wanzi9; i++) {
      if (cards[i] > 0) {
        numberCount += cards[i] * i;
      }
    }

    return numberCount >= 100 && (isZiMo || isJiePao);
  }

  async checkDaYuWu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] % 10 <= 5) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && i % 10 <= 5) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }


  async checkXiaoYuWu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] % 10 > 5) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && i % 10 > 5) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkQingYiSe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const cards = player.cards.slice();
    let wanCount = 0;
    let shuCount = 0;
    let tongCount = 0;
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] <= Enums.wanzi9) {
        wanCount++;
      }

      if (gangList[i] >= Enums.shuzi1 && gangList[i] <= Enums.shuzi9) {
        shuCount++;
      }

      if (gangList[i] >= Enums.tongzi1 && gangList[i] <= Enums.tongzi9) {
        tongCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && i <= Enums.wanzi9) {
        wanCount++;
      }

      if (cards[i] > 0 && i >= Enums.shuzi1 && i <= Enums.shuzi9) {
        shuCount++;
      }

      if (cards[i] > 0 && i >= Enums.tongzi1 && i <= Enums.tongzi9) {
        tongCount++;
      }
    }

    if (((wanCount === 0 && shuCount === 0) || (wanCount === 0 && tongCount === 0) || (shuCount === 0 && tongCount === 0))) {
      flag = true;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkQingLong(player, type) {
    const shunList = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let shunZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.shunZi) {
        shunZi = huResult.huCards.shunZi;
      }
    }

    for (let i = 0; i < 3; i++) {
      let state = true;
      let shunListSlice = shunZi.slice();
      let zhongCount = player.cards[Enums.zhong];

      for (let j = 0; j < shunList.length; j++) {
        if (!shunListSlice.includes(i * 10 + shunList[j]) && zhongCount > 0) {
          shunListSlice.push(i * 10 + shunList[j]);
          zhongCount--;
        }
      }

      for (let j = 0; j < shunList.length; j++) {
        if (!shunListSlice.includes(i * 10 + shunList[j])) {
          state = false;
        }
      }

      if (state) {
        flag = state;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkTuiBuDao(player, type) {
    const cardList = [12, 14, 15, 16, 18, 19, 21, 22, 23, 24, 25, 28, 29];
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const cards = player.cards.slice();
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (!cardList.includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkLaoShaoFu(player, type) {
    const shunList = [1, 2, 3, 7, 8, 9];
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let shunZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.shunZi) {
        shunZi = huResult.huCards.shunZi;
      }
    }

    for (let i = 0; i < 3; i++) {
      let state = true;
      let shunListSlice = shunZi.slice();
      let zhongCount = player.cards[Enums.zhong];

      for (let j = 0; j < shunList.length; j++) {
        if (!shunListSlice.includes(i * 10 + shunList[j]) && zhongCount > 0) {
          shunListSlice.push(i * 10 + shunList[j]);
          zhongCount--;
        }
      }

      for (let j = 0; j < shunList.length; j++) {
        if (!shunListSlice.includes(i * 10 + shunList[j])) {
          state = false;
        }
      }

      if (state) {
        flag = state;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  splitIntoShunzi(numbers) {
    let result = [];
    let currentShunzi = [];

    for (let i = 0; i < numbers.length; i++) {
      if (currentShunzi.length < 2) {
        // 如果当前顺子长度小于2，直接添加
        currentShunzi.push(numbers[i]);
      } else if (currentShunzi.length === 2) {
        // 当前顺子已有2项，判断是否满足相连条件
        if (numbers[i] === currentShunzi[1] + 1) {
          // 第三个数字与前两个数字相连，可以添加到顺子中
          currentShunzi.push(numbers[i]);
        } else {
          // 不相连，则将当前顺子添加到结果中，并开始新的顺子
          result.push(currentShunzi);
          currentShunzi = [numbers[i]];
        }
      } else {
        // 当前顺子已满（3项），开始新的顺子
        result.push(currentShunzi);
        currentShunzi = [numbers[i]];
      }
    }

    // 如果遍历结束后，当前顺子还有元素，则添加到结果中
    if (currentShunzi.length > 0) {
      result.push(currentShunzi);
    }

    return result;
  }

  async checkKanZhang(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let flag = false;
    let shunZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.shunZi) {
        shunZi = huResult.huCards.shunZi;
      }
    }

    // 组装顺子
    const currentShunZi = this.splitIntoShunzi(shunZi);

    for (let i = 0; i < currentShunZi.length; i++) {
      if (currentShunZi[i].length === 3 && ((isZiMo && this.lastTakeCard === currentShunZi[i][1]) || (isJiePao && this.lastHuCard === currentShunZi[i][1]))) {
        flag = true;
      }

      if (currentShunZi[i].length === 2) {
        if (currentShunZi[i][1] - currentShunZi[i][0] === 2) {
          const middle = currentShunZi[i][0] + 1;
          if ((isZiMo && this.lastTakeCard === middle) || (isJiePao && this.lastHuCard === middle)) {
            flag = true;
          }
        }
        if (currentShunZi[i][1] - currentShunZi[i][0] === 1) {
          if ((isZiMo && currentShunZi[i].includes(this.lastTakeCard)) || (isJiePao && currentShunZi[i].includes(this.lastHuCard))) {
            flag = true;
          }
        }
      }
    }

    return flag;
  }

  async checkBianZhang(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let flag = false;
    let shunZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.shunZi) {
        shunZi = huResult.huCards.shunZi;
      }
    }

    // 组装顺子
    const currentShunZi = this.splitIntoShunzi(shunZi);

    for (let i = 0; i < currentShunZi.length; i++) {
      if (currentShunZi[i].length === 3) {
        if ((isZiMo && this.lastTakeCard === currentShunZi[i][2] && this.lastTakeCard % 10 === 3) || (isJiePao && this.lastHuCard === currentShunZi[i][2] && this.lastHuCard % 10 === 3)) {
          flag = true;
        }
        if ((isZiMo && this.lastTakeCard === currentShunZi[i][0] && this.lastTakeCard % 10 === 7) || (isJiePao && this.lastHuCard === currentShunZi[i][0] && this.lastHuCard % 10 === 7)) {
          flag = true;
        }
      }

      if (currentShunZi[i].length === 2 && currentShunZi[i][1] - currentShunZi[i][0] === 1) {
        const third = currentShunZi[i][1] + 1;
        const seven = currentShunZi[i][0] - 1;
        if ((isZiMo && this.lastTakeCard % 10 === 3 && this.lastTakeCard === third) || (isJiePao && this.lastHuCard === third && this.lastHuCard % 10 === 3)) {
          flag = true;
        }
        if ((isZiMo && this.lastTakeCard % 10 === 7 && this.lastTakeCard === seven) || (isJiePao && this.lastHuCard === seven && this.lastHuCard % 10 === 7)) {
          flag = true;
        }
      }
    }

    return flag;
  }

  async checkGen(player, type) {
    const cards = player.cards.slice();
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = Enums.wanzi1; i < Enums.zhong; i++) {
      if (player.cards[i] === 4) {
        flag = true;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkDiHu(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    return !player.isGameDa && !player.zhuang && player.isDiHu && isZiMo;
  }

  async checkTianHu(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    return !player.isGameDa && player.zhuang && isZiMo;
  }

  async checkJinGouGou(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let cardCount = 0;
    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (player.cards[i] > 0) {
        cardCount += player.cards[i];
      }
    }
    return cardCount === 1 && (isZiMo || isJiePao);
  }

  async checkQiangGangHu(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const huResult = player.checkZiMo();
    return huResult.hu && huResult.huCards.huType === Enums.qiangGang && isZiMo;
  }

  async checkSiAnKe(player, type) {
    const anGang = player.events["anGang"] || [];
    let anGangCount = anGang.length;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let keZi = [];
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.keZi) {
        keZi = huResult.huCards.keZi;
        anGangCount += keZi.length;
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        anGangCount += gangZi.length;
      }
    }

    return anGangCount >= 4 && (isZiMo || isJiePao);
  }

  async checkQuanShuangKe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const cards = player.cards.slice();
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    let keZi = [];
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
      cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.keZi) {
        keZi = huResult.huCards.keZi;
        gangList.push(keZi);
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] <= Enums.tongzi9 && gangList[i] % 2 === 1) {
        flag = false;
      }
    }

    for (let i = 0; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && i % 2 === 1) {
        flag = false;
      }
    }

    return flag && gangList.length === 4 && (isZiMo || isJiePao);
  }

  async checkSiJieGao(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let keZi = [];
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.keZi) {
        keZi = huResult.huCards.keZi;
        gangList = [...gangList, ...keZi];
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    gangList.sort((a, b) => a - b);
    let flag = false;

    for (let i = Enums.wanzi1; i <= Enums.tongzi6; i++) {
      if (gangList.includes(i) && gangList.includes(i + 1) &&
        gangList.includes(i + 2) && gangList.includes(i + 3)) {
        flag = true;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkQiDui(player, type) {
    let duiCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    const cards = player.cards.slice();
    let zhongCount = cards[Enums.zhong];
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && cards[i] % 2 !== 0 && zhongCount > 0) {
        cards[i]++;
        zhongCount--;
      }
      if (cards[i] === 2 || cards[i] === 4) {
        duiCount += cards[i] / 2;
      }
    }

    return duiCount === 7 && (isZiMo || isJiePao);
  }

  async checkSanAnKe(player, type) {
    const anGang = player.events["anGang"] || [];
    let anGangCount = anGang.length;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let keZi = [];
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.keZi) {
        keZi = huResult.huCards.keZi;
        anGangCount += keZi.length;
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        anGangCount += gangZi.length;
      }
    }

    return anGangCount >= 3 && (isZiMo || isJiePao);
  }

  async checkHunDa(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] % 10 < 7) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && i % 10 < 7) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkHunZhong(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] % 10 < 4 || gangList[i] % 10 > 6) {
        flag = false;
        break;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && (i % 10 < 4 || i % 10 > 6)) {
        flag = false;
        break;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkHunXiao(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] % 10 > 3) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && i % 10 > 3) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkSanJieGao(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    let keZi = [];
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.keZi) {
        keZi = huResult.huCards.keZi;
        gangList = [...gangList, ...keZi];
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    gangList.sort((a, b) => a - b);
    let flag = false;

    for (let i = Enums.wanzi1; i <= Enums.tongzi7; i++) {
      if (gangList.includes(i) && gangList.includes(i + 1) && gangList.includes(i + 2)) {
        flag = true;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkShuangAnKe(player, type) {
    const anGang = player.events["anGang"] || [];
    let anGangCount = anGang.length;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let keZi = [];
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.keZi) {
        keZi = huResult.huCards.keZi;
        anGangCount += keZi.length;
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        anGangCount += gangZi.length;
      }
    }

    return anGangCount >= 2 && (isZiMo || isJiePao);
  }

  async checkBuQiuRen(player) {
    const peng = player.events["peng"];
    const jieGang = player.events["mingGang"];
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);

    if (peng || jieGang) {
      return false;
    }

    return isZiMo;
  }

  async checkDuanYaoJiu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if ([1, 11, 21, 9, 19, 29].includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if ([1, 11, 21, 9, 19, 29].includes(i) && cards[i] > 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkShiBaLuoHan(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    return gangList.length >= 4 && (isZiMo || isJiePao);
  }

  async checkShiErJinChai(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }

    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    return gangList.length >= 3 && (isZiMo || isJiePao);
  }

  async checkShuangTongKe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let keZi = [];
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.keZi) {
        keZi = huResult.huCards.keZi;
        gangList = [...gangList, ...keZi];
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    for (let i = 0; i < gangList.length; i++) {
      const number = gangList[i] % 10;
      const t1 = gangList.includes(number);
      const t2 = gangList.includes(number + 10);
      const t3 = gangList.includes(number + 20);
      if ((t1 && t2) || (t1 && t3) || (t3 && t2)) {
        flag = true;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkDuiDuiHu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangCount = anGang.length + jieGang.length + peng.length;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    let keZi = [];
    let gangZi = [];
    if (isJiePao) {
      player.cards[this.lastHuCard]++;
    }

    const huResult = player.checkZiMo();
    if (isJiePao) {
      player.cards[this.lastHuCard]--;
    }

    if (huResult.hu) {
      if (huResult.huCards.keZi) {
        keZi = huResult.huCards.keZi;
        gangCount += keZi.length;
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangCount += gangZi.length;
      }
    }

    return gangCount === 4 && (isZiMo || isJiePao);
  }

  async checkJueZhang(player, type) {
    let cardCount= 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }

    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i]._id === player._id) {
        continue;
      }

      // 其他用户碰牌，记3张
      const peng = this.players[i].events["peng"] || [];
      if ((isZiMo && peng.includes(this.lastTakeCard)) || (isJiePao && peng.includes(this.lastHuCard))) {
        cardCount += 3;
      }

      // 其他用户牌堆有牌，记1张
      for (let j = 0; j < this.players[i].cards.length; j++) {
        if ((isZiMo && this.players[i].cards[j] > 0 && j === this.lastTakeCard) || (isJiePao && this.players[i].cards[j] > 0 && j === this.lastHuCard)) {
          cardCount++;
        }
      }
    }

    // 判断牌堆是否还有这张牌，记1张
    for (let i = 0; i < this.cards.length; i++) {
      if ((isZiMo && this.cards[i] === this.lastTakeCard) || (isJiePao && this.cards[i] === this.lastHuCard)) {
        cardCount++;
      }
    }

    return cardCount === 0 && (isZiMo || isJiePao);
  }

  async checkGangShangPao(player, dianPaoPlayer) {
    const isJiePao = dianPaoPlayer && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, dianPaoPlayer);
    return dianPaoPlayer && dianPaoPlayer.isGangHouDa && isJiePao;
  }

  async checkHaiDiLaoYue(player) {
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    return this.remainCards === 0 && this.lastDa && isJiePao;
  }

  async checkGangShangHua(player) {
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    return player.lastOperateType === 3 && isZiMo;
  }

  async checkMiaoShouHuiChun(player) {
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    return this.remainCards === 0 && isZiMo;
  }

  async checkMenQing(player) {
    const peng = player.events["peng"];
    const jieGang = player.events["mingGang"];
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    if (peng || jieGang) {
      return false;
    }

    return this.lastDa && isJiePao;
  }

  atIndex(player: PlayerState) {
    if (!player) {
      return
    }
    return this.players.findIndex(p => p._id.toString() === player._id.toString())
  }

  setManyAction(player: PlayerState, action) {
    const index = this.manyHuArray.findIndex(p => p.to === this.atIndex(player));
    if (index !== -1) {
      this.manyHuArray[index]["action"] = action;
    }
  }

  listenPlayer(player) {
    const index = this.atIndex(player)
    player.registerHook('game/canDoSomething', msg => {
      player.emitter.emit('waitForDoSomeThing', msg)
    })
    player.registerHook('game/canDoSomethingGang', msg => {
      player.deposit(() => {
        player.emitter.emit('gangShangGuo', msg.turn)
      })
    })
    player.registerHook('game/kaiGangBuZhang', msg => {
      player.deposit(() => {
        if (msg.hu) {
          player.emitter.emit('gangShangKaiHuaGuo', msg.turn)
        }
      })
    })
    player.registerHook('game/takeHaiDiCard', msg => {
      player.deposit(() => {
        if (msg.hu) {
          player.emitter.emit('daHaiDi', msg.turn)
        }
      })
    })
    player.registerHook('game/canJieHaiDiPao', msg => {
      player.deposit(() => {
        if (msg.hu) {
          player.emitter.emit('guoHaiDiPao', msg.turn)
        }
      })
    })
    player.registerHook('game/xunWenHaiDi', msg => {
      player.deposit(() => {
        player.emitter.emit('buYaoHaiDi', msg.turn)
        player.sendMessage('game/depositBuYaoHaiDi', {turn: msg.turn})
      })
    })
    player.on('refreshQuiet', async (p, idx) => {
      await this.onRefresh(idx)
    })

    player.on('waitForDa', async msg => {
      player.deposit(async () => {
        const nextDo = async () => {
          if (msg) {
            const takenCard = msg.card;
            const todo = player.ai.onWaitForDa(msg, player.cards);

            if (todo === Enums.gang && !player.isGameHu) {
              const gangCard = msg.gang[0][0];
              player.emitter.emit(Enums.gangBySelf, this.turn, gangCard);
            } else if (todo === Enums.hu) {
              if (([Enums.zhong].includes(takenCard)) && !player.isGameHu) {
                const card = this.promptWithPattern(player, this.lastTakeCard);
                player.emitter.emit(Enums.da, this.turn, card)
              } else {
                player.emitter.emit(Enums.hu, this.turn, takenCard)
              }
            } else {
              const card = this.promptWithPattern(player, this.lastTakeCard);
              player.emitter.emit(Enums.da, this.turn, card);
            }
          } else {
            const card = this.promptWithPattern(player, null);
            player.emitter.emit(Enums.da, this.turn, card);
          }
        }

        setTimeout(nextDo, 500);
      })
    })
    player.on('waitForDoSomeThing', msg => {
      player.deposit(async () => {
        if (player.isRobot) {
          return ;
        }

        const card = msg.data.card;
        const todo = player.ai.onCanDoSomething(msg.data, player.cards, card);

        // 一炮多响切用户未操作
        if (this.isManyHu && !this.manyHuPlayers.includes(player._id)) {
          this.manyHuPlayers.push(player._id.toString());
          this.setManyAction(player, todo);
          // console.warn("player index-%s deposit choice card-%s", this.atIndex(player), card);

          player.sendMessage("game/chooseMultiple", {ok: true, data: {action: todo, card, index: this.atIndex(player)}});

          if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
            this.isRunMultiple = true;
            player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
          }

          return ;
        }

        const nextDo = async () => {
          if (todo === Enums.peng && !player.isGameHu) {
            player.emitter.emit(Enums.peng, this.turn, card)
          } else if (todo === Enums.gang && !player.isGameHu) {
            // console.warn("gang index-%s card-%s todo-%s", this.atIndex(player), msg.data.card, todo);
            player.emitter.emit(Enums.gangByOtherDa, this.turn, card);
          } else if (todo === Enums.hu) {
            return player.emitter.emit(Enums.hu, this.turn, card);
          } else {
            player.emitter.emit(Enums.guo, this.turn, card)
          }
        }

        setTimeout(nextDo, 500);
      })
    })
    player.on('willTakeCard', async denyFunc => {
      if (this.remainCards < 0) {
        denyFunc()
        const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
        const nextZhuang = this.nextZhuang()
        await this.gameAllOver(states, [], nextZhuang);
        return
      }
      // logger.info('willTakeCard player-%s remainCards %s', index, this.remainCards)
    })

    player.on("mayQiaoXiang", () => {
      player.sendMessage("game/mayQiaoXiang", {info: '可以敲响'})
      this.logger.info('mayQiaoXiang player %s', index)
    })

    player.on("qiaoXiang", ({qiao}) => {
      this.logger.info('qiaoXiang player-%s qiao :%s ', index, qiao)
      if (qiao) {
        player.setQiaoXiang()
        this.room.broadcast('game/otherQiaoXiang', {player: index})
      }
      player.stashPopTakeCard()
    })

    player.on(Enums.da, async (turn, card) => {
      await this.onPlayerDa(player, turn, card);
    })

    player.on(Enums.huTakeCard, async (msg) => {
      await this.onPlayerHuTakeCard(player, msg);
    })

    player.on(Enums.broke, async () => {
      await this.onPlayerBroke(player);
    })

    player.on(Enums.multipleHu, async () => {
      await this.onPlayerMultipleHu(player);
    })

    player.on(Enums.openCard, async () => {
      if (!player.onDeposit) {
        player.isMingCard = true;
        player.mingMultiple = 6;
        this.room.broadcast('game/openCardReply', {
          ok: true,
          data: {roomId: this.room._id, index: this.atIndex(player), cards: player.getCardsArray()}
        });
        player.emitter.emit('waitForDa')
      } else {
        await player.sendMessage('game/openCardReply', {ok: false, data: {}});
      }
    })

    player.on(Enums.getActions, async () => {
      if (!this.lastTakeCard) {
        return await player.sendMessage('game/getActionsReply', {ok: false, info: TianleErrorCode.zhuangCardInvalid});
      }

      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
      player.cards[this.zhuangCard]--;
      const msg = this.zhuang.takeCard(this.turn, this.lastTakeCard, false, false,
        {
          id: this.cardTypes.cardId,
          multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple
        }, false);
      msg["seatIndex"] = this.zhuang.seatIndex;

      // player.emitter.emit('waitForDa', msg)

      this.room.broadcast('game/getActionsReply', {ok: true, data: msg});
    })

    player.on(Enums.restoreGame, async () => {
      this.alreadyRechargeCount++;
      if (this.alreadyRechargeCount >= this.waitRechargeCount) {
        this.room.robotManager.model.step = RobotStep.running;
      }

      if (this.stateData[Enums.da] && this.stateData[Enums.da]._id === player._id) {
        this.state = stateWaitDa;
        this.stateData = {da: player, card: this.lastTakeCard};
      }

      this.room.broadcast('game/restoreGameReply', {
        ok: true,
        data: {roomId: this.room._id, index: this.atIndex(player), step: this.room.robotManager.model.step}
      });

      // 如果当前是摸牌状态，则给下家摸牌
      if (this.gameMoStatus.state) {
        const huTakeCard = async () => {
          this.players[this.gameMoStatus.index].emitter.emit(Enums.huTakeCard, {from: this.gameMoStatus.from, type: this.gameMoStatus.type});
        }

        setTimeout(huTakeCard, 1000);
      }
    })

    player.on(Enums.dingQue, async (msg) => {
      player.mode = msg.mode;
      this.room.broadcast("game/selectMode", {ok: true, data: {mode: msg.mode, index: this.atIndex(player)}});
    })

    player.on(Enums.startDeposit, async () => {
      if (!player.onDeposit) {
        player.onDeposit = true
        await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
      } else {
        await player.sendMessage('game/startDepositReply', {ok: false, data: {}})
      }
    })

    player.on(Enums.peng, (turn, card) => {
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamStateInvaid});
        return
      }
      if (this.stateData.pengGang !== player || this.stateData.card !== card) {
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamInvaid});
        return
      }

      // 一炮多响（金豆房）
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && this.room.isPublic) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.peng);
        player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.peng, card, index: this.atIndex(player)}})

        if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
          this.isRunMultiple = true;
          player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
        }

        return ;
      }

      // 一炮多响(好友房)
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && !this.room.isPublic) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.peng);
        player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.peng, card, index: this.atIndex(player)}})

        if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
          this.isRunMultiple = true;
          player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
        }

        return ;
      }

      this.actionResolver.requestAction(player, 'peng', () => {
        const ok = player.pengPai(card, this.lastDa);
        if (ok) {
          player.lastOperateType = 2;

          const hangUpList = this.stateData.hangUp;
          this.turn++;
          this.state = stateWaitDa;
          // 设置所有用户地胡状态为false
          this.players.map((p) => p.isDiHu = false);
          const nextStateData = {da: player};
          const gangSelection = player.getAvailableGangs();
          this.stateData = nextStateData;
          const from = this.atIndex(this.lastDa);
          const me = this.atIndex(player);
          player.sendMessage('game/pengReply', {
            ok: true,
            data: {
              turn: this.turn,
              card,
              from,
              gang: gangSelection.length > 0,
              gangSelection
            }
          })
          for (const gangCard of gangSelection) {
            if (gangCard === card) {
              player.gangForbid.push(gangCard[0])
            }
          }

          for (let i = 1; i < 4; i++) {
            const playerIndex = (from + i) % this.players.length
            if (playerIndex === me) {
              break
            }
            this.players[playerIndex].pengForbidden = []
          }

          this.room.broadcast('game/oppoPeng', {
            ok: true, data: {
              card,
              index,
              turn, from
            }
          }, player.msgDispatcher)
          if (hangUpList.length > 0) {    // 向所有挂起的玩家回复
            hangUpList.forEach(hangUpMsg => {
              hangUpMsg[0].emitter.emit(hangUpMsg[1], ...hangUpMsg[2])
            })
          }
        } else {
          player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengButPlayerHu});
          return;
        }
      }, () => {
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengPriorityInsufficient});
      })

      this.actionResolver.tryResolve()
    })
    player.on(Enums.gangByOtherDa, (turn, card) => {
      if (!this.stateData[Enums.gang]) {
        return ;
      }
      if (this.state !== stateWaitAction) {
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
        return;
      }
      if (this.stateData[Enums.gang]._id.toString() !== player.model._id.toString() || this.stateData.card !== card) {
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
        return
      }

      // 一炮多响(金豆房)
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && this.room.isPublic) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.gang);
        player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.gang, card, index: this.atIndex(player)}})

        if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
          this.isRunMultiple = true;
          player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
          // console.warn("manyHuArray-%s manyHuPlayers-%s canManyHuPlayers-%s card-%s can many hu", JSON.stringify(this.manyHuArray), JSON.stringify(this.manyHuPlayers), JSON.stringify(this.canManyHuPlayers), this.stateData.card);
        }

        return ;
      }

      // 一炮多响(好友房)
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && !this.room.isPublic) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.gang);
        player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.gang, card, index: this.atIndex(player)}})

        if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
          this.isRunMultiple = true;
          player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
          // console.warn("manyHuArray-%s manyHuPlayers-%s canManyHuPlayers-%s card-%s can many hu", JSON.stringify(this.manyHuArray), JSON.stringify(this.manyHuPlayers), JSON.stringify(this.canManyHuPlayers), this.stateData.card);
        }

        return ;
      }

      try {
        this.actionResolver.requestAction(
          player, 'gang',
          async () => {
            const ok = player.gangByPlayerDa(card, this.lastDa);
            // console.warn("gangByOtherDa index-%s card-%s ok-%s", this.atIndex(player), card, ok);
            if (ok) {
              player.lastOperateType = 3;
              this.turn++;
              // player.onDeposit = !!(player.isGameHu && !player.onDeposit && player.zhuang);
              // 设置所有用户地胡状态为false
              this.players.map((p) => p.isDiHu = false)
              const from = this.atIndex(this.lastDa)
              const me = this.atIndex(player)
              this.stateData = {}
              player.sendMessage('game/gangReply', {ok: true, data: {card, from, type: "mingGang"}});

              // 计算杠牌次数
              await Player.update({_id: player._id}, {$inc: {gangCount: 1}});

              for (let i = 1; i < 4; i++) {
                const playerIndex = (from + i) % this.players.length
                if (playerIndex === me) {
                  break
                }
                this.players[playerIndex].pengForbidden = []
              }

              this.room.broadcast(
                'game/oppoGangByPlayerDa',
                {ok: true, data: {card, index, turn, from}},
                player.msgDispatcher
              );

              const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

              // 明杠，赢3倍豆
              const multiple = 3;
              await this.gangDrawScore(player, this.lastDa, multiple, "刮风直杠");

              const nextDo = async () => {
                const nextCard = await this.consumeCard(player);
                player.cards[nextCard]++;
                this.cardTypes = await this.getCardTypes(player, 1);
                player.cards[nextCard]--;

                const msg = player.gangTakeCard(this.turn, nextCard,
                  {
                    id: this.cardTypes.cardId,
                    multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple
                  });
                if (msg) {
                  this.room.broadcast('game/oppoTakeCard', {
                    ok: true,
                    data: {index, card: nextCard, msg}
                  }, player.msgDispatcher);
                  this.state = stateWaitDa;
                  this.stateData = {da: player, card: nextCard, msg};
                }
              }

              setTimeout(nextDo, 2200);
            } else {
              logger.info('gangByOtherDa player-%s card:%s GangReply error:4', index, card)
              player.sendMessage('game/gangReply', {
                ok: false,
                info: TianleErrorCode.gangButPlayerPengGang
              });
              return;
            }
          },
          () => {
            player.sendMessage('game/gangReply', {
              ok: false,
              info: TianleErrorCode.gangPriorityInsufficient
            });
          }
        )

        this.actionResolver.tryResolve()
      } catch (e) {
        console.warn(this.actionResolver, e);
      }
    })

    player.on(Enums.gangBySelf, async (turn, card) => {
      let gangIndex;
      if (!this.stateData[Enums.da]) {
        return ;
      }
      if (this.state !== stateWaitDa) {
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
      }
      if (this.stateData[Enums.da] && this.stateData[Enums.da]._id.toString() !== player.model._id.toString()) {
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
      }

      const isAnGang = player.cards[card] >= 3;
      gangIndex = this.atIndex(player);
      const from = gangIndex;
      this.turn++;

      const broadcastMsg = {turn: this.turn, card, index, isAnGang};
      const ok = player.gangBySelf(card, broadcastMsg, gangIndex);
      if (ok) {
        player.lastOperateType = 3;
        this.stateData = {}
        // player.onDeposit = !!(player.isGameHu && !player.onDeposit && player.zhuang);
        // 设置所有用户地胡状态为false
        this.players.map((p) => p.isDiHu = false)
        player.sendMessage('game/gangReply', {
          ok: true,
          data: {card, from, gangIndex, type: isAnGang ? "anGang" : "buGang"}
        });

        await Player.update({_id: player._id}, {$inc: {gangCount: 1}});

        this.room.broadcast('game/oppoGangBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher);

        const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

        // 暗杠，赢2倍豆
        const multiple = isAnGang ? 2 : 1;
        await this.gangDrawScore(player, null, multiple, isAnGang ? "下雨暗杠" : "下雨补杠");

        const nextDo = async () => {
          const nextCard = await this.consumeCard(player);
          player.cards[nextCard]++;
          this.cardTypes = await this.getCardTypes(player, 1);
          player.cards[nextCard]--;
          const msg = player.gangTakeCard(this.turn, nextCard,
            {
              id: this.cardTypes.cardId,
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple
            });
          if (msg) {
            this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard, msg}}, player.msgDispatcher);
            this.state = stateWaitDa;
            this.stateData = {msg, da: player, card: nextCard};
          } else {
            player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
            return;
          }

          const check: IActionCheck = {card};

          if (!isAnGang) {
            const qiangGangCheck: HuCheck = {card}
            let qiang = null

            gangIndex = this.atIndex(player)

            for (let i = 1; i < this.players.length; i++) {
              const playerIndex = (gangIndex + i) % this.players.length
              const otherPlayer = this.players[playerIndex]

              if (otherPlayer != player) {
                const r = otherPlayer.markJiePao(card, qiangGangCheck, true)
                if (r.hu) {
                  if (!check.hu) check.hu = []
                  check.hu.push(otherPlayer)
                  otherPlayer.huInfo = r.check
                  qiang = otherPlayer
                  break
                }
              }
            }
          }
        }

        setTimeout(nextDo, 2200);
      } else {
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangPriorityInsufficient});
      }
    })

    player.on(Enums.hu, async (turn, card) => {
      let from;
      const recordCard = this.stateData.card;

      try {
        const isJiePao = this.state === stateWaitAction &&
          recordCard === card && this.stateData[Enums.hu] &&
          this.stateData[Enums.hu].contains(player);

        const isZiMo = this.state === stateWaitDa && recordCard === card;

        const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

        if (isJiePao) {
          // 一炮多响(金豆房)
          if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && this.room.isPublic) {
            this.manyHuPlayers.push(player._id.toString());
            this.setManyAction(player, Enums.hu);
            player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.hu, card, index: this.atIndex(player)}})

            if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
              this.isRunMultiple = true;
              player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
            }

            return ;
          }

          // 一炮多响(好友房)
          if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && !this.room.isPublic) {
            this.manyHuPlayers.push(player._id.toString());
            this.setManyAction(player, Enums.hu);
            player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.hu, card, index: this.atIndex(player)}})

            if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
              this.isRunMultiple = true;
              player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
            }

            return ;
          }

          this.actionResolver.requestAction(player, 'hu', async () => {
              this.lastHuCard = card;
              this.cardTypes = await this.getCardTypes(player, 2, this.lastDa);
              const cardId = this.cardTypes.cardId;
              const ok = player.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa);
              const tIndex = player.huTurnList.findIndex(t => t.card === card && t.turn === turn);
              if (tIndex !== -1) {
                return;
              }

              from = this.atIndex(this.lastDa);
              const dianPaoPlayer = this.lastDa;
              if (ok && player.daHuPai(card, this.players[from]) && tIndex === -1) {
                player.lastOperateType = 4;
                player.isGameDa = true;
                // 设置所有用户地胡状态为false
                this.players.map((p) => p.isDiHu = false)
                this.lastDa = player;
                this.stateData = {};
                this.lastDa.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);
                player.huTurnList.push({card, turn});
                if (!player.isGameHu) {
                  player.isGameHu = true;
                }
                // 设置用户的状态为待摸牌
                player.waitMo = true;

                this.room.broadcast('game/showHuType', {
                  ok: true,
                  data: {
                    index,
                    from,
                    cards: [card],
                    daCards: [],
                    huCards: [],
                    card,
                    type: "jiepao",
                  }
                });

                const huTakeCard = async () => {
                  if (player.waitMo && this.room.robotManager.model.step === RobotStep.running) {
                    return player.emitter.emit(Enums.huTakeCard, {from, type: 1});
                  }

                  // 如果牌局暂停，则记录当前牌局状态为摸牌，并记录from和type
                  this.gameMoStatus = {
                    state: true,
                    from,
                    type: 1,
                    index: this.atIndex(player)
                  }
                }

                const callForward = async () => {
                  let sleepTime = 500;
                  if (cardId === 88 && !dianPaoPlayer.isBroke) {
                    sleepTime += 1000;
                    this.room.broadcast("game/callForward", {ok: true, data: {index, from}});
                    await this.refundGangScore(from, index);
                  }

                  // 给下家摸牌
                  setTimeout(huTakeCard, sleepTime);
                }

                const gameOverFunc = async () => {
                  await this.gameOver(this.players[from], player);

                  // 执行杠后炮-呼叫转移
                  setTimeout(callForward, 2200);
                }

                const huReply = async () => {
                  await player.sendMessage('game/huReply', {
                    ok: true,
                    data: {
                      card,
                      from,
                      turn,
                      type: "jiepao",
                      constellationCards: player.constellationCards,
                      huType: {
                        id: this.cardTypes.cardId,
                        multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple
                      }
                    }
                  });

                  this.room.broadcast('game/oppoHu', {
                    ok: true,
                    data: {
                      turn,
                      card,
                      from,
                      index,
                      constellationCards: player.constellationCards,
                      huType: {id: this.cardTypes.cardId, multiple: this.cardTypes.multiple}
                    }
                  }, player.msgDispatcher);

                  //第一次胡牌自动托管
                  if (!player.onDeposit && !player.isRobot && this.room.isPublic) {
                    player.onDeposit = true
                    await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
                  }

                  // 执行胡牌结算
                  setTimeout(gameOverFunc, 200);
                }

                setTimeout(huReply, 1000);
              } else {
                player.emitter.emit(Enums.guo, this.turn, card);
              }
            },
            () => {
              player.sendMessage('game/huReply', {
                ok: false,
                info: TianleErrorCode.huPriorityInsufficient
              });
            }
          )

          this.actionResolver.tryResolve()
        } else if (isZiMo) {
          this.cardTypes = await this.getCardTypes(player, 1);
          const ok = player.zimo(card, turn === 1, this.remainCards === 0);
          const tIndex = player.huTurnList.findIndex(t => t.card === card && t.turn === turn);
          if (tIndex !== -1 || !this.stateData[Enums.da]) {
            return;
          }
          const isDa = player.daHuPai(card, null);
          if (ok && isDa && tIndex === -1) {
            this.lastDa = player;
            player.lastOperateType = 4;
            player.isGameDa = true;
            player.huTurnList.push({card, turn});
            // 设置用户的状态为待摸牌
            player.waitMo = true;
            this.stateData = {};
            if (!player.isGameHu) {
              player.isGameHu = true;
            }
            // 设置所有用户地胡状态为false
            this.players.map((p) => p.isDiHu = false)
            from = this.atIndex(this.lastDa);

            this.room.broadcast('game/showHuType', {
              ok: true,
              data: {
                from,
                index,
                cards: [card],
                daCards: [],
                huCards: [],
                card,
                type: "zimo",
              }
            });

            const huTakeCard = async () => {
              if (player.waitMo && this.room.robotManager.model.step === RobotStep.running) {
                return player.emitter.emit(Enums.huTakeCard, {from, type: 4});
              }

              // 如果牌局暂停，则记录当前牌局状态为摸牌，并记录from和type
              this.gameMoStatus = {
                state: true,
                from,
                type: 4,
                index: this.atIndex(player)
              }
            }

            const gameOverFunc = async () => {
              await this.gameOver(null, player);

              // 给下家摸牌
              setTimeout(huTakeCard, 2200);
            }

            const huReply = async () => {
              await player.sendMessage('game/huReply', {
                ok: true,
                data: {
                  card,
                  from: this.atIndex(player),
                  type: "zimo",
                  turn,
                  constellationCards: player.constellationCards,
                  huType: {
                    id: this.cardTypes.cardId,
                    multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple
                  }
                }
              });

              this.room.broadcast('game/oppoZiMo', {
                ok: true,
                data: {
                  turn,
                  card,
                  from,
                  index,
                  constellationCards: player.constellationCards,
                  huType: {id: this.cardTypes.cardId, multiple: this.cardTypes.multiple}
                }
              }, player.msgDispatcher);

              // 第一次胡牌自动托管
              if (!player.onDeposit && !player.isRobot && this.room.isPublic) {
                player.onDeposit = true
                await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
              }

              // 执行胡牌结算
              setTimeout(gameOverFunc, 200);
            }

            setTimeout(huReply, 1000);
          } else {
            player.cards[card]++;
            player.emitter.emit(Enums.da, this.turn, card);
          }
        }
      } catch (e) {
        console.warn(e)
      }
    });

    player.on(Enums.guo, async (turn, card) => {
      await this.onPlayerGuo(player, turn, card)
    })

    player.on('lastDa', () => {
      this.players.forEach(x => {
        if (x !== player) {
          x.clearLastDaFlag()
        }
      })
    })
    player.on('recordZiMo', huResult => {
      this.players.forEach(x => {
        if (x !== player) {
          x.recordGameEvent(Enums.taJiaZiMo, huResult)
        }
      })
    })
    player.on('recordAnGang', card => {
      this.players.forEach(x => {
        if (x !== player) {
          x.recordGameEvent(Enums.taJiaAnGang, card)
        }
      })
    })
    player.on('recordMingGangSelf', card => {
      this.players.forEach(x => {
        if (x !== player) {
          x.recordGameEvent(Enums.taJiaMingGangSelf, card)
        }
      })
    })
    player.on('qiShouHu', (info, showCards, restCards) => {
      this.sleepTime = 3000
      this.players.forEach(x => {
        if (x !== player) {
          x.recordGameEvent('taJiaQiShouHu', info)
        }
      })
      player.sendMessage('game/qiShouHu', {info, showCards, restCards})
      this.room.broadcast('game/oppoQiShouHu', {info, showCards, index}, player.msgDispatcher)
    })
    player.on('recordGangShangKaiHua', info => {
      this.players.forEach(x => {
        if (x !== player) {
          x.recordGameEvent('taJiaGangShangKaiHua', info)
        }
      })
    });
  }

  getCardArray(cards) {
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

  async onPlayerBroke(player) {
    // 如果当前是摸牌状态，则给下家摸牌
    if (this.gameMoStatus.state) {
      const huTakeCard = async () => {
        this.players[this.gameMoStatus.index].emitter.emit(Enums.huTakeCard, {from: this.gameMoStatus.from, type: this.gameMoStatus.type});
      }

      setTimeout(huTakeCard, 1000);
    }

    await this.playerGameOver(player, [], player.genGameStatus(this.atIndex(player), 1));
  }

  async onPlayerHuTakeCard(player, message) {
    if (!player.waitMo) {
      return ;
    }

    if (player.waitMo) {
      player.waitMo = false;
    }

    if (this.gameMoStatus.state) {
      this.gameMoStatus.state = false;
    }

    if (message.type === 1) {
      await this.onPlayerCommonTakeCard(message, "jiepao");
    }

    if (message.type === 4) {
      await this.onPlayerCommonTakeCard(message, "zimo");
    }

    if (message.type === 2) {
      await this.onPlayerMultipleTakeCard(message);
    }
  }

  async onPlayerCommonTakeCard(message, huType) {
    let xiajia = null;
    if (!this.players[message.from].isBroke && huType === "jiepao") {
      xiajia = this.players[message.from];
    } else {
      let startIndex = (message.from + 1) % this.players.length;

      // 从 startIndex 开始查找未破产的玩家
      for (let i = startIndex; i < startIndex + this.players.length; i++) {
        let index = i % this.players.length; // 处理边界情况，确保索引在数组范围内
        if (!this.players[index].isBroke) {
          xiajia = this.players[index];
          break;
        }
      }
    }

    if (!xiajia) {
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()
      await this.gameAllOver(states, [], nextZhuang);
      return ;
    }

    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    const newCard = await this.consumeCard(xiajia);
    if (newCard) {
      xiajia.cards[newCard]++;
      this.cardTypes = await this.getCardTypes(xiajia, 1);
      xiajia.cards[newCard]--;
      const msg = xiajia.takeCard(this.turn, newCard, false, false,
        {
          id: this.cardTypes.cardId,
          multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.mingMultiple
        })

      if (!msg) {
        console.error("consume card error msg ", msg);
        return;
      }

      this.state = stateWaitDa;
      this.stateData = {da: xiajia, card: newCard, msg};
      const sendMsg = {index: this.players.indexOf(xiajia), card: newCard}
      this.room.broadcast('game/oppoTakeCard', {
        ok: true,
        data: sendMsg
      }, xiajia.msgDispatcher)
    }

    this.turn++;
  }

  async onPlayerMultipleTakeCard(message) {
    // 给下家摸牌
    let xiajia = null;
    let startIndex = (message.from + 1) % this.players.length;

    // 从 startIndex 开始查找未破产的玩家
    for (let i = startIndex; i < startIndex + this.players.length; i++) {
      let index = i % this.players.length; // 处理边界情况，确保索引在数组范围内
      if (!this.players[index].isBroke) {
        xiajia = this.players[index];
        break;
      }
    }

    if (!xiajia) {
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()
      await this.gameAllOver(states, [], nextZhuang);
      return ;
    }

    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    const newCard = await this.consumeCard(xiajia);
    if (newCard) {
      xiajia.cards[newCard]++;
      this.cardTypes = await this.getCardTypes(xiajia, 1);
      xiajia.cards[newCard]--;
      const msg = xiajia.takeCard(this.turn, newCard, false, false,
        {
          id: this.cardTypes.cardId,
          multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.mingMultiple
        })

      if (!msg) {
        return;
      }

      this.state = stateWaitDa;
      this.stateData = {da: xiajia, card: newCard, msg};
      const sendMsg = {index: this.players.indexOf(xiajia), card: newCard}
      this.room.broadcast('game/oppoTakeCard', {
        ok: true,
        data: sendMsg
      }, xiajia.msgDispatcher);
    }

    this.isManyHu = false;
    this.isRunMultiple = false;
    this.manyHuArray = [];
    this.manyHuPlayers = [];
    this.canManyHuPlayers = [];
  }

  async onPlayerMultipleHu(player) {
    const msgs = [];
    const changeGolds = [
      {index: 0, changeGold: [], isBroke: false, currentGold: 0},
      {index: 1, changeGold: [], isBroke: false, currentGold: 0},
      {index: 2, changeGold: [], isBroke: false, currentGold: 0},
      {index: 3, changeGold: [], isBroke: false, currentGold: 0}
    ];

    // 判断是否同时存在胡牌和杠牌，存在则直接杠牌过
    let huCount = 0;
    for (let i = 0; i < this.manyHuArray.length; i++) {
      if (this.manyHuArray[i].action === Enums.hu) {
        huCount++;
      }
    }

    for (let i = 0; i < this.manyHuArray.length; i++) {
      // 处理过牌
      if (this.manyHuArray[i].action === Enums.guo || ([Enums.gang, Enums.peng].includes(this.manyHuArray[i].action) && huCount > 0)) {
        this.players[this.manyHuArray[i].to].emitter.emit(Enums.guo, this.turn, this.manyHuArray[i].card);
        msgs.push({type: Enums.guo, card: this.manyHuArray[i].card, index: this.manyHuArray[i].to});
      }

      // 处理碰牌
      if (this.manyHuArray[i].action === Enums.peng && huCount === 0) {
        this.players[this.manyHuArray[i].to].emitter.emit(Enums.peng, this.turn, this.manyHuArray[i].card);
        msgs.push({type: Enums.peng, card: this.manyHuArray[i].card, index: this.manyHuArray[i].to, from: this.manyHuArray[i].from});
      }

      // 处理杠牌
      if (this.manyHuArray[i].action === Enums.gang && huCount === 0) {
        this.players[this.manyHuArray[i].to].emitter.emit(Enums.gangByOtherDa, this.turn, this.manyHuArray[i].card);
        msgs.push({type: Enums.gang, card: this.manyHuArray[i].card, index: this.manyHuArray[i].to, from: this.manyHuArray[i].from});
      }

      // 处理胡牌
      if (this.manyHuArray[i].action === Enums.hu) {
        const huPlayer = this.players[this.manyHuArray[i].to];
        const huMsg = await this.onMultipleHu(huPlayer, this.manyHuArray[i]);

        if (huMsg) {
          if (!huMsg.playersModifyGolds) {
            huMsg.playersModifyGolds = [];
          }

          //第一次胡牌自动托管
          if (!huPlayer.onDeposit && !huPlayer.isRobot && this.room.isPublic) {
            huPlayer.onDeposit = true;
            await huPlayer.sendMessage('game/startDepositReply', {ok: true, data: {}})
          }

          this.room.broadcast('game/showHuType', {
            ok: true,
            data: {
              index: huMsg.index,
              from: huMsg.from,
              cards: [this.manyHuArray[i].card],
              daCards: [],
              huCards: [],
              type: "jiepao",
            }
          });

          msgs.push({
            type: "hu",
            card: this.manyHuArray[i].card,
            index: huMsg.index,
            from: this.manyHuArray[i].from,
            playersModifyGolds: huMsg.playersModifyGolds,
            constellationCards: huMsg.constellationCards,
            huType: huMsg.huType
          });

          for (let j = 0; j < huMsg.playersModifyGolds.length; j++) {
            if (huMsg.playersModifyGolds[j].gold !== 0) {
              changeGolds[j].changeGold.push(huMsg.playersModifyGolds[j].gold);
            }
          }
        }
      }
    }

    for (let i = 0; i < this.players.length; i++) {
      const model = await service.playerService.getPlayerModel(this.players[i]._id);
      changeGolds[i].currentGold = model.gold;
      changeGolds[i].isBroke = this.players[i].isBroke;
    }

    const changeGold = async () => {
      this.room.broadcast("game/multipleChangeGoldReply", {ok: true, data: changeGolds});
    }

    const huReply = async () => {
      this.room.broadcast("game/multipleHuReply", {ok: true, data: {manyHuArray: this.manyHuArray, msg: msgs, huCount}});

      setTimeout(changeGold, 1000);
    }

    setTimeout(huReply, 1000);

    if (this.remainCards <= 0 || this.isGameOver) {
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()

      const gameAllOver = async () => {
        await this.gameAllOver(states, [], nextZhuang);
      }

      setTimeout(gameAllOver, 3000);
    }

    if (huCount > 0) {
      // 设置用户的状态为待摸牌
      player.waitMo = true;

      const huTakeCard = async () => {
        if (player.waitMo && this.room.robotManager.model.step === RobotStep.running) {
          return player.emitter.emit(Enums.huTakeCard, {from: this.manyHuArray[0].from, type: 2});
        }

        // 如果牌局暂停，则记录当前牌局状态为摸牌，并记录from和type
        this.gameMoStatus = {
          state: true,
          from: this.manyHuArray[0].from,
          type: 2,
          index: this.atIndex(player)
        }
      }

      setTimeout(huTakeCard, 3500);
    } else {
      this.isManyHu = false;
      this.isRunMultiple = false;
      this.manyHuArray = [];
      this.manyHuPlayers = [];
      this.canManyHuPlayers = [];
    }
  }

  async onMultipleHu(player, msg) {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

    // 将本次要操作的牌加入到牌堆中
    this.cardTypes = await this.getCardTypes(player, 2);

    const ok = player.jiePao(msg.card, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (ok && player.daHuPai(msg.card, this.players[msg.from])) {
      player.lastOperateType = 4;
      player.isGameDa = true;
      this.lastDa = player;
      const playersModifyGolds = await this.multipleGameOver(this.players[msg.to], this.players[msg.from]);

      // 记录胡牌次数
      if (!player.huTypeList.includes(this.cardTypes.cardId)) {
        const cardTypeRecord = await this.getPlayerCardTypeRecord(player, this.cardTypes.cardId, 1);
        cardTypeRecord.count++;
        await cardTypeRecord.save();
        player.huTypeList.push(this.cardTypes.cardId);
      }

      return {
        card: msg.card,
        index: msg.to,
        from: msg.from,
        constellationCards: player.constellationCards,
        playersModifyGolds,
        huType: {
          id: this.cardTypes.cardId,
          multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple
        }
      };
    } else {
      player.sendMessage('game/huReply', {
        ok: false,
        info: TianleErrorCode.huInvaid,
        data: {type: "ziMo", card: msg.card, cards: this.getCardArray(player.cards)}
      });

      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()
      await this.gameAllOver(states, [], nextZhuang);

      return {};
    }
  }

  async multipleGameOver(to, from) {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

    this.players.map((p) => {
      p.balance = 0;
    })
    let failList = [];
    let failGoldList = [];
    let failFromList = [];
    let winBalance = 0;
    let winModel = await service.playerService.getPlayerModel(to._id.toString());

    failList.push(from._id);
    failFromList.push(this.atIndex(from));
    const model = await service.playerService.getPlayerModel(from._id.toString());
    const balance = (conf.base * conf.Ante * to.mingMultiple * this.cardTypes.multiple * 10 > conf.maxGold ? conf.maxGold : conf.base * to.mingMultiple * this.cardTypes.multiple * conf.Ante * 10);
    from.balance = -Math.min(Math.abs(balance), model.gold, winModel.gold);
    winBalance += Math.abs(from.balance);
    from.juScore += from.balance;
    failGoldList.push(from.balance);
    if (from.balance !== 0) {
      await this.room.addScore(from.model._id.toString(), from.balance, this.cardTypes);
      await service.playerService.logGoldConsume(from._id, ConsumeLogType.gamePayGold, from.balance,
        model.gold + from.balance, `对局扣除${this.room._id}`);
    }

    //增加胡牌用户金币
    to.balance = winBalance;
    to.juScore += winBalance;
    if (winBalance !== 0) {
      await this.room.addScore(to.model._id.toString(), winBalance, this.cardTypes);
      await service.playerService.logGoldConsume(to._id, ConsumeLogType.gameGiveGold, to.balance,
        to.model.gold + to.balance, `对局获得-${this.room._id}`);
    }

    // 生成金豆记录
    await RoomGoldRecord.create({
      winnerGoldReward: winBalance,
      winnerId: to.model._id.toString(),
      winnerFrom: this.atIndex(to),
      roomId: this.room._id,
      failList,
      failGoldList,
      failFromList,
      multiple: conf.base * conf.Ante * to.mingMultiple * this.cardTypes.multiple > conf.maxMultiple ? conf.maxMultiple : conf.base * conf.Ante * to.mingMultiple * this.cardTypes.multiple,
      juIndex: this.room.game.juIndex,
      cardTypes: this.cardTypes,
      isPublic: this.room.isPublic,
      categoryId: this.room.gameRule.categoryId
    })

    // 判断是否破产，破产提醒客户端充值钻石
    let brokePlayers = [];
    this.brokeList = [];
    let playersModifyGolds = [];
    let waits = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const model = await service.playerService.getPlayerModel(p.model._id.toString());
      let params = {
        index: this.atIndex(p),
        _id: p.model._id.toString(),
        isRobot: p.isRobot,
        shortId: p.model.shortId,
        gold: p.balance,
        currentGold: model.gold,
        isBroke: p.isBroke,
        huType: this.cardTypes
      };
      if (model.gold <= 0) {
        if (!params.isRobot) {
          if (!p.isBroke) {
            waits.push(params);
          } else {
            brokePlayers.push(p);
          }
        } else {
          if (!p.isBroke) {
            // 用户第一次破产
            params.isBroke = true;
            await this.playerGameOver(p, [], p.genGameStatus(this.atIndex(p), 1));
          }

          brokePlayers.push(p);
        }
      }

      playersModifyGolds.push(params);
    }

    if (brokePlayers.length >= 3) {
      this.isGameOver = true;
    }

    if (waits.length > 0 && !this.isGameOver && this.room.robotManager.model.step === RobotStep.running) {
      this.room.robotManager.model.step = RobotStep.waitRuby;
      const nextDo1 = async () => {
        // this.zhuang.onDeposit = false;
        this.room.broadcast("game/waitRechargeReply", {ok: true, data: waits});
      }
      setTimeout(nextDo1, 2000);
    }

    return playersModifyGolds;
  }

  async onPlayerDa(player, turn, card) {
    const index = this.players.indexOf(player);
    let from;

    if (!this.stateData[Enums.da]) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaRound, data: {index: this.atIndex(player), card}})
      return ;
    }
    if (this.state !== stateWaitDa) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.cardDaError, data: {index: this.atIndex(player), card, state: this.state}})
      return
    }
    if (this.stateData[Enums.da] && this.stateData[Enums.da]._id !== player._id) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaRound, data: {index: this.atIndex(player), card}})
      return
    }

    const ok = player.daPai(card);
    if (!ok) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaThisCard, data: {index: this.atIndex(player), card}});
      // return;
    }

    this.lastDa = player;
    player.cancelTimeout();

    if (ok) {
      if (!this.isGameDa) {
        this.isGameDa = true;
      }
      if (!player.isGameDa) {
        player.isGameDa = true;
      }

      if (player.isGameHu && !player.onDeposit) {
        player.onDeposit = true;
      }

      player.lastOperateType === 3 ? player.isGangHouDa = true : player.isGangHouDa = false;
      player.lastOperateType = 1;
      player.isDiHu = false;
      this.stateData = {};
      this.gameDaCards.push(card);

      await player.sendMessage('game/daReply', {ok: true, data: card});
      this.room.broadcast('game/oppoDa', {ok: true, data: {index, card, lastOperateType: player.lastOperateType, isGangHouDa: player.isGangHouDa}}, player.msgDispatcher);
    }

    // 打牌后，延迟2秒给其他用户发牌
    const nextDo = async () => {
      from = this.atIndex(this.lastDa);
      this.turn++;

      let check: HuCheck = {card}
      for (let j = 1; j < this.players.length; j++) {
        const result = {card};
        const i = (index + j) % this.players.length;
        const p = this.players[i];
        const model = await service.playerService.getPlayerModel(p._id);
        if (!p.isBroke && model.gold > 0) {
          const r = p.markJiePao(card, result);
          const isDingQue = this.checkCardIsDingQue(p, card);
          if (r.hu && isDingQue) {
            if (!check.hu || check.hu.length === 0) {
              check.hu = [];
            }

            check.hu.push(p);
            p.huInfo = r.check;
          }
        }
      }

      let xiajia = null;
      let startIndex = (index + 1) % this.players.length;

      // 从 startIndex 开始查找未破产的玩家
      for (let i = startIndex; i < startIndex + this.players.length; i++) {
        let index = i % this.players.length; // 处理边界情况，确保索引在数组范围内
        const model = await service.playerService.getPlayerModel(this.players[index]._id);
        if (!this.players[index].isBroke && model.gold > 0) {
          xiajia = this.players[index];
          break;
        }
      }

      const env = {card, from, turn: this.turn}
      this.actionResolver = new ActionResolver(env, async () => {
        if (!xiajia) {
          const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
          const nextZhuang = this.nextZhuang()
          await this.gameAllOver(states, [], nextZhuang);

          return;
        }

        if (xiajia.huTurnList) {
          const tIndex = xiajia.huTurnList.findIndex(t => t.card === card && t.turn === turn);
          if (tIndex !== -1) {
            console.warn("多次摸牌操作 index-%s card-%s turn-%s", this.atIndex(player), card, turn);
            // return;
          }

          xiajia.huTurnList.push({card, turn});
        }

        const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
        const newCard = await this.consumeCard(xiajia);
        if (newCard) {
          xiajia.cards[newCard]++;
          this.cardTypes = await this.getCardTypes(xiajia, 1);
          xiajia.cards[newCard]--;
          const msg = xiajia.takeCard(this.turn, newCard, false, false,
            {
              id: this.cardTypes.cardId,
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.mingMultiple
            });

          if (!msg) {
            console.error("consume card error msg ", msg);
            return;
          }

          // 如果用户可以杠，并且胡牌已托管，则取消托管
          if (msg.gang && xiajia.isGameHu && xiajia.onDeposit) {
            xiajia.onDeposit = false;
            xiajia.sendMessage('game/cancelDepositReply', {ok: true, data: {card: newCard}})
          }

          this.state = stateWaitDa;
          this.stateData = {da: xiajia, card: newCard, msg};
          const sendMsg = {index: this.players.indexOf(xiajia), card: newCard, msg};
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher);
        }
      });

      for (let j = 1; j < this.players.length; j++) {
        const i = (index + j) % this.players.length;
        const p = this.players[i];
        const model = await service.playerService.getPlayerModel(p._id);
        if (!p.isBroke && model.gold > 0 && !p.isGameHu && p.checkCardIsDingQue(card)) {
          check = p.checkPengGang(card, check);
        }
      }

      if (check[Enums.hu]) {
        for (const p of check[Enums.hu]) {
          this.actionResolver.appendAction(p, 'hu', p.huInfo);
        }
      }

      if (check[Enums.pengGang]) {
        if (check[Enums.gang]) {
          const p = check[Enums.gang];
          const gangInfo = [card, p.getGangKind(card, p._id.toString() === player.model._id.toString())];
          p.gangForbid.push(card);
          this.actionResolver.appendAction(check[Enums.gang], 'gang', gangInfo);
        }
        if (check[Enums.peng]) {
          this.actionResolver.appendAction(check[Enums.peng], 'peng');
        }
      }

      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
      let huCount = 0;

      for (let i = 1; i < this.players.length; i++) {
        const j = (from + i) % this.players.length;
        const p = this.players[j];

        const msg = this.actionResolver.allOptions(p);
        const model = await service.playerService.getPlayerModel(p.model._id);
        if (msg && model.gold > 0 && !p.isBroke) {
          huCount++;
          this.manyHuArray.push({...msg, ...{to: this.atIndex(p)}});
          this.canManyHuPlayers.push(p._id.toString());
          if (msg["hu"]) {
            this.lastHuCard = card;
            this.cardTypes = await this.getCardTypes(p, 2, player);
            msg["huType"] = {
              id: this.cardTypes.cardId,
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * p.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * p.mingMultiple
            }
          }

          p.record('choice', card, msg);

          // 如果用户可以杠，并且胡牌已托管，则取消托管
          if (msg["gang"] && p.isGameHu && p.onDeposit) {
            p.onDeposit = false;
            p.sendMessage('game/cancelDepositReply', {ok: true, data: {card: msg.card}})
          }

          // 碰、杠等
          p.sendMessage('game/canDoSomething', {ok: true, data: msg});
          this.room.broadcast('game/oppoCanDoSomething', {ok: true, data: {...msg, ...{index: this.atIndex(p)}}}, p.msgDispatcher);
        }
      }

      if (huCount <= 1) {
        this.isManyHu = false;
        this.manyHuArray = [];
        this.canManyHuPlayers = [];
      } else {
        this.isManyHu = true;
        this.room.broadcast('game/beginChoiceMultiple', {ok: true, data: {isManyHu: this.isManyHu, manyHuArray: this.manyHuArray, from: this.atIndex(player)}});
      }

      if (check[Enums.pengGang] || check[Enums.hu]) {
        this.state = stateWaitAction;
        this.stateData = check;
        this.stateData.hangUp = [];
      }

      this.actionResolver.tryResolve()
    }

    setTimeout(nextDo, 200);
  }

  // 检测用户是否含有定缺牌
  checkCardIsDingQue(player, card) {
    const suits = {
      wan: { start: 1, end: 9, currentCount: 0 },
      tiao: { start: 11, end: 19, currentCount: 0 },
      tong: { start: 21, end: 29, currentCount: 0 }
    };

    for (let suit in suits) {
      suits[suit].currentCount = 0;

      for (let j = suits[suit].start; j <= suits[suit].end; j++) {
        suits[suit].currentCount += player.cards[j];
      }
    }

    for (let suit in suits) {
      if (player.mode === suit && suits[suit].currentCount > 0) {
        return false;
      }
    }

    return !((player.mode === 'wan' && card <= Enums.wanzi9) ||
      (player.mode === 'tiao' && card >= Enums.shuzi1 && card <= Enums.shuzi9) ||
      (player.mode === 'tong' && card >= Enums.tongzi1 && card <= Enums.tongzi9));
  }

  // 检测用户是否含有定缺牌
  checkDingQueCard(player) {
    let wanCount = 0;
    let tiaoCount = 0;
    let tongCount = 0;
    for (let j = 1; j <= 9; j++) {
      wanCount += player.cards[j];
    }
    if (wanCount > 0 && player.mode === "wan") {
      return false;
    }


    for (let j = 11; j <= 19; j++) {
      tiaoCount += player.cards[j];
    }
    if (tiaoCount > 0 && player.mode === "tiao") {
      return false;
    }

    for (let j = 21; j <= 29; j++) {
      tongCount += player.cards[j];
    }
    return !(tongCount > 0 && player.mode === "tong");


  }

  nextZhuang(): PlayerState {
    const currentZhuangIndex = this.atIndex(this.zhuang)
    const huPlayers = this.players.filter(p => p.huPai())

    let nextZhuangIndex = currentZhuangIndex

    if (huPlayers.length === 1) {
      nextZhuangIndex = this.atIndex(huPlayers[0])
    } else if (huPlayers.length > 1) {
      const random = Math.floor(Math.random() * (huPlayers.length));
      nextZhuangIndex = this.atIndex(huPlayers[random])
    }

    return this.players[nextZhuangIndex]
  }

  calcGangScore() {
    const gangScore = this.players.length - 1
    this.players.forEach(playerToResolve => {
      const buGang = (playerToResolve.events.buGang || []).length
      const numAnGang = (playerToResolve.events.anGang || []).length
      const gangExtraGainsPerPlayer = numAnGang * 2 + buGang

      for (const player of this.players) {
        playerToResolve.winFrom(player, gangExtraGainsPerPlayer)
      }

      for (const gangFrom of playerToResolve.gangFrom) {
        playerToResolve.winFrom(gangFrom, gangScore)
      }
    })
  }

  async drawGame() {
    // logger.info('state:', this.state);
    if (this.state !== stateGameOver) {
      this.state = stateGameOver
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      // this.assignNiaos()
      this.calcGangScore()

      for (const state1 of states) {
        const i = states.indexOf(state1);
        state1.model.played += 1
        state1.score = this.players[i].balance * this.rule.diFen
        await this.room.addScore(state1.model._id.toString(), state1.score, this.cardTypes)
      }
    }
  }

  async checkBrokeAndWait(isWait = true) {
    // 判断是否破产，破产提醒客户端充值钻石
    let brokePlayers = [];
    let playersModifyGolds = [];
    let waits = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const model = await service.playerService.getPlayerModel(p.model._id.toString());
      let params = {
        index: this.atIndex(p),
        isRobot: p.isRobot,
        _id: p.model._id.toString(),
        gold: p.balance,
        currentGold: model.gold,
        isBroke: p.isBroke
      };
      if (model.gold <= 0) {
        if (!params.isRobot) {
          if (!p.isBroke) {
            if (isWait) {
              waits.push(params);
            } else {
              brokePlayers.push(p);
              await this.playerGameOver(p, [], p.genGameStatus(this.atIndex(p), 1));
            }
          } else {
            brokePlayers.push(p);
          }
        } else {
          if (!p.isBroke) {
            // 用户第一次破产
            params.isBroke = true;
            await this.playerGameOver(p, [], p.genGameStatus(this.atIndex(p), 1));
          }

          brokePlayers.push(p);
        }
      }

      playersModifyGolds.push(params);
    }


    const changeGold = async () => {
      this.room.broadcast("game/playerChangeGold", {ok: true, data: playersModifyGolds});

      setTimeout(waitRecharge, 1000);
    }

    setTimeout(changeGold, 1000);

    const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
    const nextZhuang = this.nextZhuang()

    const waitRecharge = async () => {
      if (waits.length > 0 && !this.isGameOver && this.room.robotManager.model.step === RobotStep.running) {
        this.room.robotManager.model.step = RobotStep.waitRuby;
        this.room.broadcast("game/waitRechargeReply", {ok: true, data: waits});
      }
    }

    if (this.remainCards <= 0 && isWait) {
      return await this.gameAllOver(states, [], nextZhuang);
    }

    if ((this.isGameOver || brokePlayers.length >= 3) && isWait) {
      await this.gameAllOver(states, [], nextZhuang);
    }

    return true;
  }

  async NoTingCard() {
    this.players.map((p) => { p.balance = 0; })

    const tingPlayers = [];
    const noTingPlayers = [];
    const playerIndex = [];
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

    // 计算听牌玩家和非听牌玩家
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const model = await service.playerService.getPlayerModel(p._id);
      const ting = p.isRobotTing(p.cards);
      const isDingQue = this.checkDingQueCard(p);
      if ((!ting.hu || !isDingQue) && !p.isBroke && model.gold > 0) {
        noTingPlayers.push(p);
        playerIndex.push({index: this.atIndex(p), ting: false});
      }
      if (ting.hu && isDingQue && !p.isBroke) {
        tingPlayers.push(p);
        playerIndex.push({index: this.atIndex(p), ting: true});
      }
    }

    if (noTingPlayers.length > 0 && tingPlayers.length > 0) {
      this.room.broadcast("game/showNoTingCard", {ok: true, data: playerIndex});

      // 未听牌：对局结束时，未听牌玩家赔给听牌的玩家最大叫点数的金豆
      await this.tingCardDrawScore(noTingPlayers, tingPlayers, conf);

      await this.checkBrokeAndWait(false);
    }

    return noTingPlayers.length > 0 && tingPlayers.length > 0;
  }

  async tingCardDrawScore(noTingPlayers, tingPlayers, conf) {
    for (const noTingPlayer of noTingPlayers) {
      // 未听牌玩家赔给听牌的玩家最大叫点数的金豆
      await this.noTingCardDrawScore(noTingPlayer, tingPlayers, conf);
    }
  }

  async noTingCardDrawScore(noTingPlayer, tingPlayers, conf) {
    for (const winPlayer of tingPlayers) {
      let winModel = await service.playerService.getPlayerModel(winPlayer._id);
      let winBalance = 0;
      let failGoldList = [];
      let failFromList = [];
      let failIdList = [];

      // 判断用户可以胡的最大牌型
      winPlayer.cards[Enums.zhong]++;
      this.lastTakeCard = Enums.zhong;
      const cardType = await this.getCardTypes(winPlayer, 1, false, false);
      winPlayer.cards[Enums.zhong]--;

      const model = await service.playerService.getPlayerModel(noTingPlayer._id);
      if (model.gold <= 0) {
        return;
      }

      const failBalance = (conf.base * conf.Ante * winPlayer.mingMultiple * cardType.multiple * 10 > conf.maxGold ? conf.maxGold : conf.base * cardType.multiple * conf.Ante * winPlayer.mingMultiple * 10);
      const balance = -Math.min(Math.abs(failBalance), model.gold, winModel.gold);;
      noTingPlayer.balance += balance;
      winBalance += Math.abs(balance);
      noTingPlayer.juScore += balance;
      failFromList.push(this.atIndex(noTingPlayer));
      failGoldList.push(noTingPlayer.balance);
      failIdList.push(noTingPlayer._id);
      if (balance !== 0) {
        await this.room.addScore(noTingPlayer._id, balance, cardType);
        await service.playerService.logGoldConsume(noTingPlayer._id, ConsumeLogType.gamePayGang, balance,
          model.gold + balance, `未听牌扣除-${this.room._id}`);
      }

      //增加胡牌用户金币
      winPlayer.balance += winBalance;
      winPlayer.juScore += winBalance;
      if (winBalance !== 0) {
        await this.room.addScore(winPlayer._id, winBalance, cardType);
        await service.playerService.logGoldConsume(winPlayer._id, ConsumeLogType.gameReceiveGang, winBalance,
          winPlayer.model.gold + winBalance, `未听牌获得-${this.room._id}`);
      }

      // 生成金豆记录
      await RoomGoldRecord.create({
        winnerGoldReward: winBalance,
        winnerId: winPlayer._id,
        winnerFrom: this.atIndex(winPlayer),
        roomId: this.room._id,
        failList: failIdList,
        failGoldList,
        failFromList,
        multiple: conf.base * conf.Ante * winPlayer.mingMultiple * cardType.multiple > conf.maxMultiple ? conf.maxMultiple : conf.base * conf.Ante * winPlayer.mingMultiple * cardType.multiple,
        juIndex: this.room.game.juIndex,
        cardTypes: {cardId: cardType.cardId, cardName: "未听牌", multiple: cardType.maxMultiple},
        isPublic: this.room.isPublic,
        categoryId: this.room.gameRule.categoryId
      })
    }
  }

  async searchFlowerPig() {
    this.players.map((p) => { p.balance = 0; })
    const flowerPigs = [];
    const noFlowerPigs = [];
    const playerIndex = [];
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

    // 计算定缺玩家和非定缺玩家
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.isBroke) {
        continue;
      }

      const isDingQue = this.checkDingQueCard(p);
      if (isDingQue && !p.isBroke) {
        noFlowerPigs.push(p);
        playerIndex.push({index: this.atIndex(p), huaZhu: false});
      }
      if (!isDingQue && !p.isBroke) {
        flowerPigs.push(p);
        playerIndex.push({index: this.atIndex(p), huaZhu: true});
      }
    }

    if (flowerPigs.length > 0 && noFlowerPigs.length > 0) {
      this.room.broadcast("game/searchFlowerPig", {ok: true, data: playerIndex});

      // 定缺玩家按照场次封顶倍数给费定缺玩家赔付金豆
      await this.flowerPigDrawScore(flowerPigs, noFlowerPigs, conf);

      await this.checkBrokeAndWait(false);
    }

    return flowerPigs.length > 0 && noFlowerPigs.length > 0;
  }

  async flowerPigDrawScore(flowerPigs, noFlowerPigs, conf) {
    for (const flowerPig of flowerPigs) {
      // 定缺玩家给非定缺玩家赔付金豆
      await this.noFlowerPigDrawScore(flowerPig, noFlowerPigs, conf);
    }
  }

  async noFlowerPigDrawScore(failPlayer, noFlowerPigs, conf) {
    for (const winPlayer of noFlowerPigs) {
      let winModel = await service.playerService.getPlayerModel(winPlayer._id);
      let winBalance = 0;
      let failGoldList = [];
      let failFromList = [];
      let failIdList = [];

      const model = await service.playerService.getPlayerModel(failPlayer._id);
      if (model.gold <= 0) {
        return;
      }

      const balance = -Math.min(Math.abs(conf.maxGold), model.gold, winModel.gold);;
      failPlayer.balance += balance;
      winBalance += Math.abs(balance);
      failPlayer.juScore += balance;
      failFromList.push(this.atIndex(failPlayer));
      failGoldList.push(failPlayer.balance);
      failIdList.push(failPlayer._id);
      if (balance !== 0) {
        await this.room.addScore(failPlayer._id, balance, this.cardTypes);
        await service.playerService.logGoldConsume(failPlayer._id, ConsumeLogType.gamePayGang, balance,
          model.gold + balance, `查花猪扣除-${this.room._id}`);
      }

      //增加胡牌用户金币
      winPlayer.balance += winBalance;
      winPlayer.juScore += winBalance;
      if (winBalance !== 0) {
        await this.room.addScore(winPlayer._id, winBalance, this.cardTypes);
        await service.playerService.logGoldConsume(winPlayer._id, ConsumeLogType.gameReceiveGang, winBalance,
          winPlayer.model.gold + winBalance, `查花猪获得-${this.room._id}`);
      }

      // 生成金豆记录
      await RoomGoldRecord.create({
        winnerGoldReward: winBalance,
        winnerId: winPlayer._id,
        winnerFrom: this.atIndex(winPlayer),
        roomId: this.room._id,
        failList: failIdList,
        failGoldList,
        failFromList,
        multiple: conf.maxMultiple,
        juIndex: this.room.game.juIndex,
        cardTypes: {cardId: -1, cardName: "查花猪", multiple: conf.maxMultiple},
        isPublic: this.room.isPublic,
        categoryId: this.room.gameRule.categoryId
      })
    }
  }

  async refundShui() {
    this.players.map((p) => { p.balance = 0; })
    const drawbackPlayers = [];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const model = await service.playerService.getPlayerModel(p._id);
      const ting = p.isRobotTing(p.cards);
      const isDingQue = this.checkDingQueCard(p);
      const records = await RoomGangRecord.find({roomId: this.room._id, winnerId: p._id});
      if ((!ting.hu || (ting.hu && !isDingQue)) && records.length > 0 && !p.isBroke && model.gold > 0) {
        drawbackPlayers.push({index: i, records});
      }
    }

    if (drawbackPlayers.length > 0) {
      this.room.broadcast("game/drawback", {ok: true, data: drawbackPlayers});
      for (let i = 0; i < drawbackPlayers.length; i++) {
        await this.refundGangArrayScore(drawbackPlayers[i].records);
      }

      await this.checkBrokeAndWait(false);
    }

    return drawbackPlayers.length > 0;
  }

  async refundGangArrayScore(records) {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    for (let i = 0; i < records.length; i++) {
      const drawbackPlayer = this.players[records[i].winnerFrom];
      const failList = records[i].failList;
      const record = records[i];
      let failGoldList = [];
      let failFromList = [];
      let failIdList = [];

      for (let j = 0; j < failList.length; j++) {
        const refundPlayer = this.players[failList[j].index];
        if (!refundPlayer || refundPlayer.isBroke) {
          continue;
        }

        let winModel = await service.playerService.getPlayerModel(refundPlayer._id);
        let winBalance = 0;

        const model = await service.playerService.getPlayerModel(drawbackPlayer._id.toString());
        const balance = -Math.min(Math.abs(failList[j].score), model.gold, winModel.gold);
        drawbackPlayer.balance += balance;
        winBalance += Math.abs(balance);
        drawbackPlayer.juScore += balance;
        failFromList.push(this.atIndex(drawbackPlayer));
        failGoldList.push(drawbackPlayer.balance);
        failIdList.push(drawbackPlayer._id);
        if (balance !== 0) {
          await this.room.addScore(drawbackPlayer.model._id.toString(), balance, this.cardTypes);
          await service.playerService.logGoldConsume(drawbackPlayer._id, ConsumeLogType.gamePayGang, balance,
            model.gold + balance, `退税扣除-${this.room._id}`);
        }

        //增加胡牌用户金币
        refundPlayer.balance += winBalance;
        refundPlayer.juScore += winBalance;
        if (winBalance !== 0) {
          await this.room.addScore(refundPlayer.model._id.toString(), winBalance, this.cardTypes);
          await service.playerService.logGoldConsume(refundPlayer._id, ConsumeLogType.gameReceiveGang, winBalance,
            refundPlayer.model.gold + winBalance, `退税获得-${this.room._id}`);
        }

        // 生成金豆记录
        await RoomGoldRecord.create({
          winnerGoldReward: winBalance,
          winnerId: refundPlayer._id,
          winnerFrom: this.atIndex(refundPlayer),
          roomId: this.room._id,
          failList: failIdList,
          failGoldList,
          failFromList,
          multiple: record.multiple,
          juIndex: this.room.game.juIndex,
          cardTypes: {cardId: -1, cardName: "退税", multiple: conf.maxMultiple},
          isPublic: this.room.isPublic,
          categoryId: this.room.gameRule.categoryId
        })
      }
    }

    return true;
  }

  async refundGangScore(from, index) {
    // 获取点炮用户最后一次起风数据
    const record = await RoomGangRecord.findOne({winnerFrom: from, roomId: this.room._id}).sort({createAt: -1});
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    const dianPaoPlayer = this.players[from];
    const huPlayer = this.players[index];
    let failGoldList = [];
    let failFromList = [];
    let failIdList = [];
    if (!record) {
      console.warn("gang draw score record is exists");
      return ;
    }

    let winModel = await service.playerService.getPlayerModel(huPlayer._id.toString());
    let winBalance = 0;
    this.players.map((p) => {
      p.balance = 0;
    })

    const model = await service.playerService.getPlayerModel(dianPaoPlayer._id.toString());
    dianPaoPlayer.balance = -Math.min(Math.abs(-record.winnerGoldReward), model.gold, winModel.gold);
    winBalance += Math.abs(dianPaoPlayer.balance);
    dianPaoPlayer.juScore += dianPaoPlayer.balance;
    failFromList.push(this.atIndex(dianPaoPlayer));
    failGoldList.push(dianPaoPlayer.balance);
    failIdList.push(dianPaoPlayer._id);
    if (dianPaoPlayer.balance !== 0) {
      await this.room.addScore(dianPaoPlayer.model._id.toString(), dianPaoPlayer.balance, this.cardTypes);
      await service.playerService.logGoldConsume(dianPaoPlayer._id, ConsumeLogType.gamePayGang, dianPaoPlayer.balance,
        model.gold + dianPaoPlayer.balance, `呼叫转移扣除-${this.room._id}`);
    }

    //增加胡牌用户金币
    huPlayer.balance = winBalance;
    huPlayer.juScore += winBalance;
    if (winBalance !== 0) {
      await this.room.addScore(huPlayer.model._id.toString(), winBalance, this.cardTypes);
      await service.playerService.logGoldConsume(huPlayer._id, ConsumeLogType.gameReceiveGang, huPlayer.balance,
        huPlayer.model.gold + huPlayer.balance, `呼叫转移获得-${this.room._id}`);
    }

    // 生成起风记录
    await RoomGangRecord.create({
      winnerGoldReward: winBalance,
      winnerId: huPlayer.model._id.toString(),
      winnerFrom: this.atIndex(huPlayer),
      failList: record.failList,
      roomId: this.room._id,
      multiple: record.multiple,
      categoryId: this.room.gameRule.categoryId
    })

    // 生成金豆记录
    await RoomGoldRecord.create({
      winnerGoldReward: winBalance,
      winnerId: huPlayer._id,
      winnerFrom: this.atIndex(huPlayer),
      roomId: this.room._id,
      failList: failIdList,
      failGoldList,
      failFromList,
      multiple: record.multiple,
      juIndex: this.room.game.juIndex,
      cardTypes: {cardId: -1, cardName: "呼叫转移", multiple: conf.maxMultiple},
      isPublic: this.room.isPublic,
      categoryId: this.room.gameRule.categoryId
    })

    await this.checkBrokeAndWait();
  }

  async gangDrawScore(me, from, multiple, type) {
    let winModel = await service.playerService.getPlayerModel(me._id.toString());
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    const maxMultiple = multiple * conf.base * conf.Ante;
    let winBalance = 0;
    let failList = [];
    let failGoldList = [];
    let failFromList = [];
    let failIdList = [];
    this.players.map((p) => {
      p.balance = 0;
    })

    if (from) {
      const model = await service.playerService.getPlayerModel(from._id.toString());
      from.balance = -Math.min(Math.abs(maxMultiple), model.gold, winModel.gold);
      winBalance += Math.abs(from.balance);
      from.juScore += from.balance;
      failList.push({index: this.atIndex(from), score: from.balance});
      failFromList.push(this.atIndex(from));
      failGoldList.push(from.balance);
      failIdList.push(from._id);
      if (from.balance !== 0) {
        await this.room.addScore(from.model._id.toString(), from.balance, this.cardTypes);
        await service.playerService.logGoldConsume(from._id, ConsumeLogType.gamePayGang, from.balance,
          model.gold + from.balance, `起风扣除-${this.room._id}`);
      }
    } else {
      // 自摸胡
      for (const p of this.players) {
        // 扣除三家金币
        if (p.model._id.toString() !== me.model._id.toString() && !p.isBroke) {
          const model = await service.playerService.getPlayerModel(p._id.toString());
          p.balance = -Math.min(Math.abs(maxMultiple), model.gold, winModel.gold);
          winBalance += Math.abs(p.balance);
          p.juScore += p.balance;
          failList.push({index: this.atIndex(p), score: p.balance});
          failFromList.push(this.atIndex(p));
          failGoldList.push(p.balance);
          failIdList.push(p._id);
          if (p.balance !== 0) {
            await this.room.addScore(p.model._id.toString(), p.balance, this.cardTypes);
            await service.playerService.logGoldConsume(p._id, ConsumeLogType.gamePayGang, p.balance,
              model.gold + p.balance, `起风扣除-${this.room._id}`);
          }
        }
      }
    }

    //增加胡牌用户金币
    me.balance = winBalance;
    me.juScore += winBalance;
    if (winBalance !== 0) {
      await this.room.addScore(me.model._id.toString(), winBalance, this.cardTypes);
      await service.playerService.logGoldConsume(me._id, ConsumeLogType.gameReceiveGang, me.balance,
        me.model.gold + me.balance, `起风获得-${this.room._id}`);
    }

    // 生成起风记录
    await RoomGangRecord.create({
      winnerGoldReward: winBalance,
      winnerId: me.model._id.toString(),
      winnerFrom: this.atIndex(me),
      failList,
      roomId: this.room._id,
      multiple: multiple,
      categoryId: this.room.gameRule.categoryId
    })

    // 生成金豆记录
    await RoomGoldRecord.create({
      winnerGoldReward: winBalance,
      winnerId: me.model._id,
      winnerFrom: this.atIndex(me),
      roomId: this.room._id,
      failList: failIdList,
      failGoldList,
      failFromList,
      multiple: maxMultiple,
      juIndex: this.room.game.juIndex,
      cardTypes: {cardId: -1, cardName: type, multiple},
      isPublic: this.room.isPublic,
      categoryId: this.room.gameRule.categoryId
    })

    await this.checkBrokeAndWait();
  }

  async gameOver(from, to) {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    this.players.map((p) => {
      p.balance = 0;
    })
    let failList = [];
    let failGoldList = [];
    let failFromList = [];
    let winBalance = 0;
    let winModel = await service.playerService.getPlayerModel(to._id.toString());

    // 点炮胡
    if (from) {
      failList.push(from._id);
      failFromList.push(this.atIndex(from));
      const model = await service.playerService.getPlayerModel(from._id.toString());
      const balance = (conf.base * conf.Ante * to.mingMultiple * this.cardTypes.multiple * 10 > conf.maxGold ? conf.maxGold : conf.base * this.cardTypes.multiple * conf.Ante * to.mingMultiple * 10);
      from.balance = -Math.min(Math.abs(balance), model.gold, winModel.gold);
      winBalance += Math.abs(from.balance);
      from.juScore += from.balance;
      failGoldList.push(from.balance);
      if (from.balance !== 0) {
        await this.room.addScore(from.model._id.toString(), from.balance, this.cardTypes);
        await service.playerService.logGoldConsume(from._id, ConsumeLogType.gamePayGold, from.balance,
          model.gold + from.balance, `对局扣除${this.room._id}`);
      }
    } else {
      // 自摸胡
      for (const p of this.players) {
        // 扣除三家金币
        if (p.model._id.toString() !== to.model._id.toString() && !p.isBroke) {
          const model = await service.playerService.getPlayerModel(p._id.toString());
          const balance = (conf.base * conf.Ante * to.mingMultiple * this.cardTypes.multiple * 10 > conf.maxGold ? conf.maxGold : conf.base * this.cardTypes.multiple * conf.Ante * to.mingMultiple * 10);
          p.balance = -Math.min(Math.abs(balance), model.gold, winModel.gold);
          winBalance += Math.abs(p.balance);
          p.juScore += p.balance;
          if (p.balance !== 0) {
            await this.room.addScore(p.model._id.toString(), p.balance, this.cardTypes);
            await service.playerService.logGoldConsume(p._id, ConsumeLogType.gamePayGold, p.balance,
              model.gold + p.balance, `对局扣除-${this.room._id}`);
            failList.push(p._id);
            failGoldList.push(p.balance);
            failFromList.push(this.atIndex(p));
          }
        }
      }
    }

    //增加胡牌用户金币
    to.balance = winBalance;
    to.juScore += winBalance;
    if (winBalance !== 0) {
      await this.room.addScore(to.model._id.toString(), winBalance, this.cardTypes);
      await service.playerService.logGoldConsume(to._id, ConsumeLogType.gameGiveGold, to.balance,
        to.model.gold + to.balance, `对局获得-${this.room._id}`);
    }

    // 生成金豆记录
    await RoomGoldRecord.create({
      winnerGoldReward: winBalance,
      winnerId: to.model._id.toString(),
      winnerFrom: this.atIndex(to),
      roomId: this.room._id,
      failList,
      failFromList,
      failGoldList,
      multiple: conf.base * conf.Ante * to.mingMultiple * this.cardTypes.multiple > conf.maxMultiple ? conf.maxMultiple : conf.base * conf.Ante * to.mingMultiple * this.cardTypes.multiple,
      juIndex: this.room.game.juIndex,
      cardTypes: this.cardTypes,
      isPublic: this.room.isPublic,
      categoryId: this.room.gameRule.categoryId
    })

    await this.checkBrokeAndWait();
  }

  async getPlayerCardTypeRecord(player, typeId, taskType) {
    let cardTypeRecord = await PlayerCardTypeRecord.findOne({playerId: player._id, taskType: taskType, typeId: typeId});
    if (cardTypeRecord) {
      return cardTypeRecord;
    }

    return await PlayerCardTypeRecord.create({
      playerId: player._id,
      taskType: taskType,
      typeId: typeId,
      count: 0
    });
  }

  async playerGameOver(p, niaos, states) {
    p.gameOver();
    this.room.removeReadyPlayer(p._id.toString());

    if (!p.isRobot) {
      this.alreadyRechargeCount++;
      if (this.alreadyRechargeCount >= this.waitRechargeCount) {
        this.room.robotManager.model.step = RobotStep.running;
      }
    }

    // 记录破产人数
    if (!this.brokeList.includes(p._id.toString())) {
      p.isBroke = true;
      p.isGameOver = true;
      this.brokeCount++;
      this.brokeList.push(p._id.toString());

      if (this.brokeCount >= 3) {
        this.isGameOver = true;
        const states = this.players.map((player, idx) => player.genGameStatus(idx, 1));
        const nextZhuang = this.nextZhuang();
        await this.gameAllOver(states, [], nextZhuang);
      }
    }

    //获取用户当局对局流水
    const records = await RoomGoldRecord.where({roomId: this.room._id, juIndex: this.room.game.juIndex}).find();
    const gameOverMsg = {
      niaos,
      creator: this.room.creator.model._id,
      juShu: this.restJushu,
      juIndex: this.room.game.juIndex,
      states,
      ruleType: this.rule.ruleType,
      isPublic: this.room.isPublic,
      caiShen: this.caishen,
      records
    }

    // 更新用户对局属性
    const model = await Player.findOne({_id: p._id});
    model.isGame = false;
    model.juCount++;
    if (p.juScore > 0) {
      model.juWinCount++;
    }
    model.juRank = (model.juWinCount / model.juCount).toFixed(2);
    model.goVillageCount++;

    if (p.juScore > 0) {
      model.juContinueWinCount++;

      if (p.juScore > model.reapingMachineAmount) {
        model.reapingMachineAmount = p.juScore;
      }
    }

    if (p.juScore === 0) {
      model.noStrokeCount++;
    }

    if (p.juScore < 0) {
      model.juContinueWinCount = 0;

      if (Math.abs(p.juScore) > model.looseMoneyBoyAmount) {
        model.looseMoneyBoyAmount = Math.abs(p.juScore);
      }
    }

    await model.save();
    p.isCalcJu = true;

    // 记录战绩
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();
    await CombatGain.create({
      uid: this.room._id,
      room: this.room.uid,
      juIndex: this.room.game.juIndex,
      playerId: p.model._id,
      gameName: "血流红中",
      caregoryName: category.title,
      time: new Date(),
      score: p.juScore
    });

    p.sendMessage('game/player-over', {ok: true, data: gameOverMsg})
    this.room.broadcast("game/playerBankruptcy", {ok: true, data: {index: p.seatIndex}});

    // 如果目前打牌的是破产用户，找到下一个正常用户
    if (this.stateData[Enums.da] && this.stateData[Enums.da]._id.toString() === p.model._id.toString()) {

      // 去除摸牌
      if (p.cards[this.lastTakeCard] > 0) {
        p.cards[this.lastTakeCard]--;
        p.sendMessage('game/remove-card', {ok: true, data: {card: this.lastTakeCard}})
      }

      this.turn++;
      let xiajia = null;
      let startIndex = (this.atIndex(p) + 1) % this.players.length;

      // 从 startIndex 开始查找未破产的玩家
      for (let i = startIndex; i < startIndex + this.players.length; i++) {
        let index = i % this.players.length;
        if (!this.players[index].isBroke) {
          xiajia = this.players[index];
          break;
        }
      }

      if (xiajia) {
        const nextDo = async () => {
          const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

          const newCard = await this.consumeCard(xiajia);
          if (newCard) {
            xiajia.cards[newCard]++;
            this.cardTypes = await this.getCardTypes(xiajia, 1);
            xiajia.cards[newCard]--;
            const msg = xiajia.takeCard(this.turn, newCard, false, false, {
              id: this.cardTypes.cardId,
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.mingMultiple
            })

            if (!msg) {
              const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
              const nextZhuang = this.nextZhuang()
              await this.gameAllOver(states, [], nextZhuang);
              console.error("consume card error msg ", msg)
              return;
            }

            // 如果用户可以杠，并且胡牌已托管，则取消托管
            if (msg.gang && xiajia.isGameHu && xiajia.onDeposit) {
              xiajia.onDeposit = false;
              xiajia.sendMessage('game/cancelDepositReply', {ok: true, data: {card: newCard}})
            }

            this.state = stateWaitDa;
            this.stateData = {da: xiajia, card: newCard, msg};
            const sendMsg = {index: this.players.indexOf(xiajia), card: newCard, msg}
            this.room.broadcast('game/oppoTakeCard', {
              ok: true,
              data: sendMsg
            }, xiajia.msgDispatcher)
          }
        }

        setTimeout(nextDo, 200);
      } else {
        const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
        const nextZhuang = this.nextZhuang()
        await this.gameAllOver(states, [], nextZhuang);
      }
    }
  }

  async gameAllOver(states, niaos, nextZhuang) {
    if (this.state === stateGameOver) {
      return ;
    }

    this.state = stateGameOver;
    this.players.forEach(x => x.gameOver())
    this.room.removeListener('reconnect', this.onReconnect)
    this.room.removeListener('empty', this.onRoomEmpty)

    const scores = [];
    const players = [];
    this.players.map(async (player, idx) => {
      if (player) {
        players.push(player._id.toString())
        const state = player.genGameStatus(idx, 1);
        scores.push({
          score: state.score,
          name: player.model.nickname,
          headImgUrl: player.model.avatar,
          shortId: player.model.shortId
        })
      }
    })

    // 更新战绩
    for (let i = 0; i < states.length; i++) {
      // 判断是否已经录入战绩
      const exists = await CombatGain.count({
        playerId: states[i].model._id,
        uid: this.room._id,
        juIndex: this.room.game.juIndex
      });

      if (!exists) {
        const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();

        await CombatGain.create({
          uid: this.room._id,
          room: this.room.uid,
          juIndex: this.room.game.juIndex,
          playerId: states[i].model._id,
          gameName: "血流红中",
          caregoryName: category.title,
          time: new Date(),
          score: states[i].score
        });
      }
    }

    //获取用户当局对局流水
    const records = await RoomGoldRecord.where({roomId: this.room._id, juIndex: this.room.game.juIndex}).find();
    const scoreRecords = [];

    for (let i = 0; i < records.length; i++) {
      if (states.length > 0 && states[0].score >= 0 && states[0].model._id.toString() === records[i].winnerId.toString()) {
        scoreRecords.push(records[i]);
      }

      if (states.length > 0 && states[0].score < 0 && records[i].failList.includes(states[0].model._id.toString())) {
        scoreRecords.push(records[i]);
      }
    }

    const gameOverMsg = {
      niaos,
      creator: this.room.creator.model._id,
      juShu: this.restJushu,
      juIndex: this.room.game.juIndex,
      states,
      gameType: GameType.xueliu,
      records: scoreRecords,
      ruleType: this.rule.ruleType,
      isPublic: this.room.isPublic,
      caiShen: this.caishen,
      base: this.room.currentBase
    }

    // 计算胜率
    await this.calcJuRank();

    if (states.length > 0) {
      await this.room.recordGameRecord(this, states);
      await this.room.recordRoomScore('dissolve', scores, players);
      await this.room.RoomScoreRecord(scores, players);

      const nextDo1 = async () => {
        // 退税，对局结束，未听牌的玩家需返还杠牌所得
        const flag = await this.refundShui();
        setTimeout(nextDo2, flag ? 2000 : 0);
      }

      setTimeout(nextDo1, 1000);

      // 查花猪手上拿着3门牌的玩家为花猪，花猪赔给非花猪玩家封顶点数
      const nextDo2 = async () => {
        const flag = await this.searchFlowerPig();
        setTimeout(nextDo3, flag ? 2000 : 0);
      }

      // 未听牌：对局结束时，未听牌玩家赔给听牌的玩家最大叫点数的金豆
      const nextDo3 = async () => {
        const flag = await this.NoTingCard();

        setTimeout(nextDo4, flag ? 2000 : 0);
      }

      const nextDo4 = async () => {
        await this.room.gameOver()
        this.room.broadcast('game/game-over', {ok: true, data: gameOverMsg})
      }
    }
  }

  async calcJuRank() {
    for (let i = 0; i < this.players.length; i++) {
      const model = await Player.findOne({_id: this.players[i]._id});
      model.isGame = false;

      if (!this.players[i].isCalcJu) {
        model.juCount++;
        if (this.players[i].juScore > 0) {
          model.juWinCount++;
        }
        model.juRank = (model.juWinCount / model.juCount).toFixed(2);

        if (this.players[i].juScore > 0) {
          model.juContinueWinCount++;

          if (this.players[i].juScore > model.reapingMachineAmount) {
            model.reapingMachineAmount = this.players[i].juScore;
          }
        }

        if (this.players[i].juScore === 0) {
          model.noStrokeCount++;
        }

        if (this.players[i].juScore < 0) {
          model.juContinueWinCount = 0;

          if (Math.abs(this.players[i].juScore) > model.looseMoneyBoyAmount) {
            model.looseMoneyBoyAmount = Math.abs(this.players[i].juScore);
          }
        }
      }

      await model.save();
    }
  }

  dissolve() {
    // TODO 停止牌局 托管停止 减少服务器计算消耗
    this.logger.close()
    this.players = [];
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      const player = this.players[index];
      player.onDeposit = false;
      player.reconnect(playerMsgDispatcher);
      player.sendMessage('game/reconnect', {ok: true, data: await this.generateReconnectMsg(index)})
    })

    room.once('empty', this.onRoomEmpty = () => {
      this.players.forEach(x => {
        x.gameOver()
      })
    })
  }

  async restoreMessageForPlayer(player: PlayerState) {
    const index = this.atIndex(player)

    return await this.generateReconnectMsg(index)
  }

  async onRefresh(index) {
    const player = this.players[index]
    if (!player) {
      return ;
    }
    player.sendMessage('room/refresh', {ok: true, data: await this.restoreMessageForPlayer(player)})
  }

  async generateReconnectMsg(index) {
    const player = this.players[index];
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();
    const pushMsg = {
      index, status: [], _id: this.room._id, rule: this.rule,
      category,
      remainCards: this.remainCards,
      base: this.room.currentBase,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
      current: {},
      isGameRunning: this.state !== stateGameOver,
      cardTableId: null
    }

    // 获取牌桌
    const playerCardTable = await PlayerCardTable.findOne({playerId: player._id, isUse: true});
    if (playerCardTable && (playerCardTable.times === -1 || playerCardTable.times > new Date().getTime())) {
      pushMsg.cardTableId = playerCardTable.propId;
    }

    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

    let msg;
    for (let i = 0; i < this.players.length; i++) {
      let medalId = null;
      let headerBorderId = null;
      // 获取用户称号
      const playerMedal = await PlayerMedal.findOne({playerId: this.players[i]._id, isUse: true});
      if (playerMedal && (playerMedal.times === -1 || playerMedal.times > new Date().getTime())) {
        medalId = playerMedal.propId;
      }

      // 获取用户头像框
      const playerHeadBorder = await PlayerHeadBorder.findOne({playerId: this.players[i]._id, isUse: true});
      if (playerHeadBorder && (playerHeadBorder.times === -1 || playerHeadBorder.times > new Date().getTime())) {
        headerBorderId = playerHeadBorder.propId;
      }

      if (i === index) {
        msg = this.players[i].genSelfStates(i);
        msg.events.huCards = msg.huCards.slice();
        msg.onDeposit = this.players[i].onDeposit;
        pushMsg.status.push(msg);
      } else {
        msg = this.players[i].genOppoStates(i);
        msg.events.huCards = msg.huCards.slice();
        msg.onDeposit = this.players[i].onDeposit;
        pushMsg.status.push(msg);
      }

      msg.model.medalId = medalId;
      msg.model.headerBorderId = headerBorderId;
    }

    switch (this.state) {
      case stateWaitDa: {
        const daPlayer = this.stateData[Enums.da];
        // 重连无法托管，需要设置允许托管
        if (daPlayer && daPlayer._id.toString() === player._id.toString()) {
          pushMsg.current = {
            index,
            state: 'waitDa',
            msg: this.stateData.msg ?? {},
          }
        } else {
          pushMsg.current = {index: this.atIndex(daPlayer), state: 'waitDa'};
        }

        break
      }
      case stateWaitAction: {
        const actions = this.actionResolver.allOptions && this.actionResolver.allOptions(player);
        if (actions) {
          this.cardTypes = await this.getCardTypes(player, 1);
          actions["huType"] = {};
          if (actions["hu"]) {
            actions["huType"] = {
              id: this.cardTypes.cardId,
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.mingMultiple
            };
          }
          pushMsg.current = {
            index, state: 'waitAction',
            msg: actions
          }
        } else {
          await this.room.forceDissolve();
        }
        break
      }
      default:
        await this.room.forceDissolve();
        break
    }

    return pushMsg
  }


  setGameRecorder(recorder) {
    this.recorder = recorder
    for (const p of this.players) {
      p.setGameRecorder(recorder)
    }
  }

  async onPlayerGuo(player, playTurn, playCard) {
    // 一炮多响(金豆房)
    if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && this.room.isPublic) {
      this.manyHuPlayers.push(player._id.toString());
      this.setManyAction(player, Enums.guo);

      if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
        this.isRunMultiple = true;
        player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
      }

      player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.guo, card: playCard, index: this.atIndex(player)}})
      return ;
    }

    // 一炮多响(好友房)
    if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && !this.room.isPublic) {
      this.manyHuPlayers.push(player._id.toString());
      this.setManyAction(player, Enums.guo);
      player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.guo, card: playCard, index: this.atIndex(player)}})

      if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
        this.isRunMultiple = true;
        player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
      }
    }

    const index = this.players.indexOf(player);
    if (this.turn !== playTurn) {
      player.sendMessage('game/guoReply', {ok: false, info: TianleErrorCode.notChoiceAction});
    } else if (this.state !== stateWaitAction && this.state !== stateQiangGang) {
      player.sendMessage('game/guoReply', {ok: false, info: TianleErrorCode.notChoiceState});
    } else {
      player.sendMessage('game/guoReply', {ok: true, data: {}});
      player.guoOption(playCard)
      this.actionResolver.cancel(player)
      this.actionResolver.tryResolve()
      return;
    }
  }

  promptWithOther(todo, player, card) {
    // console.warn("isManyHu-%s, index-%s, card-%s, todo-%s, stateData.card-%s", this.isManyHu, this.atIndex(player), card, todo, this.stateData.card);
    // 一炮多响
    if (this.isManyHu) {
      // 一炮多响
      for (let i = 0; i < this.canManyHuPlayers.length; i++) {
        const pp = this.players.find(p => p._id.toString() === this.canManyHuPlayers[i]);
        if (pp && !pp.isRobot && !this.manyHuPlayers.includes(pp._id.toString())) {
          console.warn("player index-%s not choice card-%s", this.atIndex(pp), this.stateData.card);
          return ;
        }
      }

      // 如果机器人没有操作，则push到数组
      if (!this.manyHuPlayers.includes(player._id.toString())) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, todo);
      }

      if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
        this.isRunMultiple = true;
        player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
        // console.warn("manyHuArray-%s manyHuPlayers-%s canManyHuPlayers-%s card-%s can many hu", JSON.stringify(this.manyHuArray), JSON.stringify(this.manyHuPlayers), JSON.stringify(this.canManyHuPlayers), this.stateData.card);
      }

      return ;
    }
    switch (todo) {
      case Enums.peng:
        player.emitter.emit(Enums.peng, this.turn, this.stateData.card)
        break;
      case Enums.gang:
        player.emitter.emit(Enums.gangByOtherDa, this.turn, this.stateData.card)
        break;
      case Enums.anGang:
      case Enums.buGang:
        player.emitter.emit(Enums.gangBySelf, this.turn, card)
        break;
      case Enums.hu:
        if ([Enums.zhong].includes(this.stateData.card) && !player.isGameHu) {
          if (this.state === stateWaitDa) {
            const card = this.promptWithPattern(player, this.lastTakeCard);
            player.emitter.emit(Enums.da, this.turn, card);
          } else {
            player.emitter.emit(Enums.guo, this.turn, card);
          }
        } else {
          player.emitter.emit(Enums.hu, this.turn, this.stateData.card);
        }

        break;
    }
  }

  // 托管模式出牌
  promptWithPattern(player: PlayerState, lastTakeCard) {
    // 获取摸牌前的卡牌
    const cards = player.cards.slice();
    if (lastTakeCard && cards[lastTakeCard] > 0) cards[lastTakeCard]--;
    // 如果用户听牌，则直接打摸牌
    const ting = player.isRobotTing(cards);
    const isDingQue = this.checkDingQueCard(player);
    if (ting.hu && isDingQue) {
      if (lastTakeCard && player.cards[lastTakeCard] > 0 && lastTakeCard !== Enums.zhong) return lastTakeCard;
    }

    // 如果用户已经胡牌，则直接打摸牌
    if (lastTakeCard && player.isGameHu && player.cards[lastTakeCard] > 0) {
      return lastTakeCard;
    }

    // 如果定缺万，还有万就打万
    if (player.mode === "wan") {
      const wanCard = this.getDingQueCard(player, 1, 9);
      if (wanCard.code) return wanCard.index;
    }

    // 如果定缺条，还有条就打条
    if (player.mode === "tiao") {
      const tiaoCard = this.getDingQueCard(player, 11, 19);
      if (tiaoCard.code) return tiaoCard.index;
    }

    // 如果定缺筒，还有筒就打筒
    if (player.mode === "tong") {
      const tongCard = this.getDingQueCard(player, 21, 29);
      if (tongCard.code) return tongCard.index;
    }

    // 有1,9孤牌打1,9孤牌
    const lonelyCard = this.getCardOneOrNoneLonelyCard(player);
    if (lonelyCard.code) return lonelyCard.index;

    // 有2,8孤牌打2,8孤牌
    const twoEightLonelyCard = this.getCardTwoOrEightLonelyCard(player);
    if (twoEightLonelyCard.code) return twoEightLonelyCard.index;

    // 有普通孤牌打普通孤牌
    const otherLonelyCard = this.getCardOtherLonelyCard(player);
    if (otherLonelyCard.code) return otherLonelyCard.index;

    // 有1,9卡张打1,9卡张
    const oneNineCard = this.getCardOneOrNineCard(player);
    if (oneNineCard.code) return oneNineCard.index;

    // 有2,8卡张打2,8卡张
    const twoEightCard = this.getCardTwoOrEightCard(player);
    if (twoEightCard.code) return twoEightCard.index;

    // 有普通卡张打普通卡张
    const otherCard = this.getCardOtherCard(player);
    if (otherCard.code) return otherCard.index;

    // 有1,9多张打1,9多张
    const oneNineManyCard = this.getCardOneOrNineManyCard(player);
    if(oneNineManyCard.code) return oneNineManyCard.index;
    //
    // //有2,8多张打2,8多张
    const twoEightManyCard = this.getCardTwoOrEightManyCard(player);
    if(twoEightManyCard.code) return twoEightManyCard.index;
    //
    // //有普通多张打普通多张
    const otherManyCard = this.getCardOtherMayCard(player);
    if(otherManyCard.code) return otherManyCard.index;

    // 从卡牌随机取一张牌
    const randCard = this.getCardRandCard(player);
    if (randCard.code) return randCard.index;
  }

  getCardOtherMayCard(player) {
    for (let i = 0; i < 3; i++) {
      for (let j = 2; j < 9; j++) {
        const tail = j + i * 10;
        const tailIndex = this.checkUserHasCard(player.cards, tail);

        switch (j) {
          case 3:
          case 4:
          case 5:
          case 6:
          case 7:
            if (tailIndex.count === 2 && ((this.checkUserHasCard(player.cards, tail - 2).count === 1
                && this.checkUserHasCard(player.cards, tail - 1).count === 1) ||
              (this.checkUserHasCard(player.cards, tail - 1).count === 1
                && this.checkUserHasCard(player.cards, tail + 1).count === 1) ||
              (this.checkUserHasCard(player.cards, tail + 2).count === 1
                && this.checkUserHasCard(player.cards, tail + 1).count === 1)))
              return {code: true, index: tailIndex.index};
            break;
        }
      }
    }

    return {code: false, index: 0};
  }

  getCardTwoOrEightManyCard(player) {
    for (let i = 0; i < 3; i++) {
      for (let j = 2; j < 9; j++) {
        const tail = j + i * 10;
        const tailIndex = this.checkUserHasCard(player.cards, tail);
        const tailllIndex = this.checkUserHasCard(player.cards, tail - 2);
        const taillIndex = this.checkUserHasCard(player.cards, tail - 1);
        const tailrIndex = this.checkUserHasCard(player.cards, tail + 1);
        const tailrrIndex = this.checkUserHasCard(player.cards, tail + 2);

        if (!tailIndex.count) continue;

        switch (j) {
          case 2:
            if (tailIndex.count === 2 && (taillIndex.count === 1 &&
                tailrIndex.count === 1) ||
              (tailrrIndex.count === 1 &&
                tailrIndex.count === 1))
              return {code: true, index: tailIndex.index};
            break;

          case 8:
            if (tailIndex.count === 2 && (tailllIndex.count === 1 &&
                tailrIndex.count === 1) ||
              (tailllIndex.count === 1 &&
                taillIndex.count === 1))
              return {code: true, index: tailIndex.index};
            break;
        }
      }
    }

    return {code: false, index: 0};
  }

  getCardOneOrNineManyCard(player) {
    for (let i = 0; i < 3; i++) {
      const tail1 = 1 + i * 10;
      const tail9 = 9 + i * 10;
      const tail1Index = this.checkUserHasCard(player.cards, tail1);
      const tail9Index = this.checkUserHasCard(player.cards, tail9);

      // 判断是否有尾数为1的多牌
      if (tail1Index.count === 2 && this.checkUserHasCard(player.cards, tail1 + 1).count === 1
        && this.checkUserHasCard(player.cards, tail1 + 2).count === 1) return {code: true, index: tail1Index.index};

      // 判断是否有尾数为9的多牌
      if (tail9Index.count === 2 && this.checkUserHasCard(player.cards, tail9 - 1).count === 1
        && this.checkUserHasCard(player.cards, tail9 - 2).count === 1) return {code: true, index: tail9Index.index};
    }

    return {code: false, index: 0};
  }

  getCardRandCard(player) {
    const nextCard = [];

    player.cards.forEach((value, i) => {
      if (value > 0) {
        nextCard.push(i);
      }
    });

    for (let i = 0; i < nextCard.length; i++) {
      const tailIndex = this.checkUserHasCard(player.cards, nextCard[i]);
      const tailllIndex = this.checkUserHasCard(player.cards, nextCard[i] - 2);
      const taillIndex = this.checkUserHasCard(player.cards, nextCard[i] - 1);
      const tailrIndex = this.checkUserHasCard(player.cards, nextCard[i] + 1);
      const tailrrIndex = this.checkUserHasCard(player.cards, nextCard[i] + 2);

      // 如果是三连张禁止拆牌
      if (tailIndex.count === 1 && ((taillIndex.count === 1 && tailllIndex.count === 1) ||
        (taillIndex.count === 1 && tailrIndex.count === 1) ||
        (tailrIndex.count === 1 && tailrrIndex.count === 1))) continue;

      // 如果单张出现3张禁止拆牌
      if (tailIndex.count > 2) continue;

      // 如果2+1,则打1
      if (tailIndex.count === 2 && taillIndex.count === 1 && tailrIndex.count === 0) return {
        code: true,
        index: taillIndex.index
      };
      if (tailIndex.count === 2 && taillIndex.count === 0 && tailrIndex.count === 1) return {
        code: true,
        index: tailrIndex.index
      };

      return {code: true, index: nextCard[i]};
    }

    return {code: true, index: nextCard[0]};
  }

  getCardOtherCard(player) {
    for (let i = 0; i < 3; i++) {
      for (let j = 2; j < 9; j++) {
        const tail = j + i * 10;
        const tailIndex = this.checkUserHasCard(player.cards, tail);

        switch (j) {
          case 3:
          case 4:
          case 5:
          case 6:
          case 7:
            if (tailIndex.count === 1 &&
              this.checkUserCardCount(player.cards, [tail - 1, tail - 2, tail + 1, tail + 2]).count === 1)
              return {code: true, index: tailIndex.index};
            break;
        }
      }
    }

    return {code: false, index: 0};
  }

  checkUserCardCount(cards, values) {
    let count = 0;
    let index = 0;
    const newCards = [];

    cards.forEach((max, j) => {
      if (max > 0) {
        for (let i = 0; i < max; i++) {
          newCards.push({value: j, index: j});
        }
      }
    });

    newCards.forEach((card, i) => {
      values.forEach((v: any) => {
        if (card.value === v) {
          count++;
          index = card.index;
        }
      })
    });

    return {index, count};
  }

  getCardTwoOrEightCard(player) {
    for (let i = 0; i < 3; i++) {
      for (let j = 2; j < 9; j++) {
        const tail = j + i * 10;
        const tailIndex = this.checkUserHasCard(player.cards, tail);

        switch (j) {
          case 2:
            if (tailIndex.count === 1 &&
              this.checkUserCardCount(player.cards, [tail - 1, tail + 1, tail + 2]).count === 1)
              return {code: true, index: tailIndex.index};
            break;

          case 8:
            if (tailIndex.count === 1 &&
              this.checkUserCardCount(player.cards, [tail - 1, tail + 1, tail - 2]).count === 1)
              return {code: true, index: tailIndex.index};
            break;
        }
      }
    }

    return {code: false, index: 0};
  }

  getCardOneOrNineCard(player) {
    for (let i = 0; i < 3; i++) {
      const tail1 = 1 + i * 10;
      const tail9 = 9 + i * 10;
      const tail1Index = this.checkUserHasCard(player.cards, tail1);
      const tail9Index = this.checkUserHasCard(player.cards, tail9);

      // 判断是否有尾数为1的卡张
      if (tail1Index.count === 1 && ((this.checkUserHasCard(player.cards, tail1 + 1).count === 1
          && this.checkUserHasCard(player.cards, tail1 + 2).count === 0) ||
        (this.checkUserHasCard(player.cards, tail1 + 1).count === 0
          && this.checkUserHasCard(player.cards, tail1 + 2).count === 1))) return {code: true, index: tail1Index.index};

      // 判断是否有尾数为9的卡张
      if (tail9Index.count === 1 && ((this.checkUserHasCard(player.cards, tail9 - 1).count === 1
          && this.checkUserHasCard(player.cards, tail9 - 2).count === 0) ||
        (this.checkUserHasCard(player.cards, tail9 - 1).count === 0
          && this.checkUserHasCard(player.cards, tail9 - 2).count === 1))) return {code: true, index: tail9Index.index};
    }

    return {code: false, index: 0};
  }

  getCardTwoOrEightLonelyCard(player) {
    for (let i = 0; i < 3; i++) {
      for (let j = 2; j < 9; j++) {
        const tail = j + i * 10;
        const tailIndex = this.checkUserHasCard(player.cards, tail);

        switch (j) {
          case 2:
            if (tailIndex.count === 1 && this.checkUserHasCard(player.cards, tail + 1).count === 0
              && this.checkUserHasCard(player.cards, tail + 2).count === 0
              && this.checkUserHasCard(player.cards, tail - 1).count === 0) return {code: true, index: tailIndex.index};
            break;

          case 8:
            if (tailIndex.count === 1 && this.checkUserHasCard(player.cards, tail + 1).count === 0
              && this.checkUserHasCard(player.cards, tail - 1).count === 0
              && this.checkUserHasCard(player.cards, tail - 2).count === 0) return {code: true, index: tailIndex.index};
            break;
        }
      }
    }

    return {code: false, index: 0};
  }

  getCardOtherLonelyCard(player) {
    for (let i = 0; i < 3; i++) {
      for (let j = 2; j < 9; j++) {
        const tail = j + i * 10;
        const tailIndex = this.checkUserHasCard(player.cards, tail);

        switch (j) {
          case 3:
          case 4:
          case 5:
          case 6:
          case 7:
            if (tailIndex.count === 1 && this.checkUserHasCard(player.cards, tail + 1).count === 0
              && this.checkUserHasCard(player.cards, tail + 2).count === 0
              && this.checkUserHasCard(player.cards, tail - 1).count === 0
              && this.checkUserHasCard(player.cards, tail - 2).count === 0) return {code: true, index: tailIndex.index};
            break;
        }
      }
    }

    return {code: false, index: 0};
  }

  getCardOneOrNoneLonelyCard(player) {
    for (let i = 0; i < 3; i++) {
      const tail1 = 1 + i * 10;
      const tail9 = 9 + i * 10;
      const tail1Index = this.checkUserHasCard(player.cards, tail1);
      const tail1pIndex = this.checkUserHasCard(player.cards, tail1 + 1);
      const tail1ppIndex = this.checkUserHasCard(player.cards, tail1 + 2);
      const tail9Index = this.checkUserHasCard(player.cards, tail9);
      const tail9pIndex = this.checkUserHasCard(player.cards, tail9 - 1);
      const tail9ppIndex = this.checkUserHasCard(player.cards, tail9 - 2);

      // 判断是否有尾数为1的孤牌
      if (tail1Index.count === 1 && tail1pIndex.count === 0
        && tail1ppIndex.count === 0) return {code: true, index: tail1Index.index};

      // 判断是否有尾数为9的孤牌
      if (tail9Index.count === 1 && tail9pIndex.count === 0
        && tail9ppIndex.count === 0) return {code: true, index: tail9Index.index};
    }

    return {code: false, index: 0};
  }

  getDingQueCard(player, start, end) {
    for (let i = start; i <= end; i++) {
      if (player.cards[i] > 0) {
        return {code: true, index: i};
      }
    }

    return {code: false, index: 0};
  }

  checkUserHasCard(cards, value) {
    let count = 0;
    let index = 0;
    const newCards = [];

    cards.forEach((max, j) => {
      if (max > 0) {
        for (let i = 0; i < max; i++) {
          newCards.push({value: j, index: j});
        }
      }
    });

    newCards.forEach((card, i) => {
      if (card.value === value) {
        index = card.index;
        count++;
      }
    });

    if (count > 0) return {index, count};
    return {index: 0, count: 0};
  }
}

export default TableState;

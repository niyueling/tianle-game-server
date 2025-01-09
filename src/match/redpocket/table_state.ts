/**
 * Created by Color on 2016/7/6.
 */
// @ts-ignore
import {isNaN, pick, random} from 'lodash'
import * as moment from 'moment'
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
import * as config from "../../config"
import RoomTimeRecord from "../../database/models/roomTimeRecord";
import algorithm from "../../utils/algorithm";

const stateWaitDa = 1
const stateWaitAction = 2
export const stateGameOver = 3

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

  addSpan(Enums.wanzi1, Enums.wanzi9);
  addSpan(Enums.zhong, Enums.bai);

  return cards;
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

  resume(actionJSON) {
    console.log('resume')
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
    this.actionsOptions.filter(ao => ao.who._id.toString() === player._id.toString())
      .forEach(ao => {
        ao.state = 'cancel'
      })

    let actionOption = null;

    try {
      actionOption = this.actionsOptions.find(ao => {
        return ao.who._id.toString() === player._id.toString() && ao.action === action;
      })
      if (actionOption) {
        actionOption.state = 'try'
        actionOption.onResolve = resolve
        actionOption.onReject = reject
      }
    } catch (e) {
      console.warn(actionOption);
    }


  }

  cancel(player: PlayerState) {
    this.actionsOptions.filter(ao => ao.who._id.toString() === player._id.toString())
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
    const oas = this.actionsOptions.filter(ao => ao.who._id.toString() === player._id.toString() && ao.state === 'waiting')

    if (oas.length === 0) {
      return null
    }

    const message = {}
    oas.forEach(ao => {
      message[ao.action] = true

      if (ao.action === 'chi') {
        message['chiCombol'] = ao.option
      }

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
  lastHuCard: number = null

  // 胡牌类型
  cardTypes: {
    cardId: any;
    cardName: any;
    multiple: number;
  }

  // 判断是否打牌
  isGameDa: boolean = false;

  // 庄家打出的首张牌信息
  zhuangFirstCard: {
    state: boolean;
    card: number;
  }

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
    this.isGameDa = false;
    this.zhuangFirstCard = {
      state: false,
      card: 0
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
      return ;
    }

    let cardIndex = count;
    let card = this.cards[cardIndex];
    if (cardIndex === 0 && player) {
      player.takeLastCard = true
    }

    const pengIndex = await this.getPlayerPengCards(player);
    if (pengIndex && Math.random() < 0.2) {
      const moIndex = this.cards.findIndex(card => card === pengIndex);
      if (moIndex !== -1) {
        cardIndex = moIndex;
        card = this.cards[moIndex];
      }
    }

    const duiIndex = await this.getPlayerDuiCards(player);
    if (duiIndex && Math.random() < 0.2) {
      const moIndex = this.cards.findIndex(card => card === duiIndex);
      if (moIndex !== -1) {
        cardIndex = moIndex;
        card = this.cards[moIndex];
      }
    }

    this.cards.splice(cardIndex, 1);
    this.lastTakeCard = card;

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

  async consumeShunOrKeCard(cardNumber?, cardType?) {
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

    if (cardType === 1) {
      const result = Object.keys(counter).filter(num => counter[num] >= cardNumber);
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
    }

    if (cardType === 2) {
      const result = Object.keys(counter).filter(num => counter[num] >= 1 && counter[Number(num) + 1] >= 1 && counter[Number(num) + 2] >= 1);
      const randomNumber = Math.floor(Math.random() * result.length);

      for (let i = 0; i < cardNumber; i++) {
        const index = this.cards.findIndex(card => card === Number(result[randomNumber]) + i);

        if (index !== -1) {
          const card = this.cards[index];
          cards.push(card);
          this.cards.splice(index, 1);
          this.lastTakeCard = card;
        }
      }
    }

    return cards;
  }

  async takeDominateCards(player) {
    let cards = []

    // 生成一个刻子或者顺子
    const cardType = algorithm.randomBySeed() < 0.3 ? 1 : 2;
    const consumeCards = await this.consumeShunOrKeCard(3, cardType);
    cards = [...cards, ...consumeCards];

    // 生成一个对子或者一个两顺
    const cardType1 = algorithm.randomBySeed() < 0.3 ? 1 : 2;
    const consumeCards1 = await this.consumeShunOrKeCard(2, cardType1);
    cards = [...cards, ...consumeCards1];

    // 生成两个单张
    for (let i = 0; i < 2; i++) {
      const consumeCard2 = await this.consumeCard(player);
      cards.push(consumeCard2);
    }

    return cards;
  }

  async start(payload) {
    await this.fapai(payload);
  }

  async fapai(payload) {
    this.shuffle()
    this.sleepTime = 1500;
    this.caishen = [Enums.slotNoCard];
    const restCards = this.remainCards - (this.rule.playerCount * 7);

    let zhuangIndex = 0;
    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      const p = this.players[i];
      const cards13 = await this.takeDominateCards(p);

      if (p.zhuang) {
        zhuangIndex = i;
      }

      p.onShuffle(restCards, this.caishen, this.restJushu, cards13, i, this.room.game.juIndex, false, zhuangIndex);
    }

    const nextDo = async () => {
      const nextCard = await this.consumeCard(this.zhuang);
      this.zhuang.cards[nextCard]++;
      this.cardTypes = await this.getCardTypes(this.zhuang, 1);
      this.zhuang.cards[nextCard]--;
      const msg = this.zhuang.takeCard(this.turn, nextCard, false, false,
        {
          id: this.cardTypes.cardId,
          multiple: await this.getRoomMultiple(this.zhuang)
        })

      const index = this.atIndex(this.zhuang);
      this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard}}, this.zhuang.msgDispatcher)
      this.state = stateWaitDa
      this.stateData = {msg, da: this.zhuang, card: nextCard}
    }

    if (this.sleepTime === 0) {
      await nextDo()
    } else {
      setTimeout(nextDo, this.sleepTime)
    }
  }

  async getRoomMultiple(player) {
    if (this.room.isPublic) {
      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
      return this.cardTypes.multiple * conf.base * conf.Ante * player.openCardScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.openCardScore;
    }

    return this.cardTypes.multiple;
  }

  async getRoomMultipleScore(player) {
    if (this.room.isPublic) {
      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
      return conf.base * conf.Ante * this.cardTypes.multiple * player.openCardScore * 10 > conf.maxGold ? conf.maxGold : conf.base * this.cardTypes.multiple * conf.Ante * player.openCardScore * 10;
    }

    return this.cardTypes.multiple;
  }

  async getCardTypes(player, type, dianPaoPlayer = null) {
    return await this.getCardTypesByHu(player, type, dianPaoPlayer);
  }

  async getCardTypesByHu(player, type = 1, dianPaoPlayer) {
    const cardTypes = await CardTypeModel.find({gameType: GameType.guobiao});
    let cardType = {...cardTypes[0]}; // 创建一个新的对象，其属性与cardTypes[0]相同
    cardType.multiple = type === 1 ? 2 : 1;
    cardType.cardId = -1;
    cardType.cardName = "平胡";

    for (let i = 0; i < cardTypes.length; i++) {
      // 绝张(牌河中已出现过多枚，胡牌时仅剩当前胡牌张的和牌)
      if (cardTypes[i].cardId === 92) {
        const status = await this.checkJueZhang(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 妙手回春(剩余牌张数位0的自摸)
      if (cardTypes[i].cardId === 93 && type === 1) {
        const status = await this.checkMiaoShouHuiChun(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 海底捞月(剩余牌张数位0的胡其他家点炮的牌)
      if (cardTypes[i].cardId === 94 && type === 2) {
        const status = await this.checkHaiDiLaoYue(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 杠上开花(用开杠后的补牌胡牌)
      if (cardTypes[i].cardId === 95 && type === 1) {
        const status = await this.checkGangShangHua(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 双同刻(含有两种花色的同一序数牌刻(杠)的和牌)
      if (cardTypes[i].cardId === 96) {
        const status = await this.checkShuangTongKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 三花聚顶(含有三张花牌的和牌)
      if (cardTypes[i].cardId === 97) {
        const status = await this.checkSanHuaJuDing(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 不求人(没有碰和明杠的自摸胡)
      if (cardTypes[i].cardId === 98 && type === 1) {
        const status = await this.checkBuQiuRen(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 断幺九(仅由序数牌2到8组成的和牌)
      if (cardTypes[i].cardId === 99) {
        const status = await this.checkDuanYaoJiu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 四季发财(含有春夏秋冬四张花牌的和牌)
      if (cardTypes[i].cardId === 100) {
        const status = await this.checkSiJiFaCai(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 推不倒(仅由1234589筒和245689条组成的和牌)
      if (cardTypes[i].cardId === 101) {
        const status = await this.checkTuiBuDao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 清一色(仅由同一种花色序数牌组成的和牌)
      if (cardTypes[i].cardId === 102) {
        const status = await this.checkQingYiSe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 五福临门(含有三张花牌的和牌)
      if (cardTypes[i].cardId === 103) {
        const status = await this.checkWuFuLinMen(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 双暗刻
      if (cardTypes[i].cardId === 104) {
        const status = await this.checkShuangAnKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 素胡
      if (cardTypes[i].cardId === 105) {
        const status = await this.checkSuHu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 大于五(仅由序数牌6789组成的和牌)
      if (cardTypes[i].cardId === 106) {
        const status = await this.checkDaYuWu(player, type);
        if (status && cardTypes[i].multiple > cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 小于五(仅由序数牌12345组成的和牌)
      if (cardTypes[i].cardId === 107) {
        const status = await this.checkXiaoYuWu(player, type);
        if (status && cardTypes[i].multiple > cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 混一色(仅由字牌+单一花色序数牌组成的和牌)
      if (cardTypes[i].cardId === 108) {
        const status = await this.checkHunYiSe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 三同刻(含有三种花色的同一序数牌刻(杠)的和牌)
      if (cardTypes[i].cardId === 109) {
        const status = await this.checkSanTongKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 七对(由7个对子组成的特殊和牌型)
      if (cardTypes[i].cardId === 110) {
        const status = await this.checkQiDui(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 对对胡(由4组刻(杠)加一对将组成的和牌)
      if (cardTypes[i].cardId === 111) {
        const status = await this.checkDuiDuiHu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全单刻(仅由序数牌13579组成的对对胡)
      if (cardTypes[i].cardId === 112) {
        const status = await this.checkQuanDanKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全双刻(仅由序数牌2468组成的对对胡)
      if (cardTypes[i].cardId === 113) {
        const status = await this.checkQuanShuangKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 混单刻(仅由字牌+序数牌13579组成的对对胡)
      if (cardTypes[i].cardId === 114) {
        const status = await this.checkHunDanKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 混双刻(仅由字牌+序数牌2468组成的对对胡)
      if (cardTypes[i].cardId === 115) {
        const status = await this.checkHunShuangKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 一色三节高(含有同一花色中3组序数相连刻(杠)的和牌)
      if (cardTypes[i].cardId === 116) {
        const status = await this.checkSanJieGao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 十二金钗
      if (cardTypes[i].cardId === 117) {
        const status = await this.checkShiErJinChai(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 三暗刻
      if (cardTypes[i].cardId === 118) {
        const status = await this.checkSanAnKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 一色四节高(含有同一花色中4组序数相连刻(杠)的和牌)
      if (cardTypes[i].cardId === 119) {
        const status = await this.checkSiJieGao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 地和(庄家打出的第一张牌被接炮)
      if (cardTypes[i].cardId === 120 && !player.zhuang && type === 2) {
        const status = await this.checkDiHu(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 小三元(包含箭牌（中、发、白）的两副刻子（杠），同时另一种箭牌作为将牌)
      if (cardTypes[i].cardId === 121) {
        const status = await this.checkXiaoSanYuan(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 沧海独钓(十八罗汉后胡剩余最后一张的牌)
      if (cardTypes[i].cardId === 122) {
        const status = await this.checkCangHaiDuDiao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 小四喜(和牌时手牌中需要包含风牌（东、南、西、北）的三副刻（杠），而第四种风牌则作为将牌。)
      if (cardTypes[i].cardId === 123) {
        const status = await this.checkXiaoSiXi(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全大
      if (cardTypes[i].cardId === 124) {
        const status = await this.checkHunDa(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全中
      if (cardTypes[i].cardId === 125) {
        const status = await this.checkHunZhong(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 全小
      if (cardTypes[i].cardId === 126) {
        const status = await this.checkHunXiao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 天和
      if (cardTypes[i].cardId === 127 && type === 1) {
        const status = await this.checkTianHu(player);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 两色三节高(含有2种花色中3组序数相连刻(杠)的和牌)
      if (cardTypes[i].cardId === 128) {
        const status = await this.checkLiangSeSanJieGao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 四暗刻(含有4组暗刻(暗杠)的和牌)
      if (cardTypes[i].cardId === 129) {
        const status = await this.checkSiAnKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 字一色(仅由字牌组成的和牌)
      if (cardTypes[i].cardId === 130) {
        const status = await this.checkZiYiSe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 五门齐(和牌时手牌包含五种不同的花色，即筒、条、万、风牌（东、南、西、北）和箭牌（中、发、白）)
      if (cardTypes[i].cardId === 131) {
        const status = await this.checkWuMenQi(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 三色三节高(含有3种花色中3组序数相连刻(杠)的和牌)
      if (cardTypes[i].cardId === 132) {
        const status = await this.checkSanSeSanJieGao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 二色四节高(含有2种花色中4组序数相连刻(杠)的和牌)
      if (cardTypes[i].cardId === 133) {
        const status = await this.checkLiangSeSiJieGao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 十八罗汉(含有4组杠的和牌)
      if (cardTypes[i].cardId === 134) {
        const status = await this.checkShiBaLuoHan(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple)
          cardType = cardTypes[i];
      }

      // 三色四节高(含有3种花色中4组序数相连刻(杠)的和牌)
      if (cardTypes[i].cardId === 135) {
        const status = await this.checkSanSeSiJieGao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 绿一色(仅由23468条组成的和牌，若无发，可记清一色)
      if (cardTypes[i].cardId === 136) {
        const status = await this.checkLvYiSe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 三风刻(含有风牌(东，南，西，北)3组刻(杠)的和牌)
      if (cardTypes[i].cardId === 137) {
        const status = await this.checkSanFengKe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 九五至尊(由红中+风牌+5筒+9筒组成的和牌)
      if (cardTypes[i].cardId === 138) {
        const status = await this.checkJiuWuZhiZun(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 天降鸿福(由白板+1579条组成的和牌)
      if (cardTypes[i].cardId === 139) {
        const status = await this.checkTianJiangHongFu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 混三节(由三节高+字牌组成的和牌)
      if (cardTypes[i].cardId === 140) {
        const status = await this.checkHunSanJie(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 清老头(仅由序数牌1和9组成的和牌)
      if (cardTypes[i].cardId === 141) {
        const status = await this.checkQingLaoTou(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 大三元(包含箭牌（中、发、白）的三副刻子（杠）)
      if (cardTypes[i].cardId === 142) {
        const status = await this.checkDaSanYuan(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 大四喜(和牌时手牌中需要包含风牌（东、南、西、北）的四副刻（杠）)
      if (cardTypes[i].cardId === 143) {
        const status = await this.checkDaSiXi(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 百花齐放(由白板+序数牌点数>=100点组成的和牌)
      if (cardTypes[i].cardId === 144) {
        const status = await this.checkBaiHuaQiFang(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 东成西就(由东西风+序数牌13579组成的和牌)
      if (cardTypes[i].cardId === 145) {
        const status = await this.checkDongChengXiJiu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 北雁南飞(由南北风+序数牌2468组成的和牌)
      if (cardTypes[i].cardId === 146) {
        const status = await this.checkBeiYanNanFei(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 紫气东来(由东风+1筒+序数牌1234组成的和牌)
      if (cardTypes[i].cardId === 147) {
        const status = await this.checkZiQiDongLai(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 意气风发(由发财+一组风牌+序数牌6789组成的和牌)
      if (cardTypes[i].cardId === 148) {
        const status = await this.checkYiQiFengFa(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 西北望乡(由西北风+序数牌789组成的和牌)
      if (cardTypes[i].cardId === 149) {
        const status = await this.checkXiBeiWangXiang(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 风中烛影(由红中+风牌+序数牌248筒组成的和牌)
      if (cardTypes[i].cardId === 150) {
        const status = await this.checkFengZhongZhuYing(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 十三太保(由1,9万+1,9筒+1,9条+东，南，西，北，中，发，白组成的和牌)
      if (cardTypes[i].cardId === 151) {
        const status = await this.checkShiSanTaiBao(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 东南见月(由东南风+1筒+序数牌456组成的和牌)
      if (cardTypes[i].cardId === 152) {
        const status = await this.checkDongNanJianYue(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 七星连珠(由同一花色的序数牌组成序数相连的7个对子的和牌)
      if (cardTypes[i].cardId === 153) {
        const status = await this.checkQiXingLianZhu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }
    }

    return cardType;
  }

  async checkQiXingLianZhu(player, type) {
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
        let zhongCount = 0;
        let state = true;
        for (let z = Enums.spring; z <= Enums.ju; z++) {
          zhongCount += cards[z];
        }
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

  async checkDongNanJianYue(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.dong, Enums.nan, Enums.tongzi1, Enums.wanzi4, Enums.wanzi5, Enums.wanzi6, Enums.shuzi4,
      Enums.shuzi5, Enums.shuzi6, Enums.tongzi4, Enums.tongzi5, Enums.tongzi6];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let dongCount = 0;
    let nanCount = 0;
    let tongCount = 0;
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

      if (gangList[i] === Enums.dong) {
        dongCount++;
      }

      if (gangList[i] === Enums.nan) {
        nanCount++;
      }

      if (gangList[i] === Enums.tongzi1) {
        tongCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.dong) {
        dongCount++;
      }

      if (cards[i] > 0 && i === Enums.nan) {
        nanCount++;
      }

      if (cards[i] > 0 && i === Enums.tongzi1) {
        tongCount++;
      }
    }

    return flag && dongCount && nanCount && tongCount && (isZiMo || isJiePao);
  }

  async checkShiSanTaiBao(player, type) {
    const cardList = [Enums.wanzi1, Enums.wanzi9, Enums.shuzi1, Enums.shuzi9, Enums.tongzi1, Enums.tongzi9,
      Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai];
    const cardCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i <= cardList.length; i++) {
      if (cards[cardList[i]] > 0) {
        cardCount[i] += cards[cardList[i]];
      }
    }

    for (let i = 0; i <= cardCount.length; i++) {
      if (cardCount[i] !== 1) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkXiBeiWangXiang(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.xi, Enums.bei, Enums.wanzi7, Enums.wanzi8, Enums.wanzi9, Enums.shuzi7,
      Enums.shuzi8, Enums.shuzi9, Enums.tongzi7, Enums.tongzi8, Enums.tongzi9];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let xiCount = 0;
    let beiCount = 0;
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

      if (gangList[i] === Enums.xi) {
        xiCount++;
      }

      if (gangList[i] === Enums.bei) {
        beiCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.xi) {
        xiCount++;
      }

      if (cards[i] > 0 && i === Enums.bei) {
        beiCount++;
      }
    }

    return flag && xiCount && beiCount && (isZiMo || isJiePao);
  }

  async checkFengZhongZhuYing(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.zhong, Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.wanzi2, Enums.wanzi4, Enums.wanzi8, Enums.shuzi2,
      Enums.shuzi4, Enums.shuzi8, Enums.tongzi2, Enums.tongzi4, Enums.tongzi8];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let zhongCount = 0;
    let fengCount = 0;
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

      if (gangList[i] === Enums.zhong) {
        zhongCount++;
      }

      if ([Enums.dong, Enums.xi, Enums.nan, Enums.bei].includes(gangList[i])) {
        fengCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.zhong) {
        zhongCount++;
      }

      if (cards[i] > 0 && [Enums.dong, Enums.xi, Enums.nan, Enums.bei].includes(i)) {
        fengCount++;
      }
    }

    return flag && zhongCount && fengCount && (isZiMo || isJiePao);
  }

  async checkYiQiFengFa(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.fa, Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.tongzi6, Enums.tongzi7,
      Enums.tongzi8, Enums.tongzi9, Enums.shuzi6, Enums.shuzi7, Enums.shuzi8, Enums.shuzi9, Enums.wanzi6, Enums.wanzi7, Enums.wanzi8, Enums.wanzi9];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let faCount = 0;
    let dongCount = 0;
    let xiCount = 0;
    let nanCount = 0;
    let beiCount = 0;
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
      if (gangList[i] === Enums.fa) {
        faCount++;
      }

      if (gangList[i] === Enums.dong) {
        dongCount++;
      }

      if (gangList[i] === Enums.xi) {
        xiCount++;
      }

      if (gangList[i] === Enums.nan) {
        nanCount++;
      }

      if (gangList[i] === Enums.bei) {
        beiCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.fa) {
        faCount++;
      }

      if (cards[i] > 0 && i === Enums.dong) {
        dongCount++;
      }

      if (cards[i] > 0 && i === Enums.xi) {
        xiCount++;
      }

      if (cards[i] > 0 && i === Enums.nan) {
        nanCount++;
      }

      if (cards[i] > 0 && i === Enums.bei) {
        beiCount++;
      }
    }

    return flag && faCount && (dongCount + xiCount + nanCount + beiCount === 1) && (isZiMo || isJiePao);
  }

  async checkZiQiDongLai(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.dong, Enums.wanzi1, Enums.wanzi2, Enums.wanzi3, Enums.wanzi4, Enums.tongzi1, Enums.tongzi2,
      Enums.tongzi3, Enums.tongzi4, Enums.shuzi1, Enums.shuzi2, Enums.shuzi3, Enums.shuzi4];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let dongCount = 0;
    let tongCount = 0;
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
      if (gangList[i] === Enums.dong) {
        dongCount++;
      }

      if (gangList[i] === Enums.tongzi1) {
        tongCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.dong) {
        dongCount++;
      }

      if (cards[i] > 0 && i === Enums.tongzi1) {
        tongCount++;
      }
    }

    return flag && dongCount && tongCount && (isZiMo || isJiePao);
  }

  async checkBeiYanNanFei(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.nan, Enums.bei, Enums.wanzi2, Enums.wanzi4, Enums.wanzi6, Enums.wanzi8, Enums.shuzi2,
      Enums.shuzi4, Enums.shuzi6, Enums.shuzi8, Enums.tongzi2, Enums.tongzi4, Enums.tongzi6, Enums.tongzi8];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let nanCount = 0;
    let beiCount = 0;
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

      if (gangList[i] === Enums.nan) {
        nanCount++;
      }

      if (gangList[i] === Enums.bei) {
        beiCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.nan) {
        nanCount++;
      }

      if (cards[i] > 0 && i === Enums.bei) {
        beiCount++;
      }
    }

    return flag && nanCount && beiCount && (isZiMo || isJiePao);
  }

  async checkDongChengXiJiu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.dong, Enums.xi, Enums.wanzi1, Enums.wanzi3, Enums.wanzi5, Enums.wanzi7, Enums.wanzi9, Enums.shuzi1,
      Enums.shuzi3, Enums.shuzi5, Enums.shuzi7, Enums.shuzi9, Enums.tongzi1, Enums.tongzi3, Enums.tongzi5, Enums.tongzi7, Enums.tongzi9];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let dongCount = 0;
    let xiCount = 0;
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

      if (gangList[i] === Enums.dong) {
        dongCount++;
      }

      if (gangList[i] === Enums.xi) {
        xiCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.dong) {
        dongCount++;
      }

      if (cards[i] > 0 && i === Enums.xi) {
        xiCount++;
      }
    }

    return flag && dongCount && xiCount && (isZiMo || isJiePao);
  }

  async checkBaiHuaQiFang(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa];
    let gangList = [...anGang, ...jieGang];
    let numberCount = 0;
    let baiCount = 0;
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (cardList.includes(gangList[i])) {
        flag = false;
      }

      if (gangList[i] === Enums.bai) {
        baiCount++;
      }

      if (gangList[i] <= Enums.tongzi9) {
        numberCount += 4 * (gangList[i] % 10);
      }
    }

    for (let i = 0; i < peng.length; i++) {
      if (cardList.includes(peng[i])) {
        flag = false;
      }

      if (peng[i] <= Enums.tongzi9) {
        numberCount += 3 * (peng[i] % 10);
      }

      if (peng[i] === Enums.bai) {
        baiCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i <= Enums.tongzi9) {
        numberCount += i % 10;
      }

      if (cards[i] > 0 && i === Enums.bai) {
        baiCount++;
      }
    }

    return flag && numberCount >= 100 && baiCount && (isZiMo || isJiePao);
  }

  async checkDaSiXi(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    let keCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let gangZi = [];
    let keZi = [];
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
      if (huResult.huCards.KeZi) {
        keZi = huResult.huCards.KeZi;
        gangList = [...gangList, ...keZi];
      }
    }

    for (let i = Enums.dong; i <= Enums.bei; i++) {
      if (gangList.includes(i)) {
        keCount++;
      }
    }

    return keCount === 4 && (isZiMo || isJiePao);
  }

  async checkDaSanYuan(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    let keCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let gangZi = [];
    let keZi = [];
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
      if (huResult.huCards.KeZi) {
        keZi = huResult.huCards.KeZi;
        gangList = [...gangList, ...keZi];
      }
    }

    for (let i = Enums.zhong; i <= Enums.bai; i++) {
      if (gangList.includes(i)) {
        keCount++;
      }
    }

    return keCount === 3 && (isZiMo || isJiePao);
  }

  async checkQingLaoTou(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const cardList = [Enums.wanzi1, Enums.wanzi9, Enums.shuzi1, Enums.shuzi9, Enums.tongzi1, Enums.tongzi9];
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

  async checkTianJiangHongFu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.bai, Enums.shuzi1, Enums.shuzi5, Enums.shuzi7, Enums.shuzi9];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let baiCount = 0;
    let tiaoCount = 0;
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

      if (gangList[i] === Enums.bai) {
        baiCount++;
      }

      if ([Enums.shuzi1, Enums.shuzi5, Enums.shuzi7, Enums.shuzi9].includes(gangList[i])) {
        tiaoCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.bai) {
        baiCount++;
      }

      if (cards[i] > 0 && [Enums.shuzi1, Enums.shuzi5, Enums.shuzi7, Enums.shuzi9].includes(i)) {
        tiaoCount++;
      }
    }

    return flag && baiCount && tiaoCount && (isZiMo || isJiePao);
  }

  async checkJiuWuZhiZun(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.tongzi5, Enums.tongzi9, Enums.zhong, Enums.dong, Enums.xi, Enums.nan, Enums.bei];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let zhongCount = 0;
    let fengCount = 0;
    let tong9Count = 0;
    let tong5Count = 0;
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

      if (gangList[i] === Enums.zhong) {
        zhongCount++;
      }

      if (gangList[i] === Enums.tongzi5) {
        tong5Count++;
      }

      if (gangList[i] === Enums.tongzi9) {
        tong9Count++;
      }

      if ([Enums.dong, Enums.xi, Enums.nan, Enums.bei].includes(gangList[i])) {
        fengCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }

      if (cards[i] > 0 && i === Enums.zhong) {
        zhongCount++;
      }

      if (cards[i] > 0 && i === Enums.tongzi5) {
        tong5Count++;
      }

      if (cards[i] > 0 && i === Enums.tongzi9) {
        tong9Count++;
      }

      if (cards[i] > 0 && [Enums.dong, Enums.xi, Enums.nan, Enums.bei].includes(i)) {
        fengCount++;
      }
    }

    return flag && zhongCount && tong9Count && tong5Count && fengCount && (isZiMo || isJiePao);
  }

  async checkLvYiSe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const cardList = [Enums.shuzi2, Enums.shuzi3, Enums.shuzi4, Enums.shuzi6, Enums.shuzi8, Enums.fa];
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

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && !cardList.includes(i)) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
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

    // 杠牌如果有小于五的序数牌或者拥有字牌
    for (let i = 0; i < gangList.length; i++) {
      if ((gangList[i] <= Enums.tongzi9 && gangList[i] % 10 <= 5) || (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai)) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if ((cards[i] > 0 && i <= Enums.tongzi9 && i % 10 <= 5) || (cards[i] > 0 && i >= Enums.dong && i <= Enums.bai)) {
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
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    // 杠牌如果有小于五的序数牌或者拥有字牌
    for (let i = 0; i < gangList.length; i++) {
      if ((gangList[i] <= Enums.tongzi9 && gangList[i] % 10 > 5) || (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai)) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if ((cards[i] > 0 && i <= Enums.tongzi9 && i % 10 > 5) || (cards[i] > 0 && i >= Enums.dong && i <= Enums.bai)) {
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
    let ziCount = 0;
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

      if (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai) {
        ziCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && i <= Enums.wanzi9) {
        wanCount++;
      }

      if (cards[i] > 0 && i >= Enums.shuzi1 && i <= Enums.shuzi9) {
        shuCount++;
      }

      if (cards[i] > 0 && i >= Enums.tongzi1 && i <= Enums.tongzi9) {
        tongCount++;
      }

      if (cards[i] > 0 && cards[i] >= Enums.dong && cards[i] <= Enums.bai) {
        ziCount++;
      }
    }

    if (((wanCount === 0 && shuCount === 0) || (wanCount === 0 && tongCount === 0) || (shuCount === 0 && tongCount === 0)) && ziCount === 0) {
      flag = true;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkHunYiSe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const cards = player.cards.slice();
    let wanCount = 0;
    let shuCount = 0;
    let tongCount = 0;
    let ziCount = 0;
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

      if (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai) {
        ziCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && i <= Enums.wanzi9) {
        wanCount++;
      }

      if (cards[i] > 0 && i >= Enums.shuzi1 && i <= Enums.shuzi9) {
        shuCount++;
      }

      if (cards[i] > 0 && i >= Enums.tongzi1 && i <= Enums.tongzi9) {
        tongCount++;
      }

      if (cards[i] > 0 && cards[i] >= Enums.dong && cards[i] <= Enums.bai) {
        ziCount++;
      }
    }

    if (((wanCount === 0 && shuCount === 0) || (wanCount === 0 && tongCount === 0) || (shuCount === 0 && tongCount === 0)) && ziCount > 0) {
      flag = true;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkZiYiSe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < Enums.dong) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (player.cards[i] > 0) {
        flag = false;
      }
    }

    if (isJiePao && this.lastHuCard <= Enums.tongzi9) {
      flag = false;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkWuMenQi(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = true;
    let wanCount = 0;
    let tiaoCount = 0;
    let tongCount = 0;
    let fengCount = 0;
    let jianCount = 0;
    const cards = player.cards.slice();
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < Enums.wanzi9) {
        wanCount++;
      }

      if (gangList[i] >= Enums.shuzi1 && gangList[i] <= Enums.shuzi9) {
        tiaoCount++;
      }

      if (gangList[i] >= Enums.tongzi1 && gangList[i] <= Enums.tongzi9) {
        tongCount++;
      }

      if (gangList[i] >= Enums.dong && gangList[i] <= Enums.bei) {
        fengCount++;
      }

      if (gangList[i] >= Enums.zhong && gangList[i] <= Enums.bai) {
        jianCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && i < Enums.wanzi9) {
        wanCount++;
      }

      if (cards[i] > 0 && i >= Enums.shuzi1 && i <= Enums.shuzi9) {
        tiaoCount++;
      }

      if (cards[i] > 0 && i >= Enums.tongzi1 && i <= Enums.tongzi9) {
        tongCount++;
      }

      if (cards[i] > 0 && i >= Enums.dong && i <= Enums.bei) {
        fengCount++;
      }

      if (cards[i] > 0 && i >= Enums.zhong && i <= Enums.bai) {
        jianCount++;
      }
    }

    return wanCount && tiaoCount && tongCount && fengCount && jianCount && (isZiMo || isJiePao);
  }

  async checkTianHu(player) {
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    return !player.isGameDa && player.zhuang && isZiMo;
  }

  async checkDiHu(player) {
    let isJiePao = this.lastDa && player.jiePao(this.zhuangFirstCard.card, this.turn === 2, this.remainCards === 0, this.lastDa);
    const state = this.zhuangFirstCard.state;
    this.zhuangFirstCard.state = false;
    return !player.isGameDa && !player.zhuang && state && isJiePao;
  }

  async checkCangHaiDuDiao(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    let cardCount = 0;
    for (let i = Enums.wanzi1; i <= Enums.ju; i++) {
      if (player.cards[i] > 0) {
        cardCount += player.cards[i];
      }
    }
    return cardCount === 1 && (isZiMo || isJiePao);
  }

  async checkSiAnKe(player, type) {
    const anGang = player.events["anGang"] || [];
    let anGangCount = anGang.length;
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
      if ((gangList[i] <= Enums.tongzi9 && gangList[i] % 2 === 1) || (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai)) {
        flag = false;
      }
    }

    for (let i = 0; i <= Enums.bai; i++) {
      if (cards[i] > 0 && ((i <= Enums.tongzi9 && i % 2 === 1) || i >= Enums.dong)) {
        flag = false;
      }
    }

    return flag && gangList.length === 4 && (isZiMo || isJiePao);
  }

  async checkQuanDanKe(player, type) {
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
      if ((gangList[i] <= Enums.tongzi9 && gangList[i] % 2 === 0) || (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai)) {
        flag = false;
      }
    }

    for (let i = 0; i <= Enums.bai; i++) {
      if (cards[i] > 0 && ((i <= Enums.tongzi9 && i % 2 === 0) || i >= Enums.dong)) {
        flag = false;
      }
    }

    return flag && gangList.length === 4 && (isZiMo || isJiePao);
  }

  async checkHunDanKe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = false;
    let ziFlag = true;

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
      if (gangList[i] <= Enums.tongzi9 && gangList[i] % 2 === 0) {
        flag = false;
      }

      if (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai) {
        ziFlag = true;
      }
    }

    for (let i = 0; i <= Enums.bai; i++) {
      if (cards[i] > 0 && i <= Enums.tongzi9 && i % 2 === 0) {
        flag = false;
      }

      if (cards[i] > 0 && i >= Enums.dong) {
        ziFlag = true;
      }
    }

    return flag && ziFlag && gangList.length === 4 && (isZiMo || isJiePao);
  }

  async checkHunShuangKe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = false;
    let ziFlag = true;

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
      if (gangList[i] <= Enums.tongzi9 && gangList[i] % 2 === 0) {
        flag = false;
      }

      if (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai) {
        ziFlag = true;
      }
    }

    for (let i = 0; i <= Enums.bai; i++) {
      if (cards[i] > 0 && i <= Enums.tongzi9 && i % 2 === 0) {
        flag = false;
      }

      if (cards[i] > 0 && i >= Enums.dong) {
        ziFlag = true;
      }
    }

    return flag && ziFlag && gangList.length === 4 && (isZiMo || isJiePao);
  }

  async checkSiJieGao(player, type) {
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

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
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
        anGangCount += keZi.length;
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        anGangCount += gangZi.length;
      }
    }

    return anGangCount >= 3 && (isZiMo || isJiePao);
  }

  async checkSuHu(player, type) {
    let flag = true;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }
    for (let i = Enums.spring; i <= Enums.ju; i++) {
      if (cards[i] > 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
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
      if ((gangList[i] <= Enums.tongzi9 && gangList[i] % 10 < 7) || (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai)) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && ((i <= Enums.tongzi9 && i % 10 < 7) || (i >= Enums.dong && i <= Enums.bai))) {
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
      if ((gangList[i] <= Enums.tongzi9 && (gangList[i] % 10 < 4 || gangList[i] % 10 > 6)) || (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai)) {
        flag = false;
        break;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && ((i <= Enums.tongzi9 && (i % 10 < 4 || i % 10 > 6)) || (i >= Enums.dong && i <= Enums.bai))) {
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
      if ((gangList[i] <= Enums.tongzi9 && gangList[i] % 10 > 3) || (gangList[i] >= Enums.dong && gangList[i] <= Enums.bai)) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
      if (cards[i] > 0 && ((i <= Enums.tongzi9 && i % 10 > 3) || (i >= Enums.dong && i <= Enums.bai))) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkSanSeSanJieGao(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();

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
        gangList = [...gangList, ...keZi];
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    gangList.sort((a, b) => a - b);
    let flag = false;

    for (let i = Enums.wanzi1; i <= Enums.wanzi7; i++) {
      if ((gangList.includes(i) || gangList.includes(i + 10) || gangList.includes(i + 20))
      && (gangList.includes(i + 1) || gangList.includes(i + 11) || gangList.includes(i + 21))
      && (gangList.includes(i + 2) || gangList.includes(i + 12) || gangList.includes(i + 22))) {
        flag = true;
      }
    }

    const cardList = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai];
    for (let i = 0; i < gangList.length; i++) {
      if (cardList.includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.dong; i <= Enums.bai; i++) {
      if (cards[i] > 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkSanSeSiJieGao(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();

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
        gangList = [...gangList, ...keZi];
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    gangList.sort((a, b) => a - b);
    let flag = false;

    for (let i = Enums.wanzi1; i <= Enums.wanzi6; i++) {
      if ((gangList.includes(i) || gangList.includes(i + 10) || gangList.includes(i + 20))
        && (gangList.includes(i + 1) || gangList.includes(i + 11) || gangList.includes(i + 21))
        && (gangList.includes(i + 2) || gangList.includes(i + 12) || gangList.includes(i + 22))
        && (gangList.includes(i + 3) || gangList.includes(i + 13) || gangList.includes(i + 23))) {
        flag = true;
      }
    }

    const cardList = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai];
    for (let i = 0; i < gangList.length; i++) {
      if (cardList.includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.dong; i <= Enums.bai; i++) {
      if (cards[i] > 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkLiangSeSanJieGao(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();

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
        gangList = [...gangList, ...keZi];
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    gangList.sort((a, b) => a - b);
    let flag = false;

    for (let i = Enums.wanzi1; i <= Enums.wanzi7; i++) {
      if ((gangList.includes(i) || gangList.includes(i + 10))
      && (gangList.includes(i + 1) || gangList.includes(i + 11))
      && (gangList.includes(i + 2) || gangList.includes(i + 12))) {
        flag = true;
      }
      if ((gangList.includes(i) || gangList.includes(i + 20))
        && (gangList.includes(i + 1) || gangList.includes(i + 21))
        && (gangList.includes(i + 2) || gangList.includes(i + 22))) {
        flag = true;
      }
      if ((gangList.includes(i + 10) || gangList.includes(i + 20))
        && (gangList.includes(i + 11) || gangList.includes(i + 21))
        && (gangList.includes(i + 12) || gangList.includes(i + 22))) {
        flag = true;
      }
    }

    const cardList = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai];
    for (let i = 0; i < gangList.length; i++) {
      if (cardList.includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.dong; i <= Enums.bai; i++) {
      if (cards[i] > 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkLiangSeSiJieGao(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();

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
        gangList = [...gangList, ...keZi];
      }

      if (huResult.huCards.gangZi) {
        gangZi = huResult.huCards.gangZi;
        gangList = [...gangList, ...gangZi];
      }
    }

    gangList.sort((a, b) => a - b);
    let flag = false;

    for (let i = Enums.wanzi1; i <= Enums.wanzi6; i++) {
      if ((gangList.includes(i) || gangList.includes(i + 10))
        && (gangList.includes(i + 1) || gangList.includes(i + 11))
        && (gangList.includes(i + 2) || gangList.includes(i + 12))
        && (gangList.includes(i + 3) || gangList.includes(i + 13))) {
        flag = true;
      }
      if ((gangList.includes(i) || gangList.includes(i + 20))
        && (gangList.includes(i + 1) || gangList.includes(i + 21))
        && (gangList.includes(i + 2) || gangList.includes(i + 22))
        && (gangList.includes(i + 3) || gangList.includes(i + 23))) {
        flag = true;
      }
      if ((gangList.includes(i + 10) || gangList.includes(i + 20))
        && (gangList.includes(i + 11) || gangList.includes(i + 21))
        && (gangList.includes(i + 12) || gangList.includes(i + 22))
        && (gangList.includes(i + 13) || gangList.includes(i + 23))) {
        flag = true;
      }
    }

    const cardList = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai];
    for (let i = 0; i < gangList.length; i++) {
      if (cardList.includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.dong; i <= Enums.bai; i++) {
      if (cards[i] > 0) {
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
    const cards = player.cards.slice();

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

    const cardList = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai];
    for (let i = 0; i < gangList.length; i++) {
      if (cardList.includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.dong; i <= Enums.bai; i++) {
      if (cards[i] > 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkHunSanJie(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    let ziCount = 0;

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

    const cardList = [Enums.dong, Enums.xi, Enums.nan, Enums.bei, Enums.zhong, Enums.fa, Enums.bai];
    for (let i = 0; i < gangList.length; i++) {
      if (cardList.includes(gangList[i])) {
        ziCount++;
      }
    }

    for (let i = Enums.dong; i <= Enums.bai; i++) {
      if (cards[i] > 0) {
        ziCount++;
      }
    }

    return flag && ziCount && (isZiMo || isJiePao);
  }

  async checkSanFengKe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    let fengCount = 0;
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

    for (let i = 0; i <= gangList.length; i++) {
      if ([Enums.dong, Enums.xi, Enums.nan, Enums.bei].includes(gangList[i])) {
        fengCount++;
      }
    }

    return fengCount === 3 && (isZiMo || isJiePao);
  }

  async checkShuangAnKe(player, type) {
    const anGang = player.events["anGang"] || [];
    let anGangCount = anGang.length;
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
      if ([1, 11, 9, 19].includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.shuzi9; i++) {
      if ([1, 11, 9, 19].includes(i) && cards[i] > 0) {
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
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
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
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
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

  async checkXiaoSanYuan(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    let jiangList = [];
    let keCount = 0;
    let jiangCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let gangZi = [];
    let keZi = [];
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
      if (huResult.huCards.KeZi) {
        keZi = huResult.huCards.KeZi;
        gangList = [...gangList, ...keZi];
      }
      if (huResult.huCards.useJiang) {
        jiangList = huResult.huCards.useJiang;
      }
    }

    for (let i = Enums.zhong; i <= Enums.bai; i++) {
      if (gangList.includes(i)) {
        keCount++;
      }

      if (jiangList.includes(i)) {
        jiangCount++;
      }
    }

    return keCount === 2 && jiangCount === 1 && (isZiMo || isJiePao);
  }

  async checkXiaoSiXi(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    let jiangList = [];
    let keCount = 0;
    let jiangCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let gangZi = [];
    let keZi = [];
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
      if (huResult.huCards.KeZi) {
        keZi = huResult.huCards.KeZi;
        gangList = [...gangList, ...keZi];
      }
      if (huResult.huCards.useJiang) {
        jiangList = huResult.huCards.useJiang;
      }
    }

    for (let i = Enums.dong; i <= Enums.bei; i++) {
      if (gangList.includes(i)) {
        keCount++;
      }

      if (jiangList.includes(i)) {
        jiangCount++;
      }
    }

    return keCount === 3 && jiangCount === 1 && (isZiMo || isJiePao);
  }

  async checkShuangTongKe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    let flag = false;
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

  async checkSanTongKe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...jieGang];
    let flag = false;
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

    for (let i = 0; i < gangList.length; i++) {
      const number = gangList[i] % 10;
      const t1 = gangList.includes(number);
      const t2 = gangList.includes(number + 10);
      const t3 = gangList.includes(number + 20);
      if (t1 && t2 && t3) {
        flag = true;
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

  async checkSanHuaJuDing(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let huaCount = 0;

    for (let i = Enums.spring; i <= Enums.ju; i++) {
      if (player.cards[i] > 0) {
        huaCount += player.cards[i];
      }
    }

    return huaCount === 3 && (isZiMo || isJiePao);
  }

  async checkWuFuLinMen(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let huaCount = 0;

    for (let i = Enums.spring; i <= Enums.ju; i++) {
      if (player.cards[i] > 0) {
        huaCount += player.cards[i];
      }
    }

    return huaCount === 5 && (isZiMo || isJiePao);
  }

  async checkSiJiFaCai(player, type) {
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let huaCount = 0;

    for (let i = Enums.spring; i <= Enums.winter; i++) {
      if (player.cards[i] > 0) {
        huaCount += player.cards[i];
      }
    }

    return huaCount === 3 && (isZiMo || isJiePao);
  }

  async checkDuiDuiHu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangCount = anGang.length + jieGang.length + peng.length;
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
    let cardCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

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

  async checkHaiDiLaoYue(player) {
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
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

  atIndex(player: PlayerState) {
    if (!player) {
      return
    }
    return this.players.findIndex(p => p._id.toString() === player._id.toString())
  }

  listenPlayer(player) {
    const index = this.atIndex(player);
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
        if (player.isRobot) {
          return ;
        }
        if (this.room.robotManager.model.step === RobotStep.waitRuby) {
          return;
        }

        const nextDo = async () => {
          if (msg) {
            const takenCard = msg.card;
            const todo = player.ai.onWaitForDa(msg, player.cards);

            if (todo === Enums.gang) {
              const gangCard = msg.gang[0][0];
              player.emitter.emit(Enums.gangBySelf, this.turn, gangCard);
            } else if (todo === Enums.hu) {
              player.emitter.emit(Enums.hu, this.turn, takenCard)
            } else {
              const card = this.promptWithPattern(player, this.lastTakeCard);
              player.emitter.emit(Enums.da, this.turn, card);
            }
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

        const nextDo = async () => {
          if (todo === Enums.chi) {
            player.emitter.emit(Enums.chi, this.turn, card, msg.data.chiCombol[0])
          } else if (todo === Enums.peng) {
            player.emitter.emit(Enums.peng, this.turn, card);
          } else if (todo === Enums.gang) {
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
    })

    player.on(Enums.da, async (turn, card) => {
      await this.onPlayerDa(player, turn, card);
    })

    player.on(Enums.startDeposit, async () => {
      if (!player.onDeposit) {
        player.onDeposit = true
        await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
      } else {
        await player.sendMessage('game/startDepositReply', {ok: false, data: {}})
      }
    })
    player.on(Enums.chi, async (msg) => {
      console.warn("msg-%s", JSON.stringify(msg));
      const cardList = msg.combol.filter(value => value !== msg.card);
      const otherCard1 = cardList[0]
      const otherCard2 = cardList[1]
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, this.turn, msg.card);
        return
      }
      if (this.stateData[Enums.chi] && this.stateData[Enums.chi]._id.toString() !== player._id.toString()) {
        player.emitter.emit(Enums.guo, this.turn, msg.card);
        return
      }

      this.actionResolver.requestAction(player, 'chi', async () => {
        const ok = await player.chiPai(msg.card, otherCard1, otherCard2, this.lastDa);
        if (ok) {
          this.turn++;
          this.state = stateWaitDa;

          const daCard = await this.promptWithPattern(player, null);
          this.stateData = {da: player, card: daCard};
          const gangSelection = player.getAvailableGangs();
          const from = this.atIndex(this.lastDa);

          player.sendMessage('game/chiReply', {ok: true, data: {
              turn: this.turn,
              card: msg.card,
              from,
              suit: msg.combol,
              gang: gangSelection.length > 0,
              gangSelection,
              forbidCards: player.forbidCards
            }});
          this.room.broadcast('game/oppoChi', {ok: true, data: {
              card: msg.card,
              turn: this.turn,
              from,
              index,
              suit: msg.combol,
            }}, player.msgDispatcher);
        } else {
          player.emitter.emit(Enums.guo, this.turn, msg.card);
        }
      }, () => {
        player.emitter.emit(Enums.guo, this.turn, msg.card);
      })

      await this.actionResolver.tryResolve()
    })
    player.on(Enums.peng, (turn, card) => {
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, turn, card);
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamStateInvaid});
        return
      }
      if (this.stateData.pengGang._id.toString() !== player._id.toString() || this.stateData.card !== card) {
        player.emitter.emit(Enums.guo, turn, card);
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamInvaid});
        return
      }

      this.actionResolver.requestAction(player, 'peng', () => {
        const ok = player.pengPai(card, this.lastDa);
        if (ok) {
          player.lastOperateType = 2;
          const hangUpList = this.stateData.hangUp;
          this.turn++;
          this.state = stateWaitDa;
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
          }, player.msgDispatcher);
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
      if (this.state !== stateWaitAction) {
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
        return;
      }
      if (this.stateData[Enums.gang]._id.toString() !== player.model._id.toString() || this.stateData.card !== card) {
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
        return
      }

      try {
        this.actionResolver.requestAction(
          player, 'gang',
          async () => {
            const ok = player.gangByPlayerDa(card, this.lastDa);
            if (ok) {
              player.lastOperateType = 3;
              this.turn++;
              player.onDeposit = !!(player.isGameHu && !player.onDeposit && player.zhuang);
              const from = this.atIndex(this.lastDa)
              const me = this.atIndex(player)
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

              const nextCard = await this.consumeCard(player);
              player.cards[nextCard]++;
              this.cardTypes = await this.getCardTypes(player, 1);
              player.cards[nextCard]--;

              const msg = player.gangTakeCard(this.turn, nextCard,
                {
                  id: this.cardTypes.cardId,
                  multiple: await this.getRoomMultiple(player)
                });
              if (msg) {
                this.room.broadcast('game/oppoTakeCard', {
                  ok: true,
                  data: {index, card: nextCard}
                }, player.msgDispatcher);
                this.state = stateWaitDa;
                this.stateData = {da: player, card: nextCard, msg};
              }
            } else {
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
      if (this.state !== stateWaitDa) {
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
      }
      if (this.stateData[Enums.da]._id.toString() !== player.model._id.toString()) {
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
      }

      const isAnGang = player.cards[card] >= 3
      gangIndex = this.atIndex(player);
      const from = gangIndex;
      this.turn++;

      const broadcastMsg = {turn: this.turn, card, index, isAnGang}
      const ok = player.gangBySelf(card, broadcastMsg, gangIndex);
      if (ok) {
        player.lastOperateType = 3;
        player.onDeposit = !!(player.isGameHu && !player.onDeposit && player.zhuang);
        player.sendMessage('game/gangReply', {
          ok: true,
          data: {card, from, gangIndex, type: isAnGang ? "anGang" : "buGang"}
        });

        await Player.update({_id: player._id}, {$inc: {gangCount: 1}});

        this.room.broadcast('game/oppoGangBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher);

        const nextCard = await this.consumeCard(player);

        player.cards[nextCard]++;
        this.cardTypes = await this.getCardTypes(player, 1);
        player.cards[nextCard]--;
        const msg = player.gangTakeCard(this.turn, nextCard,
          {
            id: this.cardTypes.cardId,
            multiple: await this.getRoomMultiple(player)
          });

        if (msg) {
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard}}, player.msgDispatcher);
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
      } else {
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangPriorityInsufficient});
      }
    })

    player.on(Enums.hu, async (turn, card) => {
      let from;
      const recordCard = this.stateData.card;
      const isJiePao = this.state === stateWaitAction &&
        recordCard === card && this.stateData[Enums.hu] &&
        this.stateData[Enums.hu].contains(player);
      const isZiMo = this.state === stateWaitDa && recordCard === card;

      if (isJiePao) {
        this.actionResolver.requestAction(player, 'hu', async () => {
            this.lastHuCard = card;
            this.cardTypes = await this.getCardTypes(player, 2, this.lastDa);
            const ok = player.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa);

            from = this.atIndex(this.lastDa);
            if (ok && player.daHuPai(card, this.players[from])) {
              player.lastOperateType = 4;
              player.isGameDa = true;
              this.lastDa = player;
              this.stateData = {};

              this.lastDa.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);

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

              const gameOverFunc = async () => {
                const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
                const nextZhuang = this.nextZhuang()
                await this.gameAllOver(states, [], nextZhuang);
              }

              const huReply = async () => {
                await player.sendMessage('game/huReply', {
                  ok: true,
                  data: {
                    card,
                    from,
                    turn,
                    type: "jiepao",
                    huType: {
                      id: this.cardTypes.cardId,
                      multiple: await this.getRoomMultiple(player)
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
                    huType: {id: this.cardTypes.cardId, multiple: await this.getRoomMultiple(player)}
                  }
                }, player.msgDispatcher);

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
        if (ok && player.daHuPai(card, null)) {
          this.lastDa = player;
          player.lastOperateType = 4;
          player.isGameDa = true;
          this.stateData = {};

          from = this.atIndex(this.lastDa);

          // 设置用户的状态为待摸牌
          player.waitMo = true;

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

          const gameOverFunc = async () => {
            const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
            const nextZhuang = this.nextZhuang()
            await this.gameAllOver(states, [], nextZhuang);
          }

          const huReply = async () => {
            await player.sendMessage('game/huReply', {
              ok: true,
              data: {
                card,
                from: this.atIndex(player),
                type: "zimo",
                turn,
                huType: {
                  id: this.cardTypes.cardId,
                  multiple: await this.getRoomMultiple(player)
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
                huType: {id: this.cardTypes.cardId, multiple: await this.getRoomMultiple(player)}
              }
            }, player.msgDispatcher);

            // 执行胡牌结算
            setTimeout(gameOverFunc, 200);
          }

          setTimeout(huReply, 1000);
        } else {
          player.cards[card]++;
          player.emitter.emit(Enums.da, this.turn, card);
        }
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

  async onPlayerDa(player, turn, card) {
    const index = this.players.indexOf(player);
    let from;

    if (this.state !== stateWaitDa) {
      player.sendMessage('game/daReply', {
        ok: false,
        info: TianleErrorCode.cardDaError,
        data: {
          index: this.atIndex(player),
          daIndex: this.atIndex(this.stateData[Enums.da]),
          card,
          turn,
          state: this.state
        }
      })
      return
    } else if (!this.stateData[Enums.da] || this.stateData[Enums.da]._id !== player._id) {
      player.sendMessage('game/daReply', {
        ok: false,
        info: TianleErrorCode.notDaRound,
        data: {
          index: this.atIndex(player),
          daIndex: this.atIndex(this.stateData[Enums.da]),
          card,
          turn,
          state: this.state
        }
      })
      return
    }

    const ok = player.daPai(card);
    if (!ok) {
      player.sendMessage('game/daReply', {
        ok: false,
        info: TianleErrorCode.notDaThisCard,
        data: {
          index: this.atIndex(player),
          daIndex: this.atIndex(this.stateData[Enums.da]),
          card,
          turn,
          state: this.state
        }
      });
      return;
    }

    this.lastDa = player;
    player.cancelTimeout();

    // 判断庄家是否打出首张牌
    if (!this.zhuangFirstCard.state && player.zhuang) {
      this.zhuangFirstCard = {
        state: true,
        card,
      }
    }

    if (ok) {
      if (!this.isGameDa) {
        this.isGameDa = true;
      }
      if (!player.isGameDa) {
        player.isGameDa = true;
      }

      player.lastOperateType === 3 ? player.isGangHouDa = true : player.isGangHouDa = false;
      player.lastOperateType = 1;
      this.stateData = {};

      await player.sendMessage('game/daReply', {ok: true, data: card});
      this.room.broadcast('game/oppoDa', {ok: true, data: {index, card}}, player.msgDispatcher);
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
          if (r.hu) {
            if (!check.hu || check.hu.length === 0) {
              check.hu = [];
            }

            check.hu.push(p);
            p.huInfo = r.check;
          }
        }
      }

      const xiajia = this.players[(index + 1) % this.players.length]
      check = xiajia.checkChi(card, check);

      const env = {card, from, turn: this.turn}
      this.actionResolver = new ActionResolver(env, async () => {
        const newCard = await this.consumeCard(xiajia);
        if (newCard) {
          xiajia.cards[newCard]++;
          this.cardTypes = await this.getCardTypes(xiajia, 1);
          xiajia.cards[newCard]--;
          const msg = xiajia.takeCard(this.turn, newCard, false, false,
            {
              id: this.cardTypes.cardId,
              multiple: await this.getRoomMultiple(xiajia)
            });

          if (!msg) {
            return;
          }

          this.state = stateWaitDa;
          this.stateData = {da: xiajia, card: newCard, msg};
          const sendMsg = {index: this.players.indexOf(xiajia), card: newCard};
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher);
        }
      });

      for (let j = 1; j < this.players.length; j++) {
        const i = (index + j) % this.players.length;
        const p = this.players[i];
        if (p.contacted(this.lastDa) < 2) {
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

      if (check[Enums.chi]) {
        check[Enums.chi].chiCombol = check.chiCombol;
        this.actionResolver.appendAction(check[Enums.chi], 'chi', check.chiCombol)
      }

      for (let i = 1; i < this.players.length; i++) {
        const j = (from + i) % this.players.length;
        const p = this.players[j];

        const msg = this.actionResolver.allOptions(p);
        if (msg) {
          if (msg["hu"]) {
            this.lastHuCard = card;
            this.cardTypes = await this.getCardTypes(p, 2);
            msg["huType"] = {
              id: this.cardTypes.cardId,
              multiple: await this.getRoomMultiple(p)
            }
          }

          p.record('choice', card, msg);

          // 碰、杠等
          p.sendMessage('game/canDoSomething', {ok: true, data: msg});
          this.room.broadcast('game/oppoCanDoSomething', {
            ok: true,
            data: {...msg, ...{index: this.atIndex(p)}}
          }, p.msgDispatcher);
        }
      }

      if (check[Enums.pengGang] || check[Enums.chi] || check[Enums.hu]) {
        this.state = stateWaitAction;
        this.stateData = check;
        this.stateData.hangUp = [];
      }

      this.actionResolver.tryResolve()
    }

    setTimeout(nextDo, 200);

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

  checkPlayerSimpleCrdCount(player) {
    const cards = player.cards.slice();
    let count = 0;

    for (let i = 0; i < cards.length; i++) {
      if ([Enums.spring, Enums.summer, Enums.autumn, Enums.winter, Enums.mei, Enums.lan, Enums.zhu, Enums.ju].includes(i)) {
        continue;
      }

      if (cards[i] === 1) {
        count++;
      }
    }

    return count;
  }

  async gameAllOver(states, niaos, nextZhuang) {
    this.state = stateGameOver;

    const winner = this.players.filter(x => x.events.jiePao)[0]

    // 没胡牌 也没放冲
    if (winner) {
      this.players.filter(x => !x.events.jiePao && !x.events.dianPao)
        .forEach(x => {
          x.events.hunhun = winner.events.hu
        })
    }
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

    if (states.length > 0) {
      await this.room.recordGameRecord(this, states);
      await this.room.recordRoomScore('dissolve', scores, players)
      await this.room.RoomScoreRecord(scores, players)
    }

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
          gameName: "红包麻将",
          caregoryName: category.title,
          time: new Date(),
          score: states[i].score
        });
      }
    }

    const gameOverMsg = {
      niaos,
      creator: this.room.creator.model._id,
      juShu: this.restJushu,
      juIndex: this.room.game.juIndex,
      states,
      gameType: GameType.redpocket,
      ruleType: this.rule.ruleType,
      isPublic: this.room.isPublic,
      caiShen: this.caishen,
      base: this.room.currentBase
    }

    if (gameOverMsg.states.length > 0) {
      await this.room.gameOver(nextZhuang._id.toString(), states)

      const nextDo = async () => {
        this.room.broadcast('game/game-over', {ok: true, data: gameOverMsg})
      }
      setTimeout(nextDo, 2000)
    }
  }

  dissolve() {
    // TODO 停止牌局 托管停止 减少服务器计算消耗
    this.logger.close()
    this.players = [];
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      return await this.room.forceDissolve();
    })

    room.once('empty', this.onRoomEmpty = () => {
      this.players.forEach(x => {
        x.gameOver()
      })
    })
  }

  async restoreMessageForPlayer(player: PlayerState) {
    return await this.room.forceDissolve();
  }

  async onRefresh(index) {
    const player = this.players[index]
    if (!player) {
      return;
    }
    player.sendMessage('room/refresh', {ok: true, data: await this.restoreMessageForPlayer(player)})
  }

  setGameRecorder(recorder) {
    this.recorder = recorder
    for (const p of this.players) {
      p.setGameRecorder(recorder)
    }
  }

  async onPlayerGuo(player, playTurn, playCard) {
    if (this.turn !== playTurn) {
      player.sendMessage('game/guoReply', {ok: false, info: TianleErrorCode.notChoiceAction});
    } else if (this.state !== stateWaitAction) {
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
        player.emitter.emit(Enums.hu, this.turn, this.stateData.card);

        break;
    }
  }

  // 托管模式出牌
  promptWithPattern(player: PlayerState, lastTakeCard) {
    // 获取摸牌前的卡牌
    const cards = player.cards.slice();
    if (cards[lastTakeCard] > 0) cards[lastTakeCard]--;
    // 如果用户听牌，则直接打摸牌
    const ting = player.isRobotTing(cards);
    if (ting.hu) {
      if (player.cards[lastTakeCard] > 0) return lastTakeCard;
    }

    // 有单张打单张
    const lonelyCard = this.getCardLonelyCard(player);
    if (lonelyCard.code) return lonelyCard.index;

    // 无单张打2张
    const twoEightLonelyCard = this.getCardTwoCard(player);
    if (twoEightLonelyCard.code) return twoEightLonelyCard.index;

    // 摸到什么牌打什么牌
    return player.cards.findIndex(value => value > 0);
  }

  getCardTwoCard(player) {
    for (let i = 1; i < 61; i++) {
      const result = this.checkUserHasCard(player.cards, i);
      if (result.count === 2) {
        return {code: true, index: result.index};
      }
    }

    return {code: false, index: 0};
  }

  getCardLonelyCard(player) {
    for (let i = 1; i < 61; i++) {
      if ([Enums.spring, Enums.summer, Enums.autumn, Enums.winter, Enums.mei, Enums.lan, Enums.zhu, Enums.ju].includes(i)) {
        continue;
      }

      const result = this.checkUserHasCard(player.cards, i);
      if (result.count === 1) {
        return {code: true, index: result.index};
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

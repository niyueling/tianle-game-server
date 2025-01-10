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
      // console.warn("cardTypes-%s, nextCard-%s", JSON.stringify(this.cardTypes), nextCard);
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
    return this.cardTypes.multiple;
  }

  async getCardTypes(player, type) {
    return await this.getCardTypesByHu(player, type);
  }

  async getCardTypesByHu(player, type = 1) {
    const cardTypes = await CardTypeModel.find({gameType: GameType.redpocket});
    let cardType = cardTypes[0]; // 创建一个新的对象，其属性与cardTypes[0]相同

    for (let i = 0; i < cardTypes.length; i++) {
      console.warn("cardId-%s, cardName-%s", cardTypes[i].cardId, cardTypes[i].cardName);
      // 清一色
      if (cardTypes[i].cardId === 163) {
        const status = await this.checkQingYiSe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 混一色
      if (cardTypes[i].cardId === 164) {
        const status = await this.checkHunYiSe(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 清一色碰碰胡
      if (cardTypes[i].cardId === 165) {
        const status = await this.checkQingYiSeDuiDuiHu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 混一色碰碰胡
      if (cardTypes[i].cardId === 166) {
        const status = await this.checkHunYiSeDuiDuiHu(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 小三元
      if (cardTypes[i].cardId === 167) {
        const status = await this.checkXiaoSanYuan(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }

      // 一条龙
      if (cardTypes[i].cardId === 168) {
        const status = await this.checkYiTiaoLong(player, type);
        if (status && cardTypes[i].multiple >= cardType.multiple) {
          cardType = cardTypes[i];
        }
      }
    }

    return cardType;
  }

  async checkYiTiaoLong(player, type) {
    let flag = false;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isZiMo && isJiePao) {
      isJiePao = false;
    }
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = Enums.wanzi1; i <= Enums.wanzi3; i++) {
      let isLong = true;
      for (let j = i; j <= i + 6; j++) {
        if (cards[j] === 0) {
          isLong = false;
          break;
        }
      }

      if (isLong) {
        flag = isLong;
        break;
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

      if (gangList[i] >= Enums.zhong && gangList[i] <= Enums.bai) {
        ziCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && i <= Enums.wanzi9) {
        wanCount++;
      }

      if (cards[i] > 0 && i >= Enums.zhong && i <= Enums.bai) {
        ziCount++;
      }
    }

    if (wanCount > 0 && ziCount === 0) {
      flag = true;
    }

    console.warn("checkQingYiSe wanCount-%s, ziCount-%s, zimo-%s, jiepao-%s", wanCount, ziCount, isZiMo, isJiePao);

    return flag && (isZiMo || isJiePao);
  }

  async checkHunYiSe(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    const cards = player.cards.slice();
    let wanCount = 0;
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

      if (gangList[i] >= Enums.zhong && gangList[i] <= Enums.bai) {
        ziCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && i <= Enums.wanzi9) {
        wanCount++;
      }

      if (cards[i] > 0 && i >= Enums.zhong && i <= Enums.bai) {
        ziCount++;
      }
    }

    if (wanCount > 0 && ziCount > 0) {
      flag = true;
    }

    console.warn("checkHunYiSe wanCount-%s, ziCount-%s, zimo-%s, jiepao-%s", wanCount, ziCount, isZiMo, isJiePao);

    return flag && (isZiMo || isJiePao);
  }

  async checkXiaoSanYuan(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    let gangList = [...anGang, ...jieGang, ...peng];
    let flag = false;
    let ziCount = 0;
    let wanCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] <= Enums.wanzi9) {
        wanCount++;
      }

      if (gangList[i] >= Enums.zhong && gangList[i] <= Enums.bai) {
        ziCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      if (cards[i] > 0 && i <= Enums.wanzi9) {
        wanCount++;
      }

      if (cards[i] > 0 && i >= Enums.zhong && i <= Enums.bai) {
        ziCount++;
      }
    }

    if (wanCount === 0 && ziCount > 0) {
      flag = true;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkQingYiSeDuiDuiHu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const keZiList = [...anGang, ...jieGang, ...peng];
    let keCount = 0;
    let duiCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < keZiList.length; i++) {
      if (keZiList[i] >= Enums.wanzi1 && keZiList[i] <= Enums.wanzi9) {
        keCount++;
      }
    }

    for (let i = Enums.wanzi1; i <= Enums.wanzi9; i++) {
      if (cards[i] >= 3) {
        keCount++;
      }

      if (cards[i] === 2) {
        duiCount++;
      }
    }

    return keCount === 2 && duiCount === 1 && (isZiMo || isJiePao);
  }

  async checkHunYiSeDuiDuiHu(player, type) {
    const anGang = player.events["anGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    const peng = player.events["peng"] || [];
    const keZiList = [...anGang, ...jieGang, ...peng];
    let keCount = 0;
    let duiCount = 0;
    const isZiMo = type === 1 && player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    let isJiePao = this.lastDa && !isZiMo && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = Enums.wanzi1; i <= Enums.wanzi9; i++) {
      if (cards[i] >= 3) {
        keCount++;
        keZiList.push(i);
      }

      if (cards[i] === 2) {
        duiCount++;
        keZiList.push(i);
      }
    }

    for (let i = Enums.zhong; i <= Enums.bai; i++) {
      if (cards[i] >= 3) {
        keCount++;
        keZiList.push(i);
      }

      if (cards[i] === 2) {
        duiCount++;
        keZiList.push(i);
      }
    }

    let wanCount = 0;
    let ziCount = 0;

    for (let i = 0; i < keZiList.length; i++) {
      if (keZiList[i] >= Enums.wanzi1 && keZiList[i] <= Enums.wanzi9) {
        wanCount++;
      }

      if (keZiList[i] >= Enums.zhong && keZiList[i] <= Enums.bai) {
        ziCount++;
      }
    }

    return keCount === 2 && duiCount === 1 && wanCount > 0 && ziCount > 0 && (isZiMo || isJiePao);
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
            this.cardTypes = await this.getCardTypes(player, 2);
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

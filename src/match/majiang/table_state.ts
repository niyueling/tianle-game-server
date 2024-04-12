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
import {ConsumeLogType, RobotStep, TianleErrorCode} from "@fm/common/constants";
import CardTypeModel from "../../database/models/CardType";
import RoomGoldRecord from "../../database/models/roomGoldRecord";
import CombatGain from "../../database/models/combatGain";
import GameCategory from "../../database/models/gameCategory";
import GameCardRecord from "../../database/models/gameCardRecord";
import PlayerMedal from "../../database/models/PlayerMedal";
import PlayerHeadBorder from "../../database/models/PlayerHeadBorder";
import PlayerCardTable from "../../database/models/PlayerCardTable";
import PlayerCardTypeRecord from "../../database/models/playerCardTypeRecord";
import {MJRobotRmqProxy} from "./robotRmqProxy";

const stateWaitDa = 1
const stateWaitAction = 2
export const stateGameOver = 3
const stateWaitGangShangHua = 4
const stateWaitGangShangAction = 5
const stateQiangHaiDi = 6
const stateWaitDaHaiDi = 7
const stateWaitHaiDiPao = 8
const stateQiangGang = 9
const stateWaitRecharge = 10

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

const getCanPengCards = (p, checks) => {
  const ret = []
  checks.forEach(x => {
    if (x.peng === p) {
      ret.push(x.card)
    }
  })
  return ret
}

const getCanGangCards = (p, checks, gangPlayer) => {
  const ret = []
  checks.forEach(x => {
    if (x.gang === p) {
      ret.push([x.card, p.getGangKind(x.card, p === gangPlayer)])
    }
  })
  return ret
}

const getCanBuCards = (p, checks, gangPlayer) => {
  const ret = []
  checks.forEach(x => {
    if (x.bu === p) {
      ret.push([x.card, p.getGangKind(x.card, p === gangPlayer)])
    }
  })
  return ret
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
  addSpan(Enums.constellation1, Enums.constellation12)
  addSpan(Enums.zeus, Enums.athena);

  return cards
}

function getTimeString() {
  return moment().format('YYYYMMDDHHmm')
}

export function cardChangeDebugger<T extends new(...args: any[]) => {
  room: any
  cards: any
  remainCards: any
  listenPlayer(p: PlayerState): void
}>(constructor: T) {

  return class TableWithDebugger extends constructor {

    constructor(...args) {
      super(...args)
    }

    listenPlayer(player: PlayerState) {
      super.listenPlayer(player)

      player.on('changePlayerCards', msg => {
        this.changePlayerCards(player, msg)
      })
      player.on('changeNextCards', msg => {
        this.changNextCards(msg)
      })
    }

    changNextCards(cards) {
      cards.forEach(card => {
        this.cards.push(card)
      })
      this.remainCards = this.cards.length;
    }

    changePlayerCards(player, cards) {
      for (let i = 0; i < 53; i++) {
        player.cards[i] = 0
      }
      cards.forEach(c => {
        player.cards[c]++
      })
      const handCards = []
      for (let i = 0; i < player.cards.length; i++) {
        const c = player.cards[i]
        for (let j = 0; j < c; j++) {
          handCards.push(i)
        }
      }
      this.room.broadcast('game/changeCards', {index: player.seatIndex, cards: handCards})
      player.sendMessage('game/changePlayerCardsReply', {ok: true, info: '换牌成功！'})
    }
  }
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
    if (action === 'hu' || action === 'gang') {
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
    this.actionsOptions.filter(ao => ao.who._id === player._id)
      .forEach(ao => {
        ao.state = 'cancel'
      })

    let actionOption = null;

    try {
      actionOption = this.actionsOptions.find(ao => {
        // console.warn("ao.who._id-%s player._id-%s ao.action-%s action-%s flag-%s", ao.who._id, player._id, ao.action, action, ao.who._id === player._id && ao.action === action);
        return ao.who._id === player._id && ao.action === action;
      })
      actionOption.state = 'try'
      actionOption.onResolve = resolve
      actionOption.onReject = reject
    } catch(e) {
      console.warn(actionOption);
    }



  }

  cancel(player: PlayerState) {
    this.actionsOptions.filter(ao => ao.who._id === player._id)
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
    const oas = this.actionsOptions.filter(ao => ao.who._id === player._id && ao.state === 'waiting')

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

  // 是否进入巅峰对决
  isAllHu: boolean = false;

  // 胡牌类型
  cardTypes: {
    cardId: any;
    cardName: any;
    multiple: number;
  }

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
    this.isAllHu = false;
    this.isGameDa = false;
    this.isManyHu = false;
    this.manyHuArray = [];
    this.manyHuPlayers = [];
    this.canManyHuPlayers = [];
    this.isRunMultiple = false;
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
    // console.warn("remainCards-%s", count);

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

    if (card > Enums.athena && !playerState.constellationCards.includes(card) && !playerState.isGameHu) {
      playerState.constellationCards.push(card);

      if (playerState.constellationCards.length >= 6) {
        const model = await service.playerService.getPlayerModel(playerState._id);

        model.triumphantCount++;
        await model.save();
      }

      let constellationCardLists = [];

      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        constellationCardLists.push({
          index: i,
          _id: p._id,
          roomId: this.room._id,
          constellationCards: p.constellationCards,
          multiple: await this.calcConstellationCardScore(p)
        })
      }

      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        p.sendMessage("game/specialCardReply", {ok: true, data: constellationCardLists});
      }
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

  async calcConstellationCardScore(player) {
    const constellationCards = player.constellationCards;
    const cardCount = constellationCards.length;
    let score = 1;

    if (cardCount <= 3) {
      score = 2 * cardCount;
    }
    if (cardCount > 3 && cardCount <= 6) {
      score = 4 * cardCount;
    }
    if (cardCount > 6 && cardCount <= 9) {
      score = 6 * cardCount;
    }

    if (cardCount > 9 && cardCount <= 12) {
      score = 8 * cardCount;
    }

    // 生肖图-大世界
    if (cardCount === 12) {
      score += 24;
    }

    // 生肖图-圆六角
    const sixArrs = [Enums.constellation2, Enums.constellation3, Enums.constellation5, Enums.constellation8, Enums.constellation10, Enums.constellation11];
    let check = true;
    for (let i = 0; i < sixArrs.length; i++) {
      if (!constellationCards.includes(sixArrs[i])) {
        check = false;
      }
    }

    if (check) {
      score += 16;
    }

    // 生肖图-小世界
    const minWorldArrs = [
      [Enums.constellation1, Enums.constellation2, Enums.constellation5, Enums.constellation6],
      [Enums.constellation2, Enums.constellation3, Enums.constellation6, Enums.constellation7],
      [Enums.constellation3, Enums.constellation4, Enums.constellation7, Enums.constellation8],
      [Enums.constellation5, Enums.constellation6, Enums.constellation9, Enums.constellation10],
      [Enums.constellation6, Enums.constellation7, Enums.constellation10, Enums.constellation11],
      [Enums.constellation7, Enums.constellation8, Enums.constellation11, Enums.constellation12],
    ];

    let check1 = false;
    for (let i = 0; i < minWorldArrs.length; i++) {
      let checked = true;
      for (let j = 0; j < minWorldArrs[i].length; j++) {
        if (!constellationCards.includes(minWorldArrs[i][j])) {
          checked = false;
        }
      }

      if (checked) {
        check1 = true;
      }
    }

    if (check1) {
      score += 4;
    }

    // 生肖图-一线天
    const oneSkyArrs = [
      [Enums.constellation1, Enums.constellation5, Enums.constellation9],
      [Enums.constellation2, Enums.constellation6, Enums.constellation10],
      [Enums.constellation3, Enums.constellation7, Enums.constellation11],
      [Enums.constellation4, Enums.constellation8, Enums.constellation12],
    ];

    let check2 = false;
    for (let i = 0; i < oneSkyArrs.length; i++) {
      let checked = true;
      for (let j = 0; j < oneSkyArrs[i].length; j++) {
        if (!constellationCards.includes(oneSkyArrs[i][j])) {
          checked = false;
        }
      }

      if (checked) {
        check2 = true;
      }
    }

    if (check2) {
      score += 6;
    }

    // 生肖图-一字禅
    const oneWordArrs = [
      [Enums.constellation1, Enums.constellation2, Enums.constellation3, Enums.constellation4],
      [Enums.constellation5, Enums.constellation6, Enums.constellation7, Enums.constellation8],
      [Enums.constellation9, Enums.constellation10, Enums.constellation11, Enums.constellation12],
    ];

    let check3 = false;
    for (let i = 0; i < oneWordArrs.length; i++) {
      let checked = true;
      for (let j = 0; j < oneWordArrs[i].length; j++) {
        if (!constellationCards.includes(oneWordArrs[i][j])) {
          checked = false;
        }
      }

      if (checked) {
        check3 = true;
      }
    }

    if (check3) {
      score += 8;
    }

    // 生肖图-铁拐李
    const IronCalliArrs = [
      [Enums.constellation1, Enums.constellation2, Enums.constellation3, Enums.constellation4, Enums.constellation5, Enums.constellation9],
      [Enums.constellation1, Enums.constellation2, Enums.constellation3, Enums.constellation4, Enums.constellation8, Enums.constellation12],
      [Enums.constellation5, Enums.constellation6, Enums.constellation7, Enums.constellation8, Enums.constellation1, Enums.constellation9],
      [Enums.constellation5, Enums.constellation6, Enums.constellation7, Enums.constellation8, Enums.constellation4, Enums.constellation12],
      [Enums.constellation9, Enums.constellation10, Enums.constellation11, Enums.constellation12, Enums.constellation1, Enums.constellation5],
      [Enums.constellation9, Enums.constellation10, Enums.constellation11, Enums.constellation12, Enums.constellation4, Enums.constellation8],
    ];

    let check4 = false;
    for (let i = 0; i < IronCalliArrs.length; i++) {
      let checked = true;
      for (let j = 0; j < IronCalliArrs[i].length; j++) {
        if (!constellationCards.includes(IronCalliArrs[i][j])) {
          checked = false;
        }
      }

      if (checked) {
        check4 = true;
      }
    }

    if (check4) {
      score += 16;
    }

    // 生肖图-四方阵
    const squareArrs = [Enums.constellation1, Enums.constellation4, Enums.constellation9, Enums.constellation12];
    let check5 = true;
    for (let i = 0; i < squareArrs.length; i++) {
      if (!constellationCards.includes(squareArrs[i])) {
        check5 = false;
      }
    }

    if (check5) {
      score += 10;
    }

    if (score <= 0) {
      score = 1;
    }
    player.constellationScore = score;

    if (player.isMingCard) {
      player.constellationScore *= 6;
    }

    return score;
  }

  async consumeSimpleCard(p: PlayerState) {
    const cardIndex = --this.remainCards;
    const card = this.cards[cardIndex];
    this.cards.splice(cardIndex, 1);
    this.lastTakeCard = card;

    return card;
  }

  async consumeSpecialCard(p: PlayerState) {
    this.remainCards--;
    const index = this.cards.findIndex(c => [Enums.athena, Enums.poseidon, Enums.zeus].includes(c));
    if (index !== -1) {
      const card = this.cards[index]
      this.lastTakeCard = card;
      this.cards.splice(index, 1);

      return card;
    }

    return null;
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

    const result = Object.keys(counter).filter(num => counter[num] >= cardNumber && ![Enums.zeus, Enums.poseidon, Enums.athena].includes(Number(num)));
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

    for (let i = 0; i < 3; i++) {
      const consumeCards = await this.consumeGangOrKeCard();
      cards = [...cards, ...consumeCards];
    }

    const residueCards = 13 - cards.length;
    const flag = Math.random();
    if (residueCards > 3 && flag < 0.2) {
      const consumeCards = await this.consumeGangOrKeCard(3);
      cards = [...cards, ...consumeCards];
    }

    const cardCount = 13 - cards.length;
    let specialCount = 0;

    for (let i = 0; i < cardCount; i++) {
      const rank = Math.random();

      if ((rank < 0.6 && specialCount === 0) || rank < 0.1 && specialCount === 1) {
        const card = await this.consumeSpecialCard(player);
        if (card) {
          specialCount++;
          cards.push(card);
        }
      } else {
        cards.push(await this.consumeSimpleCard(player));
      }
    }

    return cards;
  }

  async takeDominateCards() {
    {
      let cards = []

      for (let i = 0; i < 3; i++) {
        const consumeCards = await this.consumeGangOrKeCard(3);
        cards = [...cards, ...consumeCards];
      }

      const residueCards = 13 - cards.length;
      if (residueCards > 3) {
        const consumeCards = await this.consumeGangOrKeCard(3);
        cards = [...cards, ...consumeCards];
      }

      while (13 - cards.length > 0) {
        this.remainCards--;
        const index = this.cards.findIndex(c => [Enums.athena, Enums.poseidon, Enums.zeus].includes(c));
        if (index !== -1) {
          cards.push(this.cards[index]);
          this.lastTakeCard = this.cards[index];
          this.cards.splice(index, 1);
        }
      }

      return cards;
    }
  }

  async start() {
    await this.fapai();
  }

  async fapai() {
    this.shuffle()
    this.sleepTime = 1500;
    this.caishen = this.rule.useCaiShen ? [Enums.zeus, Enums.poseidon, Enums.athena] : [Enums.slotNoCard]

    const restCards = this.remainCards - (this.rule.playerCount * 13);

    const needShuffle = this.room.shuffleData.length > 0;
    const constellationCardLists = [];
    let zhuangIndex = 0;
    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      const p = this.players[i];
      const model = await service.playerService.getPlayerModel(p._id);
      const cards13 = model.dominateCount > 0 ? await this.takeDominateCards() : await this.take13Cards(p);

      if (model.dominateCount > 0) {
        model.dominateCount--;
        await model.save();
      }

      const constellationCards = [];
      for (let i = 0; i < cards13.length; i++) {
        if (cards13[i] > Enums.athena && !constellationCards.includes(cards13[i])) {
          constellationCards.push(cards13[i]);
        }

        // 计算序数牌相加
        if (cards13[i] < Enums.zeus) {
          p.numberCount += cards13[i] % 10;
        }
        if ([Enums.zeus, Enums.poseidon, Enums.athena].includes(cards13[i])) {
          p.numberCount += 10;
        }
      }
      p.constellationCards = constellationCards;

      if (p.constellationCards.length >= 6) {
        model.triumphantCount++;
        await model.save();
      }

      constellationCardLists.push({
        index: i,
        _id: p._id,
        constellationCards,
        multiple: await this.calcConstellationCardScore(p)
      })

      if (p.zhuang) {
        zhuangIndex = i;
      }

      // if (!p.zhuang) {
      //   p.onDeposit = true;
      //   await p.sendMessage('game/startDepositReply', {ok: true, data: {}});
      // }

      p.onShuffle(restCards, this.caishen, this.restJushu, cards13, i, this.room.game.juIndex, needShuffle, constellationCards, zhuangIndex)
    }

    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      this.players[i].sendMessage("game/specialCardReply", {ok: true, data: constellationCardLists});
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
          multiple: this.cardTypes.multiple * conf.base * conf.Ante * this.zhuang.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * this.zhuang.constellationScore
        })

      const index = this.atIndex(this.zhuang);
      this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard}}, this.zhuang.msgDispatcher)
      this.state = stateWaitDa
      this.stateData = {msg, da: this.zhuang, card: nextCard}
    }

    if (this.sleepTime === 0) {
      nextDo()
    } else {
      setTimeout(nextDo, this.sleepTime)
    }
  }

  async getCardTypes(player, type) {
    return await this.getCardTypesByHu(player, type);
  }

  async getCardTypesByHu(player, type = 1, dianPaoPlayer = null) {
    const cardTypes = await CardTypeModel.find();
    let cardType = cardTypes[0];
    cardType.multiple = 1;
    cardType.cardId = -1;

    for (let i = 0; i < cardTypes.length; i++) {
      // 起手叫
      if (cardTypes[i].cardId === 1 && type === 1) {
        const status = await this.checkQiShouJiao(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
        cardType = cardTypes[i];
      }

      // 双星辰，含有两种星座牌组成的刻(杠的和牌)
      if (cardTypes[i].cardId === 2) {
        const status = await this.checkShuangXingChen(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 门清，没有碰和明杠的情况下，胡其他家点炮的牌
      if (cardTypes[i].cardId === 3 && type === 2) {
        const status = await this.checkMenQing(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 杠上开花
      if (cardTypes[i].cardId === 4 && type === 1) {
        const status = await this.checkGangShangHua(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 妙手回春
      if (cardTypes[i].cardId === 5 && type === 1) {
        const status = await this.checkMiaoShouHuiChun(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 海底捞月
      if (cardTypes[i].cardId === 6 && type === 2) {
        const status = await this.checkHaiDiLaoYue(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 杠上炮
      if (cardTypes[i].cardId === 7 && type === 2) {
        const status = await this.checkGangShangPao(player, dianPaoPlayer);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 绝张
      if (cardTypes[i].cardId === 9) {
        const status = await this.checkJueZhang(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 对对胡
      if (cardTypes[i].cardId === 10) {
        const status = await this.checkDuiDuiHu(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 单色星辰
      if (cardTypes[i].cardId === 11) {
        const status = await this.checkDanSeXingChen(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 双同刻
      if (cardTypes[i].cardId === 12) {
        const status = await this.checkShuangTongKe(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 十二行星
      if (cardTypes[i].cardId === 13) {
        const status = await this.checkShiErXingXing(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 十二行星
      if (cardTypes[i].cardId === 14) {
        const status = await this.checkShiBaXingXing(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 断么九
      if (cardTypes[i].cardId === 15) {
        const status = await this.checkDuanYaoJiu(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 不求人
      if (cardTypes[i].cardId === 16 && type === 1) {
        const status = await this.checkBuQiuRen(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 混双
      if (cardTypes[i].cardId === 17) {
        const status = await this.checkHunShuang(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 混单
      if (cardTypes[i].cardId === 18) {
        const status = await this.checkHunDan(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 双暗刻
      if (cardTypes[i].cardId === 19) {
        const status = await this.checkShuangAnKe(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 三节高
      if (cardTypes[i].cardId === 20) {
        const status = await this.checkSanJieGao(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 双色星辰
      if (cardTypes[i].cardId === 21) {
        const status = await this.checkShuangSeXingChen(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 混小
      if (cardTypes[i].cardId === 22) {
        const status = await this.checkHunXiao(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 混中
      if (cardTypes[i].cardId === 23) {
        const status = await this.checkHunZhong(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 混大
      if (cardTypes[i].cardId === 24) {
        const status = await this.checkHunDa(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 星灭光离
      if (cardTypes[i].cardId === 25) {
        const status = await this.checkXingMieGuangLi(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 三暗刻
      if (cardTypes[i].cardId === 26) {
        const status = await this.checkSanAnKe(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 三色星辰
      if (cardTypes[i].cardId === 27) {
        const status = await this.checkSanSeXingChen(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 七对
      if (cardTypes[i].cardId === 28) {
        const status = await this.checkQiDui(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 四节高
      if (cardTypes[i].cardId === 29) {
        const status = await this.checkSiJieGao(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 全单刻
      if (cardTypes[i].cardId === 30) {
        const status = await this.checkQuanDanKe(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 全双刻
      if (cardTypes[i].cardId === 31) {
        const status = await this.checkQuanShuangKe(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 四暗刻
      if (cardTypes[i].cardId === 32) {
        const status = await this.checkSiAnKe(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 十二星座
      if (cardTypes[i].cardId === 33) {
        const status = await this.checkErXingZuo(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 景星麟凤
      if (cardTypes[i].cardId === 35) {
        const status = await this.checkJingXingLinFeng(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 天胡
      if (cardTypes[i].cardId === 36) {
        const status = await this.checkTianHu(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 一路福星
      if (cardTypes[i].cardId === 37) {
        const status = await this.checkYiLuFuXing(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 三星高照
      if (cardTypes[i].cardId === 38) {
        const status = await this.checkSanXingGaoZhao(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 星流电击
      if (cardTypes[i].cardId === 39) {
        const status = await this.checkXingLiuDianJi(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 流星望电
      if (cardTypes[i].cardId === 40) {
        const status = await this.checkWuLiuXingDian(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 星离月会
      if (cardTypes[i].cardId === 41) {
        const status = await this.checkXingLiYueHui(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 棋布星陈
      if (cardTypes[i].cardId === 42) {
        const status = await this.checkQiBuXingChen(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 一天星斗
      if (cardTypes[i].cardId === 43) {
        const status = await this.checkYiTianXingDou(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 移星换斗
      if (cardTypes[i].cardId === 44) {
        const status = await this.checkYiXingHuanDou(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 星流影集
      if (cardTypes[i].cardId === 45) {
        const status = await this.checkXingLiuYingJi(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 大步流星
      if (cardTypes[i].cardId === 46) {
        const status = await this.checkDaBuLiuXing(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 月落星沉
      if (cardTypes[i].cardId === 47) {
        const status = await this.checkYueLuoXingChen(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 众星捧月
      if (cardTypes[i].cardId === 48) {
        const status = await this.checkZhongXingPengYue(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 摩羯之吻
      if (cardTypes[i].cardId === 49) {
        const status = await this.checkMoJieZhiWen(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }

      // 星蝎交辉
      if (cardTypes[i].cardId === 50) {
        const status = await this.checkXingHeJiaoHui(player);
        if (status && cardTypes[i].multiple > cardType.multiple)
          cardType = cardTypes[i];
      }
    }

    return cardType;
  }

  async checkXingHeJiaoHui(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let tianXieCount = 0;
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation8) {
        tianXieCount++;
      }
      if (gangList[i] > 40 && ![48].includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = 41; i < 53; i++) {
      if (player.cards[i] > 0 && ![48].includes(i)) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation8] > 0 || (isJiePao && this.lastHuCard === Enums.constellation8)) {
      tianXieCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![48].includes(this.lastHuCard)) {
      flag = false;
    }
    let numberCount = player.numberCount;
    if (isJiePao && this.lastHuCard < 38) {
      numberCount += this.lastHuCard % 10;
    }

    return numberCount >= 100 && tianXieCount > 0 && flag && (isZiMo || isJiePao);
  }

  async checkMoJieZhiWen(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let moJieCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation10) {
        moJieCount++;
      }
      if ((gangList[i] < 38 && ![6, 7, 8, 9].includes(gangList[i] % 10)) || (gangList[i] > 40 && ![50].includes(gangList[i]))) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && ![6, 7, 8, 9].includes(i % 10)) || (i > 40 && ![50].includes(i)))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation10] > 0 || (isJiePao && this.lastHuCard === Enums.constellation10)) {
      moJieCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation10].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 38) {
      const numberCount = this.lastHuCard % 10;
      if (![6, 7, 8, 9].includes(numberCount)) {
        flag = false;
      }
    }

    return flag && moJieCount > 0 && (isZiMo || isJiePao);
  }

  async deepCopyMixedArray(arr) {
    // 创建一个新数组来存储复制的元素
    const newArr = [];

    // 遍历原始数组的每个元素
    for (let i = 0; i < arr.length; i++) {
      const element = arr[i];

      // 检查元素是否是对象
      if (typeof element === 'object' && element !== null) {
        // 如果是对象，则进行深拷贝
        newArr.push(JSON.parse(JSON.stringify(element)));
      } else {
        // 如果不是对象，则直接添加到新数组
        newArr.push(element);
      }
    }

    // 返回复制后的新数组
    return newArr;
  }

  async checkZhongXingPengYue(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let shuiPingCount = 0;
    let shiZiCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation5) {
        shiZiCount++;
      }
      if (gangList[i] === Enums.constellation11) {
        shuiPingCount++;
      }
      if ((gangList[i] < 38 && gangList[i] % 2 === 0) || (gangList[i] > 40 && ![45, 51].includes(gangList[i]))) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && i % 2 === 0) || (i > 40 && ![45, 51].includes(i)))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation5] > 0 || (isJiePao && this.lastHuCard === Enums.constellation5)) {
      shiZiCount++;
    }
    if (player.cards[Enums.constellation11] > 0 || (isJiePao && this.lastHuCard === Enums.constellation11)) {
      shuiPingCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation5, Enums.constellation11].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 38) {
      const numberCount = this.lastHuCard % 2;
      if (numberCount !== 1) {
        flag = false;
      }
    }

    return flag && shiZiCount > 0 && shuiPingCount > 0 && (isZiMo || isJiePao);
  }

  async checkYueLuoXingChen(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let shuiPingCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation11) {
        shuiPingCount++;
      }

      if ((gangList[i] < 38 && gangList[i] < 10) || (gangList[i] > 40 && gangList[i] !== 51)) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && i < 10) || (i > 40 && i !== 51))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation11] > 0 || (isJiePao && this.lastHuCard === Enums.constellation11)) {
      shuiPingCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation11].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 38 && this.lastHuCard < 10) {
      flag = false;
    }

    return flag && shuiPingCount > 0 && (isZiMo || isJiePao);
  }

  async checkDaBuLiuXing(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let baiYangCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation1) {
        baiYangCount++;
      }

      if ((gangList[i] < 38 && gangList[i] > 10) || (gangList[i] > 40 && gangList[i] !== 41)) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && i > 10) || (i > 40 && i !== 41))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation1] > 0 || (isJiePao && this.lastHuCard === Enums.constellation1)) {
      baiYangCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation1].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 38 && this.lastHuCard > 10) {
      flag = false;
    }

    return flag && baiYangCount > 0 && (isZiMo || isJiePao);
  }

  async checkXingLiuYingJi(player) {
    const colorArrs = [41, 42, 44, 48, 45, 47, 50, 52];
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let blackCount = 0;
    let redCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if ([Enums.constellation1, Enums.constellation2, Enums.constellation4, Enums.constellation8].includes(gangList[i])) {
        blackCount++;
      }
      if ([Enums.constellation5, Enums.constellation7, Enums.constellation10, Enums.constellation12].includes(gangList[i])) {
        redCount++;
      }

      if ((gangList[i] < 38 && gangList[i] > 10) || (gangList[i] > 40 && !colorArrs.includes(gangList[i]))) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if ([Enums.constellation1, Enums.constellation2, Enums.constellation4, Enums.constellation8].includes(i) && player.cards[i] > 0) {
        blackCount++;
      }
      if ([Enums.constellation5, Enums.constellation7, Enums.constellation10, Enums.constellation12].includes(i) && player.cards[i] > 0) {
        redCount++;
      }
      if (player.cards[i] > 0 && ((i < 38 && i > 10) || (i > 40 && !colorArrs.includes(i)))) {
        flag = false;
      }
    }

    if (isJiePao && [Enums.constellation1, Enums.constellation2, Enums.constellation4, Enums.constellation8].includes(this.lastHuCard)) {
      blackCount++;
    }
    if (isJiePao && [Enums.constellation5, Enums.constellation7, Enums.constellation10, Enums.constellation12].includes(this.lastHuCard)) {
      redCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation1, Enums.constellation2, Enums.constellation4, Enums.constellation8,
      Enums.constellation5, Enums.constellation7, Enums.constellation10, Enums.constellation12].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 38 && this.lastHuCard > 10) {
      flag = false;
    }

    return flag && blackCount > 0 && redCount > 0 && (isZiMo || isJiePao);
  }

  async checkYiXingHuanDou(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let juXieCount = 0;
    let jinNiuCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation2) {
        jinNiuCount++;
      }
      if (gangList[i] === Enums.constellation4) {
        juXieCount++;
      }
      if ((gangList[i] < 38 && ![4, 5, 6].includes(gangList[i] % 10)) || (gangList[i] > 40 && ![42, 44].includes(gangList[i]))) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && ![4, 5, 6].includes(i % 10)) || (i > 40 && ![42, 44].includes(i)))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation2] > 0 || (isJiePao && this.lastHuCard === Enums.constellation2)) {
      jinNiuCount++;
    }
    if (player.cards[Enums.constellation4] > 0 || (isJiePao && this.lastHuCard === Enums.constellation4)) {
      juXieCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation2, Enums.constellation4].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 38 && ![4, 5, 6].includes(this.lastHuCard % 10)) {
      flag = false;
    }

    return flag && jinNiuCount > 0 && juXieCount > 0 && (isZiMo || isJiePao);
  }

  async checkYiTianXingDou(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let moJieCount = 0;
    let baiYangCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation1) {
        baiYangCount++;
      }
      if (gangList[i] === Enums.constellation10) {
        moJieCount++;
      }
      if ((gangList[i] < 38 && ![6, 7, 8, 9].includes(gangList[i] % 10)) || (gangList[i] > 40 && ![41, 50].includes(gangList[i]))) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && ![6, 7, 8, 9].includes(i % 10)) || (i > 40 && ![41, 50].includes(i)))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation1] > 0 || (isJiePao && this.lastHuCard === Enums.constellation1)) {
      baiYangCount++;
    }
    if (player.cards[Enums.constellation10] > 0 || (isJiePao && this.lastHuCard === Enums.constellation10)) {
      moJieCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation1, Enums.constellation10].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 38 && ![6, 7, 8, 9].includes(this.lastHuCard % 10)) {
      flag = false;
    }

    return flag && baiYangCount > 0 && moJieCount > 0 && (isZiMo || isJiePao);
  }

  async checkQiBuXingChen(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let shiZiCount = 0;
    let shuangZiCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation3) {
        shuangZiCount++;
      }
      if (gangList[i] === Enums.constellation5) {
        shiZiCount++;
      }
      if ((gangList[i] < 38 && ![1, 2, 3, 4].includes(gangList[i] % 10)) || (gangList[i] > 40 && ![43, 45].includes(gangList[i]))) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && ![1, 2, 3, 4].includes(i % 10)) || (i > 40 && ![43, 45].includes(i)))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation3] > 0 || (isJiePao && this.lastHuCard === Enums.constellation3)) {
      shuangZiCount++;
    }
    if (player.cards[Enums.constellation5] > 0 || (isJiePao && this.lastHuCard === Enums.constellation5)) {
      shiZiCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation3, Enums.constellation5].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 38 && ![1, 2, 3, 4].includes(this.lastHuCard % 10)) {
      flag = false;
    }

    return flag && shuangZiCount > 0 && shiZiCount > 0 && (isZiMo || isJiePao);
  }

  async checkXingLiYueHui(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let sheShouCount = 0;
    let jinNiuCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation2) {
        jinNiuCount++;
      }
      if (gangList[i] === Enums.constellation9) {
        sheShouCount++;
      }
      if ((gangList[i] < 38 && gangList[i] > 10 && gangList[i] < 20) || (gangList[i] > 40 && ![42, 49].includes(gangList[i]))) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && i > 10 && i < 20) || (i > 40 && ![42, 49].includes(i)))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation2] > 0 || (isJiePao && this.lastHuCard === Enums.constellation2)) {
      jinNiuCount++;
    }
    if (player.cards[Enums.constellation9] > 0 || (isJiePao && this.lastHuCard === Enums.constellation9)) {
      sheShouCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation2, Enums.constellation9].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard < 10) {
      flag = false;
    }

    return flag && jinNiuCount > 0 && sheShouCount > 0 && (isZiMo || isJiePao);
  }

  async checkWuLiuXingDian(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    let shuiPingCount = 0;
    let tianXieCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] === Enums.constellation8) {
        tianXieCount++;
      }
      if (gangList[i] === Enums.constellation11) {
        shuiPingCount++;
      }
      if ((gangList[i] < 38 && gangList[i] % 2 !== 0) || (gangList[i] > 40 && ![48, 51].includes(gangList[i]))) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (player.cards[i] > 0 && ((i < 38 && i % 2 !== 0) || (i > 40 && ![48, 51].includes(i)))) {
        flag = false;
      }
    }

    if (player.cards[Enums.constellation8] > 0 || (isJiePao && this.lastHuCard === Enums.constellation8)) {
      tianXieCount++;
    }
    if (player.cards[Enums.constellation11] > 0 || (isJiePao && this.lastHuCard === Enums.constellation11)) {
      shuiPingCount++;
    }
    if (isJiePao && this.lastHuCard > 40 && ![Enums.constellation8, Enums.constellation11].includes(this.lastHuCard)) {
      flag = false;
    }
    if (isJiePao && this.lastHuCard % 2 !== 0) {
      flag = false;
    }

    return flag && tianXieCount > 0 && shuiPingCount > 0 && (isZiMo || isJiePao);
  }

  async checkXingLiuDianJi(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let gangCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] > 40) {
        gangCount++;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (i > 40 && cards[i] >= 3) {
        gangCount++;
      }
    }

    return gangCount >= 4 && (isZiMo || isJiePao);
  }

  async checkSanXingGaoZhao(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let gangCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] > 40) {
        gangCount++;
      }
    }

    for (let i = 1; i < 53; i++) {
      if (i > 40 && cards[i] >= 3) {
        gangCount++;
      }
    }

    return gangCount >= 3 && (isZiMo || isJiePao);
  }

  async checkYiLuFuXing(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < 38) {
        flag = false;
      }
    }

    for (let i = 1; i < 38; i++) {
      if (player.cards[i] > 0) {
        flag = false;
      }
    }

    if (isJiePao && this.lastHuCard < 38) {
      flag = false;
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkTianHu(player) {
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    return !player.isGameDa && player.zhuang && isZiMo;
  }

  async checkJingXingLinFeng(player) {
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    let cardCount = 0;
    for (let i = 0; i < 53; i++) {
      if (player.cards[i] > 0) {
        cardCount += player.cards[i];
      }
    }
    return cardCount === 1 && (isZiMo || isJiePao);
  }

  async checkErXingZuo(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let gangCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] > 40) {
        gangCount++;
      }
    }

    return gangCount >= 3 && (isZiMo || isJiePao);
  }

  async checkSiAnKe(player) {
    const anGang = player.events["anGang"] || [];
    let anGangCount = anGang.length;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 1; i < 53; i++) {
      if (cards[i] >= 3) {
        anGangCount++;
      }
    }

    return anGangCount >= 4 && (isZiMo || isJiePao);
  }

  async checkQuanShuangKe(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangCount = 0;
    let duiCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < anGang.length; i++) {
      if (anGang[i] < 38 && anGang[i] % 2 === 0) {
        gangCount++;
      }
    }

    for (let i = 0; i < buGang.length; i++) {
      if (buGang[i] < 38 && buGang[i] % 2 === 0) {
        gangCount++;
      }
    }

    for (let i = 0; i < jieGang.length; i++) {
      if (jieGang[i] < 38 && jieGang[i] % 2 === 0) {
        gangCount++;
      }
    }

    for (let i = 1; i < 38; i++) {
      if (cards[i] >= 3 && i % 2 === 0) {
        gangCount++;
      }

      if (cards[i] === 2 && i % 2 === 0) {
        duiCount++;
      }
    }

    return gangCount === 4 && duiCount === 1 && (isZiMo || isJiePao);
  }

  async checkQuanDanKe(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangCount = 0;
    let duiCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < anGang.length; i++) {
      if (anGang[i] < 38 && anGang[i] % 2 === 1) {
        gangCount++;
      }
    }

    for (let i = 0; i < buGang.length; i++) {
      if (buGang[i] < 38 && buGang[i] % 2 === 1) {
        gangCount++;
      }
    }

    for (let i = 0; i < jieGang.length; i++) {
      if (jieGang[i] < 38 && jieGang[i] % 2 === 1) {
        gangCount++;
      }
    }

    for (let i = 1; i < 38; i++) {
      if (cards[i] >= 3 && i % 2 === 1) {
        gangCount++;
      }

      if (cards[i] === 2 && i % 2 === 1) {
        duiCount++;
      }
    }

    return gangCount === 4 && duiCount === 1 && (isZiMo || isJiePao);
  }

  async checkSiJieGao(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    gangList.sort((a, b) => a - b);
    let flag = false;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 1; i < 30; i++) {
      if ((gangList.includes(i) || cards[i] >= 3) && (gangList.includes(i + 1) || cards[i + 1] >= 3) &&
        (gangList.includes(i + 2) || cards[i + 2] >= 3) && (gangList.includes(i + 3) || cards[i + 3] >= 3)) {
        flag = true;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkQiDui(player) {
    let duiCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }
    for (let i = 0; i < 53; i++) {
      if (cards[i] === 2 || cards[i] === 4) {
        duiCount += cards[i] / 2;
        break;
      }
    }

    return duiCount === 7 && (isZiMo || isJiePao);
  }

  async checkSanSeXingChen(player) {
    const blackArrs = [41, 42, 44, 48];
    const blueArrs = [43, 46, 49, 51];
    const bredArrs = [45, 47, 50, 52];
    let colorCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }
    for (let i = 0; i < blackArrs.length; i++) {
      if (cards[blackArrs[i]] > 0) {
        colorCount++;
        break;
      }
    }

    for (let i = 0; i < blueArrs.length; i++) {
      if (cards[blueArrs[i]] > 0) {
        colorCount++;
        break;
      }
    }

    for (let i = 0; i < bredArrs.length; i++) {
      if (cards[bredArrs[i]] > 0) {
        colorCount++;
        break;
      }
    }

    return colorCount >= 3 && (isZiMo || isJiePao);
  }

  async checkSanAnKe(player) {
    const anGang = player.events["anGang"] || [];
    let anGangCount = anGang.length;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 1; i < 53; i++) {
      if (cards[i] >= 3) {
        anGangCount++;
      }
    }

    return anGangCount >= 3 && (isZiMo || isJiePao);
  }

  async checkXingMieGuangLi(player) {
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }
    for (let i = 38; i <= 40; i++) {
      if (cards[i] > 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkHunDa(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < 38 && gangList[i] % 10 < 7) {
        flag = false;
      }
    }

    for (let i = 1; i < 38; i++) {
      if (cards[i] > 0 && i % 10 < 7) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkHunZhong(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < 38 && (gangList[i] % 10 < 4 || gangList[i] % 10 > 6)) {
        flag = false;
        break;
      }
    }

    for (let i = 1; i < 38; i++) {
      if (cards[i] > 0 && (i % 10 < 4 || i % 10 > 6)) {
        flag = false;
        break;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkHunXiao(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < 38 && gangList[i] % 10 > 3) {
        flag = false;
      }
    }

    for (let i = 1; i < 38; i++) {
      if (cards[i] > 0 && i % 10 > 3) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkShuangSeXingChen(player) {
    const blackArrs = [41, 42, 44, 48];
    const blueArrs = [43, 46, 49, 51];
    const bredArrs = [45, 47, 50, 50];
    let colorCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }
    for (let i = 0; i < blackArrs.length; i++) {
      if (cards[blackArrs[i]] > 0) {
        colorCount++;
        break;
      }
    }

    for (let i = 0; i < blueArrs.length; i++) {
      if (cards[blueArrs[i]] > 0) {
        colorCount++;
        break;
      }
    }

    for (let i = 0; i < bredArrs.length; i++) {
      if (cards[bredArrs[i]] > 0) {
        colorCount++;
        break;
      }
    }

    return colorCount >= 2 && (isZiMo || isJiePao);
  }

  async checkSanJieGao(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    gangList.sort((a, b) => a - b);
    let flag = false;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 1; i < 30; i++) {
      if ((gangList.includes(i) || cards[i] >= 3) && (gangList.includes(i + 1) || cards[i + 1] >= 3) && (gangList.includes(i + 2) || cards[i + 2] >= 3)) {
        flag = true;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkShuangAnKe(player) {
    const anGang = player.events["anGang"] || [];
    let anGangCount = anGang.length;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 1; i < 53; i++) {
      if (cards[i] >= 3) {
        anGangCount++;
      }
    }

    return anGangCount >= 2 && (isZiMo || isJiePao);
  }

  async checkHunDan(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < 38 && gangList[i] % 2 === 0) {
        flag = false;
      }
    }

    for (let i = 1; i < 38; i++) {
      if (cards[i] > 0 && i % 2 === 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkHunShuang(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < 38 && gangList[i] % 2 !== 0) {
        flag = false;
      }
    }

    for (let i = 1; i < 38; i++) {
      if (cards[i] > 0 && i % 2 !== 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
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

  async checkDuanYaoJiu(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = true;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] > 40 || ![1, 11, 21, 9, 19, 29].includes(gangList[i])) {
        flag = false;
      }
    }

    for (let i = 1; i < 53; i++) {
      if ((i > 40 || [1, 11, 21, 9, 19, 29].includes(i)) && cards[i] > 0) {
        flag = false;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkShiBaXingXing(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    return gangList.length >= 4 && (isZiMo || isJiePao);
  }

  async checkShiErXingXing(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    return gangList.length >= 3 && (isZiMo || isJiePao);
  }

  async checkShuangTongKe(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangList = [...anGang, ...buGang, ...jieGang];
    let flag = false;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 1; i < 53; i++) {
      if (cards[i] >= 3) {
        gangList.push(i);
      }
    }

    for (let i = 0; i < gangList.length; i++) {
      if (gangList[i] < 10) {
        const index = gangList.findIndex(g => g === gangList[i] + 10 || g === gangList[i] + 20);
        if (index !== -1) {
          flag = true;
        }
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkDanSeXingChen(player) {
    let flag = false;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }
    for (let i = 41; i < 53; i++) {
      if (cards[i] > 0) {
        flag = true;
      }
    }

    return flag && (isZiMo || isJiePao);
  }

  async checkDuiDuiHu(player) {
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangCount = anGang.length + buGang.length + jieGang.length;
    let duiCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 1; i < 53; i++) {
      if (cards[i] >= 3) {
        gangCount++;
      }

      if (cards[i] === 2) {
        duiCount++;
      }
    }

    return gangCount === 4 && duiCount === 1 && (isZiMo || isJiePao);
  }

  async checkJueZhang(player) {
    let count= 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);

    for (let i = 0; i < this.cards.length; i++) {
      if (this.cards[i] === this.lastTakeCard) {
        count++;
      }
    }

    return count === 0 && (isZiMo || isJiePao);
  }

  async checkGangShangPao(player, dianPaoPlayer) {
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    return dianPaoPlayer && this.lastDa && dianPaoPlayer.isGangHouDa && isJiePao;
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

  async checkShuangXingChen(player) {
    // 双星辰
    const anGang = player.events["anGang"] || [];
    const buGang = player.events["buGang"] || [];
    const jieGang = player.events["mingGang"] || [];
    let gangCount = 0;
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    const isJiePao = this.lastDa && player.jiePao(this.lastHuCard, this.turn === 2, this.remainCards === 0, this.lastDa);
    const cards = player.cards.slice();
    if (isJiePao) {
      cards[this.lastHuCard]++;
    }

    for (let i = 0; i < anGang.length; i++) {
      if (anGang[i] >= 41 && anGang[i] <= 52) {
        gangCount++;
      }
    }
    for (let i = 0; i < buGang.length; i++) {
      if (buGang[i] >= 41 && buGang[i] <= 52) {
        gangCount++;
      }
    }
    for (let i = 0; i < jieGang.length; i++) {
      if (jieGang[i] >= 41 && jieGang[i] <= 52) {
        gangCount++;
      }
    }

    for (let i = 41; i < 53; i++) {
      if (cards[i] >= 3) {
        gangCount++;
      }
    }

    return gangCount >= 2 && (isZiMo || isJiePao);
  }

  async checkQiShouJiao(player) {
    const isZiMo = player.zimo(this.lastTakeCard, this.turn === 1, this.remainCards === 0);
    return !player.isGameDa && isZiMo;
  }

  atIndex(player: PlayerState) {
    if (!player) {
      return
    }
    return this.players.findIndex(p => p._id.toString() === player._id.toString())
  }

  setManyAction(player: PlayerState, action) {
    const index = this.manyHuArray.findIndex(p => p.to === this.atIndex(player));
    console.warn(player._id, this.atIndex(player), index, action);
    this.manyHuArray[index]["action"] = action;

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
        if (!player.zhuang) {
          return ;
        }

        const nextDo = async () => {
          if (msg) {
            const takenCard = msg.card;
            const todo = player.ai.onWaitForDa(msg, player.cards);
            const specialCardCount = player.cards[Enums.poseidon] + player.cards[Enums.zeus] + player.cards[Enums.athena];

            if (todo === Enums.gang && !this.isAllHu && !player.isGameHu) {
              const gangCard = msg.gang[0][0];
              player.emitter.emit(Enums.gangBySelf, this.turn, gangCard);
              player.sendMessage('game/depositGangBySelf', {
                ok: true,
                data: {card: gangCard, turn: this.turn}
              });
            } else if (todo === Enums.hu) {
              if (!this.isAllHu) {
                const simpleCount = this.checkPlayerSimpleCrdCount(player);
                if (([Enums.athena, Enums.poseidon, Enums.zeus].includes(takenCard) || simpleCount > 1 || specialCardCount === 0) && !player.isGameHu) {
                  const card = this.promptWithPattern(player, this.lastTakeCard);
                  player.emitter.emit(Enums.da, this.turn, card)
                  player.sendMessage('game/depositDa', {ok: true, data: {card, turn: this.turn}})
                } else {
                  player.emitter.emit(Enums.hu, this.turn, takenCard)
                  player.sendMessage('game/depositZiMo', {
                    ok: true,
                    data: {card: takenCard, turn: this.turn}
                  })
                }
              } else {
                const msg = {
                  cards: [],
                  daCards: [],
                  huCards: []
                };

                for (let i = 0; i < player.competiteCards.length; i++) {
                  if (player.competiteCards[i].hu) {
                    msg.huCards.push(player.competiteCards[i].card);
                  } else {
                    msg.daCards.push(player.competiteCards[i].card);
                  }

                  msg.cards.push(player.competiteCards[i].card);
                }

                player.emitter.emit(Enums.competiteHu, msg)
              }
            } else {
              const card = this.promptWithPattern(player, this.lastTakeCard);
              if (this.isAllHu) {
                const msg = {
                  cards: [],
                  daCards: [],
                  huCards: []
                };

                for (let i = 0; i < player.competiteCards.length; i++) {
                  if (player.competiteCards[i].hu) {
                    msg.huCards.push(player.competiteCards[i].card);
                  } else {
                    msg.daCards.push(player.competiteCards[i].card);
                  }

                  msg.cards.push(player.competiteCards[i].card);
                }

                player.emitter.emit(Enums.competiteHu, msg);
              } else {
                player.emitter.emit(Enums.da, this.turn, card);
              }
              player.sendMessage('game/depositDa', {ok: true, data: {card, turn: this.turn}})
            }
          }
        }

        setTimeout(nextDo, this.isAllHu ? 1000 : 500);
      })
    })
    player.on('waitForDoSomeThing', msg => {
      player.deposit(async () => {
        if (!player.zhuang) {
          return ;
        }

        const card = msg.data.card;
        const todo = player.ai.onCanDoSomething(msg.data, player.cards, card);
        const specialCardCount = player.cards[Enums.poseidon] + player.cards[Enums.zeus] + player.cards[Enums.athena];


        // 一炮多响切用户未操作
        if (this.isManyHu && !this.manyHuPlayers.includes(player._id)) {
          this.manyHuPlayers.push(player._id.toString());
          this.setManyAction(player, todo);
          console.warn("player index-%s deposit choice card-%s", this.atIndex(player), card);

          player.sendMessage("game/chooseMultiple", {ok: true, data: {action: todo, card, index: this.atIndex(player)}});
          return ;
        }

        const nextDo = async () => {
          if (todo === Enums.peng && !player.isGameHu && !this.isAllHu) {
            player.emitter.emit(Enums.peng, this.turn, card);
            player.sendMessage('game/depositPeng', {ok: true, data: {card, turn: this.turn}});
          }
          if (todo === Enums.gang && !player.isGameHu && !this.isAllHu) {
            console.warn("gang index-%s card-%s todo-%s", this.atIndex(player), msg.data.card, todo);
            player.emitter.emit(Enums.gangByOtherDa, this.turn, card);
            player.sendMessage('game/depositGangByOtherDa', {ok: true, data: {card, turn: this.turn}});
          } else if (todo === Enums.hu) {
            console.warn("hu index-%s card-%s todo-%s", this.atIndex(player), msg.data.card, todo);
            const simpleCount = this.checkPlayerSimpleCrdCount(player);

            if ((simpleCount > 1 || specialCardCount === 0) && !player.isGameHu) {
              player.emitter.emit(Enums.guo, this.turn, card);
            } else {
              return player.emitter.emit(Enums.hu, this.turn, card);
            }
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

    player.on(Enums.competiteHu, async (msg) => {
      await this.onCompetiteHu(player, msg);
    })

    player.on(Enums.broke, async () => {
      await this.onPlayerBroke(player);
    })

    player.on(Enums.multipleHu, async () => {
      await this.onPlayerMultipleHu();
    })

    player.on(Enums.openCard, async () => {
      if (!player.onDeposit) {
        player.isMingCard = true;
        await player.sendMessage('game/openCardReply', {
          ok: true,
          data: {roomId: this.room._id, index: this.atIndex(player)}
        });
      } else {
        await player.sendMessage('game/openCardReply', {ok: false, data: {}});
      }
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
        logger.info('peng player-%s this.state:%s stateWaitAction:%s', index, this.state, stateWaitAction)
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamStateInvaid});
        return
      }
      if (this.stateData.pengGang !== player || this.stateData.card !== card) {
        logger.info('peng player-%s card:%s has player pengGang or curCard not is this card', index, card)
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamInvaid});
        return
      }

      // 一炮多响
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && player.zhuang) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.peng);
        console.warn("player index-%s choice peng card-%s manyHuArray-%s action-%s", this.atIndex(player), card, JSON.stringify(this.manyHuArray), Enums.peng);

        player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.peng, card, index: this.atIndex(player)}})
        return ;
      }

      this.actionResolver.requestAction(player, 'peng', () => {
        const ok = player.pengPai(card, this.lastDa);
        if (ok) {
          player.lastOperateType = 2;
          player.onDeposit = false;
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
          }, player.msgDispatcher)
          console.warn("state-%s, stateData-%s hangUpList-%s onDeposit-%s", this.state, JSON.stringify(this.stateData), JSON.stringify(hangUpList), player.onDeposit);
          if (hangUpList.length > 0) {    // 向所有挂起的玩家回复
            hangUpList.forEach(hangUpMsg => {
              hangUpMsg[0].emitter.emit(hangUpMsg[1], ...hangUpMsg[2])
            })
          }
        } else {
          logger.info('PengReply player-%s card:%s has player hu ,not contain self', index, card)
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
        logger.info('gangByOtherDa player-%s card:%s state not is wait ', index, card)
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
        return;
      }
      if (this.stateData[Enums.gang]._id.toString() !== player.model._id.toString() || this.stateData.card !== card) {
        logger.info('gangByOtherDa player-%s card:%s this.stateData.card:%s has another player pengGang', player.model._id.toString(), card, this.stateData.card)
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
        return
      }

      // 一炮多响
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && player.zhuang) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.gang);
        console.warn("player index-%s choice gang card-%s manyHuArray-%s action-%s", this.atIndex(player), card, JSON.stringify(this.manyHuArray), Enums.gang);

        player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.gang, card, index: this.atIndex(player)}})
        return ;
      }

      try {
        this.actionResolver.requestAction(
          player, 'gang',
          async () => {
            const ok = player.gangByPlayerDa(card, this.lastDa);
            console.warn("gangByOtherDa index-%s card-%s ok-%s", this.atIndex(player), card, ok);
            if (ok) {
              player.lastOperateType = 3;
              this.turn++;
              const from = this.atIndex(this.lastDa)
              const me = this.atIndex(player)
              player.sendMessage('game/gangReply', {ok: true, data: {card, from, type: "mingGang"}});

              // 计算杠牌次数
              await Player.update({_id: player._id}, {$inc: {gangCount: 1}});

              // 如果是星座杠，记录星座杠次数
              if (card >= Enums.constellation1) {
                const cardTypeRecord = await this.getPlayerCardTypeRecord(player, card, 2);
                cardTypeRecord.count++;
                await cardTypeRecord.save();
              }

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
              const nextCard = await this.consumeCard(player);
              player.cards[nextCard]++;
              this.cardTypes = await this.getCardTypes(player, 1);
              player.cards[nextCard]--;

              const msg = player.gangTakeCard(this.turn, nextCard,
                {
                  id: this.cardTypes.cardId,
                  multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore
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
      if (this.state !== stateWaitDa) {
        logger.info(`this.state !== stateWaitDa, this.state:${this.state}, stateWaitDa:${stateWaitDa}`);
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
      }
      if (this.stateData[Enums.da]._id.toString() !== player.model._id.toString()) {
        logger.info(`this.stateData[Enums.da] !== player,
        this.stateData[Enums.da]:${this.stateData[Enums.da]._id.toString()}, player:${player.model._id.toString()}`);
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
        player.sendMessage('game/gangReply', {
          ok: true,
          data: {card, from, gangIndex, type: isAnGang ? "anGang" : "buGang"}
        });

        await Player.update({_id: player._id}, {$inc: {gangCount: 1}});

        // 如果是星座杠，记录星座杠次数
        if (card >= Enums.constellation1) {
          const cardTypeRecord = await this.getPlayerCardTypeRecord(player, card, 2);
          cardTypeRecord.count++;
          await cardTypeRecord.save();
        }

        this.room.broadcast('game/oppoGangBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher);

        const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

        const nextCard = await this.consumeCard(player);
        player.cards[nextCard]++;
        this.cardTypes = await this.getCardTypes(player, 1);
        player.cards[nextCard]--;
        const msg = player.gangTakeCard(this.turn, nextCard,
          {
            id: this.cardTypes.cardId,
            multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore
          });
        if (msg) {
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard}}, player.msgDispatcher);
          this.state = stateWaitDa;
          this.stateData = {msg, da: player, card: nextCard};
        } else {
          logger.info('gangByOtherDa player-%s card:%s GangReply error:4', index, card)
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

          // if (qiang && !this.stateData.cancelQiang) {
          //   logger.info(qiang, this.stateData.cancelQiang);
          //   this.room.broadcast('game/oppoGangBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher)
          //   qiang.sendMessage('game/canDoSomething', {
          //     ok: true, data: {
          //       card, turn: this.turn, hu: true,
          //       chi: false, chiCombol: [],
          //       peng: false, gang: false, bu: false,
          //     }
          //   })
          //
          //   this.state = stateQiangGang
          //   this.stateData = {
          //     whom: player,
          //     who: qiang,
          //     event: Enums.gangBySelf,
          //     card, turn: this.turn
          //   }
          //   return
          // }
        }

        // for (let i = 1; i < this.players.length; i++) {
        //   const j = (from + i) % this.players.length;
        //   const p = this.players[j]
        //   const msg = this.actionResolver.allOptions(p)
        //   if (msg) {
        //     p.sendMessage('game/canDoSomething', {ok: true, data: msg})
        //     this.state = stateWaitAction
        //     this.stateData = {
        //       whom: player,
        //       event: Enums.gangBySelf,
        //       card, turn,
        //       hu: check.hu,
        //       huInfo: p.huInfo,
        //     }
        //     this.lastDa = player
        //   }
        // }
        // this.actionResolver.tryResolve()
      } else {
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangPriorityInsufficient});
      }
    })
    player.on(Enums.buBySelf, async (turn, card) => {
      if (this.turn !== turn) {
        player.sendMessage('game/buReply', {ok: false, info: TianleErrorCode.buGangParamTurnInvaid});
      } else if (this.state !== stateWaitDa) {
        player.sendMessage('game/buReply', {ok: false, info: TianleErrorCode.buGangParamStateInvaid});
      } else if (this.stateData[Enums.da] !== player) {
        player.sendMessage('game/buReply', {ok: false, info: TianleErrorCode.buGangButNotPlayerDa});
      } else {
        const broadcastMsg = {turn, card, index}
        const ok = player.buBySelf(card, broadcastMsg)
        if (ok) {
          player.sendMessage('game/buReply', {ok: true, data: {card}})
          this.room.broadcast('game/oppoBuBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher)
          this.turn++;
          const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

          const nextCard = await this.consumeCard(player);
          player.cards[nextCard]++;
          this.cardTypes = await this.getCardTypes(player, 1);
          player.cards[nextCard]--;
          const msg = player.takeCard(this.turn, nextCard, false, false,
            {
              id: this.cardTypes.cardId,
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore
            });
          if (!msg) {
            return;
          }
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard}}, player.msgDispatcher)
          this.state = stateWaitDa
          this.stateData = {msg, da: player, card: nextCard}
        } else {
          player.sendMessage('game/buReply', {ok: false, info: TianleErrorCode.buGangInvaid})
        }
      }
    })

    player.on(Enums.hu, async (turn, card) => {
      let from;
      const chengbaoStarted = this.remainCards <= 3;
      const recordCard = this.stateData.card;

      try {
        const isJiePao = this.state === stateWaitAction &&
          recordCard === card && this.stateData[Enums.hu] &&
          this.stateData[Enums.hu].contains(player);

        const isZiMo = this.state === stateWaitDa && recordCard === card;

        const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

        if (isJiePao) {
          // 一炮多响
          if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && player.zhuang) {
            this.manyHuPlayers.push(player._id.toString());
            this.setManyAction(player, Enums.hu);
            console.warn("player index-%s choice jiePao card-%s manyHuArray-%s action-%s", this.atIndex(player), card, JSON.stringify(this.manyHuArray), Enums.hu);

            player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.hu, card, index: this.atIndex(player)}})
            return ;
          }

          this.actionResolver.requestAction(player, 'hu', async () => {
            this.lastHuCard = card;
            this.cardTypes = await this.getCardTypes(player, 2);
              const ok = player.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa);
              logger.info('hu player %s jiepao %s', index, ok)

              from = this.atIndex(this.lastDa);
              if (ok && player.daHuPai(card, this.players[from])) {
                player.lastOperateType = 4;
                player.isGameDa = true;
                this.lastDa = player;
                await player.sendMessage('game/huReply', {
                  ok: true,
                  data: {
                    card,
                    from,
                    type: "jiepao",
                    constellationCards: player.constellationCards,
                    huType: {
                      id: this.cardTypes.cardId,
                      multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore
                    }
                  }
                });

                // 记录胡牌次数
                if (!player.huTypeList.includes(this.cardTypes.cardId)) {
                  const cardTypeRecord = await this.getPlayerCardTypeRecord(player, this.cardTypes.cardId, 1);
                  cardTypeRecord.count++;
                  await cardTypeRecord.save();
                  player.huTypeList.push(this.cardTypes.cardId);
                }

                if (!player.isGameHu) {
                  player.isGameHu = true;
                }

                let isAllHu = false;

                for (let i = 0; i < this.players.length; i++) {
                  if (!this.players[i].isBroke && !this.players[i].isGameHu) {
                    isAllHu = false;
                  }
                }

                //第一次胡牌自动托管
                if (!player.onDeposit && !this.isAllHu && player.zhuang) {
                  player.onDeposit = true
                  await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
                  // 创建机器人代理
                  // let flag = true;
                  // this.room.disconnected.map((v) => {
                  //   if (v[0] === player._id.toString()) {
                  //     flag = false;
                  //   }
                  // })
                  //
                  // if (flag) {
                  //   this.room.disconnected.push([player._id.toString(), this.atIndex(player)]);
                  //   await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
                  // }
                }

                this.stateData[Enums.hu].remove(player);
                this.lastDa.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);
                if (chengbaoStarted) {
                  this.lastDa.recordGameEvent(Enums.chengBao, {});
                }
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
                const huPlayerIndex = this.atIndex(player);
                for (let i = 1; i < this.players.length; i++) {
                  const playerIndex = (huPlayerIndex + i) % this.players.length;
                  const nextPlayer = this.players[playerIndex];
                  if (nextPlayer === this.lastDa) {
                    break;
                  }

                  if (nextPlayer.checkJiePao(card)) {
                    nextPlayer.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa)
                    nextPlayer.sendMessage('game/genHu', {ok: true, data: {}})
                    this.room.broadcast('game/oppoHu', {
                      ok: true,
                      data: {
                        turn,
                        card,
                        from,
                        index: playerIndex,
                        constellationCards: player.constellationCards,
                        huType: {id: this.cardTypes.cardId, multiple: this.cardTypes.multiple}
                      }
                    }, nextPlayer.msgDispatcher)
                  }
                }
                await this.gameOver(this.players[from], player);

                const gameCompetite = async () => {
                  if (!this.isAllHu && isAllHu && this.state !== stateGameOver) {
                    this.isAllHu = isAllHu;

                    this.room.broadcast('game/gameCompetite', {
                      ok: true,
                      data: {
                        roomId: this.room._id
                      }
                    });
                  }
                }

                setTimeout(gameCompetite, 3000);

                if (this.state !== stateGameOver) {
                  this.turn++;
                  let xiajia = null;
                  let startIndex = (from + 1) % this.players.length;

                  // 从 startIndex 开始查找未破产的玩家
                  for (let i = startIndex; i < startIndex + this.players.length; i++) {
                    let index = i % this.players.length; // 处理边界情况，确保索引在数组范围内
                    if (!this.players[index].isBroke) {
                      xiajia = this.players[index];
                      break;
                    }
                  }

                  if (xiajia) {
                    const nextDo = async () => {
                      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
                      const cardCount = this.isAllHu ? 3 : 1;
                      const takeCards = [];
                      let gangCards = [];
                      let gangCardIndexs = [];
                      const huCards = [];
                      const moCards = [];
                      xiajia.oldCards = await this.deepCopyMixedArray(xiajia.cards);
                      xiajia.competiteCards = [];

                      if (!this.isAllHu) {
                        const newCard = await this.consumeCard(xiajia);
                        if (newCard) {
                          xiajia.cards[newCard]++;
                          this.cardTypes = await this.getCardTypes(xiajia, 1);
                          xiajia.cards[newCard]--;
                          const msg = xiajia.takeCard(this.turn, newCard, false, false,
                            {
                              id: this.cardTypes.cardId,
                              multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore
                            })

                          if (!msg) {
                            console.error("consume card error msg ", msg);
                            return;
                          }

                          // console.warn("msg-%s isGameHu-%s onDeposit-%s", JSON.stringify(msg), xiajia.isGameHu, xiajia.onDeposit);


                          this.state = stateWaitDa;
                          this.stateData = {da: xiajia, card: newCard, msg};
                          const sendMsg = {index: this.players.indexOf(xiajia), card: newCard}
                          this.room.broadcast('game/oppoTakeCard', {
                            ok: true,
                            data: sendMsg
                          }, xiajia.msgDispatcher)
                        }
                      } else {
                        for (let i = 0; i < cardCount; i++) {
                          const newCard = await this.consumeCard(xiajia);
                          if (newCard) {
                            xiajia.cards[newCard]++;
                            this.cardTypes = await this.getCardTypes(xiajia, 1);
                            xiajia.cards[newCard]--;
                            const msg = await xiajia.takeCompetiteCard(this.turn, newCard,
                              {
                                id: this.cardTypes.cardId,
                                multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore
                              }, xiajia.cards);

                            if (!msg) {
                              console.error("consume card error msg ", msg)
                              continue;
                            }

                            takeCards.push(msg.card);
                            moCards.push(msg.card);
                            xiajia.competiteCards.push(msg)
                            if (msg.gang) {
                              msg.gang.map(gang => {
                                if (!gangCardIndexs.includes(gang[0])) {
                                  gangCards.push(gang);
                                  gangCardIndexs.push(gang[0]);
                                }
                              })
                            }
                            if (msg.hu || huCards.findIndex(c => c.card === msg.card) !== -1) {
                              huCards.push({card: msg.card, huInfo: msg.huInfo, huType: msg.huType});
                            }

                            this.state = stateWaitDa;
                            this.stateData = {da: xiajia, card: newCard, msg};
                          }
                        }

                        for (let i = 0; i < moCards.length; i++) {
                          xiajia.cards[moCards[i]]++;
                        }

                        xiajia.sendMessage('game/TakeThreeCard', {ok: true, data: {cards: takeCards, gangCards, huCards}})

                        const sendMsg = {index: this.players.indexOf(xiajia), cards: takeCards, gangCards, huCards}
                        this.room.broadcast('game/oppoTakeThreeCard', {
                          ok: true,
                          data: sendMsg
                        }, xiajia.msgDispatcher)
                      }
                    }

                    setTimeout(nextDo, this.isAllHu ? 4500 : 2500);
                  } else {
                    const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
                    const nextZhuang = this.nextZhuang()
                    await this.gameAllOver(states, [], nextZhuang);
                  }
                }
              } else {
                await GameCardRecord.create({
                  playerIs: player._id,
                  cards: player.cards,
                  calcCard: card,
                  room: this.room._id,
                  game: "majiang",
                  type: 2,
                })
                player.sendMessage('game/huReply', {
                  ok: false,
                  info: TianleErrorCode.huInvaid,
                  data: {type: "jiePao", card}
                });

                const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
                const nextZhuang = this.nextZhuang()
                await this.gameAllOver(states, [], nextZhuang);
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
            from = this.atIndex(this.lastDa);
            await player.sendMessage('game/huReply', {
              ok: true,
              data: {
                card,
                from: this.atIndex(player),
                type: "zimo",
                constellationCards: player.constellationCards,
                huType: {
                  id: this.cardTypes.cardId,
                  multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore
                }
              }
            });

            // 记录胡牌次数
            if (!player.huTypeList.includes(this.cardTypes.cardId)) {
              const cardTypeRecord = await this.getPlayerCardTypeRecord(player, this.cardTypes.cardId, 1);
              cardTypeRecord.count++;
              await cardTypeRecord.save();
              player.huTypeList.push(this.cardTypes.cardId);
            }

            if (!player.isGameHu) {
              player.isGameHu = true;
            }

            let isAllHu = true;

            for (let i = 0; i < this.players.length; i++) {
              if (!this.players[i].isBroke && !this.players[i].isGameHu) {
                isAllHu = false;
              }
            }

            // 第一次胡牌自动托管
            if (!player.onDeposit && !this.isAllHu && player.zhuang) {
              player.onDeposit = true
              await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
              // 创建机器人代理
              // let flag = true;
              // this.room.disconnected.map((v) => {
              //   if (v[0] === player._id.toString()) {
              //     flag = false;
              //   }
              // })
              //
              // if (flag) {
              //   this.room.disconnected.push([player._id.toString(), this.atIndex(player)]);
              //   await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
              // }
            }

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
            await this.gameOver(null, player);
            this.logger.info('hu  player %s zimo gameover', index)

            const gameCompetite = async () => {
              if (!this.isAllHu && isAllHu && this.state !== stateGameOver) {
                this.isAllHu = isAllHu;

                this.room.broadcast('game/gameCompetite', {
                  ok: true,
                  data: {
                    roomId: this.room._id
                  }
                });
              }
            }

            setTimeout(gameCompetite, 2000);

            if (this.state !== stateGameOver) {
              this.turn++;
              let xiajia = null;
              let startIndex = (from + 1) % this.players.length;

              // 从 startIndex 开始查找未破产的玩家
              for (let i = startIndex; i < startIndex + this.players.length; i++) {
                let index = i % this.players.length; // 处理边界情况，确保索引在数组范围内
                if (!this.players[index].isBroke) {
                  xiajia = this.players[index];
                  break;
                }
              }

              if (xiajia) {
                const nextDo = async () => {
                  const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
                  const cardCount = this.isAllHu ? 3 : 1;
                  const takeCards = [];
                  let gangCards = [];
                  let gangCardIndexs = [];
                  const huCards = [];
                  const moCards = [];
                  xiajia.competiteCards = [];
                  xiajia.oldCards = await this.deepCopyMixedArray(xiajia.cards);

                  if (!this.isAllHu) {
                    const newCard = await this.consumeCard(xiajia)
                    if (newCard) {
                      xiajia.cards[newCard]++;
                      this.cardTypes = await this.getCardTypes(xiajia, 1);
                      xiajia.cards[newCard]--;
                      const msg = xiajia.takeCard(this.turn, newCard, false, false,
                        {
                          id: this.cardTypes.cardId,
                          multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore
                        })

                      if (!msg) {
                        console.error("consume card error msg ", msg)
                        return;
                      }

                      // console.warn("msg-%s isGameHu-%s onDeposit-%s", JSON.stringify(msg), xiajia.isGameHu, xiajia.onDeposit);
                      this.state = stateWaitDa;
                      this.stateData = {da: xiajia, card: newCard, msg};
                      const sendMsg = {index: this.players.indexOf(xiajia), card: newCard};
                      this.room.broadcast('game/oppoTakeCard', {
                        ok: true,
                        data: sendMsg
                      }, xiajia.msgDispatcher)
                    }
                  } else {
                    for (let i = 0; i < cardCount; i++) {
                      const newCard = await this.consumeCard(xiajia)
                      if (newCard) {
                        xiajia.cards[newCard]++;
                        this.cardTypes = await this.getCardTypes(xiajia, 1);
                        xiajia.cards[newCard]--;
                        const msg = await xiajia.takeCompetiteCard(this.turn, newCard, {
                          id: this.cardTypes.cardId, multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore
                        }, xiajia.cards);

                        if (!msg) {
                          console.error("consume card error msg ", msg)
                          continue;
                        }

                        takeCards.push(msg.card);
                        moCards.push(msg.card);
                        xiajia.competiteCards.push(msg);
                        if (msg.gang) {
                          msg.gang.map(gang => {
                            if (!gangCardIndexs.includes(gang[0])) {
                              gangCards.push(gang);
                              gangCardIndexs.push(gang[0]);
                            }
                          })
                        }
                        if (msg.hu || huCards.findIndex(c => c.card === msg.card) !== -1) {
                          huCards.push({card: msg.card, huInfo: msg.huInfo, huType: msg.huType});
                        }

                        this.state = stateWaitDa;
                        this.stateData = {da: xiajia, card: newCard, msg};
                      }
                    }

                    for (let i = 0; i < moCards.length; i++) {
                      xiajia.cards[moCards[i]]++;
                    }

                    xiajia.sendMessage('game/TakeThreeCard', {ok: true, data: {cards: takeCards, gangCards, huCards}})

                    const sendMsg = {index: this.players.indexOf(xiajia), cards: takeCards, gangCards, huCards}
                    this.room.broadcast('game/oppoTakeThreeCard', {
                      ok: true,
                      data: sendMsg
                    }, xiajia.msgDispatcher)
                  }
                }

                setTimeout(nextDo, this.isAllHu ? 4500 : 2500);
              } else {
                const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
                const nextZhuang = this.nextZhuang()
                await this.gameAllOver(states, [], nextZhuang);
              }
            }
          } else {
            await GameCardRecord.create({
              playerIs: player._id,
              cards: player.cards,
              calcCard: card,
              room: this.room._id,
              game: "majiang",
              type: 1,
            })
            player.sendMessage('game/huReply', {
              ok: false,
              info: TianleErrorCode.huInvaid,
              data: {type: "ziMo", card}
            });

            const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
            const nextZhuang = this.nextZhuang()
            await this.gameAllOver(states, [], nextZhuang);
          }
        } else {
          player.sendMessage('game/huReply', {ok: false, info: TianleErrorCode.huInvaid});
          logger.info('hu  player %s stateQiangGang HuReply', index)
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
    await this.playerGameOver(player, [], player.genGameStatus(this.atIndex(player), 1));
  }

  async onCompetiteHu(player, msg) {
    const msgs = [];
    let index = this.players.indexOf(player);
    const changeGolds = [
      {index: 0, changeGold: [], isBroke: false, currentGold: 0},
      {index: 1, changeGold: [], isBroke: false, currentGold: 0},
      {index: 2, changeGold: [], isBroke: false, currentGold: 0},
      {index: 3, changeGold: [], isBroke: false, currentGold: 0}
    ];

    // 把摸牌3张移除
    for (let i = 0; i < msg.cards.length; i++) {
      if (player.cards[msg.cards[i]] > 0) {
        player.cards[msg.cards[i]]--;
      }
    }

    // 处理打牌
    for (let i = 0; i < msg.daCards.length; i++) {
      const daMsg = await this.onPlayerCompetiteDa(player, msg.daCards[i]);
      if (daMsg) {
        msgs.push({type: "da", card: daMsg.card, index: daMsg.index});
      }
    }

    // 处理胡牌
    for (let i = 0; i < msg.huCards.length; i++) {
      const huMsg = await this.onPlayerCompetiteHu(player, msg.huCards[i], index);

      if (huMsg) {
        if (!huMsg.playersModifyGolds) {
          huMsg.playersModifyGolds = [];
        }

        msgs.push({
          type: "hu",
          card: msg.huCards[i],
          index: huMsg.from,
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

    for (let i = 0; i < this.players.length; i++) {
      const model = await service.playerService.getPlayerModel(this.players[i]._id);
      changeGolds[i].currentGold = model.gold;
      changeGolds[i].isBroke = model.gold === 0;
    }

    this.room.broadcast("game/competiteHuReply", {ok: true, data: {index: msgs[0].index, msg: msgs}});
    this.room.broadcast("game/competiteChangeGoldReply", {ok: true, data: changeGolds});

    console.warn("remainCards-%s isGameOver-%s", this.remainCards, this.isGameOver);
    if (this.remainCards <= 0 || this.isGameOver) {
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()
      await this.gameAllOver(states, [], nextZhuang);
    }

    // 给下家摸牌
    let xiajia = null;
    let xiajiaIndex = null;
    let startIndex = (this.atIndex(player) + 1) % this.players.length;

    // 从 startIndex 开始查找未破产的玩家
    for (let i = startIndex; i < startIndex + this.players.length; i++) {
      let index = i % this.players.length; // 处理边界情况，确保索引在数组范围内
      if (!this.players[index].isBroke) {
        xiajia = this.players[index];
        xiajiaIndex = index;
        break;
      }
    }

    if (!xiajia) {
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()
      await this.gameAllOver(states, [], nextZhuang);
    } else {
      const nextDo = async () => {
        const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
        const takeCards = [];
        let gangCards = [];
        let gangCardIndexs = [];
        const huCards = [];
        const moCards = [];
        xiajia.oldCards = await this.deepCopyMixedArray(xiajia.cards);
        xiajia.competiteCards = [];

        for (let i = 0; i < 3; i++) {
          if (this.remainCards === 0) {
            break;
          }

          const newCard = await this.consumeCard(xiajia);
          if (newCard) {
            xiajia.cards[newCard]++;
            this.cardTypes = await this.getCardTypes(xiajia, 1);
            xiajia.cards[newCard]--;
            const msg = await xiajia.takeCompetiteCard(this.turn, newCard, {
              id: this.cardTypes.cardId, multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore
            }, xiajia.cards);

            if (!msg) {
              console.error("consume card error msg ", msg)
              continue;
            }

            // 如果用户可以杠，并且胡牌已托管，则取消托管
            if (msg.gang && xiajia.isGameHu && xiajia.onDeposit) {
              xiajia.onDeposit = false;
              xiajia.sendMessage('game/cancelDepositReply', {ok: true, data: {card: newCard}})
            }

            takeCards.push(msg.card);
            moCards.push(msg.card);
            xiajia.competiteCards.push(msg);
            if (msg.gang) {
              msg.gang.map(gang => {
                if (!gangCardIndexs.includes(gang[0])) {
                  gangCards.push(gang);
                  gangCardIndexs.push(gang[0]);
                }
              })
            }
            if (msg.hu || huCards.findIndex(c => c.card === msg.card) !== -1) {
              huCards.push({card: msg.card, huInfo: msg.huInfo, huType: msg.huType});
            }

            this.state = stateWaitDa;
            this.stateData = {da: xiajia, card: newCard, msg};
          }
        }

        for (let i = 0; i < moCards.length; i++) {
          xiajia.cards[moCards[i]]++;
        }

        xiajia.sendMessage('game/TakeThreeCard', {ok: true, data: {cards: takeCards, gangCards, huCards}})

        const playerIds = [];
        this.players.map((v) => playerIds.push(v._id));
        const sendMsg = {index: xiajiaIndex, cards: takeCards, gangCards, huCards}
        this.room.broadcast('game/oppoTakeThreeCard', {
          ok: true,
          data: sendMsg
        }, xiajia.msgDispatcher)
      }

      setTimeout(nextDo, 1500);
    }
  }

  async onPlayerMultipleHu() {
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
        const huMsg = await this.onMultipleHu(this.players[this.manyHuArray[i].to], this.manyHuArray[i]);

        if (huMsg) {
          if (!huMsg.playersModifyGolds) {
            huMsg.playersModifyGolds = [];
          }

          msgs.push({
            type: "hu",
            card: this.manyHuArray[i].card,
            index: huMsg.from,
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

    this.room.broadcast("game/multipleHuReply", {ok: true, data: {manyHuArray: this.manyHuArray, msg: msgs}});

    const nextDo1 = async () => {
      this.room.broadcast("game/multipleChangeGoldReply", {ok: true, data: changeGolds});
    }
    setTimeout(nextDo1, 1000);

    if (this.remainCards <= 0 || this.isGameOver) {
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()
      await this.gameAllOver(states, [], nextZhuang);
    }

    if (huCount > 0) {
      // 给下家摸牌
      let xiajia = null;
      let startIndex = (this.manyHuArray[0].from + 1) % this.players.length;

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
      } else {
        const nextDo = async () => {
          const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
          const newCard = await this.consumeCard(xiajia);
          if (newCard) {
            xiajia.cards[newCard]++;
            this.cardTypes = await this.getCardTypes(xiajia, 1);
            xiajia.cards[newCard]--;
            const msg = xiajia.takeCard(this.turn, newCard, false, false,
              {
                id: this.cardTypes.cardId,
                multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore
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
            }, xiajia.msgDispatcher);
          }

          this.isManyHu = false;
          this.isRunMultiple = false;
          this.manyHuArray = [];
          this.manyHuPlayers = [];
          this.canManyHuPlayers = [];
        }

        setTimeout(nextDo, 1500);
      }
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
        from: msg.to,
        constellationCards: player.constellationCards,
        playersModifyGolds,
        huType: {
          id: this.cardTypes.cardId,
          multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore
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
    const balance = (conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore * 10 > conf.maxGold ? conf.maxGold : conf.base * this.cardTypes.multiple * conf.Ante * to.constellationScore * 10);
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
      multiple: conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore > conf.maxMultiple ? conf.maxMultiple : conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore,
      juIndex: this.room.game.juIndex,
      cardTypes: this.cardTypes,
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
        shortId: p.model.shortId,
        gold: p.balance,
        currentGold: model.gold,
        isBroke: p.isBroke,
        huType: this.cardTypes
      };
      if (model.gold <= 0) {
        if (params.index === 0) {
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

    if (waits.length > 0 && !this.isGameOver) {
      this.room.robotManager.model.step = RobotStep.waitRuby;
      const nextDo1 = async () => {
        this.room.broadcast("game/waitRechargeReply", {ok: true, data: waits});
      }
      setTimeout(nextDo1, 2000);
    }

    return playersModifyGolds;
  }

  async onPlayerCompetiteHu(player, card, index) {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

    // 将本次要操作的牌加入到牌堆中
    this.lastTakeCard = card;
    player.cards[card]++;
    this.cardTypes = await this.getCardTypes(player, 1);

    const ok = player.competiteZimo(card, false, this.remainCards === 0);
    if (ok && player.daHuPai(card, null)) {
      this.lastDa = player;
      const playersModifyGolds = await this.competiteGameOver(player);

      // 记录胡牌次数
      if (!player.huTypeList.includes(this.cardTypes.cardId)) {
        const cardTypeRecord = await this.getPlayerCardTypeRecord(player, this.cardTypes.cardId, 1);
        cardTypeRecord.count++;
        await cardTypeRecord.save();
        player.huTypeList.push(this.cardTypes.cardId);
      }

      return {
        card,
        from: index,
        constellationCards: player.constellationCards,
        playersModifyGolds,
        huType: {
          id: this.cardTypes.cardId,
          multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore
        }
      };
    } else {
      player.sendMessage('game/huReply', {
        ok: false,
        info: TianleErrorCode.huInvaid,
        data: {type: "ziMo", card, cards: this.getCardArray(player.cards)}
      });

      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()
      await this.gameAllOver(states, [], nextZhuang);

      return {};
    }
  }

  async competiteGameOver(to) {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

    this.players.map((p) => {
      p.balance = 0;
    })
    let failList = [];
    let failFromList = [];
    let winBalance = 0;
    let winModel = await service.playerService.getPlayerModel(to._id.toString());

    // 自摸胡
    for (const p of this.players) {
      // 扣除三家金币
      if (p.model._id.toString() !== to.model._id.toString() && !p.isBroke) {
        const model = await service.playerService.getPlayerModel(p._id.toString());
        const balance = (conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore * 10 > conf.maxGold ? conf.maxGold : conf.base * this.cardTypes.multiple * conf.Ante * to.constellationScore * 10);
        p.balance = -Math.min(Math.abs(balance), model.gold, winModel.gold);
        winBalance += Math.abs(p.balance);
        p.juScore += p.balance;
        if (p.balance !== 0) {
          await this.room.addScore(p.model._id.toString(), p.balance, this.cardTypes);
          await service.playerService.logGoldConsume(p._id, ConsumeLogType.gamePayGold, p.balance,
            model.gold + p.balance, `对局扣除-${this.room._id}`);
          failList.push(p._id);
          failFromList.push(this.atIndex(p));
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
      multiple: conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore > conf.maxMultiple ? conf.maxMultiple : conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore,
      juIndex: this.room.game.juIndex,
      cardTypes: this.cardTypes,
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
        shortId: p.model.shortId,
        gold: p.balance,
        currentGold: model.gold,
        isBroke: p.isBroke,
        huType: this.cardTypes
      };
      if (model.gold <= 0) {
        if (params.index === 0) {
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

    // console.warn("waits-%s playersModifyGolds-%s isGameOver-%s remainCards-%s", JSON.stringify(waits), JSON.stringify(playersModifyGolds), this.isGameOver, this.remainCards);

    if (waits.length > 0 && !this.isGameOver) {
      this.room.robotManager.model.step = RobotStep.waitRuby;
      const nextDo1 = async () => {
        this.room.broadcast("game/waitRechargeReply", {ok: true, data: waits});
      }
      setTimeout(nextDo1, 2000);
    }

    return playersModifyGolds;
  }

  async onPlayerCompetiteDa(player, card) {
    const index = this.players.indexOf(player);

    if (this.state !== stateWaitDa) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.cardDaError});
      return null;
    } else if (!this.stateData[Enums.da] || this.stateData[Enums.da]._id !== player._id) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaRound});
      return null;
    }

    // 将本次要操作的牌加入到牌堆中
    player.cards[card]++;

    const ok = player.daPai(card);
    if (!ok) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaThisCard});
      return;
    }

    this.lastDa = player;
    player.cancelTimeout();

    if (ok) {
      return {card, index};
    }
  }

  async onPlayerDa(player, turn, card) {
    const index = this.players.indexOf(player);
    let from;

    if (this.state !== stateWaitDa) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.cardDaError})
      return
    } else if (!this.stateData[Enums.da] || this.stateData[Enums.da]._id !== player._id) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaRound})
      return
    }

    const ok = player.daPai(card);
    if (!ok) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaThisCard});
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

      player.lastOperateType === 3 ? player.isGangHouDa = true : player.isGangHouDa = false;
      player.lastOperateType = 1;

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
        const model = await service.playerService.getPlayerModel(this.players[index]._id);
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
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore
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
          const sendMsg = {index: this.players.indexOf(xiajia), card: newCard};
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher);
        }
      });

      for (let j = 1; j < this.players.length; j++) {
        const i = (index + j) % this.players.length;
        const p = this.players[i];
        const model = await service.playerService.getPlayerModel(p._id);
        if (!p.isBroke && model.gold > 0 && !p.isGameHu) {
          check = p.checkPengGang(card, check);
        }
      }

      if (check[Enums.hu]) {
        for (const p of check[Enums.hu]) {
          this.actionResolver.appendAction(p, 'hu', p.huInfo);
        }
      }

      if (check[Enums.pengGang]) {
      // if (check[Enums.pengGang] && (!check[Enums.hu] || check[Enums.hu].length === 0)) {
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
            this.cardTypes = await this.getCardTypes(p, 2);
            msg["huType"] = {
              id: this.cardTypes.cardId,
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * p.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * p.constellationScore
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
        this.room.broadcast('game/beginChoiceMultiple', {ok: true, data: {isManyHu: this.isManyHu, manyHuArray: this.manyHuArray}});
        console.warn("isManyHu-%s manyHuArray-%s", this.isManyHu, JSON.stringify(this.manyHuArray));
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

  async gameOver(from, to) {
    if (this.state !== stateGameOver) {
      if (this.cardTypes.multiple) {
        // 将分数 * 倍率
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
          const balance = (conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore * 10 > conf.maxGold ? conf.maxGold : conf.base * this.cardTypes.multiple * conf.Ante * to.constellationScore * 10);
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
              const balance = (conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore * 10 > conf.maxGold ? conf.maxGold : conf.base * this.cardTypes.multiple * conf.Ante * to.constellationScore * 10);
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
          multiple: conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore > conf.maxMultiple ? conf.maxMultiple : conf.base * conf.Ante * this.cardTypes.multiple * to.constellationScore,
          juIndex: this.room.game.juIndex,
          cardTypes: this.cardTypes,
          categoryId: this.room.gameRule.categoryId
        })
      }

      // 判断是否破产，破产提醒客户端充值钻石
      let brokePlayers = [];
      let playersModifyGolds = [];
      let waits = [];
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        const model = await service.playerService.getPlayerModel(p.model._id.toString());
        let params = {
          index: this.atIndex(p),
          _id: p.model._id.toString(),
          shortId: p.model.shortId,
          gold: p.balance,
          currentGold: model.gold,
          isBroke: p.isBroke,
          huType: this.cardTypes
        };
        if (model.gold <= 0) {
          if (params.index === 0) {
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

      const nextDo = async () => {
        this.room.broadcast("game/playerChangeGold", {ok: true, data: playersModifyGolds});
      }

      setTimeout(nextDo, 1500);

      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      const nextZhuang = this.nextZhuang()

      const huPlayers = this.players
        .filter(p => p.huPai())

      huPlayers
        .forEach(huPlayer => {
          const losers = this.players.filter(p => p.events[Enums.dianPao] || p.events[Enums.taJiaZiMo])
          for (const loser of losers) {
            const wins = huPlayer.winScore()
            huPlayer.winFrom(loser, wins)
          }
        })

      if (huPlayers.length > 0) {
        this.calcGangScore();
      }

      if (this.remainCards <= 0) {
        return await this.gameAllOver(states, [], nextZhuang);
      }

      if (this.isGameOver || brokePlayers.length >= 3) {
        await this.gameAllOver(states, [], nextZhuang);
      }

      if (waits.length > 0 && !this.isGameOver) {
        this.room.robotManager.model.step = RobotStep.waitRuby;
        const nextDo1 = async () => {
          this.room.broadcast("game/waitRechargeReply", {ok: true, data: waits});
        }
        setTimeout(nextDo1, 2000);
      }
    }
    this.logger.close()
  }

  checkPlayerSimpleCrdCount(player) {
    const cards = player.cards.slice();
    let count = 0;

    for (let i = 0; i < cards.length; i++) {
      if ([Enums.athena, Enums.poseidon, Enums.zeus].includes(i)) {
        continue;
      }

      if (cards[i] === 1) {
        count++;
      }
    }

    return count;
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

    if (this.atIndex(p) === 0) {
      this.room.robotManager.model.step = RobotStep.waitRuby;
    }

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

    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();

    await CombatGain.create({
      uid: this.room._id,
      room: this.room.uid,
      juIndex: this.room.game.juIndex,
      playerId: p.model._id,
      gameName: "十二星座",
      caregoryName: category.title,
      time: new Date(),
      score: p.juScore
    });

    p.sendMessage('game/player-over', {ok: true, data: gameOverMsg})

    // 如果目前打牌的是破产用户，找到下一个正常用户
    if (this.stateData[Enums.da] && this.stateData[Enums.da]._id.toString() === p.model._id.toString()) {
      // await this.onPlayerGuo(p, this.turn, this.lastTakeCard);

      // 去除摸牌
      if (p.cards[this.lastTakeCard] > 0) {
        if (!this.isAllHu) {
          p.cards[this.lastTakeCard]--;
          p.sendMessage('game/remove-card', {ok: true, data: {card: this.lastTakeCard}})
        } else {
          for (let i = 0; i < p.competiteCards.length; i++) {
            p.cards[p.competiteCards[i]]--;
          }

          p.sendMessage('game/remove-card-competite', {ok: true, data: {cards: p.competiteCards}})
        }
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
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * xiajia.constellationScore
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
            const sendMsg = {index: this.players.indexOf(xiajia), card: newCard}
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
          gameName: "十二星座",
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
      if (states.length > 0 && states[0].score >= 0 && states[0].model._id === records[i].winnerId) {
        scoreRecords.push(records[i]);
      }

      if (states.length > 0 && states[0].score < 0 && records[i].failList.includes(states[0].model._id)) {
        scoreRecords.push(records[i]);
      }
    }

    const gameOverMsg = {
      niaos,
      creator: this.room.creator.model._id,
      juShu: this.restJushu,
      juIndex: this.room.game.juIndex,
      states,
      records: scoreRecords,
      ruleType: this.rule.ruleType,
      isPublic: this.room.isPublic,
      caiShen: this.caishen,
      base: this.room.currentBase
    }

    // 计算胜率
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

    if (gameOverMsg.states.length > 0) {
      await this.room.gameOver(nextZhuang._id.toString(), states)
      this.logger.info('game/game-over %s', JSON.stringify(gameOverMsg))

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
      const player = this.players[index];

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
    player.sendMessage('room/refresh', await this.restoreMessageForPlayer(player))
  }

  async generateReconnectMsg(index) {
    const player = this.players[index];
    let roomRubyReward = 0;
    const lastRecord = await service.rubyReward.getLastRubyRecord(this.room.uid);
    if (lastRecord) {
      roomRubyReward = lastRecord.balance;
    }
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();
    const pushMsg = {
      index, status: [], _id: this.room._id, rule: this.rule,
      category,
      remainCards: this.remainCards,
      base: this.room.currentBase,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
      current: {},
      cardTableId: null
    }

    // 获取牌桌
    const playerCardTable = await PlayerCardTable.findOne({playerId: player._id, isUse: true});
    if (playerCardTable && (playerCardTable.times === -1 || playerCardTable.times > new Date().getTime())) {
      pushMsg.cardTableId = playerCardTable.propId;
    }

    for (let i = 0; i < this.players.length; i++) {
      let p = this.players[i];
      p.constellationCards = [];

      for (let j = Enums.constellation1; j <= Enums.constellation12; j++) {
        if (!p.constellationCards.includes(j) && p.cards[j] > 0) {
          p.constellationCards.push(j);
        }
      }
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
        msg.roomRubyReward = roomRubyReward;
        msg.constellationCards = this.players[i].constellationCards;
        msg.constellationCardLevel = await this.calcConstellationCardScore(this.players[i]);
        pushMsg.status.push(msg);
      } else {
        msg = this.players[i].genOppoStates(i);
        msg.roomRubyReward = roomRubyReward;
        msg.constellationCards = this.players[i].constellationCards;
        msg.constellationCardLevel = await this.calcConstellationCardScore(this.players[i]);
        pushMsg.status.push(msg);
      }

      msg.model.medalId = medalId;
      msg.model.headerBorderId = headerBorderId;
    }

    switch (this.state) {
      case stateWaitDa: {
        const daPlayer = this.stateData[Enums.da];
        // console.warn("this.stateData.msg-%s daPlayerIndex-%s playerId-%s", JSON.stringify(this.stateData.msg), this.atIndex(daPlayer), this.atIndex(player));
        if (daPlayer._id.toString() === player._id.toString()) {
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
              multiple: this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore > conf.maxMultiple ? conf.maxMultiple : this.cardTypes.multiple * conf.base * conf.Ante * player.constellationScore
            };
          }
          pushMsg.current = {
            index, state: 'waitAction',
            msg: actions
          }
        }
        break
      }
      case stateWaitGangShangHua: {
        if (this.stateData.player === player) {
          pushMsg.current = {
            index,
            state: 'waitGangShangHua',
            msg: this.stateData.msg,
          }
        } else {
          pushMsg.current = {index: this.atIndex(this.stateData.player), state: 'waitGangShangHua'}
        }
        break
      }
      case stateWaitGangShangAction: {
        const indices = this.stateData.currentIndex
        for (let i = 0; i < indices.length; i++) {
          if (indices[i] === index) {
            pushMsg.current = {index, state: 'waitGangShangAction', msg: this.stateData.lastMsg[i]}
            break
          }
        }
        break
      }
      case stateQiangHaiDi: {
        if (this.stateData.player === player) {
          pushMsg.current = {
            index,
            state: 'qiangHaiDi',
            msg: this.stateData.msg,
          }
        } else {
          pushMsg.current = {index: this.atIndex(this.stateData.player), state: 'qiangHaiDi'}
        }
        break
      }
      case stateWaitDaHaiDi: {
        if (this.stateData.player === player) {
          pushMsg.current = {
            index,
            state: 'waitDaHaiDi',
            msg: this.stateData.msg,
          }
        } else {
          pushMsg.current = {index: this.atIndex(this.stateData.player), state: 'waitDaHaiDi'}
        }
        break
      }
      case stateWaitHaiDiPao: {
        const indices = this.stateData.currentIndex
        for (let i = 0; i < indices.length; i++) {
          if (indices[i] === index) {
            pushMsg.current = {index, state: 'waitHaiDiPao', msg: this.stateData.lastMsg[i]}
            break
          }
        }
        break
      }
      default:
        break
    }

    return pushMsg
  }

  distance(p1, p2) {
    if (p1 === p2) {
      return 0
    }
    const p1Index = this.players.indexOf(p1)
    const len = this.players.length
    for (let i = 1; i < len; i++) {
      const p = this.players[(p1Index + i) % len]
      if (p === p2) {
        return i
      }
    }
    return -1
  }

  hasPlayerHu() {
    return this.players.find(x => x.isHu()) != null
  }

  setGameRecorder(recorder) {
    this.recorder = recorder
    for (const p of this.players) {
      p.setGameRecorder(recorder)
    }
  }

  arrangeCaiShen() {
    const caiShen = this.cards[0]
    const cardsWithoutCaiShen = this.cards.filter(c => c !== caiShen)

    const newCards = [caiShen]

    const caiShenIndex = [
      random(3, 13 * 4),
      random(13 * 4 + 8, 13 * 4 + 16),
      random(13 * 4 + 40, 13 * 4 + 48)]
      .map(i => i + 33)

    let nextCaiIndex = caiShenIndex.shift()
    for (let i = 1; i < this.cards.length; i++) {
      if (i === nextCaiIndex) {
        newCards.push(caiShen)
        nextCaiIndex = caiShenIndex.shift()
      } else {
        newCards.push(cardsWithoutCaiShen.shift())
      }
    }

    this.cards = newCards.reverse()

  }

  async onPlayerGuo(player, playTurn, playCard) {
    // 一炮多响
    if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && player.zhuang) {
      this.manyHuPlayers.push(player._id.toString());
      this.setManyAction(player, Enums.guo);
      console.warn("player index-%s choice guo card-%s manyHuArray-%s action-%s", this.atIndex(player), playCard, JSON.stringify(this.manyHuArray), Enums.guo);

      player.sendMessage("game/chooseMultiple", {ok: true, data: {action: Enums.guo, card: playCard, index: this.atIndex(player)}})
      return ;
    }

    const index = this.players.indexOf(player);
    // const from = this.atIndex(this.lastDa)
    if (this.turn !== playTurn) {
      player.sendMessage('game/guoReply', {ok: false, info: TianleErrorCode.notChoiceAction});
    } else if (this.state !== stateWaitAction && this.state !== stateQiangGang) {
      player.sendMessage('game/guoReply', {ok: false, info: TianleErrorCode.notChoiceState});
    } else if (this.state === stateQiangGang && this.stateData.who == player) {
      console.log('stateQiangGang player-%s ', index)

      player.sendMessage('game/guoReply', {ok: true, data: {}})

      const {whom, card, turn} = this.stateData
      this.state = stateWaitDa
      this.stateData = {[Enums.da]: whom, cancelQiang: true}
      whom.emitter.emit(Enums.gangBySelf, turn, card)
    } else {
      player.sendMessage('game/guoReply', {ok: true, data: {}});
      player.guoOption(playCard)
      this.actionResolver.cancel(player)
      this.actionResolver.tryResolve()
      return;
    }
  }

  promptWithOther(todo, player, card) {
    // 一炮多响
    if (this.room.gameState.isManyHu) {
      // 一炮多响
      if (!this.manyHuPlayers.includes(this.zhuang._id.toString()) && this.canManyHuPlayers.includes(this.zhuang._id.toString())) {
        console.warn("player index-%s not choice card-%s", this.atIndex(this.zhuang), this.stateData.card);
        return ;
      }

      console.warn("manyHuPlayers-%s canManyHuPlayers-%s playerId-%s flag-%s todo-%s", JSON.stringify(this.manyHuPlayers), JSON.stringify(this.canManyHuPlayers), player._id, this.manyHuPlayers.includes(player._id.toString()), todo);

      // 如果机器人没有操作，则push到数组
      if (!this.manyHuPlayers.includes(player._id.toString())) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, todo);
      }

      if (this.manyHuPlayers.length === this.manyHuArray.length && !this.isRunMultiple) {
        this.isRunMultiple = true;
        player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
        console.warn("manyHuArray-%s manyHuPlayers-%s canManyHuPlayers-%s card-%s can many hu", JSON.stringify(this.manyHuArray), JSON.stringify(this.manyHuPlayers), JSON.stringify(this.canManyHuPlayers), this.stateData.card);
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
        if (!this.isAllHu) {
          const simpleCount = this.checkPlayerSimpleCrdCount(player);
          const specialCardCount = player.cards[Enums.poseidon] + player.cards[Enums.zeus] + player.cards[Enums.athena];
          if (([Enums.athena, Enums.poseidon, Enums.zeus].includes(this.stateData.card) || simpleCount > 1 || specialCardCount === 0) && !player.isGameHu) {
            const card = this.promptWithPattern(player, this.lastTakeCard);
            player.emitter.emit(Enums.da, this.turn, card);
          } else {
            player.emitter.emit(Enums.hu, this.turn, this.stateData.card);
          }
        } else {
          const msg = {
            cards: [],
            daCards: [],
            huCards: []
          };

          for (let i = 0; i < player.competiteCards.length; i++) {
            if (player.competiteCards[i].hu) {
              msg.huCards.push(player.competiteCards[i].card);
            } else {
              msg.daCards.push(player.competiteCards[i].card);
            }

            msg.cards.push(player.competiteCards[i].card);
          }

          player.emitter.emit(Enums.competiteHu, msg)
        }

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
      if (player.cards[lastTakeCard] > 0 && ![Enums.zeus, Enums.poseidon, Enums.athena].includes(lastTakeCard)) return lastTakeCard;
    }

    // 如果用户已经胡牌，则直接打摸牌
    if (player.isGameHu && player.cards[lastTakeCard] > 0) {
      return lastTakeCard;
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
    for (let i = 1; i < 53; i++) {
      if ([Enums.zeus, Enums.poseidon, Enums.athena].includes(i)) {
        continue;
      }

      const result = this.checkUserHasCard(player.cards, i);
      if (result.count === 2) {
        return {code: true, index: result.index};
      }
    }

    return {code: false, index: 0};
  }

  getCardLonelyCard(player) {
    for (let i = 1; i < 53; i++) {
      if ([Enums.zeus, Enums.poseidon, Enums.athena].includes(i)) {
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

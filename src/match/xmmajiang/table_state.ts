/**
 * Created by Color on 2016/7/6.
 */
import * as config from "../../config"
// @ts-ignore
import {pick} from 'lodash'
import * as winston from "winston";
import {service} from "../../service/importService";
import alg from '../../utils/algorithm'
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "../serializeDecorator"
import {manager} from "./cardManager";
import Enums from "./enums";
import GameRecorder, {IGameRecorder} from './GameRecorder'
import PlayerState from './player_state'
import Room from './room'
import Rule from './Rule'
import {GameType, TianleErrorCode} from "@fm/common/constants";
import GameCategory from "../../database/models/gameCategory";
import CombatGain from "../../database/models/combatGain";
import Player from "../../database/models/player";

const stateWaitDa = 1
const stateWaitAction = 2
export const stateGameOver = 3
const stateQiangGang = 9
const stateQiangJin = 10

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
  type?: string
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

const generateCards = function (noBigCard) {
  return manager.allCards(noBigCard);
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

  resume() {
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
      .forEach(ao => { ao.state = 'cancel' })
    const actionOption = this.actionsOptions.find(ao => ao.who._id.toString() === player._id.toString() && ao.action === action);
    if (actionOption) {
      actionOption.state = 'try';
      actionOption.onResolve = resolve;
      actionOption.onReject = reject;
    }
  }

  cancel(player: PlayerState) {
    this.actionsOptions.filter(ao => ao.who === player)
      .forEach(ao => {
        ao.state = 'cancel'
      })
  }

  async tryResolve() {
    for (const ao of this.actionsOptions) {
      if (ao.state === 'waiting') return

      if (ao.state === 'cancel') continue;

      if (ao.state === 'try') {
        this.notifyWaitingPlayer()
        ao.onResolve()
        this.fireAndCleanAllAfterAction()
        return
      }
    }
    this.next()
  }

  notifyWaitingPlayer() {

    const notified = {}

    this.actionsOptions.filter(ao => ao.state === 'waiting')
      .forEach(ao => {
        if (!notified[ao.who._id]) {
          ao.who.sendMessage('game/actionClose', {ok: true, data: {}});
          notified[ao.who._id] = true;
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
  caishen: number

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

  logger: winston.Winston
  @autoSerialize
  sleepTime: number

  @autoSerialize
  stateData: StateData

  onRoomEmpty: () => void
  onReconnect: (anyArgs, index: number) => void

  recorder: IGameRecorder

  @autoSerialize
  actionResolver: ActionResolver

  // 最后拿到的牌
  @autoSerialize
  lastTakeCard: number

  // 测试工具自定义摸牌
  testMoCards: any[] = [];

  // 抢金用户
  qiangJinData: any[] = [];

  // 已经点击抢金的用户
  qiangJinPlayer: any[] = [];

  // 是否已经执行抢金
  isRunQiangJin: boolean = false;

  // 庄家位置
  zhuangIndex: number = -1;

  // 庄家重新摸牌次数
  zhuangResetCount: number = 0;

  constructor(room: Room, rule: Rule, restJushu: number) {
    this.restJushu = restJushu;
    this.rule = rule;
    const players = room.players.map(playerSocket => new PlayerState(playerSocket, room, rule));
    this.zhuangIndex = 0;
    players[this.zhuangIndex].zhuang = true;
    players[this.zhuangIndex].zhuangCount++;

    this.cards = generateCards(rule.noBigCard)
    this.room = room
    this.listenRoom(room)
    this.remainCards = this.cards.length
    this.players = players
    this.zhuang = players[this.zhuangIndex]
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      this.listenPlayer(p);
    }
    this.turn = 1
    this.state = stateWaitAction
    this.lastDa = null
    this.logger = winston;

    this.setGameRecorder(new GameRecorder(this))
    this.stateData = {}
    this.testMoCards = [];
    this.qiangJinData = [];
    this.qiangJinPlayer = [];
    this.isRunQiangJin = false;
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
            if (this.stateData[name][j]._id.toString() === p._id.toString()) {
              console.log(name, ` <= name ${p.model.nickname}, shortId  `, p.model.shortId)
            }
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

  async consumeCard(playerState: PlayerState, notifyFlower = true, reset = false, isHelp = true, bigCardStatus = false) {
    const player = playerState
    let cardIndex = --this.remainCards
    const playerModel = await service.playerService.getPlayerModel(player._id);

    if (cardIndex === 0 && player) {
      player.takeLastCard = true;
    }

    // 如果是花牌重新摸牌，则不能摸到花牌
    if (reset) {
      cardIndex = this.cards.findIndex(c => !this.isFlower(c));
    }

    // 客户端指定摸牌发牌时不能被摸到
    if (this.testMoCards.length > 0 && this.testMoCards.includes(this.cards[cardIndex]) && !isHelp) {
      const moIndex = this.cards.findIndex(card => !this.testMoCards.includes(card));
      if (moIndex !== -1) {
        cardIndex = moIndex;
      }
    }

    // 客户端指定摸牌
    if (this.testMoCards.length > 0 && isHelp) {
      const moIndex = this.cards.findIndex(card => card === this.testMoCards[0]);
      if (moIndex !== -1) {
        cardIndex = moIndex;
        this.testMoCards.splice(0, 1);
      }
    }

    // 新手保护辅助出牌
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();
    if (this.room.isPublic) {
      if (playerModel.gameJuShu[GameType.xmmj] < config.game.noviceProtection && !playerModel.robot && isHelp && category.title === Enums.noviceProtection) {
        // 判断是否听牌
        const isTing = player.isTing();
        console.warn("index-%s, tingPai-%s", player.seatIndex, isTing)
        // 需要辅助出牌，优先辅助出牌
        if (player.disperseCards.length > 0 && !isTing) {
          const disperseCard = this.hasTripleStraight(player.disperseCards);
          const moIndex = this.cards.findIndex(card => card === disperseCard);
          if (moIndex !== -1) {
            cardIndex = moIndex;
            player.disperseCards.push(this.cards[cardIndex]);
          }

          this.removeTripleStraight(player, disperseCard, moIndex === -1);

          // 首先对杂牌数组进行排序
          player.disperseCards.sort((a, b) => a - b);
          console.warn("room %s consumeCard disperseCards-%s", this.room._id, JSON.stringify(player.disperseCards));
        } else {
          // 如果听牌，摸取胡牌的牌
          let c1 = await this.getHuCard(player);
          if (isTing && c1) {
            // console.warn("c1-%s", c1);

            const moIndex = this.cards.findIndex(c => c === c1);
            if (moIndex !== -1) {
              console.warn("get card %s index %s can hu", c1, moIndex);
              cardIndex = moIndex;
            }
          } else {
            let c2 = await this.getDoubleCard();
            // console.warn("c2-%s", c2);

            if (c2) {
              const moIndex = this.cards.findIndex(c => c === c2);
              if (moIndex !== -1) {
                console.warn("get card %s index %s can ting", c2, moIndex);
                cardIndex = moIndex;
              }
            }
          }
        }
      }
    }

    // 摸取自己牌堆没有的大牌
    if (bigCardStatus && this.room.isPublic) {
      for (let i = Enums.dong; i < Enums.bai; i++) {
        const moIndex = this.cards.findIndex(card => card === i);
        if (moIndex !== -1 && player.cards[i] === 0) {
          cardIndex = moIndex;
          break;
        }
      }
    }

    if (this.room.isPublic && category.maxAmount !== -1) {
      if (category.title !== Enums.noviceProtection && isHelp && Math.random() < 0.4) {
        const isTing = player.isTing();
        let c1 = await this.getHuCard(player);
        if (isTing && c1) {
          const moIndex = this.cards.findIndex(c => c === c1);
          if (moIndex !== -1) {
            console.warn("normal get card %s index %s can hu", c1, moIndex);
            cardIndex = moIndex;
          }
        } else {
          let c2 = await this.getDoubleCard();

          if (c2) {
            const moIndex = this.cards.findIndex(c => c === c2);
            if (moIndex !== -1) {
              console.warn("normal get card %s index %s can ting", c2, moIndex);
              cardIndex = moIndex;
            }
          }
        }
      }
    }

    // 牌堆移除这张牌
    const card = this.cards[cardIndex];
    this.cards.splice(cardIndex, 1);
    this.lastTakeCard = card;

    // 如果对局摸到花牌，延迟0.5秒重新摸牌
    if (notifyFlower && this.isFlower(card)) {
      // 拿到花以后,重新发牌
      player.flowerList.push(card);

      if (player) {
        // player.cards[card]++;
        // 花牌记录
        await this.room.auditManager.playerTakeCard(player.model._id, card);
      }

      // 摸到花牌重新摸牌
      const getFlowerCard = async() => {
        const resetCard = await this.consumeCard(player, notifyFlower, true);
        const msg = await player.takeCard(this.turn, resetCard)

        if (msg) {
          this.state = stateWaitDa;
          this.stateData = {da: player, card: resetCard, msg};
          const sendMsg = {index: this.players.indexOf(player), card: resetCard, msg};
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, player.msgDispatcher)
        }
      }

      setTimeout(getFlowerCard, 1000);
    }

    return card;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      // 生成一个0到i之间的随机索引
      const j = Math.floor(Math.random() * (i + 1));
      // 交换元素
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  async getDoubleCard() {
    const counter = {};
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (counter[card]) {
        counter[card]++;
      } else {
        counter[card] = 1;
      }
    }
    const result = Object.keys(counter).filter(num => counter[num] >= 3);
    const sortResult = this.shuffleArray(result);
    for (let i = 0; i < sortResult.length; i++) {
      const index = this.cards.findIndex(card => card === Number(sortResult[i]));
      if (index !== -1) {
        return Number(sortResult[i]);
      }
    }

    return null;
  }

  async getHuCard(player) {
    const cards = [];
    const youJinCards = [];
    for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
      // if (i === this.caishen) {
      //   continue;
      // }

      // 如果不是财神牌就判断是否能胡牌
      player.cards[i]++;
      const huState = player.checknoviceProtectionHuState();
      player.cards[i]--;
      const moIndex = this.cards.findIndex(c => c === i);
      if (huState.hu && moIndex !== -1) {
        if (huState.isYouJin) {
          // console.warn("get card %s index %s can youJin youJinTimes %s hu", i, moIndex, huState.youJinTimes);
          youJinCards.push({card: i, isYouJin: huState.isYouJin, youJinTime: huState.youJinTimes});
        }

        cards.push(i);
      }
    }

    // 判断是否可以游金，取最高游的牌
    if (youJinCards.length > 0) {
      let youJinCard = youJinCards[0];

      for (let i = 0; i < youJinCards.length; i++) {
        // 如果用户双金以上，去掉一张金牌，判断是否能游金
        const cardsTemp = player.cards.slice();
        if (cardsTemp[this.caishen] >= 2) {
          cardsTemp[youJinCards[i].card]++;
          cardsTemp[this.caishen]--;
          // 检查是否是游金
          const isOk = manager.isCanYouJin(cardsTemp, this.caishen);
          // cardsTemp[this.caishen]++;
          // cardsTemp[youJinCards[i].card]--;

          console.warn("get caishen %s card %s cards %s can shuangYou state", this.caishen, youJinCards[i].card, JSON.stringify(this.getCardArray(cardsTemp)), isOk);

          if (isOk) {
            youJinCard = youJinCards[i];
          }
        } else {
          if (youJinCards[i].youJinTimes > youJinCard.youJinTimes) {
            youJinCard = youJinCards[i];
          }
        }
      }

      console.warn("choose youJin card %s can youJin youJinTimes %s hu", youJinCard.card, youJinCard.youJinTimes);
      return youJinCard.card;
    }

    // 将牌放入牌堆，判断去除一张牌是否能游金
    for (let i = 0; i < cards.length; i++) {
      const cardsTemp = player.cards.slice();
      cardsTemp[cards[i]]++;

      for (let j = Enums.wanzi1; j <= Enums.bai; j++) {
        if (j === this.caishen) {
          continue;
        }

        // 删除任意一张牌
        cardsTemp[j]--;

        // 检查是否是游金
        const isOk = manager.isCanYouJin(player.cards, this.caishen);
        cardsTemp[j]++;
        if (isOk) {
          console.warn("get card %s can youJin", cards[i]);
          cardsTemp[cards[i]]--;
          return cards[i];
        }
      }

      cardsTemp[cards[i]]--;
    }

    const randomNumber = Math.floor(Math.random() * cards.length);

    return cards.length > 0 ? cards[randomNumber] : null;
  }

  // 是否是花牌
  isFlower(cardValue) {
    return cardValue >= Enums.spring && cardValue <= Enums.ju;
  }

  async take16Cards(player: PlayerState, clist, isLucky, isUpgrade = false) {
    let cards = this.rule.test ? clist.slice() : [];
    const playerModel = await service.playerService.getPlayerModel(player._id);
    const cardCount = cards.length;
    let residueCount = 16 - cardCount;
    const flowerList = [];
    let card;

    for (let i = 0; i < cards.length; i++) {
      if (this.isFlower(cards[i])) {
        flowerList.push(cards[i]);
      }
    }

    // 用户处于新手保护，并且非机器人
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();
    if (this.room.isPublic && playerModel.gameJuShu[GameType.xmmj] < config.game.noviceProtection && !playerModel.robot && category.title === Enums.noviceProtection) {
      const result = await this.getNoviceProtectionCards(residueCount, player);
      console.warn("noviceProtection room %s result-%s, disperseCards-%s", this.room._id, JSON.stringify(result), JSON.stringify(player.disperseCards));
      if (result.length > 0) {
        cards = [...cards, ...result];
        residueCount -= result.length;
      }
    }

    // 非新手保护，没有新手进阶，并且不是大师场，金豆房有一定概率补刻+单金+两对
    if (residueCount >= 3 && isLucky && this.room.isPublic && category.title !== Enums.noviceProtection && !isUpgrade && category.maxAmount !== -1) {
      const result = await this.getCardCounter(3);
      if (result.length > 0) {
        cards = [...cards, ...result];
        residueCount -= result.length;
      }
    }

    // 本局有新手进阶,并且不是进阶用户
    if (this.room.isPublic && ((isUpgrade && !player.isUpgrade) || (category.maxAmount === -1 && playerModel.robot))) {
      const result = await this.getNoviceProtectionCards(residueCount, player);
      console.warn("room upgrade %s result-%s, disperseCards-%s", this.room._id, JSON.stringify(result), JSON.stringify(player.disperseCards));
      if (result.length > 0) {
        cards = [...cards, ...result];
        residueCount -= result.length;
      }
    }

    for (let i = 0; i < residueCount; i++) {
      card = await this.consumeCard(player, false, false, false);
      if (this.isFlower(card)) {
        flowerList.push(card);
      }

      cards.push(card);
    }
    return {cards, flowerList}
  }

  hasTripleStraight(nums) {
    for (let i = 0; i < nums.length; i++) {
      // 检测到对子，则补成刻子
      if (nums[i + 1] - nums[i] === 0 && nums[i + 2] !== nums[i + 1]) {
        if (this.cards.findIndex(c => c === nums[i]) !== -1) {
          return nums[i];
        }
      }
      // 检测到2连顺，补成顺子
      if (nums[i + 1] - nums[i] === 1 && nums[i + 2] - nums[i + 1] !== 1 && nums[i] < Enums.dong) {
        if (this.cards.findIndex(c => c === nums[i] + 2) !== -1) {
          return nums[i] + 2;
        }
        if (this.cards.findIndex(c => c === nums[i] - 1) !== -1) {
          return nums[i] - 1;
        }
      }
      // 检测到顺子两边，补成顺子
      if (nums[i + 1] - nums[i] === 2 && nums[i] < Enums.dong) {
        if (this.cards.findIndex(c => c === nums[i] + 1) !== -1) {
          return nums[i] + 1;
        }
      }
    }

    return nums[0];
  }

  removeTripleStraight(player, disperseCard, state) {
    const disperseCards = player.disperseCards;
    for (let i = 0; i < disperseCards.length; i++) {
      if (disperseCards[i + 1] === disperseCards[i] && disperseCards[i + 2] === disperseCards[i + 1]) {
        player.disperseCards.splice(i, 3);
      }
      if (disperseCards[i + 1] === disperseCards[i] && disperseCards[i + 2] !== disperseCards[i + 1] && state && disperseCards[i] === disperseCard) {
        player.disperseCards.splice(i, 2);
      }
      if (disperseCards[i + 1] - disperseCards[i] === 1 && disperseCards[i + 2] - disperseCards[i + 1] === 1) {
        player.disperseCards.splice(i, 3);
      }
    }
  }

  async getNoviceProtectionCards(numbers, player) {
    const counter = {};
    const cards = [];

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (counter[card]) {
        counter[card]++;
      } else {
        counter[card] = 1;
      }
    }

    // 配金牌
    const goldRank = Math.random();
    const goldCount = goldRank < 0.01 ? 3 : goldRank < 0.1 ? 2 : 1;
    let doubleSimpleCount = 0;
    // const goldCount = 2;
    for (let i = 0; i < goldCount; i++) {
      const goldIndex = this.cards.findIndex(card => card === this.caishen);

      if (goldIndex !== -1) {
        const card = this.cards[goldIndex];
        cards.push(card);
        this.cards.splice(goldIndex, 1);
        this.lastTakeCard = card;
        this.remainCards--;
        counter[card]--;
      }
    }

    // 配4个刻子或者顺子
    for (let i = 0; i < 4; i++) {
      const random = Math.random();
      let result = [];

      // 发刻子
      if (random < 0.3) {
        const keCount = Math.random() < 0.1 ? 4 : 3;
        result = Object.keys(counter).filter(num => counter[num] >= keCount);
        const randomNumber = Math.floor(Math.random() * result.length);
        for (let i = 0; i < keCount; i++) {
          const index = this.cards.findIndex(card => card === Number(result[randomNumber]));

          if (index !== -1) {
            const card = this.cards[index];
            cards.push(card);
            this.cards.splice(index, 1);
            this.lastTakeCard = card;
            this.remainCards--;
            counter[card]--;
          }
        }
      } else if (random < 0.6 && !doubleSimpleCount) {
        // 发放对子+相邻单张
        result = Object.keys(counter).filter(num => counter[num] >= 2 && counter[Number(num) + 1] >= 1);
        const randomNumber = Math.floor(Math.random() * result.length);
        for (let i = 0; i < 3; i++) {
          const cardNumber = i < 2 ? Number(result[randomNumber]) : Number(result[randomNumber]) + 1;
          const index = this.cards.findIndex(card => card === cardNumber);
          if (index !== -1) {
            const card = this.cards[index];
            cards.push(card);
            if (i === 2) {
              player.disperseCards.push(card);
            }
            this.cards.splice(index, 1);
            this.lastTakeCard = card;
            this.remainCards--;
            counter[card]--;
            doubleSimpleCount++;
          }
        }
      } else {
        // 发放顺子
        result = Object.keys(counter).filter(num => Number(num) <= Enums.tongzi7 && counter[num] >= 1 && counter[Number(num) + 1] >= 1 && counter[Number(num) + 2] >= 1);
        const randomNumber = Math.floor(Math.random() * result.length);
        for (let i = 0; i < 3; i++) {
          const index = this.cards.findIndex(card => card === Number(result[randomNumber]) + i);
          if (index !== -1) {
            const card = this.cards[index];
            cards.push(card);
            this.cards.splice(index, 1);
            this.lastTakeCard = card;
            this.remainCards--;
            counter[card]--;
          }
        }
      }
    }

    let residueCount = numbers - cards.length;
    for (let i = 0; i < residueCount; i++) {
      this.remainCards--;
      const cardIndex = this.cards.findIndex(c => c < Enums.spring);
      const card = this.cards[cardIndex];
      cards.push(card);
      player.disperseCards.push(card);
      this.cards.splice(cardIndex, 1);
      this.lastTakeCard = card;
      counter[card]--;
    }

    // 首先对杂牌数组进行排序
    player.disperseCards.sort((a, b) => a - b);

    return cards;
  }

  async getCardCounter(number) {
    const counter = {};
    const cards = [];

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (counter[card]) {
        counter[card]++;
      } else {
        counter[card] = 1;
      }
    }

    // 配一个刻子
    const random = Math.random() < 0.8;
    if (random) {
      const result = Object.keys(counter).filter(num => counter[num] >= number);
      const randomNumber = Math.floor(Math.random() * result.length);

      for (let i = 0; i < number; i++) {
        const index = this.cards.findIndex(card => card === Number(result[randomNumber]));

        if (index !== -1) {
          const card = this.cards[index];
          cards.push(card);
          this.cards.splice(index, 1);
          this.lastTakeCard = card;
          this.remainCards--;
          counter[card]--;
        }
      }
    }

    // 0.3的概率补两个对
    const doubleRank = Math.random();
    if (doubleRank < 0.3) {
      for (let j = 0; j < 2; j++) {
        const doubleResult = Object.keys(counter).filter(num => counter[num] >= 2);
        const doubleRandomNumber = Math.floor(Math.random() * doubleResult.length);

        for (let i = 0; i < 2; i++) {
          const index = this.cards.findIndex(card => card === Number(doubleResult[doubleRandomNumber]));

          if (index !== -1) {
            const card = this.cards[index];
            cards.push(card);
            this.cards.splice(index, 1);
            this.lastTakeCard = card;
            this.remainCards--;
            counter[card]--;
          }
        }
      }
    }

    // 0.3的概率获得金牌
    const goldRank = Math.random();
    if (goldRank < 0.3) {
      const goldIndex = this.cards.findIndex(card => card === this.caishen);

      if (goldIndex !== -1) {
        const card = this.cards[goldIndex];
        cards.push(card);
        this.cards.splice(goldIndex, 1);
        this.lastTakeCard = card;
        this.remainCards--;
        counter[card]--;
      }
    }

    return cards;
  }

  async takeFlowerResetCards(player: PlayerState) {
    const cards = [];
    for (let i = 0; i < player.flowerList.length; i++) {
      cards.push(await this.consumeCard(player, false, true, false));
    }
    return cards;
  }

  async start(payload) {
    await this.fapai(payload);
  }

  async fapai(payload) {
    let isGameUpgrade = false;
    this.shuffle();
    this.sleepTime = 3000;
    // 金牌
    this.caishen = this.randGoldCard(this.rule.test, payload.goldCard);
    await this.room.auditManager.start(this.room.game.juIndex, this.caishen);
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();

    const needShuffle = this.room.shuffleData.length > 0;
    const cardList = [];
    const luckyPlayerIds = [Math.floor(Math.random() * 4)];
    const random = Math.floor(Math.random() * 4);
    if (!luckyPlayerIds.includes(random)) {
      luckyPlayerIds.push(random);
    }

    // 测试工具自定义摸9张牌
    if (this.rule.test && payload.moCards && payload.moCards.length > 0) {
      this.testMoCards = payload.moCards;
    }

    // 计算本局是否由用户需要被杀
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const model = await service.playerService.getPlayerModel(p._id);

      // 判断是否升级场次
      if (this.room.isPublic && category.title === Enums.AdvancedTitle) {
        if (!model.gameUpgrade[GameType.xmmj]) {
          model.gameUpgrade[GameType.xmmj] = 0;
          if (!model.robot) {
            p.isUpgrade = true;
            isGameUpgrade = true;
          }
        }

        model.gameUpgrade[GameType.xmmj]++;
        await Player.update({_id: model._id}, {$set: {gameUpgrade: model.gameUpgrade}});
      }
    }

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];

      console.warn("index-%s, isUpgrade-%s, isGameUpgrade-%s", i, p.isUpgrade, isGameUpgrade);

      // 如果客户端指定发牌
      if (this.rule.test && payload.cards && payload.cards[i].length > 0) {
        for (let j = 0; j < payload.cards[i].length; j++) {
          // 将指定发牌从牌堆中移除
          const cardIndex = this.cards.findIndex(c => c === payload.cards[i][j]);
          if (cardIndex !== -1) {
            this.remainCards--;
            const card = this.cards[cardIndex];
            this.cards.splice(cardIndex, 1);
            this.lastTakeCard = card;
          }
        }
      }

      // 补发牌到16张
      const result = await this.take16Cards(p, this.rule.test && payload.cards && payload.cards[i].length > 0 ?
        payload.cards[i] : [], luckyPlayerIds.includes(i), isGameUpgrade);
      p.flowerList = result.flowerList;
      cardList.push(result);
    }

    const allFlowerList = [];
    cardList.map(value => allFlowerList.push(value.flowerList));
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].onShuffle(this.remainCards, this.caishen, this.restJushu, cardList[i].cards, i,
        this.room.game.juIndex, needShuffle, cardList[i].flowerList, allFlowerList, this.zhuangIndex);
      // 记录发牌
      await this.room.auditManager.playerTakeCardList(this.players[i].model._id, cardList[i].cards);
    }

    // 记录金牌
    this.zhuang.recorder.recordUserEvent(this.zhuang, 'resetGold', [this.caishen], []);

    // 延迟0.5秒，花牌重新摸牌
    const flowerResetCard = async() => {
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.flowerList.length) {
          const result = await this.takeFlowerResetCards(p);

          result.forEach(x => {
            if (!this.isFlower(x)) {
              p.cards[x]++;
            }
          });

          // 记录补花信息
          p.onBuHua(result);

          this.room.broadcast('game/flowerResetCard', {ok: true, data: {restCards: this.remainCards,
              flowerList: p.flowerList, index: i, cards: result}})
        }
      }
    }

    setTimeout(flowerResetCard, 2000);

    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }

    const nextDo = async () => {
      await this.takeFirstCard();
    }

    setTimeout(nextDo, this.sleepTime)
  }

  async takeFirstCard(bigCardStatus = false) {
    const nextCard = await this.consumeCard(this.zhuang, false, true, true, bigCardStatus);
    const msg = await this.zhuang.takeCard(this.turn, nextCard, false, false);
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();
    const playerModel = await service.playerService.getPlayerModel(this.zhuang._id);
    this.stateData = {msg, [Enums.da]: this.zhuang, card: nextCard};
    this.zhuangResetCount++;
    console.warn("nextCard-%s", nextCard);

    // 庄家摸到牌，判断是否可以抢金
    this.qiangJinData = await this.checkPlayerQiangJin();

    // 判断是否可以天胡
    const ind = this.qiangJinData.findIndex(p => p.index === this.zhuang.seatIndex);

    if (msg.hu) {
      if (ind !== -1) {
        this.qiangJinData[ind].tianHu = true;
      } else {
        this.qiangJinData.push({index: this.zhuang.seatIndex, zhuang: this.zhuang.zhuang, card: this.lastTakeCard, tianHu: true, calc: false});
      }
    }

    const isQiangJin = this.qiangJinData.findIndex(p => p.index === this.zhuang.seatIndex && p.qiangJin) !== -1;
    msg.qiangJin = isQiangJin;
    if (!msg.hu) {
      msg.hu = isQiangJin;
    }

    // 判断抢金和天胡重新发牌
    if (this.room.isPublic && msg.hu && this.zhuangResetCount < 2 && category.title === Enums.noviceProtection && playerModel.gameJuShu[GameType.xmmj] <= config.game.noviceProtection) {
      this.cards.push(nextCard);
      this.zhuang.cards[nextCard]--;
      await this.shuffleArray(this.cards);

      const random = Math.random() < 0.9;

      return await this.takeFirstCard(random);
    }

    this.zhuang.sendMessage('game/TakeCard', {ok: true, data: msg});

    const index = this.zhuangIndex;
    this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard, msg}}, this.zhuang.msgDispatcher);

    // 判断抢金和非庄家三金倒为抢金状态
    if (this.qiangJinData.length) {
      this.state = stateQiangJin;

      for (let i = 1; i < this.players.length; i++) {
        const p = this.players[i];
        const qiangDataIndex = this.qiangJinData.findIndex(pp => pp.index === p.seatIndex);
        if (qiangDataIndex !== -1) {
          p.sendMessage("game/canDoQiangJin", {ok: true, data: this.qiangJinData[qiangDataIndex]});
        }
      }
    }

    if (!this.isFlower(nextCard) && !this.qiangJinData.length) {
      this.state = stateWaitDa;
    }
  }

  async checkPlayerQiangJin() {
    const playerIndexs = [];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];

      // 如果是庄家，去除任意一张牌，可以听牌，则可以抢金
      if (p.zhuang) {
        for (let i = Enums.wanzi1; i <= Enums.bai; i++) {
          if (p.cards[i] > 0) {
            p.cards[i]--;
            const tingPai = p.isTing();
            p.cards[i]++;

            if (tingPai) {
              playerIndexs.push({index: p.seatIndex, zhuang: p.zhuang, card: this.caishen, delCard: i, qiangJin: true, calc: false});
              break;
            }
          }
        }
      } else {
        // 非庄家直接判断是否听牌(抢金)
        const tingPai = p.isTing();
        if (tingPai) {
          playerIndexs.push({index: p.seatIndex, zhuang: p.zhuang, card: this.caishen, qiangJin: true, calc: false});
        }
      }

      // 判断是否三金倒
      if (p.cards[this.caishen] === 3) {
        const index = playerIndexs.findIndex(p1 => p1.index === p.seatIndex);

        if (index !== -1) {
          playerIndexs[index].sanJinDao = true;
        } else {
          playerIndexs.push({index: p.seatIndex, zhuang: p.zhuang, card: this.caishen, sanJinDao: true, calc: false});
        }
      }
    }

    return playerIndexs;
  }

  // 根据币种类型获取币种余额
  async PlayerGoldCurrency(playerId) {
    const model = await service.playerService.getPlayerModel(playerId);

    if (this.rule.currency === Enums.goldCurrency) {
      return model.gold;
    }

    return model.tlGold;
  }

  atIndex(player: PlayerState) {
    if (!player) {
      return
    }
    return this.players.findIndex(p => p._id === player._id)
  }

  listenPlayer(player) {
    const index = this.players.indexOf(player)
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
    // TODO drop emit
    player.on('refreshQuiet', (p, idx) => {
      this.onRefresh(idx)
    })

    player.on('waitForDa', async msg => {
      // this.logger.info('waitForDa %s', JSON.stringify(msg))
      if (player.isPublicRobot) {
        // 金豆房机器人， 不打
        return;
      }

      player.deposit(async () => {
        if (msg) {
          const takenCard = msg.card
          const todo = player.ai.onWaitForDa(msg)
          switch (todo) {
            case Enums.gang:
              const gangCard = msg.gang[0][0]
              player.emitter.emit(Enums.gangBySelf, this.turn, gangCard)
              break
            case Enums.hu:
              player.emitter.emit(Enums.hu, this.turn, takenCard)
              break
            default:
              if (this.state === stateQiangJin && this.qiangJinData.findIndex(p => p.index === player.seatIndex) !== -1) {
                // 抢金(金豆房)
                if (!this.qiangJinPlayer.includes(player._id.toString()) && !player.isRobot && this.room.isPublic) {
                  this.qiangJinPlayer.push(player._id.toString());
                  this.setQiangJinAction(player, Enums.qiangJin);
                  player.sendMessage("game/chooseQiangJin", {
                    ok: true,
                    data: {action: Enums.qiangJin, index: player.seatIndex}
                  })

                  return;
                }

                // 抢金(好友房)
                if (!this.qiangJinPlayer.includes(player._id) && !this.room.isPublic) {
                  this.qiangJinPlayer.push(player._id.toString());
                  this.setQiangJinAction(player, Enums.qiangJin);
                  player.sendMessage("game/chooseQiangJin", {
                    ok: true,
                    data: {action: Enums.qiangJin, index: player.seatIndex}
                  })

                  if (this.qiangJinPlayer.length >= this.qiangJinData.length && !this.isRunQiangJin) {
                    this.isRunQiangJin = true;
                    player.emitter.emit(Enums.qiangJinHu);
                  }

                  return;
                }
              } else {
                if (this.stateData[Enums.da] && this.stateData[Enums.da]._id.toString() === player._id.toString()) {
                  const card = await this.promptWithPattern(player, this.lastTakeCard)
                  player.emitter.emit(Enums.da, this.turn, card)
                }
              }

              break
          }
        } else {
          if (this.state === stateQiangJin && this.qiangJinData.findIndex(p => p.index === player.seatIndex) !== -1) {
            // 抢金(金豆房)
            if (!this.qiangJinPlayer.includes(player._id.toString()) && !player.isRobot && this.room.isPublic) {
              this.qiangJinPlayer.push(player._id.toString());
              this.setQiangJinAction(player, Enums.qiangJin);
              player.sendMessage("game/chooseQiangJin", {
                ok: true,
                data: {action: Enums.qiangJin, index: player.seatIndex}
              })

              return;
            }

            // 抢金(好友房)
            if (!this.qiangJinPlayer.includes(player._id) && !this.room.isPublic) {
              this.qiangJinPlayer.push(player._id.toString());
              this.setQiangJinAction(player, Enums.qiangJin);
              player.sendMessage("game/chooseQiangJin", {
                ok: true,
                data: {action: Enums.qiangJin, index: player.seatIndex}
              })

              if (this.qiangJinPlayer.length >= this.qiangJinData.length && !this.isRunQiangJin) {
                this.isRunQiangJin = true;
                player.emitter.emit(Enums.qiangJinHu);
              }

              return;
            }
          } else {
            if (this.stateData[Enums.da] && this.stateData[Enums.da]._id.toString() === player._id.toString()) {
              const card = await this.promptWithPattern(player, this.lastTakeCard)
              player.emitter.emit(Enums.da, this.turn, card)
            }
          }
        }
      })
    })
    player.on('waitForDoSomeThing', msg => {
      player.deposit(() => {
        const card = msg.data.card
        const todo = player.ai.onCanDoSomething(msg.data)
        switch (todo) {
          case Enums.peng:
            player.emitter.emit(Enums.peng, this.turn, card)
            break
          case Enums.gang:
            player.emitter.emit(Enums.gangByOtherDa, this.turn, card)
            break
          case Enums.hu:
            player.emitter.emit(Enums.hu, this.turn, card)
            break
          case Enums.chi:
            // console.log("msg-%s", JSON.stringify(msg.data))
            player.emitter.emit(Enums.chi, this.turn, card, msg.data.chiCombol[0])
            break
          default:
            player.emitter.emit(Enums.guo, this.turn, card)
            break
        }
      })
    })
    player.on('willTakeCard', async denyFunc => {
      if (this.remainCards < (this.rule.noBigCard ? 0 : 16)) {
        denyFunc()
        await this.gameOver(this.players)
        return
      }
    })

    player.on('flowerList', async () => {
      const flowerLists = [];

      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        flowerLists.push({nickname: p.model.nickname, avatar: p.model.avatar, shortId: p.model.shortId, index: p.seatIndex, flowerList: p.flowerList, flowerCount: p.flowerList.length});
      }
      player.sendMessage("game/flowerLists", {ok: true, data: flowerLists})
    })

    player.on(Enums.chi, async (turn, card, shunZiList) => {
      console.warn("index %s chi card %s", player.seatIndex, card);
      const cardList = shunZiList.filter(value => value !== card);
      const otherCard1 = cardList[0]
      const otherCard2 = cardList[1]
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, turn, card);
        // player.sendMessage('game/chiReply', {ok: false, info: TianleErrorCode.chiParamStateInvaid})
        return
      }
      if (this.stateData[Enums.chi] && this.stateData[Enums.chi]._id.toString() !== player._id.toString()) {
        player.emitter.emit(Enums.guo, turn, card);
        return
      }

      this.actionResolver.requestAction(player, 'chi', async () => {
        const ok = await player.chiPai(card, otherCard1, otherCard2, this.lastDa);
        if (ok) {
          this.turn++;
          this.state = stateWaitDa;
          // 新手保护删除牌
          if (player.disperseCards.includes(card)) {
            const chiCards = [card, otherCard1, otherCard2];
            for (let i = 0; i < player.disperseCards.length; i++) {
              if (chiCards.includes(player.disperseCards[i])) {
                player.disperseCards.splice(i, 1);
              }
            }

            console.warn("peng room %s disperseCards-%s", this.room._id, JSON.stringify(player.disperseCards));
          }

          const daCard = await this.promptWithPattern(player, null);
          this.stateData = {da: player, card: daCard, type: Enums.peng};
          const gangSelection = player.getAvailableGangs();
          const from = this.atIndex(this.lastDa);

          player.sendMessage('game/chiReply', {ok: true, data: {
              turn: this.turn,
              card,
              from,
              suit: shunZiList,
              gang: gangSelection.length > 0,
              bigCardList: await this.room.auditManager.getBigCardByPlayerId(player._id, player.seatIndex, player.cards),
              gangSelection,
              forbidCards: player.forbidCards
            }});
          this.room.broadcast('game/oppoChi', {ok: true, data: {
              card,
              turn,
              from,
              index,
              suit: shunZiList,
            }}, player.msgDispatcher);
        } else {
          player.emitter.emit(Enums.guo, turn, card);
        }
      }, () => {
        player.emitter.emit(Enums.guo, turn, card);
      })

      await this.actionResolver.tryResolve()
    })
    player.on(Enums.peng, async (turn, card) => {
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, turn, card);
        return
      }
      if ((this.stateData.pengGang && this.stateData.pengGang._id.toString() !== player._id.toString()) || this.stateData.card !== card) {
        player.emitter.emit(Enums.guo, turn, card);
        return
      }

      this.actionResolver.requestAction(player, 'peng', async () => {
        const ok = await player.pengPai(card, this.lastDa);
        if (ok) {
          const hangUpList = this.stateData.hangUp
          this.turn++
          // 新手保护删除牌
          if (player.disperseCards.includes(card)) {
            for (let i = 0; i < player.disperseCards.length; i++) {
              if (player.disperseCards[i] === card) {
                player.disperseCards.splice(i, 1);
              }
            }

            console.warn("peng room %s disperseCards-%s", this.room._id, JSON.stringify(player.disperseCards));
          }
          this.state = stateWaitDa
          this.stateData = {};
          const gangSelection = player.getAvailableGangs(true);
          const daCard = await this.promptWithPattern(player, null);
          this.stateData = {da: player, card: daCard, type: Enums.peng};
          const from = this.atIndex(this.lastDa)
          const me = this.atIndex(player)
          player.sendMessage('game/pengReply', {ok: true, data: {
              turn: this.turn,
              card,
              from,
              gang: gangSelection.length > 0,
              gangSelection,
              bigCardList: await this.room.auditManager.getBigCardByPlayerId(player._id, player.seatIndex, player.cards),
            }})

          this.room.broadcast('game/oppoPeng', {ok: true, data: {
              card,
              index,
              turn, from
            }}, player.msgDispatcher)

          if (hangUpList.length > 0) {    // 向所有挂起的玩家回复
            hangUpList.forEach(hangUpMsg => {
              hangUpMsg[0].emitter.emit(hangUpMsg[1], ...hangUpMsg[2])
            })
          }

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


        } else {
          player.emitter.emit(Enums.guo, turn, card);
          return;
        }
      }, () => {
        player.emitter.emit(Enums.guo, turn, card);
      })

      await this.actionResolver.tryResolve()
    })
    player.on(Enums.gangByOtherDa, async (turn, card) => {
      console.warn("index %s gangByOtherDa card %s", player.seatIndex, card);
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, turn, card);
        return;
      }
      if (!this.stateData[Enums.gang] || this.stateData[Enums.gang]._id.toString() !== player._id.toString() || this.stateData.card !== card) {
        player.emitter.emit(Enums.guo, turn, card);
        return
      }

      this.actionResolver.requestAction(
        player, 'gang',
        async () => {
          const ok = await player.gangByPlayerDa(card, this.lastDa);
          if (ok) {
            this.turn++;
            // 新手保护删除牌
            if (player.disperseCards.includes(card)) {
              for (let i = 0; i < player.disperseCards.length; i++) {
                if (player.disperseCards[i] === card) {
                  player.disperseCards.splice(i, 1);
                }
              }

              console.warn("gangByOtherDa room %s disperseCards-%s", this.room._id, JSON.stringify(player.disperseCards));
            }
            const from = this.atIndex(this.lastDa)
            const me = this.atIndex(player)
            this.stateData = {};
            player.sendMessage('game/gangReply', {ok: true, data: {card, from, type: "mingGang"}});

            this.room.broadcast(
              'game/oppoGangByPlayerDa',
              {ok: true, data: {card, index, turn, from}},
              player.msgDispatcher
            );

            for (let i = 1; i < 4; i++) {
              const playerIndex = (from + i) % this.players.length
              if (playerIndex === me) {
                break
              }
              this.players[playerIndex].pengForbidden = []
            }

            const nextCard = await this.consumeCard(player);
            const msg = await player.gangTakeCard(this.turn, nextCard);
            if (msg) {
              this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard, msg}}, player.msgDispatcher);

              if (!this.isFlower(nextCard)) {
                this.state = stateWaitDa;
                this.stateData = {da: player, card: nextCard, msg};
              }
            }
          } else {
            player.emitter.emit(Enums.guo, turn, card);
            return;
          }
        },
        () => {
          player.emitter.emit(Enums.guo, turn, card);
        }
      )
      await this.actionResolver.tryResolve()
    })

    player.on(Enums.gangBySelf, async (turn, card) => {
      let gangIndex;
      if (![stateWaitDa, stateQiangJin].includes(this.state)) {
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
      }
      if (!this.stateData[Enums.da] || this.stateData[Enums.da]._id.toString() !== player._id.toString()) {
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
      }
      // if (this.isSomeOne2youOr3you()) {
      //   // 游金中，只能自摸
      //   return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.youJinNotHu});
      // }
      const isAnGang = player.cards[card] >= 3
      gangIndex = this.atIndex(player)
      const from = gangIndex
      this.turn++;

      const broadcastMsg = {turn: this.turn, card, index, isAnGang}

      const ok = await player.gangBySelf(card, broadcastMsg, gangIndex);
      if (ok) {
        this.stateData = {};
        // 新手保护删除牌
        if (player.disperseCards.includes(card)) {
          for (let i = 0; i < player.disperseCards.length; i++) {
            if (player.disperseCards[i] === card) {
              player.disperseCards.splice(i, 1);
            }
          }

          console.warn("gangBySelf room %s disperseCards-%s", this.room._id, JSON.stringify(player.disperseCards));
        }
        player.sendMessage('game/gangReply', {
          ok: true,
          data: {card, from, gangIndex, type: isAnGang ? "anGang" : "buGang"}
        });

        this.room.broadcast('game/oppoGangBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher);

        this.actionResolver = new ActionResolver({turn, card, from}, async () => {
          const nextCard = await this.consumeCard(player);
          const msg = await player.gangTakeCard(this.turn, nextCard);
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard, msg}}, player.msgDispatcher);

          if (!this.isFlower(nextCard)) {
            this.state = stateWaitDa;
            this.stateData = {da: player, card: nextCard, msg};
          }
        })

        await this.actionResolver.tryResolve()
      } else {
        player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
      }
    })

    player.on(Enums.hu, async (turn, card) => {
      const recordCard = this.stateData.card;
      const players = this.players;
      const isJiePao = this.state === stateWaitAction && recordCard === card && this.stateData[Enums.hu] && this.stateData[Enums.hu].findIndex(p => p._id.toString() === player._id.toString()) !== -1;
      const huResult = player.checkZiMo();
      const isZiMo = [stateWaitDa, stateQiangJin].includes(this.state) && recordCard === card && huResult.hu && huResult.huType !== Enums.qiShouSanCai;
      const isQiangJin = this.state === stateQiangJin || (huResult.hu && huResult.huType === Enums.qiShouSanCai);
      console.warn("room-%s, jiePao-%s, ziMo-%s, qiangJin-%s, huResult-%s, caishen-%s, cards-%s， stateData-%s",
        this.room._id, isJiePao, isZiMo, isQiangJin, JSON.stringify(huResult), this.caishen, JSON.stringify(this.getCardArray(player.cards)), JSON.stringify(this.stateData));

      // if (!this.stateData[Enums.hu] || this.stateData[Enums.hu]._id.toString() !== player._id.toString()) {
      //   return ;
      // }

      //双游只能自摸
      if (isJiePao && this.isSomeOne2youOr3you()) {
        player.sendMessage('game/huReply', {ok: false, info: TianleErrorCode.youJinNotHu});
        return;
      }

      // 三游只能杠上开花
      if (isZiMo && !huResult.gangShangKaiHua && this.isSomeOne3you(player)) {
        player.sendMessage('game/huReply', {ok: false, info: TianleErrorCode.youJin3NotHu});
        return;
      }

      if (isJiePao) {
        this.actionResolver.requestAction(player, 'hu', async () => {
            const ok = player.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa);
            const from = this.atIndex(this.lastDa);

            if (ok && player.daHuPai(card, this.players[from])) {
              if (this.stateData[Enums.hu]) {
                const removeIndex = this.stateData[Enums.hu].findIndex(p => p._id.toString() === player._id.toString());
                if (removeIndex === -1) {
                  return ;
                }
              }

              this.lastDa.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);
              this.stateData = {};

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

              const gameOver = async() => {
                await this.gameOver(players);
              }

              const huReply = async() => {
                player.sendMessage('game/huReply', {
                  ok: true,
                  data: {
                    card,
                    from,
                    turn,
                    type: "jiepao"
                  }
                });
                this.room.broadcast('game/oppoHu', {ok: true, data: {turn, card, index, type: "jiepao"}}, player.msgDispatcher);

                setTimeout(gameOver, 1000);
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
        await this.actionResolver.tryResolve()
      } else if (isZiMo) {
        if (this.state === stateQiangJin && !this.isRunQiangJin) {
          // 天胡(金豆房)
          const qiangDataIndex = this.qiangJinData.findIndex(pp => pp.index === player.seatIndex);
          // console.warn("qiangJinData-%s, seatIndex-%s, qiangDataIndex-%s, cards-%s", JSON.stringify(this.qiangJinData), player.seatIndex, qiangDataIndex, JSON.stringify(this.getCardArray(player.cards)));
          if (qiangDataIndex !== -1) {
            if (!this.qiangJinPlayer.includes(player._id.toString()) && !player.isRobot && this.room.isPublic && this.qiangJinData[qiangDataIndex].tianHu) {
              this.qiangJinPlayer.push(player._id.toString());
              this.setQiangJinAction(player, Enums.tianHu);
              player.sendMessage("game/chooseQiangJin", {
                ok: true,
                data: {action: Enums.tianHu, index: player.seatIndex}
              })
            }

            // 天胡(好友房)
            if (!this.qiangJinPlayer.includes(player._id) && !this.room.isPublic && this.qiangJinData[qiangDataIndex].tianHu) {
              this.qiangJinPlayer.push(player._id.toString());
              this.setQiangJinAction(player, Enums.tianHu);
              player.sendMessage("game/chooseQiangJin", {
                ok: true,
                data: {action: Enums.tianHu, index: player.seatIndex}
              })
            }

            if (this.qiangJinPlayer.length >= this.qiangJinData.length && !this.isRunQiangJin) {
              this.isRunQiangJin = true;
              player.emitter.emit(Enums.qiangJinHu);
            }

            return;
          }
        }

        // 解决机器人有时候自摸找不到牌的bug
        if (!card) {
          card = player.cards.findIndex(c => c > 0);
          // console.warn("robot reset card-%s, stateData-%s", card, JSON.stringify(this.stateData));
        }

        const ok = player.zimo(card, turn === 1, this.remainCards === 0);
        if (ok && player.daHuPai(card, null)) {
          // 是否3金倒
          const huSanJinDao = player.events.hu.filter(value => value.huType === Enums.qiShouSanCai).length > 0;
          const huTianHu = player.events.hu.filter(value => value.tianHu).length > 0;

          this.stateData = {};
          this.room.broadcast('game/showHuType', {
            ok: true,
            data: {
              index,
              from: this.atIndex(player),
              cards: [card],
              daCards: [],
              huCards: [],
              card,
              tianHu: huTianHu,
              youJin: huResult.isYouJin && player.events[Enums.youJinTimes] === 1,
              shuangYou: huResult.isYouJin && player.events[Enums.youJinTimes] === 2,
              sanYou: huResult.isYouJin && player.events[Enums.youJinTimes] === 3,
              type: "zimo",
            }
          });

          const gameOver = async() => {
            await this.gameOver(players);
          }

          const huReply = async() => {
            await player.sendMessage('game/huReply', {
              ok: true,
              data: {
                card,
                from: this.atIndex(player),
                type: "zimo",
                turn,
                tianHu: huTianHu,
                youJin: huResult.isYouJin && player.events[Enums.youJinTimes] === 1,
                shuangYou: huResult.isYouJin && player.events[Enums.youJinTimes] === 2,
                sanYou: huResult.isYouJin && player.events[Enums.youJinTimes] === 3,
                youJinTimes: player.events[Enums.youJinTimes] || 0,
                // 是否3金倒
                isSanJinDao: huSanJinDao,
              }
            });

            this.room.broadcast('game/oppoZiMo', {ok: true, data: {
              turn,
                card,
                index,
                type: "zimo",
                youJinTimes: player.events[Enums.youJinTimes] || 0,
                tianHu: huTianHu,
                youJin: huResult.isYouJin && player.events[Enums.youJinTimes] === 1,
                shuangYou: huResult.isYouJin && player.events[Enums.youJinTimes] === 2,
                sanYou: huResult.isYouJin && player.events[Enums.youJinTimes] === 3,
                // 是否3金倒
                isSanJinDao: huSanJinDao
            }}, player.msgDispatcher);

            setTimeout(gameOver, 1000);
          }

          setTimeout(huReply, 1000);
        } else {
          player.emitter.emit(Enums.da, this.turn, card);
        }
      } else if (isQiangJin) {
        // 抢金(金豆房)
        if (!this.qiangJinPlayer.includes(player._id.toString()) && !player.isRobot && this.room.isPublic) {
          this.qiangJinPlayer.push(player._id.toString());
          this.setQiangJinAction(player, huResult.hu && huResult.huType === Enums.qiShouSanCai ? Enums.sanJinDao : Enums.qiangJin);
          const qiangDataIndex = this.qiangJinData.findIndex(p => p.index === player.seatIndex);
          if (qiangDataIndex !== -1 && (huResult.hu && huResult.huType === Enums.qiShouSanCai)) {
            this.qiangJinData[qiangDataIndex].card = card;
          }
          player.sendMessage("game/chooseQiangJin", {
            ok: true,
            data: {action: huResult.hu && huResult.huType === Enums.qiShouSanCai ? Enums.sanJinDao : Enums.qiangJin, index: player.seatIndex}
          })

          if (this.qiangJinPlayer.length >= this.qiangJinData.length && !this.isRunQiangJin) {
            this.isRunQiangJin = true;
            player.emitter.emit(Enums.qiangJinHu);
          }

          return;
        }

        // 抢金(好友房)
        if (!this.qiangJinPlayer.includes(player._id) && !this.room.isPublic) {
          this.qiangJinPlayer.push(player._id.toString());
          this.setQiangJinAction(player, huResult.hu && huResult.huType === Enums.qiShouSanCai ? Enums.sanJinDao : Enums.qiangJin);
          const qiangDataIndex = this.qiangJinData.findIndex(p => p.index === player.seatIndex);
          if (qiangDataIndex !== -1 && (huResult.hu && huResult.huType === Enums.qiShouSanCai)) {
            this.qiangJinData[qiangDataIndex].card = card;
          }
          player.sendMessage("game/chooseQiangJin", {
            ok: true,
            data: {action: huResult.hu && huResult.huType === Enums.qiShouSanCai ? Enums.sanJinDao : Enums.qiangJin, index: player.seatIndex}
          })

          if (this.qiangJinPlayer.length >= this.qiangJinData.length && !this.isRunQiangJin) {
            this.isRunQiangJin = true;
            player.emitter.emit(Enums.qiangJinHu);
          }

          return;
        }

        const huType = huResult.hu && huResult.huType === Enums.qiShouSanCai ? Enums.sanJinDao : Enums.qiangJin;
        if (huType === Enums.qiangJin) {
          player.cards[this.caishen]++;
        }

        // console.warn("qiangJin");

        // 抢金
        const ok = player.zimo(card, turn === 1, this.remainCards === 0, true);
        if (ok && player.daHuPai(card, null)) {
          // 是否3金倒
          const huSanJinDao = player.events.hu.filter(value => value.huType === Enums.qiShouSanCai).length > 0;

          if (!huSanJinDao) {
            player.events.hu[0].huType = Enums.qiangJin;
            player.events.hu[0].qiangJin = true;
            // 将金牌放入手牌参与水数计算
            player.cards[card]++;
          }

          // 如果胡天胡，取消天胡
          if (player.events.hu[0].tianHu) {
            delete player.events.hu[0].tianHu;
          }

          // 闲家三金倒不下发胡的牌
          if (huSanJinDao && !player.zhuang) {
            delete player.events.zimo;
          }

          this.stateData = {};
          this.room.broadcast('game/showHuType', {
            ok: true,
            data: {
              index,
              from: index,
              cards: [card],
              daCards: [],
              huCards: [],
              card,
              type: huSanJinDao ? Enums.sanJinDao : Enums.qiangJin
            }
          });

          const gameOver = async() => {
            await this.gameOver(players);
          }

          const huReply = async() => {
            await player.sendMessage('game/huReply', {
              ok: true,
              data: {
                card,
                from: player.seatIndex,
                type: huSanJinDao ? Enums.sanJinDao : Enums.qiangJin,
                turn,
                youJinTimes: player.events[Enums.youJinTimes] || 0,
                // 是否3金倒
                isSanJinDao: huSanJinDao,
              }
            });

            this.room.broadcast('game/oppoHu', {ok: true, data: {
                turn,
                card,
                index,
                youJinTimes: player.events[Enums.youJinTimes] || 0,
                // 是否3金倒
                isSanJinDao: huSanJinDao,
                type: huSanJinDao ? Enums.sanJinDao : Enums.qiangJin,
              }}, player.msgDispatcher);

            setTimeout(gameOver, 1000);
          }

          setTimeout(huReply, 1000);
        }
      }
    });

    player.on(Enums.da, async (turn, card) => {
      await this.onPlayerDa(player, turn, card);
    })

    player.on(Enums.guo, async (turn, card) => {
      await this.onPlayerGuo(player, card);
    })

    player.on(Enums.qiangJinHu, async () => {
      await this.onPlayerQiangJinHu();
    })

    player.on('lastDa', () => {
      this.players.forEach(x => {
        if (x._id.toString() !== player._id.toString()) {
          x.clearLastDaFlag()
        }
      })
    })
    player.on('recordZiMo', huResult => {
      this.players.forEach(x => {
        if (x._id.toString() !== player._id.toString()) {
          x.recordGameEvent(Enums.taJiaZiMo, huResult)
        }
      })
    })
    player.on('recordAnGang', card => {
      this.players.forEach(x => {
        if (x._id.toString() !== player._id.toString()) {
          x.recordGameEvent(Enums.taJiaAnGang, card)
        }
      })
    })
    player.on('recordMingGangSelf', card => {
      this.players.forEach(x => {
        if (x._id.toString() !== player._id.toString()) {
          x.recordGameEvent(Enums.taJiaMingGangSelf, card)
        }
      })
    })
    player.on('qiShouHu', (info, showCards, restCards) => {
      this.sleepTime = 3000
      this.players.forEach(x => {
        if (x._id.toString() !== player._id.toString()) {
          x.recordGameEvent('taJiaQiShouHu', info)
        }
      })
      player.sendMessage('game/qiShouHu', {ok: true, data: {info, showCards, restCards}})
      this.room.broadcast('game/oppoQiShouHu', {ok: true, data: {info, showCards, index}}, player.msgDispatcher)
    })
    player.on('recordGangShangKaiHua', info => {
      this.players.forEach(x => {
        if (x._id.toString() !== player._id.toString()) {
          x.recordGameEvent('taJiaGangShangKaiHua', info)
        }
      })
    });
  }
  setQiangJinAction(player: PlayerState, action) {
    const index = this.qiangJinData.findIndex(p => p.index === player.seatIndex);
    if (index !== -1) {
      this.qiangJinData[index]["action"] = action;
    }
  }


  nextZhuang(players): PlayerState {
    // 获取本局庄家位置
    const currentZhuangIndex = this.zhuang.seatIndex;

    // 获取本局胡牌用户数据
    const huPlayers = players.filter(p => p.huPai());

    // 计算下一局庄家位置
    let nextZhuangIndex = currentZhuangIndex;
    if (huPlayers.length === 1) {
      nextZhuangIndex = huPlayers[0].seatIndex;
    } else if (huPlayers.length > 1) {
      const loser = players.find(p => p.events[Enums.dianPao]);
      nextZhuangIndex = this.atIndex(loser);
    }

    // 计算用户番数
    const playerFanShus = [];
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      // 记录上一局番数
      p.lastFanShu = p.fanShu;

      // 如果用户是下一局庄家
      if (p.seatIndex === nextZhuangIndex) {
        // 如果用户连庄
        if (nextZhuangIndex === currentZhuangIndex) {
          p.fanShu += 8;
        } else {
          p.fanShu = 16;
          p.zhuangCount = 0;
        }
      } else {
        p.fanShu = 8;
      }

      this.room.fanShuMap[p._id] = p.fanShu;
      playerFanShus.push({index: p.seatIndex, fanShu: this.room.fanShuMap[p._id]});
    }

    // console.warn("huCount-%s, nextZhuangIndex-%s, nextFan-%s", huPlayers.length, nextZhuangIndex, JSON.stringify(playerFanShus));
    return players[nextZhuangIndex];
  }

  // 计算盘数
  calcGangScore(players) {
    players.forEach(playerToResolve => {
      const mingGang = playerToResolve.events.mingGang || [];
      const AnGang = playerToResolve.events.anGang || [];
      let mingGangCount = 0;
      let ziMingGangCount = 0;
      let anGangCount = 0;
      let ziAnGangCount = 0;
      let playerShuiShu = 0;

      for (const gang of mingGang) {
        if (gang < Enums.dong) {
          mingGangCount++;
        }

        if (gang >= Enums.dong && gang <= Enums.bai) {
          ziMingGangCount++;
        }
      }

      const mingGangScore = mingGangCount * config.xmmj.mingGangShui;
      const ziMingGangScore = ziMingGangCount * config.xmmj.ziMingGangShui;
      playerShuiShu += (mingGangScore + ziMingGangScore);

      for (const gang of AnGang) {
        if (gang < Enums.dong) {
          anGangCount++;
        }

        if (gang >= Enums.dong && gang <= Enums.bai) {
          ziAnGangCount++;
        }
      }

      const anGangScore = anGangCount * config.xmmj.anGangShui;
      const ziAnGangScore = ziAnGangCount * config.xmmj.ziAnGangShui;
      playerShuiShu += (anGangScore + ziAnGangScore);

      // 计算金牌盘数
      const goldScore = playerToResolve.cards[this.caishen];
      playerShuiShu += goldScore;

      // 计算花牌盘数
      let huaScore = playerToResolve.flowerList.length;

      //计算花牌春夏秋冬或梅兰竹菊一套
      let flag = true;
      for (let i = Enums.spring; i <= Enums.winter; i++) {
        if (!playerToResolve.flowerList.includes(i)) {
          flag = false;
        }
      }
      let flag1 = true;
      for (let i = Enums.mei; i <= Enums.ju; i++) {
        if (!playerToResolve.flowerList.includes(i)) {
          flag1 = false;
        }
      }
      if ((flag && !flag1) || (!flag && flag1)) {
        huaScore -= 4;
        huaScore += config.xmmj.huaSetShui;
      }

      if (flag && flag1) {
        huaScore -= 8;
        huaScore += config.xmmj.allHuaShui;
      }
      playerShuiShu += huaScore;

      // 计算序数牌暗刻
      let anKeScore = 0;
      for (let i = Enums.wanzi1; i <= Enums.tongzi9; i++) {
        if (playerToResolve.cards[i] >= 3) {
          anKeScore += config.xmmj.anKeShui;
        }
      }
      playerShuiShu += anKeScore;

      // 计算序数牌暗刻
      let ziAnKeScore = 0;
      for (let i = Enums.dong; i <= Enums.bai; i++) {
        if (playerToResolve.cards[i] >= 3) {
          ziAnKeScore += config.xmmj.ziAnKeShui;
        }
      }
      playerShuiShu += ziAnKeScore;

      // 计算字牌碰盘数
      const pengs = playerToResolve.events.peng || [];
      let pengScore = 0;

      for (const peng of pengs) {
        if (peng >= Enums.dong && peng <= Enums.bai) {
          pengScore += config.xmmj.ziPengShui;
        }
      }
      playerShuiShu += pengScore;

      // 记录用户最终盘数
      playerToResolve.shuiShu = playerShuiShu;

      playerToResolve.panInfo = {
        gangScore: mingGangScore + ziMingGangScore + anGangScore + ziAnGangScore,
        goldScore,
        huaScore: huaScore,
        anKeScore: anKeScore + ziAnKeScore,
        pengScore,
        shuiShu: playerToResolve.shuiShu
      }
    })
  }

  async drawGame() {
    // logger.info('state:', this.state);
    if (this.state !== stateGameOver) {
      this.state = stateGameOver
      // 没有赢家
      const states = this.players.map((player, idx) => player.genGameStatus(idx))
      this.calcGangScore(this.players);

      for (const state1 of states) {
        const i = states.indexOf(state1);
        state1.model.played += 1
        state1.score = this.players[i].balance * this.rule.diFen
        await this.room.addScore(state1.model._id, state1.score)
      }
    }

    // await this.room.recordRoomScore('dissolve')
  }

  huTypeScore(p) {
    const events = p.events;

    if (events.hu.filter(value => value.isYouJin && value.youJinTimes === 3).length > 0) {
      return 16;
    }
    if (events.hu.filter(value => value.isYouJin && value.youJinTimes === 2).length > 0) {
      return 8;
    }
    if (events.hu.filter(value => value.huType === Enums.qiShouSanCai).length > 0 || events.hu.filter(value => value.tianHu).length > 0
      || events.hu.filter(value => value.isYouJin && value.youJinTimes === 1).length > 0 || events.hu.filter(value => value.huType === Enums.qiangJin).length > 0) {
      return 4;
    }
    if (events.qiangGang) {
      return 3;
    }
    if (events.zimo) {
      return 2;
    }
    if (events.jiePao) {
      return 1;
    }
  }

  async calcGameScore(players) {
    const huPlayer = players.filter(p => p.huPai())[0];
    const playerPanShus = [];

    // 计算赢家盘数
    const fan = this.huTypeScore(huPlayer);
    huPlayer.panShu = (huPlayer.fanShu + huPlayer.shuiShu) * fan;
    huPlayer.shuiShu = huPlayer.panShu;
    huPlayer.gameOverShuiShu = huPlayer.panShu;
    huPlayer.panInfo["shuiShu"] = huPlayer.shuiShu;

    // 计算输家盘数
    const loserPlayers = players.filter(p => !p.huPai());
    for (let i = 0; i < loserPlayers.length; i++) {
      const loser = loserPlayers[i];
      let loserPanCount = 0;

      for (let j = 0; j < loserPlayers.length; j++) {
        const anotherLoser = loserPlayers[j];

        if (loser._id.toString() !== anotherLoser._id.toString()) {
          loserPanCount += (loser.shuiShu - anotherLoser.shuiShu);
        }
      }

      // 计算输家的净赢盘数
      loser.panShu = loserPanCount;

      // 计算输家最终积分
      loser.balance = -huPlayer.panShu + loser.panShu;

      // 如果输家是庄家，则需要额外扣除庄家得分
      if (loser.zhuang) {
        const zhuangDiFen = loser.fanShu - 8;
        loser.balance -= zhuangDiFen * fan;
      }

      loser.gameOverShuiShu = Math.abs(loser.balance);
      loser.panInfo["shuiShu"] = Math.abs(loser.balance);

      // 如果是好友房，计算积分是否足够扣
      if (!this.room.isPublic && loser.score < Math.abs(loser.balance)) {
        loser.balance = -loser.score;
      }

      loser.score += loser.balance;

      // 计算赢家最终积分
      huPlayer.balance -= loser.balance;
      huPlayer.score -= loser.balance;
      playerPanShus.push({index: loser.seatIndex, panShu: loser.panShu, balance: loser.balance});
    }

    playerPanShus.push({index: huPlayer.seatIndex, panShu: huPlayer.panShu, balance: huPlayer.balance});
  }

  async gameOver(players) {
    if (this.state !== stateGameOver) {
      this.state = stateGameOver;
      const winner = players.filter(x => x.events.jiePao)[0]
      const index = players.findIndex(p => p.events.hu && p.events.hu[0].huType === Enums.qiangJin);
      if (index !== -1) {
        const qiangJinPlayer = players[index];
        if (qiangJinPlayer) {
          qiangJinPlayer.cards[this.caishen]--;
        }
      }

      // 没胡牌 也没放冲
      if (winner) {
        players.filter(x => !x.events.jiePao && !x.events.dianPao)
          .forEach(x => {
            x.events.hunhun = winner.events.hu
          })
      }

      // 计算用户盘数
      this.calcGangScore(players);

      // 计算用户最终得分
      if (players.filter(x => x.huPai()).length > 0) {
        await this.calcGameScore(players);
      }

      // 计算下一局庄家，计算底分
      const nextZhuang = this.nextZhuang(players);
      const states = players.map((player, idx) => player.genGameStatus(idx))
      const huPlayers = players.filter(p => p.huPai());
      let isLiuJu = true;

      await this.recordRubyReward();
      for (const state1 of states) {
        const i = states.indexOf(state1);
        const player = this.players[i];
        state1.model.played += 1;
        if (this.room.isPublic) {
          // 金豆房
          state1.score = player.balance;
          // 是否破产
          state1.isBroke = player.isBroke;
          // 生成战绩
          await this.savePublicCombatGain(player, state1.score);
        } else {
          state1.score = this.players[i].balance * this.rule.diFen
        }
        if (state1.model && state1.model._id) {
          await this.room.addScore(state1.model._id, state1.score);

          // 记录胜率
          await this.setPlayerGameConfig(state1.model, state1.score);

          const playerModel = await service.playerService.getPlayerModel(player._id);
          this.room.broadcast('resource/updateGold', {ok: true, data: {index: i, data: pick(playerModel, ['gold', 'diamond', 'tlGold'])}})
        }

        if (state1.score !== 0) {
          isLiuJu = false;
        }
      }

      // 记录流局
      if (isLiuJu && this.zhuang.recorder) {
        this.zhuang.recorder.recordUserEvent(this.zhuang, 'liuJu', null, []);
      }

      await this.room.recordGameRecord(this, states);
      await this.room.recordRoomScore()
      this.players.forEach(x => x.gameOver())
      this.room.removeListener('reconnect', this.onReconnect)
      this.room.removeListener('empty', this.onRoomEmpty)
      // 是否游金
      const isYouJin = huPlayers.filter(item => item.events.hu.filter(value => value.isYouJin).length > 0).length > 0
      // 是否3金倒
      const isSanJinDao = huPlayers.filter(item => item.events.hu.filter(value => value.huType === Enums.qiShouSanCai).length > 0).length > 0
      const gameOverMsg = {
        creator: this.room.creator.model._id,
        juShu: this.restJushu,
        juIndex: this.room.game.juIndex,
        states,
        liuJu: isLiuJu,
        isYouJin,
        isSanJinDao,
        gameType: GameType.xmmj,
        // 金豆奖池
        rubyReward: 0,
        isPublic: this.room.isPublic,
        caiShen: this.caishen,
        zhuangCount: this.room.zhuangCounter,
        caishen: [this.caishen]
      }


      this.room.broadcast('game/game-over', {ok: true, data: gameOverMsg});
      await this.room.gameOver(nextZhuang._id, states, this.zhuang._id);
    }
  }

  async setPlayerGameConfig(player, score) {
    const model = await Player.findOne({_id: player._id});

    model.isGame = false;
    model.juCount++;
    if (!model.gameJuShu[GameType.xmmj]) {
      model.gameJuShu[GameType.xmmj] = 0;
    }
    model.gameJuShu[GameType.xmmj]++;
    await Player.update({_id: model._id}, {$set: {gameJuShu: model.gameJuShu}});

    if (score > 0) {
      model.juWinCount++;
    }
    model.juRank = (model.juWinCount / model.juCount).toFixed(2);
    model.goVillageCount++;

    if (score > 0) {
      model.juContinueWinCount++;

      if (score > model.reapingMachineAmount) {
        model.reapingMachineAmount = score;
      }
    }

    if (score === 0) {
      model.noStrokeCount++;
    }

    if (score < 0) {
      model.juContinueWinCount = 0;

      if (Math.abs(score) > model.looseMoneyBoyAmount) {
        model.looseMoneyBoyAmount = Math.abs(score);
      }
    }

    await model.save();
  }

  async savePublicCombatGain(player, score) {
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();

    await CombatGain.create({
      uid: this.room._id,
      room: this.room.uid,
      juIndex: this.room.game.juIndex,
      playerId: player._id,
      gameName: "厦门麻将",
      caregoryName: category.title,
      currency: this.rule.currency,
      time: new Date(),
      score
    });
  }

  dissolve() {
    // TODO 停止牌局 托管停止 减少服务器计算消耗
    // this.logger.close()
    this.players = [];
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      if (index !== -1) {
        const player = this.players[index];
        player.onDeposit = false;
        player.reconnect(playerMsgDispatcher)
        player.sendMessage('game/reconnect', {ok: true, data: await this.generateReconnectMsg(index)})
      }
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
      return
    }
    player.sendMessage('room/refresh', {ok: true, data: await this.restoreMessageForPlayer(player)})
  }

  async generateReconnectMsg(index) {
    const player = this.players[index];
    let redPocketsData = null
    let validPlayerRedPocket = null
    if (this.room.isHasRedPocket) {
      redPocketsData = this.room.redPockets;
      validPlayerRedPocket = this.room.vaildPlayerRedPocketArray;
    }

    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();
    const pushMsg = {
      index,
      category,
      status: [],
      caishen: this.caishen,
      remainCards: this.remainCards,
      base: this.room.currentBase,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
      current: {},
      zhuangCounter: this.room.zhuangCounter,
      isGameRunning: !!this.room.gameState && this.state !== stateGameOver,
      redPocketsData,
      validPlayerRedPocket,
      state: this.state,
      stateData: this.stateData,
    }
    for (let i = 0; i < this.players.length; i++) {
      if (i === index) {
        pushMsg.status.push(await this.players[i].genSelfStates(i))
      } else {
        pushMsg.status.push(await this.players[i].genOppoStates(i))
      }
    }

    switch (this.state) {
      case stateQiangJin:
      case stateWaitDa: {
        const state = this.state;
        const daPlayer = this.stateData[Enums.da];
        if (daPlayer._id.toString() === player._id.toString()) {
          console.warn("reconnect msg-%s", JSON.stringify(this.stateData.msg));
          pushMsg.current = {
            index,
            state: 'waitDa',
            msg: this.stateData.msg
          }
        } else {
          pushMsg.current = {index: daPlayer.seatIndex, state: 'waitDa'};

          // 如果抢金状态并且非打牌玩家，下发抢金消息
          const qiangDataIndex = this.qiangJinData.findIndex(p => p.index === player.seatIndex);
          if (state === stateQiangJin && !this.qiangJinPlayer.includes(player._id.toString()) && qiangDataIndex !== -1) {
            player.sendMessage("game/canDoQiangJin", {ok: true, data: this.qiangJinData[qiangDataIndex]});
          }
        }

        this.state = state;
        break;
      }
      case stateWaitAction: {
        const actionList = [];
        const playerAction = this.actionResolver && this.actionResolver.allOptions && this.actionResolver.allOptions(player);
        this.state = stateWaitAction;
        pushMsg.current = {
          index, state: 'waitAction',
          msg: playerAction
        }

        for (let i = 0; i < this.players.length; i++) {
          const pp = this.players[i];
          const actions = this.actionResolver && this.actionResolver.allOptions && this.actionResolver.allOptions(pp);
          console.warn("state-%s, actions-%s, cards-%s", this.state, JSON.stringify(actions), JSON.stringify(this.getCardArray(pp.cards)));
          if (actions) {
            actionList.push(actions);
            // player.emitter.emit(Enums.guo);
          }
        }

        if (this.room.isPublic && !actionList.length) {
          await this.room.forceDissolve();
        }

        if (!this.room.isPublic && !actionList.length) {
          pushMsg.isGameRunning = false;
        }

        break;
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

  async onPlayerDa(player, turn, card) {
    const index = this.players.indexOf(player);
    let from;
    if (this.state === stateQiangJin) {
      const qiangDataIndex = this.qiangJinData.findIndex(p => p.index === player.seatIndex);
      // 如果用户无法天胡，三金倒，抢金，或者闲家可以抢金，三金倒，则不能打牌
      if (qiangDataIndex === -1 || this.qiangJinData.length > 1) {
        player.sendMessage('game/daReply', {
          ok: false,
          info: TianleErrorCode.qiangJinNotDa,
          data: {
            index: player.seatIndex,
            daIndex: this.stateData[Enums.da].seatIndex,
            card,
            turn,
            state: this.state
          }
        })

        return;
      }
    }
    if (!this.stateData[Enums.da] || this.stateData[Enums.da]._id !== player._id) {
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
    if (this.state === stateWaitAction) {
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
    }

    // 获取大牌
    const bigCardList = await this.room.auditManager.getBigCardByPlayerId(player._id, player.seatIndex, player.cards);
    if (bigCardList.length > 0 && bigCardList.indexOf(card) === -1) {
      // 没出大牌
      player.sendMessage('game/daReply', {
        ok: false,
        info: TianleErrorCode.notDaThisCard,
        data: {
          index: this.atIndex(player),
          daIndex: this.atIndex(this.stateData[Enums.da]),
          card,
          bigCardList,
          state: this.state
        }
      })
      return ;
    }

    const ok = await player.daPai(card)
    if (ok) {
      this.lastDa = player;
      player.cancelTimeout();
      this.stateData = {};
      // 新手保护删除牌
      if (player.disperseCards.includes(card)) {
        const disperseIndex = player.disperseCards.findIndex(c => c === card);
        player.disperseCards.splice(disperseIndex, 1);
        console.warn("daPai room %s disperseCards-%s", this.room._id, JSON.stringify(player.disperseCards));
      }
      await player.sendMessage('game/daReply', {ok: true, data: card});
      this.room.broadcast('game/oppoDa', {ok: true, data: {index, card}}, player.msgDispatcher);
      // 扣掉打的牌
      await this.room.auditManager.cardUsed(player.model._id, card);
    } else {
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
      return
    }
    from = this.atIndex(this.lastDa)
    this.turn++

    let check: HuCheck = {card}
    for (let j = 1; j < this.players.length; j++) {
      const result = {card}
      const i = (index + j) % this.players.length
      const p = this.players[i]
      const r = p.markJiePao(card, result)
      if (r.hu) {
        if (!check.hu) check.hu = []
        check.hu.push(p)
        p.huInfo = r.check
      }
    }

    const xiajia = this.players[(index + 1) % this.players.length]
    check = xiajia.checkChi(card, check);

    for (let j = 1; j < this.players.length; j++) {
      const i = (index + j) % this.players.length
      const p = this.players[i]
      if (p.contacted(this.lastDa) < 2) {
        check = p.checkPengGang(card, check)
      }
    }
    const env = {card, from, turn: this.turn}
    this.actionResolver = new ActionResolver(env, async () => {

      const newCard = await this.consumeCard(xiajia);
      const msg = await xiajia.takeCard(this.turn, newCard);
      if (!msg) {
        return ;
      }

      if (!this.isFlower(newCard)) {
        this.state = stateWaitDa;
        this.stateData = {da: xiajia, card: newCard, msg};
      }

      const sendMsg = {index: this.players.indexOf(xiajia), card: newCard, msg}
      this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher)
    })

    if (check[Enums.hu] && !this.isSomeOne2youOr3you()) {
      for (const p of check[Enums.hu]) {
        this.actionResolver.appendAction(p, 'hu', p.huInfo)
      }
    }

    if (check[Enums.pengGang] && this.is2youOr3youByMe(check[Enums.pengGang])) {
      if (check[Enums.peng]) {
        this.actionResolver.appendAction(check[Enums.peng], 'peng')
      }
      if (check[Enums.gang]) {
        const p = check[Enums.gang]
        const gangInfo = [card, p.getGangKind(card, p._id.toString() === player._id.toString())]
        p.gangForbid.push(card)
        this.actionResolver.appendAction(check[Enums.gang], 'gang', gangInfo)
      }
    }

    if (check[Enums.chi] && this.is2youOr3youByMe(check[Enums.chi])) {
      check[Enums.chi].chiCombol = check.chiCombol;
      this.actionResolver.appendAction(check[Enums.chi], 'chi', check.chiCombol)
    }

    for (let i = 1; i < this.players.length; i++) {
      const j = (from + i) % this.players.length;
      const p = this.players[j];
      const msg = this.actionResolver.allOptions(p);
      if (msg) {
        p.record('choice', card, msg)
        // 碰、杠等
        p.sendMessage('game/canDoSomething', {ok: true, data: msg});
        this.room.broadcast('game/oppoCanDoSomething', {
          ok: true,
          data: {...msg, ...{index: this.atIndex(p)}}
        }, p.msgDispatcher);
      }
    }

    // 双游或三游，其他三家无法进行吃碰杠操作
    if ((check[Enums.chi] && this.is2youOr3youByMe(check[Enums.chi])) || (check[Enums.pengGang] && this.is2youOr3youByMe(check[Enums.pengGang])) || (check[Enums.hu] && !this.isSomeOne2youOr3you())) {
      this.state = stateWaitAction;
      this.stateData = check;
      this.stateData.hangUp = [];
    }

    await this.actionResolver.tryResolve()
  }

  async onPlayerGuo(player, playCard) {
    if (this.state === stateQiangJin) {
      // 天胡(金豆房)
      const qiangDataIndex = this.qiangJinData.findIndex(pp => pp.index === player.seatIndex);
      if (qiangDataIndex !== -1) {
        if (!this.qiangJinPlayer.includes(player._id.toString()) && !player.isRobot && this.room.isPublic) {
          this.qiangJinPlayer.push(player._id.toString());
          this.setQiangJinAction(player, Enums.guo);
          player.sendMessage("game/chooseQiangJin", {
            ok: true,
            data: {action: Enums.guo, index: player.seatIndex}
          })
        }

        // 天胡(好友房)
        if (!this.qiangJinPlayer.includes(player._id) && !this.room.isPublic) {
          this.qiangJinPlayer.push(player._id.toString());
          this.setQiangJinAction(player, Enums.guo);
          player.sendMessage("game/chooseQiangJin", {
            ok: true,
            data: {action: Enums.guo, index: player.seatIndex}
          })
        }

        // console.warn("qiangJinPlayerCount-%s, qiangJinDataCount-%s, isRunQiangJin-%s", this.qiangJinPlayer.length, this.qiangJinData.length, this.isRunQiangJin);
        if (this.qiangJinPlayer.length >= this.qiangJinData.length && !this.isRunQiangJin) {
          this.isRunQiangJin = true;
          player.emitter.emit(Enums.qiangJinHu);
        }

        return;
      }
    }

    if (this.state !== stateWaitAction && this.state !== stateQiangGang) {
      // player.sendMessage('game/guoReply', {ok: false, info: TianleErrorCode.notChoiceState});
    } else {
      player.sendMessage('game/guoReply', {ok: true, data: {}});
      player.guoOption(playCard)
      this.actionResolver.cancel(player)
      this.actionResolver.tryResolve()
      return;
    }
  }

  async onPlayerQiangJinHu() {
    const msgs = [];

    // 判断是否同时存在抢金
    let huIndex = [];
    for (let i = 0; i < this.qiangJinData.length; i++) {
      if ([Enums.qiangJin, Enums.sanJinDao, Enums.tianHu].includes(this.qiangJinData[i].action)) {
        huIndex.push(this.qiangJinData[i]);
      }
    }

    // 三金倒人数
    const sanJinDaoPlayer = this.qiangJinData.filter(value => value.action === Enums.sanJinDao).length > 0;
    // 天胡人数
    const tianHuPlayer = this.qiangJinData.filter(value => value.action === Enums.tianHu).length > 0;
    // 抢金人数
    const qiangJinPlayer = this.qiangJinData.filter(value => value.action === Enums.qiangJin).length;

    //闲家三金倒优先级最高
    if (sanJinDaoPlayer) {
      const qiangDataIndex = this.qiangJinData.findIndex(value => value.action === Enums.sanJinDao);
      if (qiangDataIndex !== -1) {
        let cardIndex = this.cards.findIndex(c => !this.isFlower(c));

        // 闲家三金倒少一张牌，所以从牌堆插入一张牌
        if (!this.players[this.qiangJinData[qiangDataIndex].index].zhuang) {
          cardIndex = this.cards[cardIndex];
          this.players[this.qiangJinData[qiangDataIndex].index].cards[cardIndex]++;
        } else {
          cardIndex = this.qiangJinData[qiangDataIndex].card;
        }

        this.players[this.qiangJinData[qiangDataIndex].index].emitter.emit(Enums.hu, this.turn, cardIndex);
        msgs.push({type: Enums.hu, card: cardIndex, index: this.qiangJinData[qiangDataIndex].index});
        this.qiangJinData[qiangDataIndex].calc = true;
      }
    } else if (tianHuPlayer) {
      // 庄家天胡
      const qiangDataIndex = this.qiangJinData.findIndex(value => value.action === Enums.tianHu);
      if (qiangDataIndex !== -1) {
        this.players[this.qiangJinData[qiangDataIndex].index].emitter.emit(Enums.hu, this.turn, this.lastTakeCard);
        msgs.push({type: Enums.hu, card: this.lastTakeCard, index: this.qiangJinData[qiangDataIndex].index});
        this.qiangJinData[qiangDataIndex].calc = true;
      }
    } else if (qiangJinPlayer) {
      // 抢金
      const qiangJinData = this.qiangJinData.filter(value => value.action === Enums.qiangJin);
      let data = qiangJinData[0];
      const zhuangFlag = this.qiangJinData.filter(value => value.zhuang).length > 0;

      if (zhuangFlag && qiangJinPlayer > 1) {
        data = qiangJinData[1];
      }

      // 如果是庄家，移除一张牌换成金牌
      if (this.players[data.index].zhuang) {
        this.players[data.index].cards[data.delCard]--;
      }

      // 插入一张财神牌
      // this.players[data.index].cards[this.caishen]++;

      // console.warn("data-%s, cards-%s", JSON.stringify(data), JSON.stringify(this.getCardArray(this.players[data.index].cards)));

      this.players[data.index].emitter.emit(Enums.hu, this.turn, data.card);
      msgs.push({type: Enums.hu, card: data.card, index: data.index});
      data.calc = true;
    }

    // for (let i = 0; i < this.qiangJinData.length; i++) {
    //   // 处理过牌
    //   if (!this.qiangJinData[i].calc) {
    //     // this.qiangJinData[i].calc = true;
    //     // this.players[this.qiangJinData[i].index].emitter.emit(Enums.guo, this.turn, this.qiangJinData[i].card);
    //     msgs.push({type: Enums.guo, card: this.qiangJinData[i].card, index: this.qiangJinData[i].index});
    //   }
    // }

    const huReply = async () => {
      this.state = stateWaitDa;
      this.room.broadcast("game/qiangJinHuReply", {ok: true, data: {qiangJinData: this.qiangJinData, msg: msgs}});
    }

    setTimeout(huReply, 500);
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

  async recordRubyReward() {
    if (!this.room.isPublic) {
      return null;
    }
    // 金豆房记录奖励
    await this.getBigWinner();
  }

  // 本局大赢家
  async getBigWinner() {
    let winner = [];
    let tempScore = 0;
    // 将分数 * 倍率
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    let times = 1;
    if (!conf) {
      // 配置失败
      console.error('invalid room level');
    } else {
      times = conf.base * conf.Ante;
    }
    let winRuby = 0;
    let lostRuby = 0;
    const winnerList = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]
      console.log('index', p.seatIndex, 'balance', p.balance, 'multiple', times);
      if (p) {
        p.balance *= times;
        if (p.balance > 0) {
          winRuby += p.balance;
          winnerList.push(p);
        } else {
          const currency = await this.PlayerGoldCurrency(p._id);
          if (currency < -p.balance) {
            p.balance = -currency;
            p.isBroke = true;
          }
          lostRuby += p.balance;
        }
        const score = p.balance || 0;
        if (tempScore === score && score > 0) {
          winner.push(p.model.shortId)
        }
        if (tempScore < score && score > 0) {
          tempScore = score;
          winner = [p.model.shortId]
        }
      }
    }
    if (isNaN(winRuby)) {
      winRuby = 0;
    }
    if (isNaN(lostRuby)) {
      lostRuby = 0;
    }
    console.log('win ruby', winRuby, 'lost ruby', lostRuby);
    // 平分奖励
    if (winRuby > 0) {
      for (const p of winnerList) {
        p.balance = Math.floor(p.balance / winRuby * lostRuby * -1);
        console.log('after balance', p.balance, p.model.shortId)
      }
    }
  }

  getPlayerStateById(playerId) {
    for (const p of this.players) {
      if (p && p.model._id === playerId) {
        return p;
      }
    }
    return null;
  }

  promptWithOther(todo, player, card) {
    switch (todo) {
      case Enums.gang:
        player.emitter.emit(Enums.gangByOtherDa, this.turn, this.stateData.card)
        break;
      case Enums.peng:
        player.emitter.emit(Enums.peng, this.turn, this.stateData.card)
        break;
      case Enums.chi:
        player.emitter.emit(Enums.chi, this.turn, this.stateData.card, player.chiCombol[0])
        break;
      case Enums.anGang:
      case Enums.buGang:
        player.emitter.emit(Enums.gangBySelf, this.turn, card)
        break;
      case Enums.hu:
        player.emitter.emit(Enums.hu, this.turn, this.stateData.card)
        break;
      case Enums.qiangJin:
        // 抢金
        if (this.state === stateQiangJin) {
          const qiangDatas = this.qiangJinData.filter(p => !p.isRobot);
          let flag = true;
          for (let i = 0; i < qiangDatas.length; i++) {
            flag = !this.qiangJinPlayer.includes(this.players[qiangDatas[i].index]._id.toString());

            if (!flag) {
              break;
            }
          }
          // 抢金，如果庄家未操作，则机器人禁止操作
          if (qiangDatas.length > 0 && !flag) {
            console.warn("player index-%s not choice card-%s", this.atIndex(this.zhuang), this.stateData.card);
            return;
          }

          // 如果机器人没有操作，则push到数组
          const xianQiangDataIndex = this.qiangJinData.findIndex(p => p.index === player.seatIndex);
          // 闲家可以三金倒
          console.warn("includes-%s xianQiangDataIndex-%s qiangJinData-%s", this.qiangJinPlayer.includes(player._id.toString()), xianQiangDataIndex, JSON.stringify(this.qiangJinData[xianQiangDataIndex]));
          if (!this.qiangJinPlayer.includes(player._id.toString()) && xianQiangDataIndex !== -1 && this.qiangJinData[xianQiangDataIndex].sanJinDao) {
            this.qiangJinPlayer.push(player._id.toString());
            this.setQiangJinAction(player, Enums.sanJinDao);
          } else if (!this.qiangJinPlayer.includes(player._id.toString()) && xianQiangDataIndex !== -1 && this.qiangJinData[xianQiangDataIndex].qiangJin) {
            this.qiangJinPlayer.push(player._id.toString());
            this.setQiangJinAction(player, Enums.qiangJin);
          }

          if (this.qiangJinPlayer.length >= this.qiangJinData.length && !this.isRunQiangJin) {
            this.isRunQiangJin = true;
            player.emitter.emit(Enums.qiangJinHu);
            // console.warn("qiangJinPlayer-%s qiangJinData-%s isRunQiangJin-%s can many hu", JSON.stringify(this.qiangJinPlayer), JSON.stringify(this.qiangJinData), this.isRunQiangJin);
          }

          return;
        }
        break;
    }
  }

  // 托管模式出牌
  async promptWithPattern(player: PlayerState, lastTakeCard) {
    let daCard = 0;
    // 获取摸牌前的卡牌
    const cards = player.cards.slice();
    if (lastTakeCard && cards[lastTakeCard] > 0) cards[lastTakeCard]--;
    // 检查手里有没有要打的大牌
    const bigCardList = await this.room.auditManager.getBigCardByPlayerId(player._id, player.seatIndex, player.cards);
    if (bigCardList.length > 0) {
      // 从大牌中随机选第一个
      return bigCardList[0];
    }

    // 如果用户听牌，则直接打摸牌
    const ting = player.isRobotTing(cards);
    if (ting.hu && player.cards[this.caishen] <= 1) {
      if (lastTakeCard && player.cards[lastTakeCard] > 0 && lastTakeCard !== this.caishen) return lastTakeCard;
    }

    // 有大牌，非单张，先打大牌
    const middleCard = this.checkUserBigCard(player.cards);
    const lonelyCard = this.getCardOneOrNoneLonelyCard(player);
    const twoEightLonelyCard = this.getCardTwoOrEightLonelyCard(player);
    const otherLonelyCard = this.getCardOtherLonelyCard(player);
    const oneNineCard = this.getCardOneOrNineCard(player);
    const twoEightCard = this.getCardTwoOrEightCard(player);
    const otherCard = this.getCardOtherCard(player);
    const oneNineManyCard = this.getCardOneOrNineManyCard(player);
    const twoEightManyCard = this.getCardTwoOrEightManyCard(player);
    const otherManyCard = this.getCardOtherMayCard(player);
    const randCard = this.getCardRandCard(player);

    if (middleCard.code) daCard = middleCard.index;

    // 有1,9孤牌打1,9孤牌
    else if (lonelyCard.code && lonelyCard.index !== this.caishen) daCard = lonelyCard.index;

    // 有2,8孤牌打2,8孤牌
    else if (twoEightLonelyCard.code && twoEightLonelyCard.index !== this.caishen) daCard = twoEightLonelyCard.index;

    // 有普通孤牌打普通孤牌
    else if (otherLonelyCard.code && otherLonelyCard.index !== this.caishen) daCard = otherLonelyCard.index;

    // 有1,9卡张打1,9卡张
    else if (oneNineCard.code && oneNineCard.index !== this.caishen) daCard = oneNineCard.index;

    // 有2,8卡张打2,8卡张

    else if (twoEightCard.code && twoEightCard.index !== this.caishen) daCard = twoEightCard.index;

    // 有普通卡张打普通卡张
    else if (otherCard.code && otherCard.index !== this.caishen) daCard = otherCard.index;

    // 有1,9多张打1,9多张
    else if(oneNineManyCard.code) daCard = oneNineManyCard.index;
    //
    // //有2,8多张打2,8多张
    else if(twoEightManyCard.code) daCard = twoEightManyCard.index;
    //
    // //有普通多张打普通多张
    else if(otherManyCard.code) daCard = otherManyCard.index;

    // 从卡牌随机取一张牌
    else if (randCard.code) daCard = randCard.index;

    if (player.cards[daCard] === 0 || daCard === this.caishen) {
      const card = player.cards.findIndex((cardCount, index) => cardCount > 0 && index !== this.caishen);
      if (card !== -1) {
        daCard = card;
      }
    }

    return daCard;
  }

  checkUserBigCard(cards) {
    for (let i = Enums.dong; i <= Enums.bai; i++) {
      if (this.caishen < Enums.dong && i === Enums.bai) {
        continue;
      }

      if (cards[i] === 1 && i !== this.caishen) {
        return {code: true, index: i};
      }
    }

    return {code: false, index: 0};
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
      if (nextCard[i] === this.caishen) {
        // 金牌，不出
        continue;
      }
      const tailIndex = this.checkUserHasCard(player.cards, nextCard[i]);
      const tailllIndex = this.checkUserHasCard(player.cards, nextCard[i] - 2);
      const taillIndex = this.checkUserHasCard(player.cards, nextCard[i] - 1);
      const tailrIndex = this.checkUserHasCard(player.cards, nextCard[i] + 1);
      const tailrrIndex = this.checkUserHasCard(player.cards, nextCard[i] + 2);

      // 如果是三连张禁止拆牌
      if (tailIndex.count === 1 && ((taillIndex.count === 1 && tailllIndex.count === 1) ||
        (taillIndex.count === 1 && tailrIndex.count === 1) || (tailrIndex.count === 1 && tailrrIndex.count === 1)))
        continue;

      // 如果单张出现3张禁止拆牌
      if (tailIndex.count > 2) continue;

      // 如果2+1,则打1
      if (tailIndex.count === 2 && taillIndex.count === 1 && tailrIndex.count === 0)
        return {code: true, index: taillIndex.index};
      if (tailIndex.count === 2 && taillIndex.count === 0 && tailrIndex.count === 1)
        return {code: true, index: tailrIndex.index};

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

    newCards.forEach(card => {
      values.forEach(v => {
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

    newCards.forEach(card => {
      if (card.value === value) {
        index = card.index;
        count++;
      }
    });

    if (count > 0) return {index, count};
    return {index: 0, count: 0};
  }

  randGoldCard(test, goldCard) {
    const index = manager.randGoldCard();
    // 金牌
    let card = this.cards[this.cards.length - 1 - index];

    if (test && goldCard) {
      card = goldCard;
    }
    // 检查金牌不是花
    if (this.isFlower(card)) {
      // 重新发
      return this.randGoldCard(test, goldCard);
    }
    // 剔除这张牌，只保留3张金
    const cardIndex = this.cards.findIndex(c => c === card);
    this.cards.splice(cardIndex, 1);
    this.remainCards--;
    return card;
  }

  // 用户是否有玩家在2游，3游
  is2youOr3youByMe(player) {
    const p = this.players.find(value => value.youJinTimes > 1);
    return (p && p._id.toString() === player._id.toString()) || !p;
  }

  // 是否有玩家在2游，3游
  isSomeOne2youOr3you() {
    const list = this.players.filter(value => value.youJinTimes > 1)
    return list.length > 0;
  }

  // 是否有玩家在3游
  isSomeOne3you(player) {
    const list = this.players.filter(value => value.youJinTimes === 3 && player._id.toString() !== value._id.toString())
    // console.warn(list.length);
    return list.length > 0;
  }
}

export default TableState

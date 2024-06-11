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
import {GameType, RobotStep, TianleErrorCode} from "@fm/common/constants";

const stateWaitDa = 1
const stateWaitAction = 2
export const stateGameOver = 3
const stateWaitGangShangHua = 4
const stateWaitGangShangAction = 5
const stateQiangHaiDi = 6
const stateWaitDaHaiDi = 7
const stateWaitHaiDiPao = 8
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
          ao.who.sendMessage('game/actionClose', {ok: true, data: {}})
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
  niaos: any[] = []

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

  constructor(room: Room, rule: Rule, restJushu: number) {
    this.restJushu = restJushu
    this.rule = rule
    const players = room.players.map(playerSocket => new PlayerState(playerSocket, room, rule))
    players[0].zhuang = true;
    players[0].zhuangCount++;

    this.cards = generateCards(rule.noBigCard)
    this.room = room
    this.listenRoom(room)
    this.remainCards = this.cards.length
    this.players = players
    this.zhuang = players[0]
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      // console.warn("_id-%s, fanShu-%s, zhuang-%s", p._id, p.fanShu, p.zhuang);
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

  async consumeCard(playerState: PlayerState, notifyFlower = true, reset = false, isHelp = true) {
    const player = playerState
    let cardIndex = --this.remainCards

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

    // 牌堆移除这张牌
    const card = this.cards[cardIndex];
    this.cards.splice(cardIndex, 1);
    this.lastTakeCard = card;

    // console.warn("consume card-%s, cardIndex-%s, remainCards-%s", card, cardIndex, this.remainCards);

    // 如果对局摸到花牌，延迟0.5秒重新摸牌
    if (notifyFlower && this.isFlower(card)) {
      // 拿到花以后,重新发牌
      player.flowerList.push(card);

      if (player) {
        player.cards[card]++;
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
          const sendMsg = {index: this.players.indexOf(player), card: resetCard, msg}
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, player.msgDispatcher)
        }
      }

      setTimeout(getFlowerCard, 700);
    }

    return card
  }

  // 是否是花牌
  isFlower(cardValue) {
    return cardValue >= Enums.spring && cardValue <= Enums.ju
  }

  async take16Cards(player: PlayerState, clist) {
    const cards = this.rule.test ? clist.slice() : [];
    const cardCount = cards.length;
    const flowerList = [];
    let card;
    for (let i = 0; i < 16 - cardCount; i++) {
      card = await this.consumeCard(player, false, false, false);
      if (this.isFlower(card)) {
        flowerList.push(card);
      }

      cards.push(card);
    }
    return {cards, flowerList}
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
    this.shuffle();
    this.sleepTime = 2500;
    // 金牌
    this.caishen = this.randGoldCard(this.rule.test, payload.goldCard);
    await this.room.auditManager.start(this.room.game.juIndex, this.caishen);

    const needShuffle = this.room.shuffleData.length > 0;
    let cardList = [];

    // 测试工具自定义摸9张牌
    if (this.rule.test && payload.moCards && payload.moCards.length > 0) {
      this.testMoCards = payload.moCards;
    }

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];

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
      const result = await this.take16Cards(p, this.rule.test && payload.cards && payload.cards[i].length > 0 ? payload.cards[i] : []);
      p.flowerList = result.flowerList;
      cardList.push(result);
    }

    const allFlowerList = [];
    cardList.map(value => allFlowerList.push(value.flowerList));
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].onShuffle(this.remainCards, this.caishen, this.restJushu, cardList[i].cards, i, this.room.game.juIndex,
        needShuffle, cardList[i].flowerList, allFlowerList);
      // 记录发牌
      await this.room.auditManager.playerTakeCardList(this.players[i].model._id, cardList[i].cards);
    }

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

          this.room.broadcast('game/flowerResetCard', {ok: true, data: {restCards: this.remainCards, flowerList: p.flowerList, index: i, cards: result}})
        }
      }
    }

    setTimeout(flowerResetCard, 2000);

    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }

    const nextDo = async () => {
      const nextCard = await this.consumeCard(this.zhuang, false, true, true);
      const msg = await this.zhuang.takeCard(this.turn, nextCard, false, false);
      this.stateData = {msg, [Enums.da]: this.zhuang, card: nextCard};

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
      this.zhuang.sendMessage('game/TakeCard', {ok: true, data: msg});

      const index = 0
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

    setTimeout(nextDo, this.sleepTime)
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
    }

    return playerIndexs;
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
    // player.on('refreshQuiet', (p, idx) => {
    //   this.onRefresh(idx)
    // })

    player.on('waitForDa', async msg => {
      // this.logger.info('waitForDa %s', JSON.stringify(msg))
      if (player.isPublicRobot) {
        // 金豆房机器人， 不打
        return;
      }
      // 检查手里有没有要打的大牌
      let bigCard = 0;
      const bigCardList = await this.room.auditManager.getBigCardByPlayerId(player._id, player.seatIndex, player.cards);
      if (bigCardList.length > 0) {
        // 从大牌中随机选第一个
        bigCard = bigCardList[0];
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
                if (!this.qiangJinPlayer.includes(player._id.toString()) && player.zhuang && this.room.isPublic) {
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
                const card = await this.promptWithPattern(player, this.lastTakeCard)
                player.emitter.emit(Enums.da, this.turn, card)
              }

              break
          }
        } else {
          if (this.state === stateQiangJin && this.qiangJinData.findIndex(p => p.index === player.seatIndex) !== -1) {
            // 抢金(金豆房)
            if (!this.qiangJinPlayer.includes(player._id.toString()) && player.zhuang && this.room.isPublic) {
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
            const card = await this.promptWithPattern(player, this.lastTakeCard);
            player.emitter.emit(Enums.da, this.turn, card)
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
        await this.gameOver()
        return
      }
    })

    player.on("mayQiaoXiang", () => {
      player.sendMessage("game/mayQiaoXiang", {info: '可以敲响'})
      // this.logger.info('mayQiaoXiang player %s', index)
    })

    player.on("qiaoXiang", ({qiao}) => {
      // this.logger.info('qiaoXiang player-%s qiao :%s ', index, qiao)
      if (qiao) {
        player.setQiaoXiang()
        this.room.broadcast('game/otherQiaoXiang', {player: index})
      }
      player.stashPopTakeCard()
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
      const cardList = shunZiList.filter(value => value !== card);
      const otherCard1 = cardList[0]
      const otherCard2 = cardList[1]
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, turn, card);
        player.sendMessage('game/chiReply', {ok: false, info: TianleErrorCode.chiParamStateInvaid})
        return
      }
      if (this.stateData[Enums.chi] && this.stateData[Enums.chi]._id.toString() !== player._id.toString()) {
        player.emitter.emit(Enums.guo, turn, card);
        player.sendMessage('game/chiReply', {ok: false, info: TianleErrorCode.chiButPlayerChi})
        return
      }

      // if (this.isSomeOne2youOr3you()) {
      //   // 游金中，只能自摸
      //   player.emitter.emit(Enums.guo, turn, card);
      //   player.sendMessage('game/chiReply', {ok: false, info: TianleErrorCode.youJinNotHu})
      //   return;
      // }

      this.actionResolver.requestAction(player, 'chi', async () => {
        const ok = await player.chiPai(card, otherCard1, otherCard2, this.lastDa);
        if (ok) {
          this.turn++;
          this.state = stateWaitDa;
          this.stateData = {da: player};
          const gangSelection = player.getAvailableGangs()
          const from = this.atIndex(this.lastDa)

          player.sendMessage('game/chiReply', {ok: true, data: {
              turn: this.turn,
              card,
              from,
              suit: [card, otherCard1, otherCard2].sort(),
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
              suit: [card, otherCard1, otherCard2].sort(),
            }}, player.msgDispatcher);
        } else {
          player.emitter.emit(Enums.guo, turn, card);
          player.sendMessage('game/chiReply', {ok: false, info: TianleErrorCode.chiNotSuccess});
        }
      }, () => {
        player.emitter.emit(Enums.guo, turn, card);
        player.sendMessage('game/chiReply', {ok: false, info: TianleErrorCode.chiPriorityInsufficient});
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

      // if (this.isSomeOne2youOr3you()) {
      //   // 游金中，只能自摸
      //   player.emitter.emit(Enums.guo, turn, card);
      //   return;
      // }

      this.actionResolver.requestAction(player, 'peng', async () => {
        const ok = await player.pengPai(card, this.lastDa);
        if (ok) {
          const hangUpList = this.stateData.hangUp
          this.turn++
          this.state = stateWaitDa
          const nextStateData = {da: player}
          const gangSelection = player.getAvailableGangs(true)
          this.stateData = nextStateData
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
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, turn, card);
        return;
      }
      if ((this.stateData[Enums.gang] && this.stateData[Enums.gang]._id.toString() !== player._id.toString()) || this.stateData.card !== card) {
        player.emitter.emit(Enums.guo, turn, card);
        return
      }
      // if (this.isSomeOne2youOr3you()) {
      //   // 游金中，只能自摸
      //   player.emitter.emit(Enums.guo, turn, card);
      //   return;
      // }

      this.actionResolver.requestAction(
        player, 'gang',
        async () => {
          const ok = await player.gangByPlayerDa(card, this.lastDa);
          if (ok) {
            this.turn++;
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
      if (this.stateData[Enums.da] && this.stateData[Enums.da]._id.toString() !== player.model._id.toString()) {
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
      const isJiePao = this.state === stateWaitAction && recordCard === card && this.stateData[Enums.hu].contains(player);
      const huResult = player.checkZiMo()
      const isZiMo = [stateWaitDa, stateQiangJin].includes(this.state) && recordCard === card && huResult.hu && huResult.huType !== Enums.qiShouSanCai;
      const isQiangJin = this.state === stateQiangJin || (huResult.hu && huResult.huType === Enums.qiShouSanCai);

      console.warn("jiePao-%s, ziMo-%s, qiangJin-%s, huResult-%s", isJiePao, isZiMo, isQiangJin, JSON.stringify(huResult));
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
              this.lastDa.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);
              this.stateData[Enums.hu].remove(player);
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
                await this.gameOver();
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
                this.room.broadcast('game/oppoHu', {ok: true, data: {turn, card, index}}, player.msgDispatcher);

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
            if (!this.qiangJinPlayer.includes(player._id.toString()) && player.zhuang && this.room.isPublic && this.qiangJinData[qiangDataIndex].tianHu) {
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
          card = this.lastTakeCard;
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
            await this.gameOver();
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
        if (!this.qiangJinPlayer.includes(player._id.toString()) && player.zhuang && this.room.isPublic) {
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

        // 抢金
        const ok = player.zimo(card, turn === 1, this.remainCards === 0);
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
            await this.gameOver();
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
      await this.onPlayerDa(player, turn, card)
    })

    player.on(Enums.guo, async (turn, card) => {
      await this.onPlayerGuo(player, turn, card)
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


  nextZhuang(): PlayerState {
    // 获取本局庄家位置
    const currentZhuangIndex = this.zhuang.seatIndex;

    // 获取本局胡牌用户数据
    const huPlayers = this.players.filter(p => p.huPai());

    // 计算下一局庄家位置
    let nextZhuangIndex = currentZhuangIndex;
    if (huPlayers.length === 1) {
      nextZhuangIndex = huPlayers[0].seatIndex;
    } else if (huPlayers.length > 1) {
      const loser = this.players.find(p => p.events[Enums.dianPao]);
      nextZhuangIndex = this.atIndex(loser);
    }

    // 计算用户番数
    const playerFanShus = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
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
    return this.players[nextZhuangIndex];
  }

  // 计算盘数
  calcGangScore() {
    this.players.forEach(playerToResolve => {
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
        huaScore = config.xmmj.huaSetShui;
      }

      if (flag && flag1) {
        huaScore = config.xmmj.allHuaShui;
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

      // console.warn("index-%s, mingGangScore-%s, ziMingGangScore-%s, anGangScore-%s, ziAnGangScore-%s, goldScore-%s, huaScore-%s, anKeScore-%s, ziAnKeScore-%s, pengScore-%s, shuiShu-%s",
      //   this.atIndex(playerToResolve), mingGangScore, ziMingGangScore, anGangScore, ziAnGangScore, goldScore, huaScore, anKeScore, ziAnKeScore, pengScore, playerToResolve.shuiShu);
    })
  }

  async drawGame() {
    // logger.info('state:', this.state);
    if (this.state !== stateGameOver) {
      this.state = stateGameOver
      // 没有赢家
      const states = this.players.map((player, idx) => player.genGameStatus(idx))
      // this.assignNiaos()
      this.calcGangScore()

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

  async calcGameScore() {
    const huPlayer = this.players.filter(p => p.huPai())[0];
    const playerPanShus = [];

    // 计算赢家盘数
    const fan = this.huTypeScore(huPlayer);
    huPlayer.panShu = (huPlayer.fanShu + huPlayer.shuiShu) * fan;
    huPlayer.shuiShu = huPlayer.panShu;
    huPlayer.panInfo["shuiShu"] = huPlayer.shuiShu;

    // 计算输家盘数
    const loserPlayers = this.players.filter(p => !p.huPai());
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

      // 如果是好友房，计算积分是否足够扣
      if (loser.score < Math.abs(loser.balance)) {
        loser.balance = -loser.score;
      }

      loser.score += loser.balance;

      // 计算赢家最终积分
      huPlayer.balance -= loser.balance;
      huPlayer.score -= loser.balance;
      playerPanShus.push({index: loser.seatIndex, panShu: loser.panShu, balance: loser.balance});
    }

    playerPanShus.push({index: huPlayer.seatIndex, panShu: huPlayer.panShu, balance: huPlayer.balance});

    // console.warn("playerPanShus-%s", JSON.stringify(playerPanShus));
  }

  async gameOver() {
    if (this.state !== stateGameOver) {
      this.state = stateGameOver;
      const winner = this.players.filter(x => x.events.jiePao)[0]
      const index = this.players.findIndex(p => p.events.hu && p.events.hu[0].huType === Enums.qiangJin);
      if (index !== -1) {
        const qiangJinPlayer = this.players[index];
        if (qiangJinPlayer) {
          qiangJinPlayer.cards[this.caishen]--;
        }
      }

      // 没胡牌 也没放冲
      if (winner) {
        this.players.filter(x => !x.events.jiePao && !x.events.dianPao)
          .forEach(x => {
            x.events.hunhun = winner.events.hu
          })
      }

      // 计算用户盘数
      this.calcGangScore();

      // 计算用户最终得分
      if (this.players.filter(x => x.huPai()).length > 0) {
        await this.calcGameScore();
      }

      // 计算下一局庄家，计算底分
      const nextZhuang = this.nextZhuang();

      const states = this.players.map((player, idx) => player.genGameStatus(idx))
      const huPlayers = this.players.filter(p => p.huPai());

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
        } else {
          state1.score = this.players[i].balance * this.rule.diFen
        }
        await this.room.addScore(state1.model._id, state1.score)
      }

      await this.room.recordGameRecord(this, states)
      await this.room.recordRoomScore()
      this.players.forEach(x => x.gameOver())
      this.room.removeListener('reconnect', this.onReconnect)
      this.room.removeListener('empty', this.onRoomEmpty)
      // 是否游金
      const isYouJin = huPlayers.filter(item => item.events.hu.filter(value => value.isYouJin).length > 0).length > 0
      // 是否3金倒
      const isSanJinDao = huPlayers.filter(item => item.events.hu.filter(value => value.huType === Enums.qiShouSanCai).length > 0).length > 0
      const gameOverMsg = {
        niaos: [],
        creator: this.room.creator.model._id,
        juShu: this.restJushu,
        juIndex: this.room.game.juIndex,
        useKun: this.rule.useKun,
        states,
        isYouJin,
        isSanJinDao,
        gameType: GameType.xmmj,
        // 金豆奖池
        rubyReward: 0,
        ruleType: this.rule.ruleType,
        isPublic: this.room.isPublic,
        caiShen: this.caishen,
        zhuangCount: this.room.zhuangCounter,
        maiDi: this.rule.maiDi,
        caishen: [this.caishen]
      }

      this.room.broadcast('game/game-over', {ok: true, data: gameOverMsg});
      await this.room.gameOver(nextZhuang._id, states);
    }
  }

  dissolve() {
    // TODO 停止牌局 托管停止 减少服务器计算消耗
    // this.logger.close()
    this.players = [];
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      const player = this.players[index];
      player.onDeposit = false;
      player.reconnect(playerMsgDispatcher)
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
    console.warn("state-%s", this.state);
    const pushMsg = {
      index,
      status: [],
      caishen: this.caishen,
      remainCards: this.remainCards,
      base: this.room.currentBase,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
      current: {},
      zhuangCounter: this.room.zhuangCounter,
      isGameRunning: !!this.room.gameState,
      redPocketsData,
      validPlayerRedPocket,
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
        this.state = stateWaitDa;
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
        }
        break;
      }
      case stateWaitAction: {
        const actions = this.actionResolver && this.actionResolver.allOptions && this.actionResolver.allOptions(player);
        console.warn("state-%s, actions-%s", this.state, JSON.stringify(actions));
        if (actions) {
          this.state = stateWaitAction;
          pushMsg.current = {
            index, state: 'waitAction',
            msg: actions
          }
        }
        break;
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

  async onPlayerDa(player, turn, card) {
    const index = this.players.indexOf(player);
    let from
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
      this.lastDa = player
      player.cancelTimeout()
      this.stateData = {};
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

    if (xiajia.contacted(this.lastDa) < 2) {
      check = xiajia.checkChi(card, check);
    }

    for (let j = 1; j < this.players.length; j++) {
      const i = (index + j) % this.players.length
      const p = this.players[i]
      if (p.contacted(this.lastDa) < 2) {
        check = p.checkPengGang(card, check)
      }
    }
    const env = {card, from, turn: this.turn}
    this.actionResolver = new ActionResolver(env, async () => {
      const newCard = await this.consumeCard(xiajia)
      const msg = await xiajia.takeCard(this.turn, newCard)

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

    if (check[Enums.pengGang]) {
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

    if (check[Enums.chi]) {
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
        p.sendMessage('game/canDoSomething', {ok: true, data: msg})
        this.room.broadcast('game/oppoCanDoSomething', {
          ok: true,
          data: {...msg, ...{index: this.atIndex(p)}}
        }, p.msgDispatcher);
      }
    }

    if (check[Enums.chi] || check[Enums.pengGang] || (check[Enums.hu] && !this.isSomeOne2youOr3you())) {
      this.state = stateWaitAction;
      this.stateData = check;
      this.stateData.hangUp = [];
    }

    await this.actionResolver.tryResolve()
  }

  async onPlayerGuo(player, playTurn, playCard) {
    if (this.state === stateQiangJin) {
      // 天胡(金豆房)
      const qiangDataIndex = this.qiangJinData.findIndex(pp => pp.index === player.seatIndex);
      if (qiangDataIndex !== -1) {
        if (!this.qiangJinPlayer.includes(player._id.toString()) && player.zhuang && this.room.isPublic) {
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

        if (this.qiangJinPlayer.length >= this.qiangJinData.length && !this.isRunQiangJin) {
          this.isRunQiangJin = true;
          player.emitter.emit(Enums.qiangJinHu);
        }

        return;
      }
    }

    if (this.state !== stateWaitAction && this.state !== stateQiangGang) {
      player.sendMessage('game/guoReply', {ok: false, info: TianleErrorCode.notChoiceState});
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

      // 如果是庄家，移除一张牌
      if (this.players[data.index].zhuang) {
        this.players[data.index].cards[data.delCard]--;
      }

      // 插入一张财神牌
      this.players[data.index].cards[this.caishen]++;

      // console.warn("data-%s, cards-%s", JSON.stringify(data), JSON.stringify(this.getCardArray(this.players[data.index].cards)));

      this.players[data.index].emitter.emit(Enums.hu, this.turn, data.card);
      msgs.push({type: Enums.hu, card: data.card, index: data.index});
      data.calc = true;
    }

    for (let i = 0; i < this.qiangJinData.length; i++) {
      // 处理过牌
      if (!this.qiangJinData[i].calc) {
        // this.players[this.qiangJinData[i].index].emitter.emit(Enums.guo, this.turn, this.qiangJinData[i].card);
        msgs.push({type: Enums.guo, card: this.qiangJinData[i].card, index: this.qiangJinData[i].index});
      }
    }

    const huReply = async () => {
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
      if (p) {
        p.balance *= times;
        if (p.balance > 0) {
          winRuby += p.balance;
          winnerList.push(p);
        } else {
          const model = await service.playerService.getPlayerModel(p.model._id);
          if (model.gold < -p.balance) {
            p.balance = -model.gold;
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
      case Enums.peng:
        player.emitter.emit(Enums.peng, this.turn, this.stateData.card)
        break;
      case Enums.gang:
        player.emitter.emit(Enums.gangByOtherDa, this.turn, this.stateData.card)
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
          const qiangDataIndex = this.qiangJinData.findIndex(p => p.index === this.zhuang.seatIndex);
          // 抢金，如果庄家未操作，则机器人禁止操作
          if (!this.qiangJinPlayer.includes(this.zhuang._id.toString()) && qiangDataIndex !== -1) {
            // console.warn("player index-%s not choice card-%s", this.atIndex(this.zhuang), this.stateData.card);
            return;
          }

          // 如果机器人没有操作，则push到数组
          const xianQiangDataIndex = this.qiangJinData.findIndex(p => p.index === player.seatIndex);
          // 闲家可以三金倒
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
    if (cards[lastTakeCard] > 0) cards[lastTakeCard]--;
    // 检查手里有没有要打的大牌
    const bigCardList = await this.room.auditManager.getBigCardByPlayerId(player._id, player.seatIndex, player.cards);
    if (bigCardList.length > 0) {
      // 从大牌中随机选第一个
      daCard = bigCardList[0];
    }

    // 如果用户听牌，则直接打摸牌
    const ting = player.isRobotTing(cards);
    if (ting.hu) {
      if (player.cards[lastTakeCard] > 0 && lastTakeCard !== this.caishen) daCard = lastTakeCard;
    }

    // 有大牌，非单张，先打大牌
    const middleCard = this.checkUserBigCard(player.cards);
    if (middleCard.code) daCard = middleCard.index;

    // 有1,9孤牌打1,9孤牌
    const lonelyCard = this.getCardOneOrNoneLonelyCard(player);
    if (lonelyCard.code && lonelyCard.index !== this.caishen) daCard = lonelyCard.index;

    // 有2,8孤牌打2,8孤牌
    const twoEightLonelyCard = this.getCardTwoOrEightLonelyCard(player);
    if (twoEightLonelyCard.code && twoEightLonelyCard.index !== this.caishen) daCard = twoEightLonelyCard.index;

    // 有普通孤牌打普通孤牌
    const otherLonelyCard = this.getCardOtherLonelyCard(player);
    if (otherLonelyCard.code && otherLonelyCard.index !== this.caishen) daCard = otherLonelyCard.index;

    // 有1,9卡张打1,9卡张
    const oneNineCard = this.getCardOneOrNineCard(player);
    if (oneNineCard.code && oneNineCard.index !== this.caishen) daCard = oneNineCard.index;

    // 有2,8卡张打2,8卡张
    const twoEightCard = this.getCardTwoOrEightCard(player);
    if (twoEightCard.code && twoEightCard.index !== this.caishen) daCard = twoEightCard.index;

    // 有普通卡张打普通卡张
    const otherCard = this.getCardOtherCard(player);
    if (otherCard.code && otherCard.index !== this.caishen) daCard = otherCard.index;

    // 有1,9多张打1,9多张
    const oneNineManyCard = this.getCardOneOrNineManyCard(player);
    if(oneNineManyCard.code) daCard = oneNineManyCard.index;
    //
    // //有2,8多张打2,8多张
    const twoEightManyCard = this.getCardTwoOrEightManyCard(player);
    if(twoEightManyCard.code) daCard = twoEightManyCard.index;
    //
    // //有普通多张打普通多张
    const otherManyCard = this.getCardOtherMayCard(player);
    if(otherManyCard.code) daCard = otherManyCard.index;

    // 从卡牌随机取一张牌
    const randCard = this.getCardRandCard(player);
    if (randCard.code) daCard = randCard.index;

    if (player.cards[daCard] <= 0) {
      daCard = player.cards.findIndex(cardCount => cardCount > 0);
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

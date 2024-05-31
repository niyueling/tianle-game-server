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
import {TianleErrorCode} from "@fm/common/constants";

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

  constructor(room: Room, rule: Rule, restJushu: number) {
    this.restJushu = restJushu
    this.rule = rule
    const players = room.players.map(playerSocket => new PlayerState(playerSocket, room, rule))
    players[0].zhuang = true

    this.cards = generateCards(rule.noBigCard)
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
    this.state = stateWaitDa
    this.lastDa = null
    this.logger = winston;

    this.setGameRecorder(new GameRecorder(this))
    this.stateData = {}
    this.testMoCards = [];
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
      if (this.lastDa && this.lastDa._id === p._id) {
        this.lastDa = p;
      }
      if (this.zhuang && this.zhuang._id === p._id) {
        this.lastDa = p;
      }

      const stateDataName = ['player', 'pengGang', 'HangUpPeng', 'gangPlayer', 'hangUpBu', 'HangUpGang', 'whom',
        'who', 'HangUpChi']
      for (const name of stateDataName) {
        if (this.stateData[name] && this.stateData[name]._id === p._id) {
          this.stateData[name] = p;
        }
      }
      const stateDataArrayNames = [Enums.hu, Enums.pengGang, Enums.chi, Enums.peng]
      for (const name of stateDataArrayNames) {
        if (this.stateData[name]) {
          for (let j = 0; j < this.stateData[name].length; j++) {
            if (this.stateData[name][j]._id.toString() === p._id.toString()) {
              console.log(name, ` <= name ${p.model.name}, shortId  `, p.model.shortId)
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

    // 如果对局摸到花牌，延迟0.5秒重新摸牌
    if (notifyFlower && this.isFlower(card)) {
      // 拿到花以后,重新发牌
      player.flowerList.push(card);
      this.room.broadcast('game/takeFlower', {ok: true, data: {card, seatIndex: player.seatIndex, remainCards: this.remainCards}})
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

      setTimeout(getFlowerCard, 500);
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

      cards.push(card)
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
    this.shuffle()
    this.sleepTime = 1500
    // 金牌
    this.caishen = this.randGoldCard();
    await this.room.auditManager.start(this.room.game.juIndex, this.caishen);
    // 总牌数扣掉每人16张
    let restCards = this.remainCards - (this.rule.playerCount * 16);
    const needShuffle = this.room.shuffleData.length > 0;
    let cardList = [];

    // 测试工具自定义摸9张牌
    if (this.rule.test && payload.moCards && payload.moCards.length > 0) {
      this.testMoCards = payload.moCards;
    }

    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      const p = this.players[i]
      const result = await this.take16Cards(p, this.rule.test && payload.cards && payload.cards[i].length > 0 ? payload.cards[i] : []);
      // this.logger.info('fapai player-%s :%s', i, result.cards);
      p.flowerList = result.flowerList;
      cardList.push(result);

      // 如果客户端指定发牌
      if (this.rule.test && payload.cards && payload.cards[i].length > 0) {
        for (let j = 0; j < payload.cards[i].length; j++) {
          const cardIndex = this.cards.findIndex(c => c === payload.cards[i][j]);
          this.remainCards--;
          const card = this.cards[cardIndex];
          this.cards.splice(cardIndex, 1);
          this.lastTakeCard = card;
        }
      }
    }
    const allFlowerList = [];
    cardList.map(value => allFlowerList.push(value.flowerList));
    for (let i = 0; i < this.players.length; i++) {
      // this.players[i].fanShu = this.players[i].zhuang ? 16 : 8;
      this.players[i].onShuffle(restCards, this.caishen, this.restJushu, cardList[i].cards, i, this.room.game.juIndex,
        needShuffle, cardList[i].flowerList, allFlowerList)
      // 记录发牌
      await this.room.auditManager.playerTakeCardList(this.players[i].model._id, cardList[i].cards);
    }

    // 延迟0.5秒，花牌重新摸牌
    const flowerResetCard = async() => {
      for (let i = 0; i < this.players.length; i++) {
        const p = this.players[i];
        if (p.flowerList.length) {
          const result = await this.takeFlowerResetCards(p);
          restCards -= p.flowerList.length;

          p.sendMessage('game/flowerResetCard', {ok: true, data: {restCards, flowerList: p.flowerList, index: i, cards: result}})
        }
      }
    }

    setTimeout(flowerResetCard, 500);

    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }

    const nextDo = async () => {
      const nextCard = await this.consumeCard(this.zhuang);
      const msg = await this.zhuang.takeCard(this.turn, nextCard);

      const index = 0
      this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard, msg}}, this.zhuang.msgDispatcher);

      if (!this.isFlower(nextCard)) {
        this.state = stateWaitDa;
        this.stateData = {msg, [Enums.da]: this.zhuang, card: nextCard};
      }
    }

    setTimeout(nextDo, this.sleepTime)
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
      const bigCardList = await this.room.auditManager.getBigCardByPlayerId(player.model._id);
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
              const card = await this.promptWithPattern(player, this.lastTakeCard)
              player.emitter.emit(Enums.da, this.turn, card)
              break
          }
        } else {
          const card = await this.promptWithPattern(player, this.lastTakeCard);
          player.emitter.emit(Enums.da, this.turn, card)
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
      if (this.remainCards < 0) {
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

    player.on(Enums.chi, async (turn, card, shunZiList) => {
      // console.warn("shunZiList-%s", JSON.stringify(shunZiList));
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

      if (this.isSomeOne2youOr3you()) {
        // 游金中，只能自摸
        player.emitter.emit(Enums.guo, turn, card);
        player.sendMessage('game/chiReply', {ok: false, info: TianleErrorCode.youJinNotHu})
        return;
      }

      this.actionResolver.requestAction(player, 'chi', async () => {
        const ok = await player.chiPai(card, otherCard1, otherCard2, this.lastDa);
        if (ok) {
          this.turn++;
          this.state = stateWaitDa;
          this.stateData = {da: player};
          const gangSelection = player.getAvailableGangs()

          player.sendMessage('game/chiReply', {ok: true, data: {
              turn: this.turn,
              card,
              suit: [card, otherCard1, otherCard2].sort(),
              gang: gangSelection.length > 0,
              gangSelection,
              forbidCards: player.forbidCards
            }});
          this.room.broadcast('game/oppoChi', {ok: true, data: {
              card,
              turn,
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

      if (this.isSomeOne2youOr3you()) {
        // 游金中，只能自摸
        player.emitter.emit(Enums.guo, turn, card);
        return;
      }

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
              gangSelection
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
      if (this.isSomeOne2youOr3you()) {
        // 游金中，只能自摸
        player.emitter.emit(Enums.guo, turn, card);
        return;
      }

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
      if (this.state !== stateWaitDa) {
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
      }
      if (this.stateData[Enums.da] && this.stateData[Enums.da]._id.toString() !== player.model._id.toString()) {
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
      }
      if (this.isSomeOne2youOr3you()) {
        // 游金中，只能自摸
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.youJinNotHu});
      }
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
      const isZiMo = this.state === stateWaitDa && recordCard === card;
      if (isJiePao && this.isSomeOne2youOr3you()) {
        player.sendMessage('ame/huReply', {ok: false, info: TianleErrorCode.youJinNotHu});
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
        const ok = player.zimo(card, turn === 1, this.remainCards === 0);
        if (ok && player.daHuPai(card, null)) {
          // 是否3金倒
          const huSanJinDao = player.events.hu.filter(value => value.huType === Enums.qiShouSanCai).length > 0;

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
                // 是否3金倒
                isSanJinDao: huSanJinDao
            }}, player.msgDispatcher);

            setTimeout(gameOver, 1000);
          }

          setTimeout(huReply, 1000);
        } else {
          player.emitter.emit(Enums.da, this.turn, card);
        }
      }
    });

    player.on(Enums.da, async (turn, card) => {
      await this.onPlayerDa(player, turn, card)
    })

    player.on(Enums.guo, async (turn, card) => {
      await this.onPlayerGuo(player, turn, card)
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

  nextZhuang(): PlayerState {
    // 获取本局庄家位置
    const currentZhuangIndex = this.atIndex(this.zhuang);

    // 获取本局胡牌用户数据
    const huPlayers = this.players.filter(p => p.huPai());

    // 计算下一局庄家位置
    let nextZhuangIndex = currentZhuangIndex;
    if (huPlayers.length === 1) {
      nextZhuangIndex = this.atIndex(huPlayers[0])
    } else if (huPlayers.length > 1) {
      const loser = this.players.find(p => p.events[Enums.dianPao]);
      nextZhuangIndex = this.atIndex(loser);
    }

    // 计算用户番数
    const playerFanShus = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      // 如果用户是下一局庄家
      if (this.atIndex(p) === nextZhuangIndex) {
        // 如果用户连庄
        if (nextZhuangIndex === currentZhuangIndex) {
          p.fanShu += 8;
        } else {
          p.fanShu = 16;
        }
      } else {
        p.fanShu = 8;
      }

      playerFanShus.push({index: this.atIndex(p), fanShu: p.fanShu});
    }

    // console.warn("playerFanShus-%s", JSON.stringify(playerFanShus));

    return this.players[nextZhuangIndex]
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
      playerShuiShu += huaScore;

      //计算花牌春夏秋冬或梅兰竹菊一套
      let huaSetScore = 0;
      let flag = true;
      for (let i = Enums.spring; i <= Enums.winter; i++) {
        if (!playerToResolve.flowerList.includes(i)) {
          flag = false;
        }
      }
      if (flag) {
        huaSetScore += config.xmmj.huaSetShui;
        playerShuiShu += huaSetScore;
      }

      flag = true;
      for (let i = Enums.mei; i <= Enums.ju; i++) {
        if (!playerToResolve.flowerList.includes(i)) {
          flag = false;
        }
      }
      if (flag) {
        huaSetScore += config.xmmj.huaSetShui;
        playerShuiShu += huaSetScore;
      }

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

      console.warn("index-%s, mingGangScore-%s, ziMingGangScore-%s, anGangScore-%s, ziAnGangScore-%s, goldScore-%s, huaScore-%s, huaSetScore-%s, anKeScore-%s, ziAnKeScore-%s, pengScore-%s, shuiShu-%s",
        this.atIndex(playerToResolve), mingGangScore, ziMingGangScore, anGangScore, ziAnGangScore, goldScore, huaScore, huaSetScore, anKeScore, ziAnKeScore, pengScore, playerToResolve.shuiShu);
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
    if (events.hu.filter(value => value.huType === Enums.qiShouSanCai).length > 0 || events.tianHu || events.hu.filter(value => value.isYouJin && value.youJinTimes === 1).length > 0) {
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
      loser.balance = -huPlayer.panShu - loser.panShu;

      // 如果输家是庄家，则需要额外扣除庄家得分
      if (loser.zhuang) {
        const zhuangDiFen = loser.fanShu - 8;
        loser.balance - zhuangDiFen * fan;
      }

      // 计算赢家最终积分
      huPlayer.balance -= loser.balance;
      playerPanShus.push({index: loser.seatIndex, panShu: loser.panShu, balance: loser.balance});
    }

    playerPanShus.push({index: huPlayer.seatIndex, panShu: huPlayer.panShu, balance: huPlayer.balance});

    console.warn("playerPanShus-%s", JSON.stringify(playerPanShus));
  }

  async gameOver() {
    if (this.state !== stateGameOver) {
      this.state = stateGameOver
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

      // 计算用户盘数
      this.calcGangScore();

      // 计算用户最终得分
      await this.calcGameScore();

      // 计算下一局庄家，计算底分
      const nextZhuang = this.nextZhuang();

      const huPlayers = this.players.filter(p => p.huPai());
      const states = this.players.map((player, idx) => player.genGameStatus(idx))
      await this.recordRubyReward();
      for (const state1 of states) {
        const i = states.indexOf(state1);
        const player = this.players[i];
        state1.model.played += 1
        if (this.room.isPublic) {
          // 金豆房
          state1.score = player.balance;
          state1.rubyReward = 0;
          // 是否破产
          state1.isBroke = player.isBroke;
        } else {
          state1.score = this.players[i].balance * this.rule.diFen
        }
        await this.room.addScore(state1.model._id, state1.score)
      }

      await this.room.recordGameRecord(this, states)
      await this.room.recordRoomScore()
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
        // 金豆奖池
        rubyReward: 0,
        ruleType: this.rule.ruleType,
        isPublic: this.room.isPublic,
        caiShen: this.caishen,
        base: this.room.currentBase,
        maiDi: this.rule.maiDi
      }

      this.room.broadcast('game/game-over', {ok: true, data: gameOverMsg})
      await this.room.gameOver(nextZhuang.model._id, states)
    }
  }

  dissolve() {
    // TODO 停止牌局 托管停止 减少服务器计算消耗
    // this.logger.close()
    this.players = [];
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = (playerMsgDispatcher, index) => {
      const player = this.players[index]
      player.reconnect(playerMsgDispatcher)
      player.sendMessage('game/reconnect', {ok: true, data: this.generateReconnectMsg(index)})
    })

    room.once('empty', this.onRoomEmpty = () => {
      this.players.forEach(x => {
        x.gameOver()
      })
    })
  }

  restoreMessageForPlayer(player: PlayerState) {
    const index = this.atIndex(player)
    return this.generateReconnectMsg(index)
  }

  onRefresh(index) {
    const player = this.players[index]
    if (!player) {
      return
    }
    player.sendMessage('room/refresh', {ok: true, data: this.restoreMessageForPlayer(player)})
  }

  generateReconnectMsg(index) {
    const player = this.players[index]
    let redPocketsData = null
    let validPlayerRedPocket = null
    if (this.room.isHasRedPocket) {
      redPocketsData = this.room.redPockets;
      validPlayerRedPocket = this.room.vaildPlayerRedPocketArray;
    }
    const pushMsg = {
      index,
      status: [],
      remainCards: this.remainCards,
      base: this.room.currentBase,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
      current: {},
      redPocketsData,
      validPlayerRedPocket
    }
    for (let i = 0; i < this.players.length; i++) {
      if (i === index) {
        pushMsg.status.push(this.players[i].genSelfStates(i))
      } else {
        pushMsg.status.push(this.players[i].genOppoStates(i))
      }
    }

    switch (this.state) {
      case stateWaitDa: {
        const daPlayer = this.stateData[Enums.da]
        if (daPlayer === player) {
          pushMsg.current = {
            index,
            state: 'waitDa',
            msg: this.stateData.msg,
          }
        } else {
          pushMsg.current = {index: this.atIndex(daPlayer), state: 'waitDa'}
        }
        break
      }
      case stateWaitAction: {
        const actions = this.actionResolver.allOptions && this.actionResolver.allOptions(player)
        if (actions) {
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

  async onPlayerDa(player, turn, card) {
    const index = this.players.indexOf(player);
    let from
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
      check = xiajia.checkChi(card, check)
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

    if (check[Enums.hu]) {
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

    if (check[Enums.chi] || check[Enums.pengGang] || check[Enums.hu]) {
      this.state = stateWaitAction;
      this.stateData = check;
      this.stateData.hangUp = [];
    }

    await this.actionResolver.tryResolve()
  }

  async onPlayerGuo(player, playTurn, playCard) {
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
        p.balance *= (times * this.rule.diFen);
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
    // logger.info("index-%s, todo-%s, card-%s, chiCombol-%s", this.atIndex(player), todo, this.stateData.card, player.chiCombol.length ? JSON.stringify(player.chiCombol) : null);

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
    }
  }

  // 托管模式出牌
  async promptWithPattern(player: PlayerState, lastTakeCard) {
    // 获取摸牌前的卡牌
    const cards = player.cards.slice();
    if (cards[lastTakeCard] > 0) cards[lastTakeCard]--;
    // 检查手里有没有要打的大牌
    const bigCardList = await this.room.auditManager.getBigCardByPlayerId(player.model._id);
    if (bigCardList.length > 0) {
      // 从大牌中随机选第一个
      return bigCardList[0];
    }

    // 如果用户听牌，则直接打摸牌
    const ting = player.isRobotTing(cards);
    if (ting.hu) {
      if (player.cards[lastTakeCard] > 0) return lastTakeCard;
    }

    // 有大牌，非单张，先打大牌
    const middleCard = this.checkUserBigCard(player.cards);
    if (middleCard.code) return middleCard.index;

    // 有1,9孤牌打1,9孤牌
    const lonelyCard = this.getCardOneOrNoneLonelyCard(player);
    if (lonelyCard.code && lonelyCard.index !== this.caishen) return lonelyCard.index;

    // 有2,8孤牌打2,8孤牌
    const twoEightLonelyCard = this.getCardTwoOrEightLonelyCard(player);
    if (twoEightLonelyCard.code && twoEightLonelyCard.index !== this.caishen) return twoEightLonelyCard.index;

    // 有普通孤牌打普通孤牌
    const otherLonelyCard = this.getCardOtherLonelyCard(player);
    if (otherLonelyCard.code && otherLonelyCard.index !== this.caishen) return otherLonelyCard.index;

    // 有1,9卡张打1,9卡张
    const oneNineCard = this.getCardOneOrNineCard(player);
    if (oneNineCard.code && oneNineCard.index !== this.caishen) return oneNineCard.index;

    // 有2,8卡张打2,8卡张
    const twoEightCard = this.getCardTwoOrEightCard(player);
    if (twoEightCard.code && twoEightCard.index !== this.caishen) return twoEightCard.index;

    // 有普通卡张打普通卡张
    const otherCard = this.getCardOtherCard(player);
    if (otherCard.code && otherCard.index !== this.caishen) return otherCard.index;

    // 有1,9多张打1,9多张
    // const oneNineManyCard = this.getCardOneOrNineManyCard(player);
    // if(oneNineManyCard.code) return oneNineManyCard.index;
    //
    // //有2,8多张打2,8多张
    // const twoEightManyCard = this.getCardTwoOrEightManyCard(player);
    // if(twoEightManyCard.code) return twoEightManyCard.index;
    //
    // //有普通多张打普通多张
    // const otherManyCard = this.getCardOtherMayCard(player);
    // if(otherManyCard.code) return otherManyCard.index;

    // 从卡牌随机取一张牌
    const randCard = this.getCardRandCard(player);
    if (randCard.code) return randCard.index;
  }

  checkUserBigCard(cards) {
    for (let i = Enums.dong; i < Enums.bai; i++) {
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

  randGoldCard() {
    const index = manager.randGoldCard();
    // 金牌
    const card = this.cards[this.cards.length - 1 - index];
    // 检查金牌不是花
    if (this.isFlower(card)) {
      // 重新发
      return this.randGoldCard();
    }
    // 剔除这张牌，只保留3张金
    this.cards.splice(this.cards.length - 1 - index, 1);
    this.remainCards--;
    return card;
  }

  // 是否有玩家在2游，3游
  isSomeOne2youOr3you() {
    const list = this.players.filter(value => value.youJinTimes > 1)
    return list.length > 0;
  }
}

export default TableState

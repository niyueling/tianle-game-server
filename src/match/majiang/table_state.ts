/**
 * Created by Color on 2016/7/6.
 */
// @ts-ignore
import {isNaN, pick, random} from 'lodash'
import * as moment from 'moment'
import * as logger from "winston";
import * as winston from "winston";
import PlayerModel from "../../database/models/player";
import PlayerHelpDetail from "../../database/models/playerHelpModel";
import TreasureBox from "../../database/models/treasureBox";
import {service} from "../../service/importService";
import algorithm from "../../utils/algorithm";
import alg from "../../utils/algorithm";
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "../serializeDecorator"
import {CardType} from "./card";
import enums from "./enums";
import Enums from "./enums";
import GameRecorder, {IGameRecorder} from './GameRecorder'
import PlayerState from './player_state'
import Room from './room'
import Rule from './Rule'
import {TianleErrorCode} from "@fm/common/constants";
import CardTypeModel from "../../database/models/CardType";
import RoomGoldRecord from "../../database/models/roomGoldRecord";
import {RedisKey} from "@fm/common/constants";

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

  // 本局是否补助
  isHelp: boolean = false;

  // 胡牌类型
  cardTypes: {
    cardId: any;
    cardName: any;
    multiple: number;
  }

  // 解决偶发性重复发牌问题
  isFaPai: boolean = false;

  constructor(room: Room, rule: Rule, restJushu: number) {
    this.restJushu = restJushu
    this.rule = rule
    const players = room.players.map(playerSocket => new PlayerState(playerSocket, room, rule))
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
    const lock = await service.utils.grantLockOnce(RedisKey.inviteWithdraw + playerState._id, 1);
    if (!lock) {
      // 有进程在处理
      console.log('consumeCard another processing');
      return;
    }
    const player = playerState;
    // const sum = player.cards.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
    // if (![1, 4, 7, 10, 13].includes(sum)) {
    //   console.log(`card-length: ${sum}, cards: ${JSON.stringify(player.cards)}`)
    //   return;
    // }

    const cardIndex = --this.remainCards;
    if (cardIndex === 0 && player) {
      player.takeLastCard = true
    }
    const card = this.cards[cardIndex]
    this.cards.splice(cardIndex, 1);
    this.lastTakeCard = card;
    return card;
  }

  async consumeSimpleCard(p: PlayerState) {
    const cardIndex = --this.remainCards;
    const card = this.cards[cardIndex];
    this.cards.splice(cardIndex, 1);
    this.lastTakeCard = card;

    return card;
  }

  async consumeGangOrKeCard(cardNum?) {
    const isGang = Math.random() < 0.3;

    const cardNumber = isGang && !cardNum ? 4 : 3;
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
    if (residueCards >= 3) {
      const consumeCards = await this.consumeGangOrKeCard(3);
      cards = [...cards, ...consumeCards];
    }

    const cardCount = 13 - cards.length;

    for (let i = 0; i < cardCount; i++) {
      cards.push(await this.consumeSimpleCard(player));
    }


    return cards;
  }

  async start() {
    await this.fapai();
  }

  async fapai() {
    this.shuffle()
    this.sleepTime = 0;
    this.caishen = this.rule.useCaiShen ? [Enums.zeus, Enums.poseidon, Enums.athena] : [Enums.slotNoCard]
    const restCards = this.remainCards - (this.rule.playerCount * 13);

    const needShuffle = this.room.shuffleData.length > 0;
    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      const p = this.players[i];
      const cards13 = await this.take13Cards(p);
      p.onShuffle(restCards, this.caishen, this.restJushu, cards13, i, this.room.game.juIndex, needShuffle)
    }

    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }

    const nextDo = async () => {
      const nextCard = await this.consumeCard(this.zhuang)
      const msg = this.zhuang.takeCard(this.turn, nextCard)
      this.logger.info('takeCard player-%s  take %s', this.zhuang._id, nextCard)

      const index = 0
      this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index}}, this.zhuang.msgDispatcher)
      this.state = stateWaitDa
      this.stateData = {msg, da: this.zhuang, card: nextCard}
    }

    if (this.sleepTime === 0) {
      nextDo()
    } else {
      setTimeout(nextDo, this.sleepTime)
    }
  }

  async getCardTypes() {
    return CardTypeModel.where({level: 1}).find();
  }

  atIndex(player: PlayerState) {
    if (!player) {
      return
    }
    return this.players.findIndex(p => p._id.toString() === player._id.toString())
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
    player.on('refreshQuiet', async (p, idx) => {
      await this.onRefresh(idx)
    })

    player.on('waitForDa', msg => {
      logger.info('waitForDa %s', JSON.stringify(msg))
      if (player.isPublicRobot) {
        // 金豆房机器人， 不打
        return;
      }
      player.deposit(() => {
        // console.log("table_state.js 183 ", "执行自动打")
        logger.info('takeCard player-%s  执行自动打', index)

        if (msg) {
          const takenCard = msg.card
          const todo = player.ai.onWaitForDa(msg, player.cards)
          switch (todo) {
            case Enums.gang:
              const gangCard = msg.gang[0][0]
              player.emitter.emit(Enums.gangBySelf, this.turn, gangCard)
              player.sendMessage('game/depositGangBySelf', {ok: true, data: {card: gangCard, turn: this.turn}})
              break
            case Enums.hu:
              player.emitter.emit(Enums.hu, this.turn, takenCard)
              player.sendMessage('game/depositZiMo', {ok: true, data: {card: takenCard, turn: this.turn}})
              break
            default:
              const card = player.ai.getUseLessCard(player.cards, takenCard)
              player.emitter.emit(Enums.da, this.turn, card)
              player.sendMessage('game/depositDa', {ok: true, data: {card, turn: this.turn}})
              break
          }
        } else {
          const card = player.ai.getUseLessCard(player.cards, Enums.slotNoCard)
          player.emitter.emit(Enums.da, this.turn, card)
          player.sendMessage('game/depositDa', {ok: true, data: {card, turn: this.turn}})
        }
      })
    })
    player.on('waitForDoSomeThing', msg => {
      logger.info('waitForDoSomeThing %s card %s', JSON.stringify(msg.data), msg.card)
      player.deposit(() => {
        const card = msg.card
        const todo = player.ai.onCanDoSomething(msg.data, player.cards, card)
        logger.info('waitForDoSomeThing TODO %s', todo)
        switch (todo) {
          case Enums.peng:
            player.emitter.emit(Enums.peng, this.turn, card)
            player.sendMessage('game/depositPeng', {ok: true, data: {card, turn: this.turn}})
            break
          case Enums.gang:
            player.emitter.emit(Enums.gangByOtherDa, this.turn, card)
            player.sendMessage('game/depositGangByOtherDa', {ok: true, data: {card, turn: this.turn}})
            break
          case Enums.hu:
            player.emitter.emit(Enums.hu, this.turn, card)
            player.sendMessage('game/depositHu', {ok: true, data: {card, turn: this.turn}})
            break
          case Enums.chi:
            player.emitter.emit(Enums.chi, this.turn, card, ...msg.chiCombol[0])
            player.sendMessage('game/depositChi', {ok: true, data: {card, turn: this.turn, chiCombol: msg.chiCombol[0]}})
            break
          default:
            player.emitter.emit(Enums.guo, this.turn, card)
            break
        }
      })

      this.logger.info('waitForDoSomeThing player %s', index)
    })
    player.on('willTakeCard', async denyFunc => {
      if (this.remainCards < 0) {
        denyFunc()
        await this.gameOver(null, player);
        return
      }
      this.logger.info('willTakeCard player-%s', index)
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

    player.on(Enums.broke, async () => {
      await this.onPlayerBroke(player);
    })

    player.on(Enums.peng, (turn, card) => {
      // if (this.turn !== turn) {
      //   logger.info('peng player-%s this.turn:%s turn:%s', index, this.turn, turn)
      //   player.emitter.emit(Enums.guo, turn, card)
      //   player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamTurnInvaid});
      //   return
      // }
      if (this.state !== stateWaitAction) {
        logger.info('peng player-%s this.state:%s stateWaitAction:%s', index, this.state, stateWaitAction)
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamStateInvaid});
        return
      }
      if (this.hasPlayerHu()) {
        logger.info('peng player-%s card:%s but has player hu', index, card)
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengButPlayerHu});
        player.lockMessage()
        player.emitter.emit(Enums.guo, turn, card)
        player.unlockMessage()
        return
      }

      if (this.stateData.pengGang !== player || this.stateData.card !== card) {
        logger.info('peng player-%s card:%s has player pengGang or curCard not is this card', index, card)
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamInvaid});
        return
      }

      this.actionResolver.requestAction(player, 'peng', () => {
        const ok = player.pengPai(card, this.lastDa);
        if (ok) {
          const hangUpList = this.stateData.hangUp
          this.turn++
          this.state = stateWaitDa
          const nextStateData = {da: player}
          const gangSelection = player.getAvailableGangs()
          this.stateData = nextStateData
          const from = this.atIndex(this.lastDa)
          const me = this.atIndex(player)
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
      // if (this.turn !== turn) {
      //   logger.info('gangByOtherDa player-%s card:%s turn not eq', index, card)
      //   player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamTurnInvaid});
      //   return;
      // }
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

      try {
        this.actionResolver.requestAction(
          player, 'gang',
          async () => {
            const ok = player.gangByPlayerDa(card, this.lastDa);
            if (ok) {
              this.turn++;
              const from = this.atIndex(this.lastDa)
              const me = this.atIndex(player)
              player.sendMessage('game/gangReply', {ok: true, data: {card, from, type: "mingGang"}});
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

              if (player.isTing()) {
                logger.info('gangByOtherDa player-%s card:%s ting', index, card)
                if (player.events[Enums.anGang] && player.events[Enums.anGang].length > 0) {
                  player.sendMessage('game/showAnGang',
                    {ok: true, data: {index, cards: player.events[Enums.anGang]}})
                  this.room.broadcast('game/oppoShowAnGang',
                    {ok: true, data: {index, cards: player.events[Enums.anGang]}}
                    , player.msgDispatcher)
                }
              }
              logger.info('gangByOtherDa player-%s card:%s gang ok, take card', index, card)

              const nextCard = await this.consumeCard(player);
              const msg = player.gangTakeCard(this.turn, nextCard);
              if (msg) {
                this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index}}, player.msgDispatcher);
                this.state = stateWaitDa;
                this.stateData = {da: player, card: nextCard, msg};
              }
            } else {
              logger.info('gangByOtherDa player-%s card:%s GangReply error:4', index, card)
              player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
              return;
            }
          },
          () => {
            player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangPriorityInsufficient});
          }
        )

        this.actionResolver.tryResolve()
      } catch (e) {
        console.warn(this.actionResolver, e);
      }
    })

    player.on(Enums.gangBySelf, async (turn, card) => {
      let gangIndex;
      // if (this.turn !== turn) {
      //   logger.info(`this.turn !== turn, this.turn:${this.turn}, turn:${turn}`);
      //   return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamTurnInvaid});
      // }
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
        player.sendMessage('game/gangReply', {
          ok: true,
          data: {card, from, gangIndex, type: isAnGang ? "anGang" : "mingGang"}
        });
        this.room.broadcast('game/oppoGangBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher);

        if (!this.isFaPai) {
          this.isFaPai = true;

          const nextCard = await this.consumeCard(player);
          const msg = player.gangTakeCard(this.turn, nextCard);
          if (msg) {
            this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index}}, player.msgDispatcher);
            this.state = stateWaitDa;
            this.stateData = {msg, da: player, card: nextCard};
          } else {
            logger.info('gangByOtherDa player-%s card:%s GangReply error:4', index, card)
            player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangButPlayerPengGang});
            return;
          }

          this.isFaPai = false;
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

          if (qiang && !this.stateData.cancelQiang) {
            logger.info(qiang, this.stateData.cancelQiang);
            this.room.broadcast('game/oppoGangBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher)
            qiang.sendMessage('game/canDoSomething', {
              ok: true, data: {
                card, turn: this.turn, hu: true,
                chi: false, chiCombol: [],
                peng: false, gang: false, bu: false,
              }
            })

            this.state = stateQiangGang
            this.stateData = {
              whom: player,
              who: qiang,
              event: Enums.gangBySelf,
              card, turn: this.turn
            }
            return
          }
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
          const nextCard = await this.consumeCard(player);
          const msg = player.takeCard(this.turn, nextCard);
          if (!msg) {
            return;
          }
          this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index}}, player.msgDispatcher)
          this.state = stateWaitDa
          this.stateData = {msg, da: player, card: nextCard}
        } else {
          player.sendMessage('game/buReply', {ok: false, info: TianleErrorCode.buGangInvaid})
        }
      }
    })
    player.on(Enums.hu, async (turn, card) => {
      logger.info('hu player %s state %s card %s cards %s', index, this.state, card, JSON.stringify(player.cards));
      let from
      const chengbaoStarted = this.remainCards <= 3;

      // if (this.turn !== turn) {
      //   return player.sendMessage('game/huReply', {ok: false, info: TianleErrorCode.huParamTurnInvaid});
      // }

      const recordCard = this.stateData.card;

      try {
        if (this.stateData[Enums.hu]) {
          console.log(this.stateData[Enums.hu]);
        }
        const isJiePao = this.state === stateWaitAction &&
          recordCard === card && this.stateData[Enums.hu] &&
          this.stateData[Enums.hu].contains(player);

        const isZiMo = this.state === stateWaitDa && recordCard === card;

        console.warn(`state %s recordCard %s card %s isZiMo %s this.stateData[Enums.hu].contains(player) %s`, this.state, recordCard, card, isZiMo, this.stateData[Enums.hu].contains(player) )

        const cardTypes = await this.getCardTypes();
        const random = Math.floor(Math.random() * cardTypes.length);
        this.cardTypes = cardTypes[random];

        if (isJiePao) {
          this.actionResolver.requestAction(player, 'hu', async () => {
              const ok = player.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa);
              logger.info('hu  player %s jiepao %s', index, ok)

              from = this.atIndex(this.lastDa);
              if (ok && player.daHuPai(card, this.players[from])) {
                this.lastDa = player;
                await player.sendMessage('game/huReply', {
                  ok: true,
                  data: {
                    card,
                    from,
                    type: "jiepao",
                    huType: {id: this.cardTypes.cardId, multiple: this.cardTypes.multiple}
                  }
                });

                //第一次胡牌自动托管
                if (!player.onDeposit) {
                  player.onDeposit = true
                  await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
                }

                this.stateData[Enums.hu].remove(player);
                this.lastDa.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);
                if (chengbaoStarted) {
                  this.lastDa.recordGameEvent(Enums.chengBao, {});
                }
                this.room.broadcast('game/oppoHu', {ok: true, data: {turn, card, from, index, huType: {id: this.cardTypes.cardId, multiple: this.cardTypes.multiple}}}, player.msgDispatcher);
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
                      data: {turn, card, from, index: playerIndex, huType: {id: this.cardTypes.cardId, multiple: this.cardTypes.multiple}}
                    }, nextPlayer.msgDispatcher)
                  }
                }
                await this.gameOver(this.players[from], player);
                logger.info('hu player %s gameover', index);

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
                      console.warn(`xiajia: ${xiajia.model.shortId}, index: ${this.players.indexOf(xiajia)}`);

                      if (!this.isFaPai) {
                        this.isFaPai = true;

                        try {
                          const newCard = await this.consumeCard(xiajia)
                          if (newCard) {
                            const msg = xiajia.takeCard(this.turn, newCard)

                            if (!msg) {
                              this.isFaPai = false;
                              console.error("consume card error msg ", msg)
                              return;
                            }
                            this.state = stateWaitDa;
                            this.stateData = {da: xiajia, card: newCard, msg};
                            const sendMsg = {index: this.players.indexOf(xiajia)}
                            this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher)
                            logger.info('da broadcast game/oppoTakeCard   msg %s', JSON.stringify(sendMsg), "remainCard", this.remainCards)
                            this.isFaPai = false;
                          }
                        } catch (e) {
                          this.isFaPai = false;
                          console.warn(e);
                        }
                      }
                    }

                    setTimeout(nextDo, 2000);
                  } else {
                    console.warn('No unbroke player found as the next player but last da %s', this.atIndex(this.lastDa));
                  }
                }
              } else {
                player.sendMessage('game/huReply', {ok: false, info: TianleErrorCode.huInvaid, data: {type: "jiePao"}});
              }
            },
            () => {
              player.sendMessage('game/huReply', {ok: false, info: TianleErrorCode.huPriorityInsufficient});
            }
          )

          this.actionResolver.tryResolve()
        } else if (isZiMo) {
          const ok = player.zimo(card, turn === 1, this.remainCards === 0);
          if (ok && player.daHuPai(card, null)) {
            this.lastDa = player;
            from = this.atIndex(this.lastDa);
            await player.sendMessage('game/huReply', {
              ok: true,
              data: {
                card,
                from: this.atIndex(player),
                type: "zimo",
                huType: {id: this.cardTypes.cardId, multiple: this.cardTypes.multiple}
              }
            });

            //第一次胡牌自动托管
            if (!player.onDeposit) {
              player.onDeposit = true
              await player.sendMessage('game/startDepositReply', {ok: true, data: {}})
            }

            this.room.broadcast('game/oppoZiMo', {ok: true, data: {turn, card, from, index, huType: {id: this.cardTypes.cardId, multiple: this.cardTypes.multiple}}}, player.msgDispatcher);
            await this.gameOver(null, player);
            this.logger.info('hu  player %s zimo gameover', index)

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
                  console.warn(`xiajia: ${xiajia.model.shortId}, index: ${this.players.indexOf(xiajia)}`);

                  if (!this.isFaPai) {
                    this.isFaPai = true;

                    try {
                      const newCard = await this.consumeCard(xiajia)
                      if (newCard) {
                        const msg = xiajia.takeCard(this.turn, newCard);

                        if (!msg) {
                          this.isFaPai = false;
                          console.error("consume card error msg ", msg)
                          return;
                        }

                        this.stateData = {da: xiajia, card: newCard, msg};
                        this.state = stateWaitDa;

                        const sendMsg = {index: this.players.indexOf(xiajia)}
                        this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher)
                        logger.info('da broadcast game/oppoTakeCard   msg %s', JSON.stringify(sendMsg), "remainCard", this.remainCards)
                        this.isFaPai = false;
                      }
                    } catch (e) {
                      this.isFaPai = false;
                      console.warn(e);
                    }
                  }
                }

                setTimeout(nextDo, 2000);
              } else {
                console.warn('No unbroke player found as the next player but last da %s', this.atIndex(this.lastDa));
              }
            }
          } else {
            console.warn("ok:", ok);
            player.sendMessage('game/huReply', {ok: false, info: TianleErrorCode.huInvaid, data: {type: "ziMo"}});
          }
        } else if (this.state === stateQiangGang) {
          if (this.stateData.who === player && turn === this.stateData.turn) {
            player.cards.qiangGang = true
            from = this.atIndex(this.lastDa);

            const qiangGangJiePao = player.jiePao(card, turn === 2, this.remainCards === 0, this.stateData.whom)
            logger.info('hu  player %s stateQiangGang jiePao %s', index, qiangGangJiePao)
            if (qiangGangJiePao) {
              if (chengbaoStarted) {
                this.stateData.whom.recordGameEvent(Enums.chengBao, {});
              }

              player.sendMessage('game/huReply', {ok: true, data: {card, from}})
              this.stateData.whom.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);
              // this.stateData.whom.recordGameEvent(Enums.chengBao, {})
              this.room.broadcast('game/oppoHu', {ok: true, data: {turn, card, from, index}}, player.msgDispatcher);
              const huPlayerIndex = this.atIndex(player)
              for (let i = 1; i < this.players.length; i++) {
                const playerIndex = (huPlayerIndex + i) % this.players.length
                const nextPlayer = this.players[playerIndex]
                if (nextPlayer === this.stateData.whom) {
                  break
                }

                if (nextPlayer.checkJiePao(card, true)) {
                  nextPlayer.cards.qiangGang = true
                  nextPlayer.jiePao(card, turn === 2, this.remainCards === 0, this.stateData.whom)
                  nextPlayer.sendMessage('game/genHu', {ok: true, data: {}})
                  this.room.broadcast('game/oppoHu', {
                    ok: true,
                    data: {turn, card, index: playerIndex}
                  }, nextPlayer.msgDispatcher)
                }
              }
              await this.gameOver(null, player);
              logger.info('hu  player %s stateQiangGang jiePao gameOver', index)

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
                console.warn(`xiajia: ${xiajia.model.shortId}, index: ${this.players.indexOf(xiajia)}`);
              } else {
                console.warn('No unbroke player found as the next player');
              }

              const env = {card, from, turn: this.turn}
              this.actionResolver = new ActionResolver(env, async () => {
                const newCard = await this.consumeCard(xiajia)
                const msg = xiajia.takeCard(this.turn, newCard)

                if (!msg) {
                  console.error("consume card error msg ", msg)
                  return;
                }
                this.state = stateWaitDa;
                this.stateData = {da: xiajia, card: newCard, msg};
                const sendMsg = {index: this.players.indexOf(xiajia)}
                this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher)
                logger.info('da broadcast game/oppoTakeCard   msg %s', JSON.stringify(sendMsg), "remainCard", this.remainCards)
              })
            } else {
              player.cards.qiangGang = false
            }
          } else {
            player.sendMessage('game/huReply', {ok: false, info: TianleErrorCode.huPriorityInsufficient})
            logger.info('hu  player %s stateQiangGang 不是您能抢', index)
          }

          this.actionResolver.tryResolve()
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

  async onPlayerBroke(player) {
    // 用户第一次破产
    player.isBroke = true;
    player.isGameOver = true;
    this.state = stateWaitDa;
    await this.playerGameOver(player, [], player.genGameStatus(this.atIndex(player), 1));
  }

  async onPlayerDa(player, turn, card) {
    const index = this.players.indexOf(player);
    this.logger.info('da player-%s card:%s', index, card)
    let from

    if (this.state !== stateWaitDa) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.cardDaError})
      logger.info('da player-%s card:%s 不能打牌', index, card)
      return
    } else if (!this.stateData[Enums.da] || this.stateData[Enums.da]._id !== player._id) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaRound})
      logger.info('da player-%s card:%s 不是您的回合', index, card)
      return
    }

    const lock = await service.utils.grantLockOnce(RedisKey.daPaiLock + player._id, 1);
    if (!lock) {
      // 有进程在处理
      console.log('onPlayerDa another processing');
      return;
    }

    const ok = player.daPai(card);
    if (!ok) {
      player.sendMessage('game/daReply', {ok: false, info: TianleErrorCode.notDaThisCard});
      logger.info('da player-%s card:%s 不能打这张牌', index, card);
      // return;
    }

    this.lastDa = player;
    player.cancelTimeout();

    if (ok) {
      await player.sendMessage('game/daReply', {ok: true, data: card});
      this.room.broadcast('game/oppoDa', {ok: true, data: {index, card}}, player.msgDispatcher);
    }

    // 打牌后，延迟2秒给其他用户发牌
    const nextDo = () => {
      from = this.atIndex(this.lastDa);
      this.turn++;

      let check: HuCheck = {card}
      for (let j = 1; j < this.players.length; j++) {
        const result = {card};
        const i = (index + j) % this.players.length;
        const p = this.players[i];
        const r = p.markJiePao(card, result);
        if (r.hu) {
          if (!check.hu) check.hu = [];
          check.hu.push(p);
          p.huInfo = r.check;
        }
      }

      let xiajia = null;
      let startIndex = (index + 1) % this.players.length;

      // 从 startIndex 开始查找未破产的玩家
      for (let i = startIndex; i < startIndex + this.players.length; i++) {
        let index = i % this.players.length; // 处理边界情况，确保索引在数组范围内
        if (!this.players[index].isBroke) {
          xiajia = this.players[index];
          break;
        }
      }

      if (xiajia && !this.isFaPai) {
        console.warn(`xiajia: ${xiajia.model.shortId}, index: ${this.players.indexOf(xiajia)}`);
        this.isFaPai = true;

        const env = {card, from, turn: this.turn}
        this.actionResolver = new ActionResolver(env, async () => {
          const newCard = await this.consumeCard(xiajia);
          if (newCard) {
            const msg = xiajia.takeCard(this.turn, newCard);

            if (!msg) {
              console.error("consume card error msg ", msg);
              this.room.broadcast('game/game-error', {
                ok: false,
                data: {name: "game/takeCard", msg: "consume card error msg"}
              }, xiajia.msgDispatcher);
              return;
            }
            this.state = stateWaitDa;
            this.stateData = {da: xiajia, card: newCard, msg};
            const sendMsg = {index: this.players.indexOf(xiajia)}
            this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher);
            logger.info('da broadcast game/oppoTakeCard  msg %s', JSON.stringify(sendMsg), "remainCard", this.remainCards);
          }
        })

        this.isFaPai = false;
      } else {
        this.room.broadcast('game/game-error', {ok: false, data: {name: "game/takeCard", msg: "No unbroke player found as the next player", data: {players: this.players, isFaPai: this.isFaPai}}});
        return console.warn('No unbroke player found as the next player');
      }

      for (let j = 1; j < this.players.length; j++) {
        const i = (index + j) % this.players.length
        const p = this.players[i]
        if (p.contacted(this.lastDa) < 2) {
          check = p.checkPengGang(card, check)
        }
      }

      if (check[Enums.hu]) {
        for (const p of check[Enums.hu]) {
          this.actionResolver.appendAction(p, 'hu', p.huInfo)
        }
      }

      if (check[Enums.pengGang]) {
        if (check[Enums.peng]) this.actionResolver.appendAction(check[Enums.peng], 'peng')
        if (check[Enums.gang]) {
          const p = check[Enums.gang]
          const gangInfo = [card, p.getGangKind(card, p._id.toString() === player.model._id.toString())]
          p.gangForbid.push(card)
          this.actionResolver.appendAction(check[Enums.gang], 'gang', gangInfo)
        }
      }

      for (let i = 1; i < this.players.length; i++) {
        const j = (from + i) % this.players.length;
        const p = this.players[j]

        const msg = this.actionResolver.allOptions(p)
        if (msg && !p.isBroke) {
          p.record('choice', card, msg)
          // 碰、杠等
          p.sendMessage('game/canDoSomething', {ok: true, data: msg});
        }
      }

      if (check[Enums.pengGang] || check[Enums.hu]) {
        this.state = stateWaitAction;
        this.stateData = check;
        this.stateData.hangUp = [];
      }

      this.actionResolver.tryResolve()
    }

    setTimeout(nextDo, 2000);
  }

  multiTimesSettleWithSpecial(states, specialId, times) {
    const specialState = states.find(s => s.model._id === specialId)

    console.log(`${__filename}:1577 multiTimesSettleWithSpecial`, specialState)

    if (specialState.score > 0) {
      for (const state of states) {
        state.score *= times
      }
    } else {
      const winState = states.find(s => s.score > 0)
      if (winState) {
        winState.score += specialState.score * -(times - 1)
        specialState.score *= times
      }
    }
  }

  async generateNiao() {
    const playerNiaos = []
    const playerIndex = 0
    if (this.rule.quanFei > 0) {
      for (const p of this.players) {
        p.niaoCards = []
        playerNiaos[playerIndex] = {}
        playerNiaos[playerIndex][p._id] = []
        for (let i = 0; i < this.rule.quanFei; i++) {
          const niaoPai = await this.consumeCard(null)
          if (niaoPai) {
            playerNiaos[playerIndex][p._id].push(niaoPai)
            p.niaoCards.push(niaoPai)
          }
        }
      }
    } else {
      this.players[0].niaoCards = []
      for (let i = 0; i < this.rule.feiNiao; i++) {
        const niaoPai = await this.consumeCard(null)
        if (niaoPai) {
          if (!playerNiaos[0]) {
            playerNiaos[0] = {}
            playerNiaos[0][this.players[0]._id] = []
          }
          playerNiaos[0][this.players[0]._id].push(niaoPai)
          this.players[0].niaoCards.push(niaoPai)
        }
      }
    }

    return playerNiaos
  }

  assignNiaos() {
    this.players.forEach(p => {
      const playerNiaos = p.niaoCards
      const nPlayers = this.players.length
      for (const niao of playerNiaos) {
        const tail = niao % 10
        const index = (tail + nPlayers - 1) % nPlayers
        this.players[index].niaoCount += 1
        this.players[index].buyer.push(p)
      }
    })
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
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))

      const nextZhuang = this.nextZhuang()
      const niaos = await this.generateNiao()
      this.assignNiaos()
      this.niaos = niaos

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
        return await this.gameAllOver(states, niaos, nextZhuang);
      }

      const recordCount = await CardTypeModel.count();
      if (recordCount > 0) {
        await CardTypeModel.where({_id: {$ne: null}}).remove();
        await this.saveCardType();
      }

      if (this.cardTypes.multiple) {
        // 将分数 * 倍率
        const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);

        this.players.map((p) => {
          p.balance = 0;
        })
        let failList = [];
        let winBalance = 0;

        // 点炮胡
        if (from) {
          failList.push(from.model._id.toString());
          const model = await service.playerService.getPlayerModel(from._id.toString());
          // 扣除点炮用户金币
          from.balance = -conf.Ante * conf.maxMultiple * this.cardTypes.multiple;
          if (Math.abs(from.balance) >= model.gold) {
            from.balance = -model.gold;
          }
          winBalance += Math.abs(from.balance);
          await this.room.addScore(from.model._id.toString(), from.balance, this.cardTypes);
        } else {
          // 自摸胡
          for (const p of this.players) {
            // 扣除三家金币
            if (p.model._id.toString() !== to.model._id.toString() && !p.isBroke) {
              const model = await service.playerService.getPlayerModel(p._id.toString());
              p.balance = -conf.Ante * conf.maxMultiple * this.cardTypes.multiple;
              if (Math.abs(p.balance) >= model.gold) {
                p.balance = -model.gold;
              }
              winBalance += Math.abs(p.balance);
              await this.room.addScore(p.model._id.toString(), p.balance, this.cardTypes);
              failList.push(p.model._id.toString());
            }
          }
        }

        //增加胡牌用户金币
        to.balance = winBalance;
        await this.room.addScore(to.model._id.toString(), winBalance, this.cardTypes);

        // 生成金豆记录
        await RoomGoldRecord.create({
          winnerGoldReward: winBalance,
          winnerId: to.model._id.toString(),
          roomId: this.room._id,
          failList,
          juIndex: this.room.game.juIndex,
          cardTypes: this.cardTypes
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
          gold: p.balance,
          currentGold: model.gold,
          isBroke: false,
          huType: this.cardTypes
        };
        if (model.gold <= 0) {
          if (!p.isBroke && params.index === 0) {
            waits.push(params);
          } else {
            if (!p.isBroke) {
              // 用户第一次破产
              p.isBroke = true;
              params.isBroke = true;

              // 需要增加破产接口，用户将用户置于破产状态，并执行playerGameOver
              p.isGameOver = true;
              await this.playerGameOver(p, niaos, p.genGameStatus(this.atIndex(p), 1));
            }

            brokePlayers.push(p);
          }
        }

        playersModifyGolds.push(params);
      }

      this.room.broadcast("game/playerChangeGold", {ok: true, data: playersModifyGolds});

      if (waits.length > 0) {
        this.state = stateWaitRecharge;
        this.room.broadcast("game/waitRechargeReply", {ok: true, data: waits});
      }

      if (brokePlayers.length >= 3) {
        const _this = this;
        setTimeout(function () {
          _this.gameAllOver(states, niaos, nextZhuang);
        }, 2000);
      }
    }
    this.logger.close()
  }

  async saveCardType() {
    const cardTypes = [
      {cardName: "起手叫", multiple: 4, isOrdinal: false, isTianHu: true, cardId: 1},
      {cardName: "双星辰", multiple: 4, isOrdinal: false, constellateCount: 2, level: 1, cardId: 2},
      {
        cardName: "门清",
        multiple: 2,
        isOrdinal: false,
        condition: {peng: false, mingGang: false, hu: true, dianPao: true},
        level: 1,
        cardId: 3
      },
      {cardName: "杠上开花", multiple: 3, isOrdinal: false, condition: {gang: true, hu: true}, cardId: 4},
      {
        cardName: "妙手回春",
        multiple: 3,
        isOrdinal: false,
        condition: {residueCount: 0, zimo: true, hu: true},
        level: 1,
        cardId: 5
      },
      {
        cardName: "海底捞月",
        multiple: 2,
        isOrdinal: false,
        condition: {residueCount: 0, hu: true, jiePao: true},
        level: 1,
        cardId: 6
      },
      {cardName: "杠上炮", multiple: 2, isOrdinal: false, condition: {gang: true, hu: true, jiePao: true}, cardId: 7},
      {cardName: "抢杠胡", multiple: 2, isOrdinal: false, condition: {buGang: true, hu: true, jiePao: true}, cardId: 8},
      {cardName: "绝张", multiple: 2, isOrdinal: false, condition: {simpleCount: 1, hu: true}, cardId: 9},
      {cardName: "对对胡", multiple: 2, isOrdinal: false, condition: {keCount: 4, hu: true}, level: 1, cardId: 10},
      {cardName: "单色星辰", multiple: 2, isOrdinal: false, constellateCount: 1, level: 1, cardId: 11},
      {cardName: "双同刻", multiple: 2, isOrdinal: false, condition: {keCount: 2}, level: 1, cardId: 12},
      {cardName: "十二行星", multiple: 3, isOrdinal: false, condition: {gangCount: 3}, level: 1, cardId: 13},
      {cardName: "十八行星", multiple: 4, isOrdinal: false, condition: {gangCount: 4}, level: 1, cardId: 14},
      {cardName: "断么九", multiple: 6, isOrdinal: true, ordinalCard: [2, 3, 4, 5, 6, 7, 8], level: 1, cardId: 15},
      {
        cardName: "不求人",
        multiple: 6,
        isOrdinal: false,
        condition: {peng: false, mingGang: false, hu: true, zimo: true},
        level: 1,
        cardId: 16
      },
      {
        cardName: "混双",
        multiple: 6,
        isOrdinal: true,
        ordinalCard: [2, 4, 6, 8],
        constellateCount: 1,
        level: 1,
        cardId: 17
      },
      {
        cardName: "混单",
        multiple: 6,
        isOrdinal: true,
        ordinalCard: [1, 3, 5, 7, 9],
        constellateCount: 1,
        level: 1,
        cardId: 18
      },
      {cardName: "双暗刻", multiple: 6, isOrdinal: false, condition: {anGangCount: 2}, level: 1, cardId: 19},
      {
        cardName: "三节高",
        multiple: 8,
        isOrdinal: false,
        condition: {huaType: "simple", keCount: 3},
        level: 1,
        cardId: 20
      },
      {cardName: "双色星辰", multiple: 8, isOrdinal: false, constellateCount: 2, level: 1, cardId: 21},
      {cardName: "混小", multiple: 12, isOrdinal: true, ordinalCard: [1, 2, 3], level: 1, cardId: 22},
      {cardName: "混中", multiple: 12, isOrdinal: true, ordinalCard: [4, 5, 6], level: 1, cardId: 23},
      {cardName: "混大", multiple: 12, isOrdinal: true, ordinalCard: [7, 8, 9], level: 1, cardId: 24},
      {cardName: "星灭光离", multiple: 12, isOrdinal: false, condition: {laiCount: 0}, level: 1, cardId: 25},
      {cardName: "三暗刻", multiple: 12, isOrdinal: false, condition: {anGangCount: 3}, level: 1, cardId: 26},
      {cardName: "三色星辰", multiple: 16, isOrdinal: false, constellateCount: 3, level: 1, cardId: 27},
      {cardName: "七对", multiple: 16, isOrdinal: false, condition: {duiCount: 7}, level: 1, cardId: 28},
      {
        cardName: "四节高",
        multiple: 16,
        isOrdinal: false,
        condition: {huaType: "simple", keCount: 4},
        level: 1,
        cardId: 29
      },
      {cardName: "全单刻", multiple: 24, isOrdinal: true, ordinalCard: [1, 3, 5, 7, 9], level: 1, cardId: 30},
      {cardName: "全双刻", multiple: 24, isOrdinal: true, ordinalCard: [2, 4, 6, 8], level: 1, cardId: 31},
      {cardName: "四暗刻", multiple: 24, isOrdinal: false, condition: {anGangCount: 4}, level: 1, cardId: 32},
      {
        cardName: "十二星座",
        multiple: 24,
        isOrdinal: false,
        constellateCount: 3,
        condition: {gangCount: 3},
        level: 1,
        cardId: 33
      },
    ];
    await CardTypeModel.insertMany(cardTypes);
  }

  async playerGameOver(p, niaos, states) {
    p.gameOver();

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

    p.sendMessage('game/player-over', {ok: true, data: gameOverMsg})

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

    await this.room.recordGameRecord(this, states);
    await this.room.recordRoomScore()
    // 更新大赢家
    await this.room.updateBigWinner();
    await this.room.charge();

    //获取用户当局对局流水
    const records = await RoomGoldRecord.where({roomId: this.room._id, juIndex: this.room.game.juIndex}).find();

    // 算分
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    for (let i = 0; i < states.length; i++) {
      states[i].score = states[i].score * conf.Ante * conf.maxMultiple;
    }

    const gameOverMsg = {
      niaos,
      creator: this.room.creator.model._id,
      juShu: this.restJushu,
      juIndex: this.room.game.juIndex,
      states,
      records,
      ruleType: this.rule.ruleType,
      isPublic: this.room.isPublic,
      caiShen: this.caishen,
      base: this.room.currentBase
    }

    this.room.broadcast('game/game-over', {ok: true, data: gameOverMsg})
    await this.room.gameOver(nextZhuang._id.toString(), states)
    this.logger.info('game/game-over %s', JSON.stringify(gameOverMsg))
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

    const pushMsg = await this.generateReconnectMsg(index);

    return pushMsg
  }

  async onRefresh(index) {
    const player = this.players[index]
    if (!player) {
      return
    }
    player.sendMessage('room/refresh', await this.restoreMessageForPlayer(player))
  }

  async generateReconnectMsg(index) {
    const player = this.players[index]
    let redPocketsData = null
    let validPlayerRedPocket = null
    if (this.room.isHasRedPocket) {
      redPocketsData = this.room.redPockets;
      validPlayerRedPocket = this.room.vaildPlayerRedPocketArray;
    }
    let roomRubyReward = 0;
    const lastRecord = await service.rubyReward.getLastRubyRecord(this.room.uid);
    if (lastRecord) {
      roomRubyReward = lastRecord.balance;
    }
    const pushMsg = {
      index, status: [],
      remainCards: this.remainCards,
      base: this.room.currentBase,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
      current: {},
      redPocketsData,
      validPlayerRedPocket,
    }

    let msg;
    for (let i = 0; i < this.players.length; i++) {
      if (i === index) {
        msg = this.players[i].genSelfStates(i);
        msg.roomRubyReward = roomRubyReward;
        pushMsg.status.push(msg)
      } else {
        msg = this.players[i].genOppoStates(i);
        msg.roomRubyReward = roomRubyReward;
        pushMsg.status.push(msg)
      }
    }

    switch (this.state) {
      case stateWaitDa: {
        const daPlayer = this.stateData[Enums.da]
        if (daPlayer._id.toString() === player._id.toString()) {
          pushMsg.current = {
            index,
            state: 'waitDa',
            msg: this.stateData.msg.data,
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

  async gangShangGoNext(index, player, buzhang, guo) {
    const xiajiaIndex = (index + 1) % this.players.length
    const xiajia = this.players[xiajiaIndex]
    const checks =
      buzhang.map(x => {
        const checkResult: HuCheck = {card: x}
        if (!guo) {
          player.checkGangShangGang(x, checkResult)
        }
        xiajia.checkChi(x, checkResult)
        for (let i = 1; i < this.players.length; i++) {
          const p = this.players[(index + i) % this.players.length]
          const hu = p.checkJiePao(x)
          if (hu) {
            if (!checkResult.hu) {
              checkResult.hu = [p]
            } else {
              checkResult.hu.push(p)
            }
          }
          p.checkPengGang(x, checkResult)
        }
        return checkResult
      })
    const checkReduce =
      checks.reduce((acc0, x) => {
        // const acc0 = acc0_
        if (x.hu) {
          if (acc0.hu == null) {
            acc0.hu = []
          }
          x.hu.forEach(h => (!acc0.hu.contains(h)) && acc0.hu.push(h))
        }
        if (x.peng) {
          if (acc0.pengGang == null) {
            acc0.pengGang = []
          }
          if (acc0.peng == null) {
            acc0.peng = []
          }
          (!acc0.pengGang.contains(x.peng)) && acc0.pengGang.push(x.peng)
          acc0.peng.push(x.peng)
        }
        if (x.bu) {
          if (acc0.pengGang == null) {
            acc0.pengGang = []
          }
          if (acc0.bu == null) {
            acc0.bu = []
          }
          (!acc0.pengGang.contains(x.bu)) && acc0.pengGang.push(x.bu)
          acc0.bu.push(x.bu)
        }
        if (x.gang) {
          if (acc0.pengGang == null) {
            acc0.pengGang = []
          }
          if (acc0.gang == null) {
            acc0.gang = []
          }
          (!acc0.pengGang.contains(x.gang)) && acc0.pengGang.push(x.gang)
          acc0.gang.push(x.gang)
        }
        if (x.chi) {
          acc0.chi = x.chi
          if (acc0.chiCombol == null) {
            acc0.chiCombol = []
          }
          if (!acc0.chiCombol.find(c => c[0] === x.card)) {
            acc0.chiCombol.push([x.card, x.chiCombol])
          }
        }
        return acc0
      }, {})
    if (checkReduce.hu || checkReduce.pengGang || checkReduce.chi) {
      this.state = stateWaitGangShangAction
      this.stateData = {checks, checkReduce, cards: buzhang, gangPlayer: player}
      this.stateData.currentIndex = []
      this.stateData.lastMsg = []
      if (checkReduce.hu != null && checkReduce.hu.length > 0) {
        console.log('can hu')
        checkReduce.hu.forEach(x => {
          this.stateData.currentIndex.push(this.players.indexOf(x))
          this.stateData.lastMsg.push(x.sendMessage('game/canDoSomethingGang', {
            cards: buzhang,
            turn: this.turn,
            hu: true,
            peng: checkReduce.peng && checkReduce.peng.contains(x),
            pengSelection: getCanPengCards(x, checks),
            gang: checkReduce.gang && checkReduce.gang.contains(x),
            gangSelection: getCanGangCards(x, checks, player),
            bu: checkReduce.bu && checkReduce.bu.contains(x),
            buSelection: getCanBuCards(x, checks, player),
            chi: checkReduce.chi === x,
            chiCombol: checkReduce.chi === x && checkReduce.chiCombol,
          }))
        })
      } else if (checkReduce.pengGang != null && checkReduce.pengGang.length > 0) {

        checkReduce.pengGang.sort((a, b) => this.distance(player, a) - this.distance(player, b))
        const first = checkReduce.pengGang[0]
        this.stateData.currentIndex.push(this.players.indexOf(first))
        this.stateData.lastMsg.push(first.sendMessage('game/canDoSomethingGang', {
          cards: buzhang,
          turn: this.turn,
          peng: checkReduce.peng && checkReduce.peng.contains(first),
          pengSelection: getCanPengCards(first, checks),
          gang: checkReduce.gang && checkReduce.gang.contains(first),
          gangSelection: getCanGangCards(first, checks, player),
          bu: checkReduce.bu && checkReduce.bu.contains(first),
          buSelection: getCanBuCards(first, checks, player),
          chi: checkReduce.chi === first,
          chiCombol: checkReduce.chi === first && checkReduce.chiCombol,
        }))
      } else if (checkReduce.chi) {
        console.log('can chi')
        this.stateData.currentIndex.push(this.players.indexOf(checkReduce.chi))
        this.stateData.lastMsg.push(
          checkReduce.chi.sendMessage('game/canDoSomethingGang', {
            cards: buzhang,
            turn: this.turn,
            chi: true,
            chiCombol: checkReduce.chiCombol,
          }))
      }
    } else {
      console.log('can do nothing')
      const nextCard = await this.consumeCard(xiajia)
      const msg = xiajia.takeCard(this.turn, nextCard)
      if (!msg) {
        return
      }
      this.state = stateWaitDa
      this.stateData = {
        da: xiajia,
        card: nextCard,
        msg,
      }
      this.room.broadcast('game/oppoTakeCard', {
        ok: true, data: {
          index: this.players.indexOf(xiajia),
        }
      }, xiajia.msgDispatcher)
    }
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
    const index = this.players.indexOf(player);
    console.log('guo  player %s card %s', index, playCard)
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

  async recordRubyReward() {
    if (!this.room.isPublic) {
      return null;
    }
    // 金豆房记录奖励
    // let record;
    await this.getBigWinner();
    // const {winnerList, ruby} = await service.rubyReward.calculateRubyReward(this.room.uid, resp.winner);
    // if (ruby > 0) {
    //   // 瓜分奖池
    //   record = await service.rubyReward.winnerGainRuby(this.room.uid, Number(this.room._id), winnerList,
    //     resp.winner, this.room.game.juIndex);
    //   for (const shortId of winnerList) {
    //     const player = this.getPlayerByShortId(shortId);
    //     if (!player) {
    //       throw new Error('invalid balance player')
    //     }
    //     player.winFromReward(ruby);
    //   }
    // } else {
    //   // 扣除 30% 金豆， 系统 1：1 补充
    //   const rubyReward = Math.floor(resp.score * config.game.winnerReservePrizeRuby);
    //   for (const shortId of resp.winner) {
    //     // 扣掉用户 30% 金豆
    //     const player = this.getPlayerByShortId(shortId);
    //     if (!player) {
    //       throw new Error('invalid balance player')
    //     }
    //     player.winFromReward(-rubyReward);
    //   }
    //   record = await service.rubyReward.systemAddRuby(this.room.uid, Number(this.room._id),
    //     rubyReward * resp.winner.length,
    //     rubyReward * resp.winner.length, resp.winner, this.room.game.juIndex)
    // }
    // return record;
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
      times = conf.maxMultiple;
    }

    let winRuby = 0;
    let lostRuby = 0;
    const winnerList = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]
      if (p) {
        console.warn("balance: ", p.balance)
        p.balance *= times * conf.Ante;
        if (p.balance > 0) {
          winRuby += p.balance;
          winnerList.push(p);
        } else {
          const model = await service.playerService.getPlayerModel(p.model._id.toString());
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
    console.log('win gold', winRuby, 'lost gold', lostRuby, "conf.maxMultiple", conf.maxMultiple, "this.rule.diFen", conf.Ante);
    // 平分奖励
    if (winRuby > 0) {
      for (const p of winnerList) {
        p.balance = Math.floor(p.balance / winRuby * lostRuby * -1);
        console.log('after balance', p.balance, p.model.shortId)
      }

    }
  }

  promptWithOther(todo, player, card) {
    console.warn(`${player.model.shortId}游戏操作:${todo}`);

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
        player.emitter.emit(Enums.hu, this.turn, this.stateData.card)
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
    if (ting.hu && ![Enums.zeus, Enums.poseidon, Enums.athena].includes(lastTakeCard)) {
      if (player.cards[lastTakeCard] > 0) return lastTakeCard;
    }

    // 有单张打单张
    const lonelyCard = this.getCardLonelyCard(player);
    if (lonelyCard.code) return lonelyCard.index;

    // 无单张打2张
    const twoEightLonelyCard = this.getCardTwoCard(player);
    if (twoEightLonelyCard.code) return twoEightLonelyCard.index;

    // 摸到什么牌打什么牌
    console.warn(player.cards);
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

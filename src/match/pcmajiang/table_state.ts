/**
 * Created by Color on 2016/7/6.
 */
// @ts-ignore
import {pick, random} from 'lodash'
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
import {GameType, TianleErrorCode} from "@fm/common/constants";
import Player from "../../database/models/player";
import GameCategory from "../../database/models/gameCategory";
import CombatGain from "../../database/models/combatGain";

const stateWaitDa = 1
const stateWaitAction = 2
export const stateGameOver = 3
const stateWaitGangShangAction = 5
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
  addSpan(Enums.tongzi1, Enums.tongzi9)
  addSpan(Enums.shuzi1, Enums.shuzi9)
  // addSpan(Enums.dong, Enums.bai);

  cards.push(Enums.zhong)
  cards.push(Enums.zhong)
  cards.push(Enums.zhong)
  cards.push(Enums.zhong)

  return cards
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
      for (let i = 0; i < 38; i++) {
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

  // 测试工具摸牌
  testMoCards: any[] = [];

  // 判断对局是否开始
  isGameRunning: boolean = false;

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
    this.state = stateWaitDa
    this.lastDa = null

    const transports = []
    this.logger = new winston.Logger({transports})

    this.setGameRecorder(new GameRecorder(this))
    this.stateData = {}

    this.isManyHu = false;
    this.manyHuArray = [];
    this.manyHuPlayers = [];
    this.canManyHuPlayers = [];
    this.isRunMultiple = false;
    this.testMoCards = [];
    this.isGameRunning = false;
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
            if (this.stateData[name][j]._id === p._id)
              console.log(name, ` <= name ${p.model.name}, shortId  `, p.model.shortId)
            if (this.stateData[name][j]._id === p._id) {
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
    this.remainCards = this.cards.length;
    if (this.rule.quanFei > 0) {
      this.remainCards -= this.rule.quanFei * this.rule.playerCount + 1;
    }
    if (this.rule.feiNiao > 0) {
      this.remainCards -= this.rule.feiNiao + 1;
    }
  }

  consumeCard(playerState: PlayerState) {
    const player = playerState
    let cardIndex = --this.remainCards
    if (cardIndex === 0 && player) {
      player.takeLastCard = true
    }
    cardIndex = Math.floor(Math.random() * this.cards.length);
    let card = this.cards[cardIndex];

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
    return card;
  }

  take13Cards(player: PlayerState, clist) {
    const cards = this.rule.test ? clist.slice() : [];
    const cardCount = cards.length;
    for (let i = 0; i < 13 - cardCount; i++) {
      cards.push(this.consumeCard(player));
    }
    return cards;
  }

  async start(payload) {
    await this.fapai(payload);
  }

  async fapai(payload) {
    this.shuffle()
    this.sleepTime = 0
    this.caishen = this.rule.useCaiShen ? Enums.zhong : Enums.slotNoCard
    const restCards = this.remainCards - (this.rule.playerCount * 13);
    if (this.rule.test && payload.moCards && payload.moCards.length > 0) {
      this.testMoCards = payload.moCards;
    }

    const zhuangIndex = 0;

    // 判断麻将补助是否开房
    // const isMajongOpen = await service.utils.getGlobalConfigByName("majiangHelp");
    // if (!this.room.rule.isPublic && Number(isMajongOpen) === 1) await this.checkPlayerHelper();

    const needShuffle = this.room.shuffleData.length > 0;
    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      const p = this.players[i]
      const cards13 = this.take13Cards(p, this.rule.test && payload.cards && payload.cards[i].length > 0 ? payload.cards[i] : [])
      // const finallyCards = [...p.helpCards, ...cards13];

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

      p.onShuffle(restCards, this.caishen, this.restJushu, cards13, i, this.room.game.juIndex, needShuffle, zhuangIndex)
    }

    //设置对局已经开始
    this.isGameRunning = true;

    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }

    const nextDo = () => {
      const nextCard = this.consumeCard(this.zhuang)
      const msg = this.zhuang.takeCard(this.turn, nextCard)
      this.logger.info('takeCard player-%s  take %s', this.zhuang._id, nextCard)

      const index = 0
      this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard}}, this.zhuang.msgDispatcher)
      this.state = stateWaitDa;
      this.stateData = {msg, da: this.zhuang, card: nextCard};
    }

    if (this.sleepTime === 0) {
      nextDo()
    } else {
      setTimeout(nextDo, this.sleepTime)
    }
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
    player.on('refreshQuiet', async (p, idx) => {
      await this.onRefresh(idx)
    })

    player.on('waitForDa', msg => {
      this.logger.info('waitForDa %s', JSON.stringify(msg))
      if (player.isPublicRobot) {
        // 金豆房机器人， 不打
        return;
      }
      player.deposit(() => {
        if (msg) {
          const takenCard = msg.card
          const todo = player.ai.onWaitForDa(msg, player.cards)
          switch (todo) {
            case Enums.gang:
              const gangCard = msg.gang[0][0]
              player.emitter.emit(Enums.gangBySelf, this.turn, gangCard)
              break
            case Enums.hu:
              player.emitter.emit(Enums.hu, this.turn, takenCard)
              break
            default:
              const card = this.promptWithPattern(player, this.lastTakeCard);
              player.emitter.emit(Enums.da, this.turn, card)
              break
          }
        } else {
          const card = this.promptWithPattern(player, this.lastTakeCard);
          player.emitter.emit(Enums.da, this.turn, card)
        }
      })
    })
    player.on('waitForDoSomeThing', msg => {
      player.deposit(() => {
        const card = msg.data.card
        const todo = player.ai.onCanDoSomething(msg.data)
        // console.warn("card-%s, todo-%s", card, todo)
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

    player.on(Enums.multipleHu, async () => {
      await this.onPlayerMultipleHu(player);
    })

    player.on(Enums.peng, (turn, card) => {
      if (this.state !== stateWaitAction) {
        player.emitter.emit(Enums.guo, turn, card)
        // player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamStateInvaid});
        return
      }
      if (this.stateData.pengGang !== player || this.stateData.card !== card) {
        player.emitter.emit(Enums.guo, turn, card)
        // player.sendMessage('game/pengReply', {ok: false, info: TianleErrorCode.pengParamInvaid});
        return
      }

      // 一炮多响（金豆房）
      if (this.isManyHu && !this.manyHuPlayers.includes(player._id) && this.room.isPublic) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.peng);

        player.sendMessage("game/chooseMultiple", {
          ok: true,
          data: {action: Enums.peng, card, index: this.atIndex(player)}
        })
        return;
      }

      // 一炮多响(好友房)
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && !this.room.isPublic) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.peng);
        player.sendMessage("game/chooseMultiple", {
          ok: true,
          data: {action: Enums.peng, card, index: this.atIndex(player)}
        })

        if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
          this.isRunMultiple = true;
          player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
        }

        return;
      }

      this.actionResolver.requestAction(player, 'peng', () => {
        const ok = player.pengPai(card, this.lastDa);
        if (ok) {
          player.lastOperateType = 2;

          const hangUpList = this.stateData.hangUp;
          this.turn++;
          this.state = stateWaitDa;
          const daCard = this.promptWithPattern(player, null);
          // const index = player;
          const nextStateData = {da: player, card: daCard, type: Enums.peng};
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
          // console.warn("state-%s, stateData-%s hangUpList-%s onDeposit-%s", this.state, JSON.stringify(this.stateData), JSON.stringify(hangUpList), player.onDeposit);
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

      // 一炮多响(金豆房)
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && this.room.isPublic) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.gang);
        // console.warn("player index-%s choice gang card-%s manyHuArray-%s action-%s", this.atIndex(player), card, JSON.stringify(this.manyHuArray), Enums.gang);

        player.sendMessage("game/chooseMultiple", {
          ok: true,
          data: {action: Enums.gang, card, index: this.atIndex(player)}
        })
        return;
      }

      // 一炮多响(好友房)
      if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && !this.room.isPublic) {
        this.manyHuPlayers.push(player._id.toString());
        this.setManyAction(player, Enums.gang);
        player.sendMessage("game/chooseMultiple", {
          ok: true,
          data: {action: Enums.gang, card, index: this.atIndex(player)}
        })

        if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
          this.isRunMultiple = true;
          player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
          // console.warn("manyHuArray-%s manyHuPlayers-%s canManyHuPlayers-%s card-%s can many hu", JSON.stringify(this.manyHuArray), JSON.stringify(this.manyHuPlayers), JSON.stringify(this.canManyHuPlayers), this.stateData.card);
        }

        return;
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

              const nextCard = this.consumeCard(player);

              const msg = player.gangTakeCard(this.turn, nextCard);
              if (msg) {
                const takeCard = async () => {
                  this.room.broadcast('game/oppoTakeCard', {
                    ok: true,
                    data: {index, card: nextCard}
                  }, player.msgDispatcher);
                  this.state = stateWaitDa;
                  this.stateData = {da: player, card: nextCard, msg};
                }

                setTimeout(takeCard, 500);
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
        return player.sendMessage('game/gangReply', {ok: false, info: TianleErrorCode.gangParamStateInvaid});
      }
      if (this.stateData[Enums.da] && this.stateData[Enums.da]._id.toString() !== player.model._id.toString()) {
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

        this.room.broadcast('game/oppoGangBySelf', {ok: true, data: broadcastMsg}, player.msgDispatcher);

        const nextCard = this.consumeCard(player);
        const msg = player.gangTakeCard(this.turn, nextCard);

        if (msg) {
          const takeCard = async () => {
            this.room.broadcast('game/oppoTakeCard', {ok: true, data: {index, card: nextCard}}, player.msgDispatcher);
            this.state = stateWaitDa;
            this.stateData = {msg, da: player, card: nextCard};
          }

          setTimeout(takeCard, 500);
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
      const recordCard = this.stateData.card;
      const isJiePao = this.state === stateWaitAction && recordCard === card && this.stateData[Enums.hu].contains(player)
      const isZiMo = this.state === stateWaitDa && recordCard === card

      if (isJiePao) {
        // 一炮多响(金豆房)
        if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && this.room.isPublic) {
          this.manyHuPlayers.push(player._id.toString());
          this.setManyAction(player, Enums.hu);
          player.sendMessage("game/chooseMultiple", {
            ok: true,
            data: {action: Enums.hu, card, index: this.atIndex(player)}
          })

          return;
        }

        // 一炮多响(好友房)
        if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && !this.room.isPublic) {
          this.manyHuPlayers.push(player._id.toString());
          this.setManyAction(player, Enums.hu);
          player.sendMessage("game/chooseMultiple", {
            ok: true,
            data: {action: Enums.hu, card, index: this.atIndex(player)}
          })

          if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
            this.isRunMultiple = true;
            player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
          }

          return;
        }

        this.actionResolver.requestAction(player, 'hu', async () => {
            const ok = player.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa);
            const from = this.atIndex(this.lastDa);

            if (ok && player.daHuPai(card, this.players[from])) {
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

        this.actionResolver.tryResolve()
      } else if (isZiMo) {
        const ok = player.zimo(card, turn === 1, this.remainCards === 0);
        if (ok && player.daHuPai(card, null)) {
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
              }
            });
            this.room.broadcast('game/oppoZiMo', {ok: true, data: {turn, card, index}}, player.msgDispatcher);

            setTimeout(gameOver, 1000);
          }

          setTimeout(huReply, 1000);
        } else {
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

  generateNiao() {
    const playerNiaos = []
    const playerIndex = 0
    if (this.rule.quanFei > 0) {
      this.players.forEach(p => {
        p.niaoCards = []
        playerNiaos[playerIndex] = {}
        playerNiaos[playerIndex][p._id.toString()] = []
        for (let i = 0; i < this.rule.quanFei; i++) {
          const niaoPai = this.consumeCard(null)
          if (niaoPai) {
            playerNiaos[playerIndex][p._id.toString()].push(niaoPai)
            p.niaoCards.push(niaoPai)
          }
        }
      })
    } else {
      this.players[0].niaoCards = []
      for (let i = 0; i < this.rule.feiNiao; i++) {
        const niaoPai = this.consumeCard(null)
        if (niaoPai) {
          if (!playerNiaos[0]) {
            playerNiaos[0] = {}
            playerNiaos[0][this.players[0]._id.toString()] = []
          }
          playerNiaos[0][this.players[0]._id.toString()].push(niaoPai)
          this.players[0].niaoCards.push(niaoPai)
        }
      }
    }

    return playerNiaos
  }

  isEmptyObject(obj) {
    return obj && Object.keys(obj).length === 0;
  }

  async onPlayerMultipleHu(player) {
    const msgs = [];
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
        msgs.push({
          type: Enums.peng,
          card: this.manyHuArray[i].card,
          index: this.manyHuArray[i].to,
          from: this.manyHuArray[i].from
        });
      }

      // 处理杠牌
      if (this.manyHuArray[i].action === Enums.gang && huCount === 0) {
        this.players[this.manyHuArray[i].to].emitter.emit(Enums.gangByOtherDa, this.turn, this.manyHuArray[i].card);
        msgs.push({
          type: Enums.gang,
          card: this.manyHuArray[i].card,
          index: this.manyHuArray[i].to,
          from: this.manyHuArray[i].from
        });
      }

      // 处理胡牌
      if (this.manyHuArray[i].action === Enums.hu) {
        const huPlayer = this.players[this.manyHuArray[i].to];
        const huMsg = await this.onMultipleHu(huPlayer, this.manyHuArray[i]);

        if (huMsg) {
          this.room.broadcast('game/showHuType', {
            ok: true,
            data: {
              index: huMsg.from,
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
            from: huMsg.from
          });
        }
      }
    }

    const gameOver = async () => {
      await this.gameOver();
    }

    const huReply = async () => {
      this.room.broadcast("game/multipleHuReply", {ok: true, data: {manyHuArray: this.manyHuArray, msg: msgs, huCount}});

      setTimeout(gameOver, 1000);
    }

    setTimeout(huReply, 1000);
  }

  async onMultipleHu(player, msg) {
    const ok = player.jiePao(msg.card, this.turn === 2, this.remainCards === 0, this.lastDa);
    if (ok && player.daHuPai(msg.card, this.players[msg.from])) {
      player.lastOperateType = 4;
      player.isGameDa = true;
      player.isGameHu = true;
      this.lastDa.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);

      return {
        card: msg.card,
        index: msg.to,
        from: msg.from
      };
    } else {
      player.sendMessage('game/huReply', {
        ok: false,
        info: TianleErrorCode.huInvaid,
        data: {type: "jiePao", card: msg.card}
      });

      return {};
    }
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
      const loser = this.players.find(p => p.events[Enums.dianPao])
      nextZhuangIndex = this.atIndex(loser)
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
    if (this.state !== stateGameOver) {
      this.state = stateGameOver
      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      this.assignNiaos()
      this.calcGangScore()

      for (const state1 of states) {
        const i = states.indexOf(state1);
        state1.model.played += 1
        state1.score = this.players[i].balance * this.rule.diFen
        await this.room.addScore(state1.model._id, state1.score)
      }
    }
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
      await this.room.charge()

      const nextZhuang = this.nextZhuang()
      // 生成鸟牌
      const niaos = this.generateNiao()
      // 计算用户的鸟牌数
      this.assignNiaos()
      this.niaos = niaos

      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
      // 其他三家鸟数
      let noHuNiaoCount = 0;
      // 胡牌用户鸟数
      let huNiaoCount = 0;
      let huType = 0;
      let score = 1;
      const feiNiaoArrs = [];

      if (this.rule.quanFei > 0 || this.rule.feiNiao > 0) {
        // 计算鸟数
        for (let i = 0; i < this.players.length; i++) {
          const p = this.players[i];

          // 计算胡牌用户鸟数和其他三家鸟数
          p.huPai() ? huNiaoCount += p.niaoCount : noHuNiaoCount += p.niaoCount;

          if (p.events.zimo) {
            huType = 1;
          }

          if (p.events.jiePao) {
            huType = 2;
          }
        }

        // 计算底分
        if (huType !== 0) {
          for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i];

            // 计算胡牌基数底分
            if (p.huPai()) {
              if (p.events.zimo) {
                score = 2;
                if (p.events.hu[0].pengPengHu || p.events.hu[0].qiDui) {
                  score = 4;
                }
                if (p.events.hu[0].qingYiSe || p.events.hu[0].haoQi) {
                  score = 8;
                }
                if ((p.events.hu[0].qingYiSe && p.events.hu[0].qiDui) ||
                  (p.events.hu[0].qingYiSe && p.events.hu[0].pengPengHu) ||
                  p.events.hu[0].shuangHaoQi) {
                  score = 16;
                }

                if ((p.events.hu[0].qingYiSe && p.events.hu[0].haoQi) || p.events.hu[0].sanHaoQi) {
                  score = 32;
                }
                if (p.events.hu[0].qingYiSe && p.events.hu[0].shuangHaoQi) {
                  score = 64;
                }
                if (p.events.hu[0].qingYiSe && p.events.hu[0].sanHaoQi) {
                  score = 128;
                }
                if (p.events.hu[0].tianHu) {
                  score === 2 ? score *= 4 : score *= 8;
                }

                p.gameDiFen += (noHuNiaoCount + this.rule.playerCount - 1) * score;

                for (let j = 0; j < this.players.length; j++) {
                  if (p._id !== this.players[j]._id) {
                    this.players[j].gameDiFen -= (p.niaoCount + 1) * score;
                  }
                }
              }

              if (p.events.jiePao && p._id.toString() === winner._id.toString()) {
                if (p.events.hu[0].pengPengHu || p.events.hu[0].qiDui || p.events.hu[0].qiangGang) {
                  score = 2 * (this.rule.playerCount - 1);
                }
                if (p.events.hu[0].qingYiSe || p.events.hu[0].haoQi) {
                  score = 4 * (this.rule.playerCount - 1);
                }
                if ((p.events.hu[0].qingYiSe && p.events.hu[0].qiDui) ||
                  (p.events.hu[0].qingYiSe && p.events.hu[0].pengPengHu) ||
                  p.events.hu[0].shuangHaoQi) {
                  score = 8 * (this.rule.playerCount - 1);
                }
                if ((p.events.hu[0].qingYiSe && p.events.hu[0].haoQi) ||
                  p.events.hu[0].sanHaoQi) {
                  score = 16 * (this.rule.playerCount - 1);
                }
                if (p.events.hu[0].qingYiSe && p.events.hu[0].shuangHaoQi) {
                  score = 32 * (this.rule.playerCount - 1);
                }
                if (p.events.hu[0].qingYiSe && p.events.hu[0].sanHaoQi) {
                  score = 64 * (this.rule.playerCount - 1);
                }

                if (p.events.hu[0].diHu) {
                  score *= 4;
                }

                for (let j = 0; j < this.players.length; j++) {
                  if (p._id !== this.players[j]._id && this.players[j].events.dianPao) {
                    p.gameDiFen += (this.players[j].niaoCount + 1) * score;
                    this.players[j].gameDiFen -= (p.niaoCount + 1) * score;
                  }
                }
              }

              // console.warn("hu events %s score %s", JSON.stringify(p.events), score);
            }
          }

          // 计算杠牌底分
          for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i];

            // 计算暗杠分数
            if (p.eventCount('anGang') > 0) {
              // console.warn("roomId-%s anGangCount-%s", this.room._id, p.eventCount('anGang'));
              const anGangCount = p.eventCount('anGang');
              let otherNiaoCount = 0;

              for (let j = 0; j < this.players.length; j++) {
                if (p._id !== this.players[j]._id) {
                  otherNiaoCount += this.players[j].niaoCount;
                }
              }

              p.gameDiFen += (otherNiaoCount + this.rule.playerCount - 1) * 2 * anGangCount;

              for (let j = 0; j < this.players.length; j++) {
                if (p._id !== this.players[j]._id) {
                  this.players[j].gameDiFen -= (p.niaoCount + 1) * 2 * anGangCount;
                }
              }
            }

            // 计算补杠分数
            if (p.eventCount('buGang') > 0) {
              // console.warn("roomId-%s buGangCount-%s", this.room._id, p.eventCount('buGang'));
              const buGangCount = p.eventCount('buGang');
              let otherNiaoCount = 0;

              for (let j = 0; j < this.players.length; j++) {
                if (p._id !== this.players[j]._id) {
                  otherNiaoCount += this.players[j].niaoCount;
                }
              }
              p.gameDiFen += (otherNiaoCount + this.rule.playerCount - 1) * buGangCount;

              for (let j = 0; j < this.players.length; j++) {
                if (p._id !== this.players[j]._id) {
                  this.players[j].gameDiFen -= (p.niaoCount + 1) * buGangCount;
                }
              }
            }

            // 计算明杠分数
            if (p.gangFrom.length > 0) {
              // console.warn("roomId-%s jieGangCount-%s", this.room._id, p.gangFrom.length);
              for (let j = 0; j < p.gangFrom.length; j++) {
                p.gameDiFen += (p.gangFrom[j].niaoCount + 1) * (this.rule.playerCount - 1);
                p.gangFrom[j].gameDiFen -= (p.niaoCount + 1) * (this.rule.playerCount - 1);
              }
            }
          }
        }

        const diFenArrs = [];
        for (let i = 0; i < this.players.length; i++) {
          diFenArrs.push({shortId: this.players[i].model.shortId, diFen: this.players[i].gameDiFen });
        }

        // 计算最终分数
        for (let i = 0; i < this.players.length; i++) {
          const p = this.players[i];
          p.gameScore = p.gameDiFen;
          const playerNiaos = p.niaoCards;
          const nPlayers = this.players.length;
          for (const niao of playerNiaos) {
            const tail = niao % 10
            const index = (tail + nPlayers - 1) % nPlayers
            p.gameScore += this.players[index].gameDiFen;
            // @ts-ignore
            p.feiNiaoCards.push({card: niao, score: this.players[index].gameDiFen});
          }
        }

        for (let i = 0; i < this.players.length; i++) {
          feiNiaoArrs.push({shortId: this.players[i].model.shortId, feiNiaoCards: this.players[i].feiNiaoCards });
          // console.warn("index-%s, gameScore-%s", this.players[i].seatIndex, this.players[i].gameScore);
        }
      }

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
        this.calcGangScore()
      }

      await this.recordRubyReward();
      let isLiuJu = true;

      for (const state1 of states) {
        const i = states.indexOf(state1);
        const player = this.players[i];
        state1.model.played += 1
        if (this.room.isPublic) {
          state1.score = player.balance;
          state1.rubyReward = 0;
          // 是否破产
          state1.isBroke = player.isBroke;
          // mvp 次数
          state1.mvpTimes = 0;

          // 生成战绩
          await this.savePublicCombatGain(player, state1.score);
        } else {
          state1.score = ((this.rule.quanFei > 0 || this.rule.feiNiao > 0) ? this.players[i].gameScore : this.players[i].balance) * this.rule.diFen
        }

        if (this.rule.quanFei > 0 || this.rule.feiNiao > 0) {
          state1["feiNiaos"] = feiNiaoArrs[i];
        }

        await this.room.addScore(state1.model._id, state1.score);

        if (state1.score !== 0) {
          isLiuJu = false;
        }

        await this.setPlayerGameConfig(state1.model, state1.score);
      }

      await this.room.recordGameRecord(this, states)
      await this.room.recordRoomScore()
      // 更新大赢家
      // await this.room.updateBigWinner();

      const gameOverMsg = {
        niaos,
        liuJu: isLiuJu,
        creator: this.room.creator.model._id,
        juShu: this.restJushu,
        juCount: this.rule.juShu,
        juIndex: this.room.game.juIndex,
        useKun: this.rule.useKun,
        states,
        gameType: GameType.pcmj,
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
    this.logger.close()
  }

  async savePublicCombatGain(player, score) {
    const category = await GameCategory.findOne({_id: this.room.gameRule.categoryId}).lean();

    await CombatGain.create({
      uid: this.room._id,
      room: this.room.uid,
      juIndex: this.room.game.juIndex,
      playerId: player._id,
      gameName: "红中麻将",
      caregoryName: category.title,
      time: new Date(),
      score
    });
  }

  async setPlayerGameConfig(player, score) {
    const model = await Player.findOne({_id: player._id});

    model.isGame = false;
    model.juCount++;
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

  dissolve() {
    // TODO 停止牌局 托管停止 减少服务器计算消耗
    this.logger.close()
    this.players = [];
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      // console.warn("room reconnect")
      const player = this.players[index]
      player.onDeposit = false;
      player.reconnect(playerMsgDispatcher)
      player.sendMessage('game/reconnect', {ok: true, data: await this.generateReconnectMsg(index)})
    })

    room.once('empty', this.onRoomEmpty = () => {
      console.warn("room empty")
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
    const player = this.players[index]
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
      isGameRunning: this.state !== stateGameOver,
      juShu: this.restJushu,
      current: {}
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
        const daPlayer = this.stateData[Enums.da];
        if (daPlayer._id.toString() === player._id.toString()) {
          pushMsg.current = {
            index,
            state: 'waitDa',
            msg: this.stateData.msg.data || {card: this.lastTakeCard},
          }
        } else {
          pushMsg.current = {index: this.atIndex(daPlayer), state: 'waitDa'}
        }

        // 处理特殊情况，防止重连对局卡死
        // if (this.atIndex(daPlayer) === -1) {
        //   const playerIndex = await this.getPlayerDaIndex();
        //
        // }

        break
      }
      case stateWaitAction: {
        const actions = this.actionResolver && this.actionResolver.allOptions && this.actionResolver.allOptions(player)
        if (actions) {
          pushMsg.current = {
            index, state: 'waitAction',
            msg: actions
          }
        }
        break
      }

      default:
        break
    }

    if (Object.keys(pushMsg.current).length === 0) {
      console.warn("state-%s, stateData-%s", this.state, JSON.stringify(this.stateData));
    }

    return pushMsg
  }

  async getPlayerDaIndex() {
    for (let i = 0; i < this.players.length; i++) {
      let cardCount = 0;
      const p = this.players[i];

      for (let j = 0; j < p.cards.length; j++) {
        if (p.cards[j] > 0) {
          cardCount += p.cards[j];
        }
      }

      if ([2, 5, 8, 11, 14].includes(cardCount)) {
        return i;
      }
    }

    return -1;
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

  gangShangGoNext(index, player, buzhang, guo) {
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
      const nextCard = this.consumeCard(xiajia)
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
        index: this.players.indexOf(xiajia),
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

    const ok = player.daPai(card)
    if (ok) {
      this.lastDa = player
      player.cancelTimeout()
      await player.sendMessage('game/daReply', {ok: true, data: card});
      this.room.broadcast('game/oppoDa', {ok: true, data: {index, card}}, player.msgDispatcher);
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

    for (let j = 1; j < this.players.length; j++) {
      const i = (index + j) % this.players.length
      const p = this.players[i]
      if (p.contacted(this.lastDa) < 2) {
        check = p.checkPengGang(card, check)
      }
    }
    const env = {card, from, turn: this.turn}
    this.actionResolver = new ActionResolver(env, () => {
      const newCard = this.consumeCard(xiajia)
      const msg = xiajia.takeCard(this.turn, newCard)

      if (!msg) {
        return;
      }
      this.state = stateWaitDa;
      this.stateData = {da: xiajia, card: newCard, msg};
      const sendMsg = {index: this.players.indexOf(xiajia), card: newCard, msg}
      this.room.broadcast('game/oppoTakeCard', {ok: true, data: sendMsg}, xiajia.msgDispatcher)
      this.logger.info('da broadcast game/oppoTakeCard   msg %s', JSON.stringify(sendMsg))
    })

    if (check[Enums.hu]) {
      for (const p of check[Enums.hu]) {
        this.actionResolver.appendAction(p, 'hu', p.huInfo)
      }
    }

    if (check[Enums.pengGang]) {
      if (check[Enums.peng]) this.actionResolver.appendAction(check[Enums.peng], 'peng')
      if (check[Enums.gang]) {
        const p = check[Enums.gang]
        const gangInfo = [card, p.getGangKind(card, p._id.toString() === player._id.toString())]
        p.gangForbid.push(card)
        this.actionResolver.appendAction(check[Enums.gang], 'gang', gangInfo)
      }
    }

    let huCount = 0;

    for (let i = 1; i < this.players.length; i++) {
      const j = (from + i) % this.players.length;
      const p = this.players[j];
      const msg = this.actionResolver.allOptions(p);
      const model = await service.playerService.getPlayerModel(p._id);
      if (msg && ((model.gold > 0 && !p.isBroke && this.room.isPublic) || !this.room.isPublic)) {
        huCount++;
        this.manyHuArray.push({...msg, ...{to: this.atIndex(p)}});
        this.canManyHuPlayers.push(p._id.toString());
        p.record('choice', card, msg);

        // 碰、杠等
        p.sendMessage('game/canDoSomething', {ok: true, data: msg});
        this.room.broadcast('game/oppoCanDoSomething', {
          ok: true,
          data: {...msg, ...{index: this.atIndex(p)}}
        }, p.msgDispatcher);
      }
    }

    if (huCount <= 1) {
      this.isManyHu = false;
      this.manyHuArray = [];
      this.canManyHuPlayers = [];
    } else {
      this.isManyHu = true;
      this.room.broadcast('game/beginChoiceMultiple', {
        ok: true,
        data: {isManyHu: this.isManyHu, manyHuArray: this.manyHuArray, from: this.atIndex(player)}
      });
    }

    if (check[Enums.pengGang] || check[Enums.hu]) {
      this.state = stateWaitAction;
      this.stateData = check;
      this.stateData.hangUp = [];
    }

    this.actionResolver.tryResolve()
  }

  async onPlayerGuo(player, playTurn, playCard) {
    // 一炮多响(金豆房)
    if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && this.room.isPublic) {
      this.manyHuPlayers.push(player._id.toString());
      this.setManyAction(player, Enums.guo);

      player.sendMessage("game/chooseMultiple", {
        ok: true,
        data: {action: Enums.guo, card: playCard, index: this.atIndex(player)}
      })
      return;
    }

    // 一炮多响(好友房)
    if (this.room.gameState.isManyHu && !this.manyHuPlayers.includes(player._id) && !this.room.isPublic) {
      this.manyHuPlayers.push(player._id.toString());
      this.setManyAction(player, Enums.guo);
      player.sendMessage("game/chooseMultiple", {
        ok: true,
        data: {action: Enums.guo, card: playCard, index: this.atIndex(player)}
      })

      if (this.manyHuPlayers.length >= this.manyHuArray.length && !this.isRunMultiple) {
        this.isRunMultiple = true;
        player.emitter.emit(Enums.multipleHu, this.turn, this.stateData.card);
      }
    }

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

  async recordRubyReward() {
    if (!this.room.isPublic) {
      return null;
    }
    // 金豆房记录奖励
    // let record;
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
        // 如果是全飞，设置用户的底分
        if (this.rule.quanFei > 0) {
          p.balance = p.gameScore;
        }

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

  getPlayerByShortId(shortId) {
    for (const p of this.players) {
      if (p && p.model.shortId === shortId) {
        return p;
      }
    }
    return null;
  }

  promptWithOther(todo, player, card) {
    // logger.info("index-%s, todo-%s, stateCard-%s, stateData-%s", player.seatIndex, todo, this.stateData.card, JSON.stringify(this.stateData));

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
    const cards = player.cards.slice();
    if (lastTakeCard && cards[lastTakeCard] > 0) cards[lastTakeCard]--;

    // 如果用户听牌，则直接打摸牌
    const ting = player.isRobotTing(cards);
    if (ting.hu) {
      if (player.cards[lastTakeCard] > 0 && lastTakeCard) return lastTakeCard;
    }

    // 有中打中,非万能牌优先打
    const middleCard = this.checkUserHasCard(player.cards, enums.zhong);
    if (middleCard.count > 0 && !this.rule.useCaiShen) return middleCard.index;

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

  setManyAction(player: PlayerState, action) {
    const index = this.manyHuArray.findIndex(p => p.to === this.atIndex(player));
    if (index !== -1) {
      this.manyHuArray[index]["action"] = action;
    }
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

  robotTingConsumeCard(player) {
    // 帮机器人摸合适的牌
    const isMo = Math.random() < 0.4;
    if (isMo) {
      const lackCard = this.getCardLack(player);
      if (lackCard) return lackCard;
    }

    // const ting = player.isRobotTing(player.cards);
    // logger.info(`ting:${JSON.stringify(ting)}`);
    // if(ting.hu) {
    //   logger.info(`${player.model.shortId}(${player.model.name})的卡牌可胡牌`);
    //   const isHu = Math.random() < 1;
    //   if(isHu) {
    //     let cas = [];
    //     player.cards.forEach((c, x) => {
    //       if(c > 0) cas.push({card: x, count: c})
    //     })
    //     let huCards = Array.from(new Set([...ting.huCards.useJiang]));
    //     const index = this.cards.findIndex((c) => huCards.includes(c));
    //
    //     if(index !== -1) {
    //       const cardIndex = --this.remainCards
    //       if (cardIndex === 0 && player) {
    //         player.takeLastCard = true
    //       }
    //       const card = this.cards[index]
    //       this.cards.splice(index, 1);
    //       logger.info('robot-consumeCard %s', card)
    //       this.lastTakeCard = card;
    //       return card
    //     }
    //   }
    // }

    return false;
  }

  getCardLack(player) {
    for (let i = 0; i < 3; i++) {
      for (let j = 1; j <= 7; j++) {
        let card = [];
        const tail = j + i * 10;
        const tailIndex = this.checkUserHasCard(player.cards, tail);
        const tailr = this.checkUserHasCard(player.cards, tail + 1);
        const tailrr = this.checkUserHasCard(player.cards, tail + 2);
        const isPeng = Math.random() < 0.2;

        if ([1, 3].includes(tailIndex.count) && tailr.count === 0 && [1, 3].includes(tailrr.count))
          card = [tailr.index];
        if ([1, 3].includes(tailIndex.count) && [1, 3].includes(tailr.count) && tailrr.count === 0)
          card = [tailrr.index];
        if (tailIndex.count === 1 && tailr.count === 1 && tailrr.count === 0)
          card = [tailrr.index];
        if (tailIndex.count === 1 && tailr.count === 0 && tailrr.count === 1)
          card = [tailr.index];
        if ([1, 3].includes(tailIndex.count) && [1, 3].includes(tailr.count) && tailrr.count === 0)
          card = [tailrr.index];
        if ([2].includes(tailIndex.count) && isPeng) card = [tailIndex.index];
        // if(player.events.peng) card = player.events.peng;

        const index = this.cards.findIndex((c: any) => card.includes(c));
        if (index !== -1) {
          const cardIndex = --this.remainCards
          if (cardIndex === 0 && player) {
            player.takeLastCard = true
          }

          const c0 = this.cards[index];
          this.cards.splice(index, 1);
          logger.info('robot-getCardLackCard %s', c0)
          this.lastTakeCard = c0;
          return card
        }
      }
    }

    return false;
  }

  async checkPlayerHelper() {
    const tasks = this.players.map((p: any) => {
      p.isHelp = false;
      return this.checkHelper(p);
    });

    await Promise.all(tasks);
  }

  async checkHelper(p) {
    const player = await PlayerModel.findOne({_id: p._id}).lean();
    const helpInfo = await PlayerHelpDetail.findOne({
      player: p._id,
      isHelp: 1,
      type: {$in: [1, 2]}
    }).sort({estimateLevel: -1, type: -1}).lean();

    if (!helpInfo) return;
    if (!this.room.gameState.isHelp) {
      const PlayerHelpRank = 1 / helpInfo.juCount;
      const randWithSeed = algorithm.randomBySeed();

      if (randWithSeed > PlayerHelpRank && helpInfo.juCount > helpInfo.count) {
        await PlayerHelpDetail.findByIdAndUpdate(helpInfo._id, {juCount: helpInfo.juCount - 1});
        return;
      }

      const treasure = await TreasureBox.findOne({level: helpInfo.treasureLevel}).lean();

      logger.info(`${new Date()}：${player.shortId}救助概率${PlayerHelpRank},随机种子概率：${randWithSeed}`);
      logger.info(`${new Date()}：${player.shortId}补助牌型：${treasure.mahjong.cardName},摸牌次数：${treasure.mahjong.moCount}次`)
      this.room.gameState.isHelp = true;
      p.isHelp = true;

      // 发放刻子
      if (treasure.mahjong.cardType === CardType.KeZi) await this.consumeKeziCard(p);

      // 发放对子
      if (treasure.mahjong.cardType === CardType.DuiZi) await this.consumeDuiziCard(p);

      // 发放顺子
      if (treasure.mahjong.cardType === CardType.ShunZi) await this.consumeShunziCard(p);

      // 发放杠
      if (treasure.mahjong.cardType === CardType.Gang) await this.consumeGangziCard(p);

      // 发放七大对
      if (treasure.mahjong.cardType === CardType.QiDaDui) await this.consumeQiDaDuiCard(p);

      // 发放碰碰胡
      if (treasure.mahjong.cardType === CardType.PengPengHu) await this.consumePengPengHuCard(p);

      // 发放清一色
      if (treasure.mahjong.cardType === CardType.QingYiSe) await this.consumeQingYiSeCard(p);

      // 发放地胡
      if (treasure.mahjong.cardType === CardType.DiHu) await this.consumeDiHuCard(p);

      // 发放天胡
      if (treasure.mahjong.cardType === CardType.TianHu) await this.consumeTianHuCard(p);
    }
  }

  async consumeKeziCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：刻子`);
  }

  async consumeDuiziCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：对子`);
  }

  async consumeShunziCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：顺子`);
    p.helpCards.push(this.playerHelpConsumeCard(Enums.wanzi1));
    p.helpCards.push(this.playerHelpConsumeCard(Enums.wanzi2));
    p.helpCards.push(this.playerHelpConsumeCard(Enums.wanzi3));
    p.helpCards.push(this.playerHelpConsumeCard(Enums.wanzi4));
    p.helpCards.push(this.playerHelpConsumeCard(Enums.wanzi5));
  }

  async consumeGangziCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：杠子`);
  }

  async consumeQiDaDuiCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：七大对`);
  }

  async consumePengPengHuCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：碰碰胡`);
  }

  async consumeQingYiSeCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：清一色`);
  }

  async consumeDiHuCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：地胡`);
  }

  async consumeTianHuCard(p) {
    logger.info(`${new Date()}：${p.model.shortId}补助牌型：天胡`);
  }

  playerHelpConsumeCard(card) {
    const index = this.cards.findIndex((c: any) => c === card);

    if (index !== -1) {
      --this.remainCards;
      const c0 = this.cards[index];
      this.cards.splice(index, 1);
      logger.info('player-help-consumeCard %s', c0);
      this.lastTakeCard = c0;
      return c0;
    }
  }
}

export default TableState;

/**
 * Created by Color on 2016/7/6.
 */
// @ts-ignore
import {pick, random} from 'lodash'
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
    this.remainCards = this.cards.length
  }

  consumeCard(playerState: PlayerState) {
    const player = playerState
    // const isRobot = player.room.robotManager.checkIsRobot(player);

    // if(isRobot) {
    //   const rCard = this.robotTingConsumeCard(player);
    //   if(rCard) return rCard;
    // }

    const cardIndex = --this.remainCards
    if (cardIndex === 0 && player) {
      player.takeLastCard = true
    }
    const card = this.cards[cardIndex]
    this.cards.splice(cardIndex, 1);
    // logger.info('player %s normal-consumeCard %s', player.model.shortId, card)
    this.lastTakeCard = card;
    return card
  }

  take13Cards(player: PlayerState) {
    const cards = []
    // logger.info(`${player.model.shortId}目前有${player.helpCards.length}张牌`);
    for (let i = 0; i < 13 - player.helpCards.length || 0; i++) {
      cards.push(this.consumeCard(player))
    }
    return cards
  }

  async start() {
    await this.fapai();
  }

  async fapai() {
    this.shuffle()
    this.sleepTime = 0
    this.caishen = this.rule.useCaiShen ? Enums.zhong : Enums.slotNoCard
    const restCards = this.remainCards - (this.rule.playerCount * 13);

    // 判断麻将补助是否开房
    // const isMajongOpen = await service.utils.getGlobalConfigByName("majiangHelp");
    // if (!this.room.rule.isPublic && Number(isMajongOpen) === 1) await this.checkPlayerHelper();

    const needShuffle = this.room.shuffleData.length > 0;
    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      const p = this.players[i]
      const cards13 = this.take13Cards(p)
      const finallyCards = [...p.helpCards, ...cards13];
      // logger.info('fapai player-%s :%s', this.players[i].model.shortId, finallyCards)
      p.onShuffle(restCards, this.caishen, this.restJushu, finallyCards, i, this.room.game.juIndex, needShuffle)
    }

    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }

    const nextDo = () => {
      const nextCard = this.consumeCard(this.zhuang)
      const msg = this.zhuang.takeCard(this.turn, nextCard)
      this.logger.info('takeCard player-%s  take %s', this.zhuang._id, nextCard)

      const index = 0
      this.room.broadcast('game/oppoTakeCard', {index}, this.zhuang.msgDispatcher)
      this.state = stateWaitDa
      this.stateData = {msg, da: this.zhuang, card: nextCard}
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
        console.log("table_state.js 183 ", "执行自动打")
        this.logger.info('takeCard player-%s  执行自动打', index)

        if (msg) {
          const takenCard = msg.card
          const todo = player.ai.onWaitForDa(msg, player.cards)
          switch (todo) {
            case Enums.gang:
              const gangCard = msg.gang[0][0]
              player.emitter.emit(Enums.gangBySelf, this.turn, gangCard)
              player.sendMessage('game/depositGangBySelf', {card: gangCard, turn: this.turn})
              break
            case Enums.hu:
              player.emitter.emit(Enums.hu, this.turn, takenCard)
              player.sendMessage('game/depositZiMo', {card: takenCard, turn: this.turn})
              break
            default:
              const card = player.ai.getUseLessCard(player.cards, takenCard)
              player.emitter.emit(Enums.da, this.turn, card)
              player.sendMessage('game/depositDa', {card, turn: this.turn})
              break
          }
        } else {
          const card = player.ai.getUseLessCard(player.cards, Enums.slotNoCard)
          player.emitter.emit(Enums.da, this.turn, card)
          player.sendMessage('game/depositDa', {card, turn: this.turn})
        }
      })
    })
    player.on('waitForDoSomeThing', msg => {
      player.deposit(() => {
        const card = msg.card
        const todo = player.ai.onCanDoSomething(msg, player.cards, card)
        console.log(`${player.model.shortId}选项:${todo}`)
        switch (todo) {
          case Enums.peng:
            player.emitter.emit(Enums.peng, this.turn, card)
            player.sendMessage('game/depositPeng', {card, turn: this.turn})
            break
          case Enums.gang:
            player.emitter.emit(Enums.gangByOtherDa, this.turn, card)
            player.sendMessage('game/depositGangByOtherDa', {card, turn: this.turn})
            break
          case Enums.hu:
            player.emitter.emit(Enums.hu, this.turn, card)
            player.sendMessage('game/depositHu', {card, turn: this.turn})
            break
          case Enums.chi:
            player.emitter.emit(Enums.chi, this.turn, card, ...msg.chiCombol[0])
            player.sendMessage('game/depositChi', {card, turn: this.turn, chiCombol: msg.chiCombol[0]})
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
    player.on(Enums.chi, (turn, card, otherCard1, otherCard2) => {
      this.logger.info('chi player-%s ', index)

      if (this.turn !== turn) {
        player.sendMessage('ChiReply', {errorCode: 1})
        return
      }

      if (this.state !== stateWaitAction) {
        player.sendMessage('ChiReply', {errorCode: 6})
        return
      }
      if (this.stateData[Enums.chi] !== player) {
        player.sendMessage('ChiReply', {errorCode: 3})
        return
      }

      this.actionResolver.requestAction(player, 'chi', () => {
        const ok = player.chiPai(card, otherCard1, otherCard2, this.lastDa);
        if (ok) {
          this.turn++;
          this.state = stateWaitDa;
          this.stateData = {da: player};
          const gangSelection = player.getAvailableGangs()

          player.sendMessage('ChiReply', {
            errorCode: 0, turn: this.turn,
            card, suit: [otherCard1, otherCard2],
            gang: gangSelection.length > 0,
            gangSelection,
            forbidCards: player.forbidCards
          });
          this.room.broadcast('game/oppoChi', {
            card,
            turn,
            index,
            suit: [otherCard1, otherCard2]
          }, player.msgDispatcher);
        } else {
          player.sendMessage('ChiReply', {errorCode: 4, msg: '吃不进'});
        }
      }, () => {
        player.sendMessage('ChiReply', {errorCode: 4, msg: '优先级不足'});
      })

      this.actionResolver.tryResolve()
    })
    player.on(Enums.peng, (turn, card) => {
      if (this.turn !== turn) {
        logger.info('peng player-%s this.turn:%s turn:%s', index, this.turn, turn)
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('PengReply', {errorCode: 1})
        return
      }
      if (this.state !== stateWaitAction) {
        logger.info('peng player-%s this.state:%s stateWaitAction:%s', index, this.state, stateWaitAction)
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('PengReply', {errorCode: 6})
        return
      }
      if (this.hasPlayerHu()) {
        logger.info('peng player-%s card:%s but has player hu', index, card)
        player.sendMessage('PengReply', {errorCode: 2})
        player.lockMessage()
        player.emitter.emit(Enums.guo, turn, card)
        player.unlockMessage()
        return
      }

      if (this.stateData.pengGang !== player || this.stateData.card !== card) {
        logger.info('peng player-%s card:%s has player pengGang or curCard not is this card', index, card)
        player.emitter.emit(Enums.guo, turn, card)
        player.sendMessage('PengReply', {errorCode: 3, msg: '错误的碰参数'})
        return
      }

      // const from = this.atIndex(this.lastDa)

      this.actionResolver.requestAction(player, 'peng', () => {
        const ok = player.pengPai(card, this.lastDa);
        if (ok) {
          const hangUpList = this.stateData.hangUp
          this.turn++
          this.state = stateWaitDa
          const nextStateData = {da: player}
          const gangSelection = player.getAvailableGangs()
          player.sendMessage('PengReply', {
            errorCode: 0,
            turn: this.turn,
            gang: gangSelection.length > 0,
            gangSelection
          })
          for (const gangCard of gangSelection) {
            if (gangCard === card) {
              player.gangForbid.push(gangCard[0])
            }
          }

          this.stateData = nextStateData
          const from = this.atIndex(this.lastDa)
          const me = this.atIndex(player)

          for (let i = 1; i < 4; i++) {
            const playerIndex = (from + i) % this.players.length
            if (playerIndex === me) {
              break
            }
            this.players[playerIndex].pengForbidden = []
          }

          this.room.broadcast('game/oppoPeng', {
            card,
            index,
            turn, from
          }, player.msgDispatcher)
          if (hangUpList.length > 0) {    // 向所有挂起的玩家回复
            hangUpList.forEach(hangUpMsg => {
              hangUpMsg[0].emitter.emit(hangUpMsg[1], ...hangUpMsg[2])
            })
          }
        } else {
          logger.info('PengReply player-%s card:%s has player hu ,not contain self', index, card)
          player.sendMessage('PengReply', {errorCode: 4});
          return;
        }
      }, () => {
        player.sendMessage('PengReply', {errorCode: 4, msg: '竞争失败'})
      })

      this.actionResolver.tryResolve()
    })
    player.on(Enums.gangByOtherDa, (turn, card) => {
      if (this.turn !== turn) {
        logger.info('gangByOtherDa player-%s card:%s turn not eq', index, card)
        player.sendMessage('GangReply', {errorCode: 1});
        return;
      }
      if (this.state !== stateWaitAction) {
        logger.info('gangByOtherDa player-%s card:%s state not is wait ', index, card)
        player.sendMessage('GangReply', {errorCode: 6});
        return;
      }
      if (this.stateData[Enums.gang] !== player || this.stateData.card !== card) {
        logger.info('gangByOtherDa player-%s card:%s has another player pengGang', index, card)
        player.sendMessage('GangReply', {errorCode: 3});
        return
      }

      // const from = this.atIndex(this.lastDa)

      this.actionResolver.requestAction(
        player, 'gang',
        () => {
          const ok = player.gangByPlayerDa(card, this.lastDa);
          if (ok) {
            this.turn++;
            const from = this.atIndex(this.lastDa)
            const me = this.atIndex(player)
            player.sendMessage('GangReply', {errorCode: 0, card, from});
            for (let i = 1; i < 4; i++) {
              const playerIndex = (from + i) % this.players.length
              if (playerIndex === me) {
                break
              }
              this.players[playerIndex].pengForbidden = []
            }

            this.room.broadcast(
              'game/oppoGangByPlayerDa',
              {card, index, turn, from},
              player.msgDispatcher
            );

            if (player.isTing()) {
              logger.info('gangByOtherDa player-%s card:%s ting', index, card)
              if (player.events[Enums.anGang] && player.events[Enums.anGang].length > 0) {
                player.sendMessage('game/showAnGang',
                  {index, cards: player.events[Enums.anGang]})
                this.room.broadcast('game/oppoShowAnGang',
                  {index, cards: player.events[Enums.anGang]}
                  , player.msgDispatcher)
              }
            }
            logger.info('gangByOtherDa player-%s card:%s gang ok, take card', index, card)

            const nextCard = this.consumeCard(player);
            const msg = player.gangTakeCard(this.turn, nextCard);
            if (msg) {
              this.room.broadcast('game/oppoTakeCard', {index}, player.msgDispatcher);
              this.state = stateWaitDa;
              this.stateData = {da: player, card: nextCard, msg};
            }
          } else {
            logger.info('gangByOtherDa player-%s card:%s GangReply error:4', index, card)
            player.sendMessage('GangReply', {errorCode: 4});
            return;
          }
        },
        () => {
          player.sendMessage('GangReply', {errorCode: 5, msg: ''});
        }
      )

      this.actionResolver.tryResolve()
    })

    player.on(Enums.gangBySelf, (turn, card) => {
      let gangIndex;
      if (this.turn !== turn) {
        logger.info(`this.turn !== turn, this.turn:${this.turn}, turn:${turn}`);
        player.sendMessage('GangReply', {errorCode: 1})
      } else if (this.state !== stateWaitDa) {
        logger.info(`this.state !== stateWaitDa, this.state:${this.state}, stateWaitDa:${stateWaitDa}`);
        player.sendMessage('GangReply', {errorCode: 2})
      } else if (this.stateData[Enums.da] !== player) {
        logger.info(`this.stateData[Enums.da] !== player,
        this.stateData[Enums.da]:${this.stateData[Enums.da].model.shortId}, player:${player.model.shortId}`);
        player.sendMessage('GangReply', {errorCode: 3})
      } else {
        const isAnGang = player.cards[card] >= 3
        gangIndex = this.atIndex(player)
        const from = gangIndex
        this.turn++;

        const broadcastMsg = {turn: this.turn, card, index, isAnGang}
        this.actionResolver = new ActionResolver({turn, card, from}, () => {
          const nextCard = this.consumeCard(player);
          const msg = player.gangTakeCard(this.turn, nextCard);
          if (!msg) {
            return;
          }
          this.room.broadcast('game/oppoTakeCard', {index}, player.msgDispatcher);
          this.state = stateWaitDa;
          this.stateData = {msg, da: player, card: nextCard};
        })

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
            this.room.broadcast('game/oppoGangBySelf', broadcastMsg, player.msgDispatcher)
            qiang.sendMessage('game/canDoSomething', {
              card, turn: this.turn, hu: true,
              chi: false, chiCombol: [],
              peng: false, gang: false, bu: false,
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

        const ok = player.gangBySelf(card, broadcastMsg, gangIndex);
        if (ok) {
          player.sendMessage('GangReply', {errorCode: 0, card, from, gangIndex});
          this.room.broadcast('game/oppoGangBySelf', broadcastMsg, player.msgDispatcher);

          for (let i = 1; i < this.players.length; i++) {
            const j = (from + i) % this.players.length;
            const p = this.players[j]
            const msg = this.actionResolver.allOptions(p)
            if (msg) {
              p.sendMessage('game/canDoSomething', msg)
              this.state = stateWaitAction
              this.stateData = {
                whom: player,
                event: Enums.gangBySelf,
                card, turn,
                hu: check.hu,
                huInfo: p.huInfo,
              }
              this.lastDa = player
            }
          }
          this.actionResolver.tryResolve()
        } else {
          player.sendMessage('GangReply', {errorCode: 4, message: '杠不进'});
        }
      }
    })
    player.on(Enums.buBySelf, (turn, card) => {
      if (this.turn !== turn) {
        player.sendMessage('BuReply', {errorCode: 1})
      } else if (this.state !== stateWaitDa) {
        player.sendMessage('BuReply', {errorCode: 2})
      } else if (this.stateData[Enums.da] !== player) {
        console.log(this.stateData)
        player.sendMessage('BuReply', {errorCode: 3})
      } else {
        const broadcastMsg = {turn, card, index}
        const ok = player.buBySelf(card, broadcastMsg)
        if (ok) {
          player.sendMessage('BuReply', {errorCode: 0})
          this.room.broadcast('game/oppoBuBySelf', broadcastMsg, player.msgDispatcher)
          this.turn++
          const nextCard = this.consumeCard(player)
          const msg = player.takeCard(this.turn, nextCard)
          if (!msg) {
            return
          }
          this.room.broadcast('game/oppoTakeCard', {index}, player.msgDispatcher)
          this.state = stateWaitDa
          this.stateData = {msg, da: player, card: nextCard}
        } else {
          player.sendMessage('BuReply', {errorCode: 4})
        }
      }
    })
    player.on(Enums.hu, async (turn, card) => {
      logger.info('hu  player %s ', index)
      const chengbaoStarted = this.remainCards <= 3

      if (this.turn !== turn) {
        player.sendMessage('HuReply', {errorCode: 1});
      } else {
        const recordCard = this.stateData.card;

        const isJiePao = this.state === stateWaitAction &&
          recordCard === card &&
          this.stateData[Enums.hu].contains(player)

        const isZiMo = this.state === stateWaitDa && recordCard === card

        if (isJiePao) {
          this.actionResolver.requestAction(player, 'hu', async () => {
              const ok = player.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa);
              logger.info('hu  player %s jiepao %s', index, ok)

              if (ok) {
                player.sendMessage('HuReply', {errorCode: 0});
                this.stateData[Enums.hu].remove(player);
                this.lastDa.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);
                if (chengbaoStarted) {
                  this.lastDa.recordGameEvent(Enums.chengBao, {});
                }
                this.room.broadcast('game/oppoHu', {turn, card, index}, player.msgDispatcher);
                const huPlayerIndex = this.atIndex(player)
                for (let i = 1; i < this.players.length; i++) {
                  const playerIndex = (huPlayerIndex + i) % this.players.length
                  const nextPlayer = this.players[playerIndex]
                  if (nextPlayer === this.lastDa) {
                    break
                  }

                  if (nextPlayer.checkJiePao(card)) {
                    nextPlayer.jiePao(card, turn === 2, this.remainCards === 0, this.lastDa)
                    nextPlayer.sendMessage('game/genHu', {})
                    this.room.broadcast('game/oppoHu', {turn, card, index: playerIndex}, nextPlayer.msgDispatcher)
                  }
                }
                await this.gameOver();
                logger.info('hu  player %s gameover', index)
              } else {
                player.sendMessage('HuReply', {errorCode: 2});
              }
            },
            () => {
              player.sendMessage('HuReply', {errorCode: 3, msg: '竞争失败'});
            }
          )

          this.actionResolver.tryResolve()
        } else if (isZiMo) {
          const ok = player.zimo(card, turn === 1, this.remainCards === 0);
          if (ok) {
            player.sendMessage('HuReply', {errorCode: 0});
            this.room.broadcast('game/oppoZiMo', {turn, card, index}, player.msgDispatcher);
            await this.gameOver();
            this.logger.info('hu  player %s zimo gameover', index)
          } else {
            player.sendMessage('HuReply', {errorCode: 2, msg: '不能自摸'});
          }
        } else if (this.state === stateQiangGang) {
          if (this.stateData.who === player && turn === this.stateData.turn) {
            player.cards.qiangGang = true

            const qiangGangJiePao = player.jiePao(card, turn === 2, this.remainCards === 0, this.stateData.whom)
            logger.info('hu  player %s stateQiangGang jiePao %s', index, qiangGangJiePao)
            if (qiangGangJiePao) {

              if (chengbaoStarted) {
                this.stateData.whom.recordGameEvent(Enums.chengBao, {});
              }

              player.sendMessage('HuReply', {errorCode: 0})
              this.stateData.whom.recordGameEvent(Enums.dianPao, player.events[Enums.hu][0]);
              // this.stateData.whom.recordGameEvent(Enums.chengBao, {})
              this.room.broadcast('game/oppoHu', {turn, card, index}, player.msgDispatcher);
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
                  nextPlayer.sendMessage('game/genHu', {})
                  this.room.broadcast('game/oppoHu', {turn, card, index: playerIndex}, nextPlayer.msgDispatcher)
                }
              }
              await this.gameOver()
              logger.info('hu  player %s stateQiangGang jiePao gameOver', index)
            } else {
              player.cards.qiangGang = false
            }
          } else {
            player.sendMessage('HuReply', {errorCode: 2, message: '不是您能抢'})
            logger.info('hu  player %s stateQiangGang 不是您能抢', index)
          }
        } else {
          player.sendMessage('HuReply', {errorCode: 3});
          logger.info('hu  player %s stateQiangGang HuReply', index)
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

  generateNiao() {
    const playerNiaos = []
    const playerIndex = 0
    if (this.rule.quanFei > 0) {
      this.players.forEach(p => {
        p.niaoCards = []
        playerNiaos[playerIndex] = {}
        playerNiaos[playerIndex][p._id] = []
        for (let i = 0; i < this.rule.quanFei; i++) {
          const niaoPai = this.consumeCard(null)
          if (niaoPai) {
            playerNiaos[playerIndex][p._id].push(niaoPai)
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
    logger.info('state:', this.state);
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

    // await this.room.recordRoomScore('dissolve')
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

      // await this.room.charge()

      const nextZhuang = this.nextZhuang()
      const niaos = this.generateNiao()
      this.assignNiaos()
      this.niaos = niaos

      const states = this.players.map((player, idx) => player.genGameStatus(idx, 1))
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
      for (const state1 of states) {
        const i = states.indexOf(state1);
        const player = this.players[i];
        state1.model.played += 1
        if (this.room.isPublic) {
          // 金豆房
          if (player.balance < 0 && this.room.preventTimes[player.model.shortId] > 0) {
            // 输豆，扣掉一次免输次数
            this.room.preventTimes[player.model.shortId]--;
          }
          state1.score = player.balance;
          state1.rubyReward = 0;
          // 是否破产
          state1.isBroke = player.isBroke;
          // mvp 次数
          state1.mvpTimes = 0;
        } else {
          state1.score = this.players[i].balance * this.rule.diFen
        }
        await this.room.addScore(state1.model._id, state1.score)
      }

      await this.room.recordGameRecord(this, states)
      await this.room.recordRoomScore()
      // 更新大赢家
      await this.room.updateBigWinner();
      await this.room.charge();

      const gameOverMsg = {
        niaos,
        creator: this.room.creator.model._id,
        juShu: this.restJushu,
        juIndex: this.room.game.juIndex,
        useKun: this.rule.useKun,
        states,
        // 金豆奖池
        rubyReward: 0,
        ruleType: this.rule.ruleType,
        isPublic: this.room.isPublic,
        caiShen: this.caishen,
        base: this.room.currentBase,
        maiDi: this.rule.maiDi
      }

      this.room.broadcast('game/game-over', gameOverMsg)
      await this.room.gameOver(nextZhuang.model._id, states)
      this.logger.info('game/game-over  %s', JSON.stringify(gameOverMsg))
    }
    this.logger.close()
  }

  dissolve() {
    // TODO 停止牌局 托管停止 减少服务器计算消耗
    this.logger.close()
    this.players = [];
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      const player = this.players[index]
      player.reconnect(playerMsgDispatcher)
      player.sendMessage('game/reconnect', await this.generateReconnectMsg(index))
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

  async onRefreshQuiet(playerMsgDispatcher, index) {
    const player = this.players[index]
    const reconnect = await this.generateReconnectMsg(index)
    const rejoin = await this.room.joinMessageFor(playerMsgDispatcher)

    player.sendMessage('game/reconnect', reconnect)
    player.sendMessage('room/rejoin', rejoin)
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
    this.logger.info('da player-%s card:%s', index, card)
    let from
    // const card = card_
    if (this.state !== stateWaitDa) {
      player.sendMessage('DaReply', {errorCode: 1, info: '不能打牌'})
      this.logger.info('da player-%s card:%s 不能打牌', index, card)
      return
    } else if (this.stateData[Enums.da]._id !== player._id) {
      player.sendMessage('DaReply', {errorCode: 2, info: '不是您的回合'})
      this.logger.info('da player-%s card:%s 不是您的回合', index, card)
      return
    }

    const ok = player.daPai(card)
    if (ok) {
      this.lastDa = player
      player.cancelTimeout()
      player.sendMessage('DaReply', {errorCode: 0})

      if (player.isTing()) {
        if (player.events[Enums.anGang] && player.events[Enums.anGang].length > 0) {
          player.sendMessage('game/showAnGang',
            {index, cards: player.events[Enums.anGang]})
          this.room.broadcast('game/oppoShowAnGang',
            {index, cards: player.events[Enums.anGang]}
            , player.msgDispatcher)
        }
      }
    } else {
      player.sendMessage('DaReply', {errorCode: 3, info: '不能打这张牌'})
      this.logger.info('da player-%s card:%s 不能打这张牌', index, card)
      return
    }

    from = this.atIndex(this.lastDa)
    this.turn++

    if (this.remainCards === 4) {
      this.room.broadcast('game/lastFour', {})
      this.logger.info('game/lastFour')
    }
    if (this.remainCards === 1) {
      this.room.broadcast('game/lastOne', {})
      this.logger.info('game/lastOne')
    }

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
    this.actionResolver = new ActionResolver(env, () => {
      const newCard = this.consumeCard(xiajia)
      const msg = xiajia.takeCard(this.turn, newCard)

      if (!msg) {
        return;
      }
      this.state = stateWaitDa;
      this.stateData = {da: xiajia, card: newCard, msg};
      const sendMsg = {index: this.players.indexOf(xiajia)}
      this.room.broadcast('game/oppoTakeCard', sendMsg, xiajia.msgDispatcher)
      this.logger.info('da broadcast game/oppoTakeCard   msg %s', JSON.stringify(sendMsg))
    })

    if (check[Enums.hu]) {
      for (const p of check[Enums.hu]) {
        this.actionResolver.appendAction(p, 'hu', p.huInfo)
      }
    }

    // if (check[Enums.gang]) {
    //   const p = check[Enums.gang]
    //   let gangInfo = [card ,p.getGangKind(card, p === player)]
    //   this.actionResolver.appendAction(p, 'gang', gangInfo)
    // }

    if (check[Enums.pengGang]) {
      if (check[Enums.peng]) this.actionResolver.appendAction(check[Enums.peng], 'peng')
      if (check[Enums.gang]) {
        const p = check[Enums.gang]
        const gangInfo = [card, p.getGangKind(card, p === player)]
        p.gangForbid.push(card)
        this.actionResolver.appendAction(check[Enums.gang], 'gang', gangInfo)
      }
    }

    if (check[Enums.chi]) {
      this.actionResolver.appendAction(check[Enums.chi], 'chi', check.chiCombol)
    }

    this.room.broadcast('game/oppoDa', {index, card}, player.msgDispatcher)
    for (let i = 1; i < this.players.length; i++) {

      const j = (from + i) % this.players.length;
      const p = this.players[j]

      const msg = this.actionResolver.allOptions(p)

      if (msg) {
        p.record('choice', card, msg)
        // 碰、杠等
        p.sendMessage('game/canDoSomething', msg)
      }
    }

    if (check[Enums.chi] || check[Enums.pengGang] || check[Enums.hu]) {
      this.state = stateWaitAction;
      this.stateData = check;
      this.stateData.hangUp = [];
    }

    this.actionResolver.tryResolve()
  }

  async onPlayerGuo(player, playTurn, playCard) {
    const index = this.players.indexOf(player);
    console.log('guo  player %s card %s', index, playCard)
    // const from = this.atIndex(this.lastDa)
    if (this.turn !== playTurn) {
      player.sendMessage('GuoReply', {errorCode: 1})
    } else if (this.state !== stateWaitAction && this.state !== stateQiangGang) {
      player.sendMessage('GuoReply', {errorCode: 2})
    } else if (this.state === stateQiangGang && this.stateData.who == player) {
      console.log('stateQiangGang player-%s ', index)

      player.sendMessage('GuoReply', {errorCode: 0})

      const {whom, card, turn} = this.stateData
      this.state = stateWaitDa
      this.stateData = {[Enums.da]: whom, cancelQiang: true}
      whom.emitter.emit(Enums.gangBySelf, turn, card)
    } else {
      player.sendMessage('GuoReply', {errorCode: 0});
      this.actionResolver.cancel(player)

      player.guoOption(playCard)

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
      times = conf.minScore;
    }
    let winRuby = 0;
    let lostRuby = 0;
    const winnerList = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]
      if (p) {
        p.balance *= times * this.rule.diFen;
        if (p.balance > 0) {
          winRuby += p.balance;
          winnerList.push(p);
        } else {
          const model = await service.playerService.getPlayerModel(p.model._id);
          if (model.ruby < -p.balance) {
            p.balance = -model.ruby;
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
      // tempScore = Math.floor(tempScore / winRuby * lostRuby * -1);
    }
    // return {winner, score: tempScore};
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
    logger.info(`${player.model.shortId}游戏操作:${todo}`);

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
    if (ting.hu) {
      if (player.cards[lastTakeCard] > 0) return lastTakeCard;
    }

    // 有中打中,非万能牌优先打
    const middleCard = this.checkUserHasCard(player.cards, enums.zhong);
    if (middleCard.count === 1 && !this.room.rule.caiShen) return middleCard.index;

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

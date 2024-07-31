import {pick, remove} from 'lodash'
import * as winston from 'winston'
import GameCardRecord from "../../database/models/gameCardRecord";
import alg from '../../utils/algorithm'
import {ITable} from '../IRoom'
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "../serializeDecorator"
import {AuditSSS} from "./auditSSS";
import Card, {CardType} from "./card"
import CompareSuit, {default as ClassicCompared} from "./classic/classicCompared"
import Combiner from "./combiner"
import Combo from "./combo"
import GameRecorder, {IGameRecorder} from './GameRecorder'
import {eqlModelId} from "./modelId"
import PlayerState, {Commit} from './player_state'
import Room from './room'
import Rule from './Rule'

const stateWaitCommit = 'stateWaitCommit'
const stateGameOver = 'stateGameOver'

export const genFullyCards = (useJoker: boolean = false) => {
  const types = [CardType.Club, CardType.Diamond, CardType.Heart, CardType.Spades]
  const cards = []

  types.forEach((type: CardType) => {
    for (let v = 1; v <= 13; v += 1) {
      cards.push(new Card(type, v))
    }
  })
  if (useJoker) {
    cards.push(new Card(CardType.Joker, 15))
    cards.push(new Card(CardType.Joker, 16))
  }
  return cards
}
export const getPlayerCards = (playersConut = 4, useJoker: boolean = false) => {
  const types = [CardType.Club, CardType.Diamond, CardType.Heart, CardType.Spades]
  if (playersConut > 4) {
    types.push(CardType.Spades);
  }
  if (playersConut > 5) {
    types.push(CardType.Heart);
  }
  if (playersConut > 6) {
    types.push(CardType.Club);
  }
  // 8人场多加一色
  if (playersConut > 7) {
    types.push(CardType.Diamond);
  }
  const cards = []

  if (useJoker) {
    cards.push(new Card(CardType.Joker, 15))
    cards.push(new Card(CardType.Joker, 16))
  }
  types.forEach((type: CardType) => {
    for (let v = 1; v <= 13; v += 1) {
      cards.push(new Card(type, v))
    }
  })
  return cards
}

abstract class Table implements ITable, Serializable {

  @autoSerialize
  restJushu: number
  turn: number

  cards: number[]

  @autoSerialize
  remainCards: number

  @serialize
  players: PlayerState[]
  zhuang: PlayerState

  rule: Rule
  room: Room

  @autoSerialize
  state: string

  logger: winston.LoggerInstance

  onRoomEmpty: () => void
  onReconnect: (anyArgs, index: number) => void

  recorder: IGameRecorder

  @autoSerialize
  listenerOn: string[]

  @autoSerialize
  autoCommitStartTime: number

  @autoSerialize
  stateData: any

  private autoCommitTimer: NodeJS.Timer

  // 统计信息
  audit: AuditSSS

  constructor(room, rule, restJushu) {
    this.restJushu = restJushu
    this.rule = rule
    this.room = room
    this.listenRoom(room)

    this.initCards()
    this.initPlayers()
    this.setGameRecorder(new GameRecorder(this))
    this.logger = new winston.Logger({
      transports: []
    })
    this.audit = new AuditSSS();
  }

  toJSON() {
    return serializeHelp(this)
  }

  resume(tableStateJson) {
    const keys = autoSerializePropertyKeys(this)
    Object.assign(this, pick(tableStateJson.gameState, keys))

    for (const [i, p] of this.players.entries()) {
      if (p) {
        p.resume(tableStateJson.gameState.players[i])
      }
      if (!tableStateJson.gameState.players[i]) {
        this.players[i] = null
      }
    }
    if (this.rule.autoCommit) {
      const delayTime = this.rule.autoCommit * 1000 - (Date.now() - this.autoCommitStartTime)
      this.autoCommitTimer = setTimeout(() => {
        this.autoCommitForPlayers()
      }, delayTime)
    }
  }

  abstract name()

  abstract async start()

  initPlayers() {
    const room = this.room
    const rule = this.rule
    const players = room.playersOrder.map(playerSocket => playerSocket && new PlayerState(playerSocket, room, rule))
    players[0].zhuang = true
    this.zhuang = players[0]
    players.forEach(p => p && this.listenPlayer(p))
    this.players = players
  }

  initCards() {
    this.cards = getPlayerCards(this.rule.playerCount, this.rule.useJoker);
    this.remainCards = this.cards.length
  }

  shuffle() {
    alg.shuffle(this.cards)
    this.turn = 1
    this.remainCards = this.cards.length
  }

  consumeCard() {
    const cardIndex = --this.remainCards
    const card = this.cards[cardIndex]
    this.logger.info('consumeCard %s last-%s', card, cardIndex)
    return card
  }

  take13Cards() {
    const cards = []
    for (let i = 0; i < 13; i++) {
      cards.push(this.consumeCard())
    }
    return cards
  }

  mapMaCount2Times(prevPlayer: ClassicCompared, nextPlayer: ClassicCompared) {
    const count2Times = maCount => ({1: 2, 2: 3, 3: 4, 4: 5, 0: 1}[maCount])

    return Math.max(count2Times(prevPlayer.maPaiCount) * count2Times(nextPlayer.maPaiCount), 1)
  }

  async fapai() {
    this.shuffle()
    this.stateData = {}
    const restCards = this.remainCards - (this.rule.playerCount * 13)
    const needShuffle = this.room.shuffleData.length > 0;
    for (let i = 0, iMax = this.players.length; i < iMax; i++) {
      const p = this.players[i]
      if (p) {
        const cards13 = this.take13Cards()
        p.onShuffle(restCards, this.restJushu, cards13, i, this.room.game.juIndex, needShuffle)
      }
    }

    if (this.rule.autoCommit) {
      this.autoCommitStartTime = Date.now();
      this.autoCommitTimer = setTimeout(() => {
        this.autoCommitForPlayers()
      }, this.rule.autoCommit * 1000)
    }

    // 记录发牌
    await this.addPlayerCardLog();
  }

  async addPlayerCardLog() {
    for (let j = 0; j < this.players.length; j++) {
      const p = this.players[j];
      if (p) {
        await GameCardRecord.create({
          player: p._id, shortId: p.model.shortId, username: p.model.name, cardLists: p.cards, createAt: new Date(),
          room: this.room._id, juIndex: this.room.game.juIndex, game: "shisanshui"
        });
      }
    }
  }

  evictPlayer(evictPlayer: PlayerState) {
    remove(this.players, p => eqlModelId(p, evictPlayer))
    this.removeRoomListenerIfEmpty()
  }

  removeRoomListenerIfEmpty() {
    if (this.empty) {
      this.removeRoomListener()
    }
  }

  removeRoomListener() {
    this.room.removeListener('reconnect', this.onReconnect)
    this.room.removeListener('empty', this.onRoomEmpty)
  }

  get empty() {
    return this.players.filter(p => p).length === 0
  }

  showTime(result: CompareSuit[]) {
    const remains = this.divideRemains()
    const msg = {onTable: result, remains, audit: this.audit.currentRound}

    this.state = stateGameOver
    this.stateData.showTime = msg
    this.room.broadcast('game/showTime', msg)
  }

  atIndex(player: PlayerState) {
    return this.players.findIndex(p => p && p._id === player._id)
  }

  restoreMessageForPlayer(player: PlayerState) {
    const index = this.atIndex(player)

    const pushMsg = {
      index, status: [],
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
    }
    for (let i = 0; i < this.players.length; i++) {
      // if (i === index && this.players[i]) {
      //   pushMsg.status.push({
      //     ...this.players[i].statusForSelf(this),
      //     teamMateCards: this.teamMateCards(this.players[i])
      //   })
      // } else {
      //   pushMsg.status.push(this.players[i].statusForOther(this))
      // }
    }

    return pushMsg
  }

  divideRemains() {
    const lack = 4 - this.players.filter(p => p).length
    let remains = []

    if (lack > 0) {
      const all = this.cards.slice(0, this.remainCards)
      remains = [all.slice(0, 13)]
      if (lack > 1) {
        remains.push(all.slice(13, 26))
      }
    }
    return remains
  }

  get isWaitCommitStage() {
    return this.state === stateWaitCommit
  }

  async playerOnCommit(player: PlayerState, commit: Commit) {
    if (await this.verifyCommit(player, commit)) {
      this.playerCommit(player, commit)
      this.broadcastIfAllCommitted()
    }
  }

  async verifyCommit(player: PlayerState, commit: Commit) {
    if (!this.isWaitCommitStage) {
      player.sendMessage('game/commitReply', {ok: false, info: '还没到提交阶段'})
      return false
    }

    const playerVerify = await player.verify(commit);
    if (!playerVerify) {
      player.sendMessage('game/commitReply', {ok: false, info: '提交内容不符'});
      return false;
    }

    return true
  }

  playerCommit(player: PlayerState, commit: Commit) {
    player.setCommit(commit)
    player.sendMessage('game/commitReply', {ok: true})
    this.room.broadcast('game/anotherCommit', {index: player.seatIndex})
  }

  broadcastIfAllCommitted() {
    if (this.allCommitted()) {
      const result = this.playersOfCompare()
      this.showTime(result)
      this.gameOver(result)
    }
  }

  autoCommitForPlayers() {
    for (const p of this.players) {
      if (p && !p.committed) {
        this.commitForPlayer(p);
      }
    }
  }

  abstract playersOfCompare(): CompareSuit[]

  compareOn(position: string, a: CompareSuit, b: CompareSuit): { win: number, extra: number } {
    const diff = a[position].combo.score - b[position].combo.score
    if (diff > 0) {
      return {win: this.buffScore(position, a[position].combo), extra: 0}
    } else if (diff < 0) {
      return {win: -1 * this.buffScore(position, b[position].combo), extra: 0}
    } else {
      return {win: 0, extra: 0}
    }
  }

  // 基础分
  buffScore(loc: string, combo: Combo) {
    const buffMap = {
      head: {triple: 3},
      middle: {gourd: 2, bomb: 8, flush: 10, fiveSame: 20},
      tail: {bomb: 4, flush: 5, fiveSame: 10}
    }
    // ~~相当于 parseInt
    // tslint:disable-next-line:no-bitwise
    return Math.max(~~buffMap[loc][combo.type], 1)
  }

  // 平局
  public maybeDraw(prev, next, {headWin, middleWin, tailWin}) {
    const drawGame = () => {
      headWin.win = 0
      middleWin.win = 0
      tailWin.win = 0
    }

    const fullWin = (suit, sign) => {
      headWin.win = this.buffScore('head', suit.head.combo) * sign
      middleWin.win = this.buffScore('middle', suit.middle.combo) * sign
      tailWin.win = this.buffScore('tail', suit.tail.combo) * sign
    }

    const summary = [headWin, middleWin, tailWin]
      .map(result => {
        return result.win > 0 ? 1 : result.win < 0 ? -1 : 0
      })

    if (summary.indexOf(0) >= 0) {
      const sum = summary.reduce((a, b) => a + b, 0)
      if (sum > 0) {
        fullWin(prev, 1)
      } else if (sum < 0) {
        fullWin(next, -1)
      } else {
        if (summary.join() === '0,0,0') drawGame()
      }
    }
  }

  get playerCount() {
    return this.players.filter(p => p).length
  }

  allCommitted() {
    return this.players.filter(p => p && p.committed).length === this.playerCount
  }

  playerLastConfirm(player: PlayerState) {
    this.room.playerOnLastConfirm(player)
    this.removeListeners(player)
  }

  async listenPlayer(player: PlayerState) {
    this.listenerOn = ['game/commit', 'game/lastConfirm', 'game/refresh']

    player.msgDispatcher.on('game/commit', async commitLike => await this.playerOnCommit(player, commitLike))
    player.msgDispatcher.on('game/lastConfirm', () => this.playerLastConfirm(player))
    player.msgDispatcher.on('game/refresh', () => {
      player.sendMessage('room/refresh', this.restoreMessageForPlayer(player));
    })
    player.msgDispatcher.on('game/disableRobot', async () => {
      if (this.room.robotManager) {
        this.room.robotManager.disableRobot(player._id);
      }
    })
  }

  removeListeners(player) {
    player.removeListenersByNames(this.listenerOn)
  }

  removeAllPlayerListeners() {
    this.players.forEach(p => p && p.removeListenersByNames(this.listenerOn))
  }

  get isLastMatch() {
    return this.restJushu === 0
  }

  async gameOver(result: CompareSuit[]) {
    // if (!this.isLastMatch) {
    this.removeAllPlayerListeners()
    // }
    const {states, gameOverMsg} = this.generateGameOverMsg(result)
    // 扣房卡
    await this.room.charge()
    // 金币场扣金币
    const stateScore = {};
    for (const state of states) {
      stateScore[state.model._id] = state.score;
    }
    await this.room.updateClubGoldByScore(stateScore);
    this.room.broadcast('game/game-over', gameOverMsg)
    this.stateData.gameOver = gameOverMsg
    await this.roomGameOver(result, states)

    this.logger.info('game/game-over  %s', JSON.stringify(gameOverMsg))
    this.logger.close()
  }

  getScoreBy(playerId) {
    return this.room.getScoreBy(playerId)
  }

  drawGameState(): any[] {
    return this.players.filter(p => p).map((p, index) => ({
      won: 0,
      model: p.model,
      index,
      score: 0,
      player: {
        index,
        model: p.model
      },
      daQiang: [],
      maPaiCount: 0,
      head: {combo: {cards: p.cards.slice(0, 3), water: 0, extra: 0}},
      middle: {combo: {cards: p.cards.slice(3, 8), water: 0, extra: 0}},
      tail: {combo: {cards: p.cards.slice(8, 13), water: 0, extra: 0}},
    }))
  }

  generateGameOverMsg(result: CompareSuit[]) {
    result.forEach(suit => {
      suit.player.model.played += 1
      this.room.addScore(suit.player.model._id, suit.won)
    })

    const states = result.map(r => ({
        won: r.won,
        model: r.player.model,
        index: r.player.index,
        score: r.won,
        head: r.head.combo.cards,
        middle: r.middle.combo.cards,
        tail: r.tail.combo.cards,
        totalScore: this.room.scoreMap[r.player.model._id] || 0,
      })
    )

    const gameOverMsg = {
      states,
      juShu: this.restJushu,
      isPublic: this.room.isPublic,
      ruleType: this.rule.ruleType,
      juIndex: this.room.game.juIndex,
      creator: this.room.creator.model._id,
    }

    return {states, gameOverMsg}
  }

  async roomGameOver(result: CompareSuit[], gameOverStates) {
    await this.room.gameOver({cmpResult: result, gameOverStates})
  }

  async listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      let player = this.players[index]
      if (!player) {
        player = new PlayerState(playerMsgDispatcher, this.room, this.rule)
      } else {
        await this.replaceSocketAndListen(player, playerMsgDispatcher)
      }
      const content = this.reconnectContent(index, player)

      player.sendMessage('game/reconnect', content)
    })

    room.once('empty',
      this.onRoomEmpty = () => {
        return;
      })
  }

  reconnectStatus(reconnectPlayer) {
    const mapSuit = suit => {
      return {
        head: {
          combo: suit.head
        },
        middle: {
          combo: suit.middle
        },
        tail: {
          combo: suit.tail
        }
      }
    }

    const recontentData = this.players.filter(p => p)
      .map(player => {
        const ip = player.ip
        const model = player.model
        const index = player.seatIndex
        const committed = player.committed
        const isQiangZhuang = player.isQiangZhuang
        const isZhuang = player.isZhuang

        let suit = null;
        let cards = null
        if (eqlModelId(reconnectPlayer, player)) {
          if (player.committed) {
            suit = mapSuit(player.suit)
          }
          cards = player.cards
        }

        return {ip, model, committed, index, suit, cards, isQiangZhuang, isZhuang}
      })

    let allNumber = this.players.filter(p => p).length;

    const newJoinPlayers = this.room.playersOrder.filter(p =>
      p && !this.players.some(x => x && x.model._id === p.model._id))
      .map(player => new PlayerState(player, this.room, this.rule))

    const newJoinPlayerSData = newJoinPlayers.map(player => {
      const ip = player.ip
      const model = player.model
      const index = allNumber++
      const committed = true // player.committed
      const isQiangZhuang = player.isQiangZhuang
      const isZhuang = player.isZhuang

      const suit = null;
      const cards = null

      return {ip, model, committed, index, suit, cards, isQiangZhuang, isZhuang}
    })

    return recontentData.concat(newJoinPlayerSData);
  }

  async replaceSocketAndListen(player, playerMsgDispatcher) {
    if (!player)
      return
    player.reconnect(playerMsgDispatcher)
    await this.listenPlayer(player)
  }

  reconnectContent(index, player: PlayerState) {
    const state = this.state
    const stateData = this.stateData
    const isPlayAgain = this.room.isPlayAgain
    const juIndex = this.room.game.juIndex
    let redPocketsData = null
    let validPlayerRedPocket = null
    if (this.rule.luckyReward && this.rule.luckyReward > 0) {
      redPocketsData = this.room.redPockets;
      validPlayerRedPocket = this.room.vaildPlayerRedPocketArray;
    }
    return {
      index,
      state,
      juIndex,
      stateData,
      isPlayAgain,
      status: this.reconnectStatus(player),
      remainCards: this.remainCards,
      redPocketsData,
      validPlayerRedPocket
    }
  }

  setGameRecorder(recorder) {
    this.recorder = recorder
    for (const p of this.players) {
      if (p) {
        p.setGameRecorder(recorder)
      }
    }
  }

  dissolve() {
    this.logger.close()
  }

  destroy() {
    this.removeRoomListener()
    this.removeAllPlayerListeners()
  }

  commitForPlayer(playerState) {
    const combiner = new Combiner(playerState.cards)

    const qiPaiRes = combiner.detectQiPai()
    if (qiPaiRes) {
      this.playerOnCommit(playerState, {
        isQiPai: true, name: qiPaiRes.name,
        head: qiPaiRes.sorted.slice(0, 3),
        middle: qiPaiRes.sorted.slice(3, 7),
        tail: qiPaiRes.sorted.slice(7),
        score: qiPaiRes.score
      })
    } else {
      const suit = combiner.findAllSuit()[0]
      this.playerOnCommit(playerState, {
        isQiPai: false,
        head: suit.head.cards,
        middle: suit.middle.cards,
        tail: suit.tail.cards,
        score: suit.score
      })
    }
  }
}

export default Table

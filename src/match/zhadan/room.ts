/**
 * Created by user on 2016-07-04.
 */
import {GameType, RobotStep} from "@fm/common/constants";
import {Channel} from 'amqplib'
// @ts-ignore
import {pick} from 'lodash'
import * as mongoose from 'mongoose'
import * as logger from 'winston'
import Club from '../../database/models/club'
import DissolveRecord from '../../database/models/dissolveRecord'
import GameRecord from '../../database/models/gameRecord'
import RoomRecord from '../../database/models/roomRecord'
import {service} from "../../service/importService";
import '../../utils/algorithm'
import {RoomBase} from "../IRoom"
import {getPlayerRmqProxy, PlayerRmqProxy} from "../PlayerRmqProxy"
import {autoSerialize, autoSerializePropertyKeys, serialize} from "../serializeDecorator"
import Game from './game'
import {eqlModelId} from "./modelId"
import NormalTable from "./normalTable"
import {RobotManager} from "./robotManager";
import Table from "./table"

const ObjectId = mongoose.Types.ObjectId

class Room extends RoomBase {
  @autoSerialize
  dissolveTime: number;

  @autoSerialize
  juIndex: number;

  @autoSerialize
  restJuShu: number;

  dissolveTimeout: NodeJS.Timer

  @serialize
  game: Game

  capacity: number

  @autoSerialize
  players: any[]

  @autoSerialize
  isPublic: boolean

  @autoSerialize
  snapshot: any[]
  disconnectCallback: (player) => void

  @autoSerialize
  readyPlayers: string[]

  @serialize
  playersOrder: any[]

  @autoSerialize
  charged: boolean

  @autoSerialize
  roomState: string = ''

  @serialize
  gameState: Table

  @autoSerialize
  scoreMap: any

  @autoSerialize
  disconnected: any[]
  zhuangCounter: number
  counterMap: any

  @autoSerialize
  ownerId: string

  @autoSerialize
  creator: any

  @autoSerialize
  creatorName: string

  currentBase: number

  @autoSerialize
  gameRule: any
  // noinspection TsLint
  @autoSerialize
  _id: string

  @autoSerialize
  uid: string
  nextStarterIndex: number = 0

  @autoSerialize
  dissolveReqInfo: Array<{ name: string, _id: string, type: string }> = []

  listenOn: string[]
  isPlayAgain: boolean = false

  @autoSerialize
  clubId: number = 0

  @autoSerialize
  clubMode: boolean = false

  @autoSerialize
  clubOwner: any

  // @autoSerialize
  // shuffleData: any = []

  autoDissolveTimer: NodeJS.Timer
  robotManager: RobotManager

  @autoSerialize
  isHelp: boolean = false

  constructor(rule: any) {
    super()
    this.uid = ObjectId().toString()
    this.game = new Game(rule)
    this.isPublic = rule.isPublic
    this.gameRule = rule

    this.initPlayers()

    this.scoreMap = {}
    this.counterMap = {}
    this.gameState = null
    this.dissolveReqInfo = []
    this.charged = false
    this.restJuShu = rule.juShu
    this.juIndex = 0
    this.autoDissolve();
  }

  // TODO should delete?
  get allReady() {
    return this.readyPlayers.length === this.capacity
  }

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<Room> {
    const room = new Room(json.gameRule)
    const gameAutoKeys = autoSerializePropertyKeys(room.game)
    Object.assign(room.game, pick(json.game, gameAutoKeys))

    const keys = autoSerializePropertyKeys(room)
    Object.assign(room, pick(json, keys))

    for (const [index, playerId] of json.playersOrder.entries()) {
      if (playerId) {
        const playerRmq = await getPlayerRmqProxy(playerId, repository.channel, GameType.zd);
        if (json.players[index]) {
          room.players[index] = playerRmq
        }
        room.playersOrder[index] = playerRmq;
      }
    }

    for (const [index, playerId] of json.snapshot.entries()) {
      room.snapshot[index] = await getPlayerRmqProxy(playerId, repository.channel, GameType.zd);
    }

    if (room.clubMode) {
      room.clubOwner = await getPlayerRmqProxy(room.clubOwner, repository.channel, GameType.zd);
    }
    // contest模式房间recover报错  待测
    const creatorModel = await service.playerService.getPlayerPlainModel(room.creator)
    if (creatorModel)
      room.creator = new PlayerRmqProxy(creatorModel, repository.channel, GameType.zd)
    else {
      room.creator = {model: {_id: 'tournament'}}
      // room.charge = () => {
      //   console.log('on charge')
      // }
    }
    if (json.gameState) {
      room.gameState = new NormalTable(room, room.rule, room.game.juShu)
      room.gameState.resume(json)
    }

    if (room.roomState === 'dissolve') {
      const delayTime = room.dissolveTime + 180 * 1000 - Date.now();
      room.dissolveTimeout = setTimeout(() => {
        room.forceDissolve()
      }, delayTime)
    }
    await room.init();
    return room
  }

  static roomFee(rule): number {
    const creatorFeeMap = {
      5: 4, 10: 8, // old config
      4: 2, 8: 4, 12: 6
    }

    const shareFeeMap = {
      5: 1, 10: 2,
      4: 1, 8: 1, 12: 2
    }

    const juShu = rule.juShu
    // if (rule.clubPersonalRoom === false) {
    //   return creatorFeeMap[juShu] || 6
    // }

    if (rule.share) {
      return shareFeeMap[juShu] || 2
    }

    return creatorFeeMap[juShu] || 6
  }

  // 30 分钟房间没动静就结束
  autoDissolve() {
    this.autoDissolveTimer = setTimeout(() => {
      if (this.game.juIndex === 0 && !this.gameState) {
        this.autoDissolveFunc()
      }
    }, 30 * 60 * 1000);
  }

  async autoDissolveFunc() {
    // await this.refundClubOwner();
    this.dissolveAndDestroyTable()
    this.players.forEach(player => {
      if (player) {
        player.sendMessage('room/dissolve', {})
        player.room = null
      }
    })
    this.emit('empty', this.disconnected.map(x => x[0]))
    this.players.fill(null)
    return true
  }

  initPlayers() {
    this.snapshot = []
    this.readyPlayers = []
    this.disconnected = []
    this.capacity = this.rule.playerCount || 4
    this.players = new Array(this.capacity).fill(null)
    this.playersOrder = new Array(this.capacity).fill(null)
    this.disconnectCallback = async messageBoyd => {

      const disconnectPlayer = this.getPlayerById(messageBoyd.from)
      await this.playerDisconnect(disconnectPlayer)
    }
  }

  initScore(player) {
    if (this.scoreMap[player._id] === undefined) {
      this.scoreMap[player._id] = 0
    }
  }

  clearScore(playerId) {
    if (!this.isPublic) {
      delete this.scoreMap[playerId];
    }
  }

  recordGameRecord(states, events) {

    const room = this.uid
    const players = states.map(state => state.model._id)
    const playersInfo = states.map(player => ({
      model: pick(player.model, ['name', 'headImgUrl', 'sex', 'gold', 'shortId'])
    }))
    const playerArray = states.map(state => ({
      name: state.model.name,
      headImgUrl: state.model.headImgUrl,
      score: state.score,
      _id: state.model._id,
    }))

    GameRecord.create({
        room,
        players,
        juShu: this.game.juIndex,
        playersInfo,
        record: playerArray,
        game: {roomId: this._id, rule: this.rule.getOriginData()},
        states,
        events,
        type: 'zhadan'
      },
      err => {
        if (err) {
          logger.error(err)
        }
      }
    )
  }

  updatePosition(player, position) {
    if (position) {
      player.model.position = position

      const positions = this.players.map(p => p && p.model)

      this.broadcast('room/playersPosition', {positions});
    }
  }

  async recordRoomScore(roomState = 'normal') {
    const players = this.snapshot.map(p => p._id)

    // const scores = this.snapshot.map(player => ({
    //   score: this.scoreMap[player.model._id] || 0,
    //   name: player.model.name,
    //   headImgUrl: player.model.headImgUrl,
    //   shortId: player.model.shortId
    // }))
    const scores = [];
    this.snapshot.forEach(player => {
      scores.push({
        score: this.scoreMap[player.model._id] || 0,
        name: player.model.name,
        headImgUrl: player.model.headImgUrl,
        shortId: player.model.shortId
      })
    })

    // if (!this.charged) {
    //   roomState = 'zero_ju'
    // }
    const stateInfo = this.game.juIndex === this.rule.ro.juShu ? roomState + '_last' : roomState
    if (this.isPayClubGold(roomState)) {
      await this.updatePlayerClubGold();
    }

    const roomRecord = {
      players,
      scores,
      roomNum: this._id,
      room: this.uid,
      creatorId: this.creator.model.shortId || 0,
      createAt: Date.now(),
      club: null,
      category: 'zhadan',
      roomState: stateInfo,
      juIndex: this.game.juIndex,
      rule: this.rule.getOriginData()
    }

    if (this.clubId) {
      roomRecord.club = this.clubId;
    }

    try {
      await RoomRecord.update({room: this.uid}, roomRecord, {
        upsert: true,
        setDefaultsOnInsert: true
      }).exec()
    } catch (e) {
      logger.error(`${__filename}:261 recordRoomScore`, e)
    }
    return roomRecord
  }

  async recordDrawGameScore() {
    DissolveRecord.create({
        roomNum: this._id,
        juIndex: this.game.juIndex,
        category: 'zhadan',
        dissolveReqInfo: this.dissolveReqInfo,
      },
      err => {
        if (err) {
          logger.error(err)
        }
      }
    )
    if (this.gameState) {
      this.gameState.showGameOverPlayerCards()
      const states = this.gameState.drawGameTableState()

      for (const state of states) {
        state.model.played += 1;
        await this.addScore(state.model._id, state.score)
      }
      const club = this.clubId && await Club.findOne({_id: this.clubId})

      if (club && this.rule.ro.useClubGold) {
        for (let i = 0; i < states.length; i++) {
          const p = states[i];
          p.model.clubGold += p.score;
          if (p) {
            await this.adjustPlayerClubGold(club, p.score, p.model._id, "游戏输赢，房间号：" + this._id)
          }
        }
      }

      const gameOverMsg = {
        states,
        juShu: this.restJuShu,
        isPublic: this.isPublic,
        ruleType: this.rule.ruleType,
        juIndex: this.game.juIndex,
        creator: this.creator.model._id,
      }

      this.broadcast('game/game-over', gameOverMsg)

      this.recordGameRecord(states, this.gameState.recorder.getEvents())

      await this.recordRoomScore('dissolve')
    } else {
      if (this.rule.ro.useClubGold) {
        await this.updatePlayerClubGold();
      }
      await RoomRecord.update({room: this.uid}, {roomState: 'dissolve'})
    }
    // 更新大赢家
    await this.updateBigWinner();
  }

  async addScore(player, v) {
    switch (typeof player) {
      case 'string':
        this.scoreMap[player] += v
        break
      case 'object':
        player.addGold(v)
        this.scoreMap[player._id] = ((player && player.gold) || 0) - v
        break
      default:
        break
    }
  }

  removeDisconnected(item) {
    for (let i = 0; i < this.disconnected.length; i++) {
      if (this.disconnected[i] === item) {
        this.disconnected.splice(i, 1)
      }
    }
  }

  async reconnect(reconnectPlayer) {
    const disconnectedItem = this.disconnected.find(x => eqlModelId(x[0], reconnectPlayer._id))
    // if (disconnectedItem) {
    // const [_, index] = disconnectedItem
    reconnectPlayer.room = this

    this.listen(reconnectPlayer)
    this.arrangePos(reconnectPlayer, true)
    this.mergeOrder()

    // reconnectPlayer.on('disconnect', this.disconnectCallback)
    if (disconnectedItem) {
      this.removeDisconnected(disconnectedItem)
    }

    if (!this.gameState) {
      await this.announcePlayerJoin(reconnectPlayer)
    }

    const i = this.snapshot.findIndex(p => p._id === reconnectPlayer._id)
    this.emit('reconnect', reconnectPlayer, i)
    await this.broadcastRejoin(reconnectPlayer)
    if (this.dissolveTimeout) {
      this.updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer);
    }
  }

  inRoom(socket) {
    return this.players.indexOf(socket) > -1
  }

  async joinMessageFor(newJoinPlayer): Promise<any> {
    return {
      index: this.indexOf(newJoinPlayer),
      model: await service.playerService.getPlayerPlainModel(newJoinPlayer.model._id),
      ip: newJoinPlayer.getIpAddress(),
      location: newJoinPlayer.location,
      owner: this.ownerId,
      score: this.getScore(newJoinPlayer),
      base: this.currentBase,
      zhuangCounter: this.zhuangCounter,
      juIndex: this.game.juIndex,
      readyPlayers: this.readyPlayers.map(playerId => {
        const readyPlayer = this.inRoomPlayers.find(p => p._id === playerId)
        return this.players.indexOf(readyPlayer)
      }),
      disconnectedPlayers: this.disconnected.map(item => this.indexOf({_id: item[0]})),
    }
  }

  async join(newJoinPlayer) {

    const isReconnect = this.indexOf(newJoinPlayer) >= 0
    if (isReconnect || this.disconnected.find(x => x[0] === newJoinPlayer._id)) {
      return this.reconnect(newJoinPlayer)
    }

    if (!this.canJoin(newJoinPlayer)) {
      return false
    }
    newJoinPlayer.room = this
    this.listen(newJoinPlayer)
    this.arrangePos(newJoinPlayer, false)

    this.mergeOrder()

    this.initScore(newJoinPlayer)

    this.emit('join')
    await this.announcePlayerJoin(newJoinPlayer)

    this.pushToSnapshot(newJoinPlayer)
    return true
  }

  difen() {
    return this.game.rule.ro.difen
  }

  async nextGame(thePlayer) {
    if (!this.isPublic && this.game.juShu <= 0) {
      thePlayer.sendMessage('room/join-fail', {reason: '牌局已经结束.'})
      return
    }
    if (this.indexOf(thePlayer) < 0) {
      thePlayer.sendMessage('room/join-fail', {reason: '您已经不属于这个房间.'})
      return false
    }

    await this.announcePlayerJoin(thePlayer)
    // this.evictFromOldTable(thePlayer)

    const joinFunc = async() => {
      this.robotManager.model.step = RobotStep.start;
    }

    setTimeout(joinFunc, 1000);

    return true
  }

  onRequestDissolve(player) {
    const dissolveInfo = this.getDissolvePlayerInfo(player);
    this.broadcast('room/dissolveReq', {dissolveReqInfo: dissolveInfo, startTime: this.dissolveTime});
    if (this.canDissolve()) {
      this.forceDissolve()
      return
    }

    if (!this.dissolveTimeout) {
      this.roomState = 'dissolve'
      this.dissolveTimeout = setTimeout(() => {
        this.forceDissolve()
      }, 180 * 1000)
    }

    return true;
  }

  onAgreeDissolve(player) {
    if (this.roomState !== 'dissolve') {
      return
    }

    const item = this.dissolveReqInfo.find(x => {
      return x._id === player.model._id;
    });
    if (item) {
      item.type = 'agree';
    }
    this.broadcast('room/dissolveReq', {dissolveReqInfo: this.dissolveReqInfo});

    if (this.canDissolve()) {
      this.forceDissolve()
      return
    }
    return true;
  }

  onDisagreeDissolve(player) {
    if (this.roomState !== 'dissolve') {
      return
    }

    const item = this.dissolveReqInfo.find(x => {
      return x._id === player.model._id;
    });
    if (item) {
      item.type = 'disAgree';
      clearTimeout(this.dissolveTimeout)
      this.roomState = ''
      this.dissolveTimeout = null
    }
    this.broadcast('room/dissolveReq', {dissolveReqInfo: this.dissolveReqInfo});
    return true;
  }

  evictFromOldTable(thePlayer) {
    const oldTable = this.gameState
    oldTable.evictPlayer(thePlayer)
  }

  getDissolvePlayerInfo(player) {
    this.dissolveReqInfo = [];
    this.dissolveTime = Date.now();
    this.dissolveReqInfo.push({
      type: 'originator',
      name: player.model.name,
      _id: player.model._id
    });
    for (let i = 0; i < this.players.length; i++) {
      const pp = this.players[i];
      if (pp && pp.isRobot()) {
        this.dissolveReqInfo.push({
          type: 'agree',
          name: pp.model.name,
          _id: pp.model._id
        });
      } else if (pp && pp !== player) {
        this.dissolveReqInfo.push({
          type: 'waitConfirm',
          name: pp.model.name,
          _id: pp.model._id
        });
      }
    }
    // for (let i = 0; i < this.disconnected.length; i++) {
    //   const pp = this.disconnected[i];
    //   this.snapshot.forEach(p => {
    //       if (pp && p.model._id === pp[0]) {
    //         this.dissolveReqInfo.push({
    //           type: 'offline',
    //           name: p.model.name,
    //           _id: p.model._id
    //         });
    //       }
    //     }
    //   )
    // }
    return this.dissolveReqInfo;
  }

  updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer) {
    const item = this.dissolveReqInfo.find(x => {
      return x._id === reconnectPlayer.model._id;
    });
    if (item) {
      if (item.type === 'agree_offline') {
        item.type = 'agree';
      } else if (item.type !== 'originator') {
        item.type = 'waitConfirm';
      }
    }
    this.broadcast('room/dissolveReq',
      {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime});
  }

  updateDisconnectPlayerDissolveInfoAndBroadcast(player) {
    const item = this.dissolveReqInfo.find(x => {
      return x._id === player.model._id;
    });
    if (item) {
      if (item.type === 'agree') {
        item.type = 'agree_offline'
      } else if (item.type !== 'originator') {
        item.type = 'offline';
      }
    }
    this.broadcast('room/dissolveReq', {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime});
  }

  async playerDisconnect(player) {
    const p = player
    const index = this.players.indexOf(player)

    if (index === -1) {
      return
    }

    // 掉线托管
    // if (this.isPublic && !this.gameState) {
    //   this.leave(player)
    //   return
    // }

    p.room = null
    if (!this.gameState) {
      this.cancelReady(p._id)
    }

    if (this.dissolveTimeout) {
      this.updateDisconnectPlayerDissolveInfoAndBroadcast(player);
    }

    this.broadcast('room/playerDisconnect', {ok: true, data: {index: this.players.indexOf(player)}}, player.msgDispatcher)
    this.removePlayer(player)
    // 避免消息重试
    const disconnectedIndex = this.disconnected.findIndex(value => value[0] === player._id);
    if (disconnectedIndex === -1) {
      this.disconnected.push([player._id, index])
    }
    // no effect
    this.emit('disconnect', p._id)
  }

  // TODO should delete?
  leave(player) {
    if (!player) return false
    if (this.game.juIndex > 0 && !this.isRoomAllOver()) return false

    this.removePlayer(player)
    this.removeOrder(player)

    player.room = null

    this.broadcast('room/leave', {_id: player._id})
    this.cancelReady(player._id)

    this.emit('leave', {_id: player._id})
    if (this.isEmpty() && this.isPublic) {
      this.emit('empty', this.disconnected);
      this.readyPlayers = [];
    }
    this.broadcast('room/leave', {_id: player._id});
    this.removeReadyPlayer(player._id);
    return true
  }

  // TODO should delete?
  async ready(player) {
    if (this.isReadyPlayer(player._id)) {
      return
    }

    if (this.gameState) {
      return
    }
    this.readyPlayers.push(player._id)
    this.broadcast('room/playerReady', {
      index: this.players.indexOf(player),
      readyPlayers: this.readyPlayers
    })
    if (this.allReady) {
      if (!this.isRoomAllOver()) {
        this.playersOrder = this.players.slice()
        this.clearReady()
        await this.startGame({})
      }
    }
  }

  isRoomAllOver(): boolean {
    return this.game.isAllOver()
  }

  async gameOver(states, firstPlayerId) {
    this.shuffleData = []
    for (const state of states) {
      if (state.detail.noLoss > 0 && this.preventTimes[state.model.shortId] > 0) {
        // 输豆，扣掉一次免输次数
        this.preventTimes[state.model.shortId]--;
        state.score += state.detail.noLoss;
      }
      state.model.played += 1
      await this.addScore(state.model._id, state.score)
    }
    const club = this.clubId && await Club.findOne({_id: this.clubId})

    if (club && this.gameRule.useClubGold) {
      for (let i = 0; i < states.length; i++) {
        const p = states[i];
        p.model.clubGold += p.score;
        if (p) {
          await this.adjustPlayerClubGold(club, p.score, p.model._id, "游戏输赢，房间号：" + this._id)
        }
      }
    }
    this.clearReady()
    await this.recordRoomScore()
    this.recordGameRecord(states, this.gameState.recorder.getEvents())
    await this.charge();
    this.gameState.destroy()
    this.gameState = null
    this.readyPlayers = [];
    this.robotManager.model.step = RobotStep.waitRuby;

    this.nextStarterIndex = this.playersOrder.findIndex(p => p._id === firstPlayerId)
    this.sortPlayer(this.nextStarterIndex)
    await this.delPlayerBless();
    // 可能没人离线，需要手动初始化
    await this.robotManager.nextRound();

    if (this.isRoomAllOver()) {
      const message = this.allOverMessage()
      this.broadcast('room/allOver', message);
      this.players.forEach(x => x && this.leave(x));
      this.emit('empty', this.disconnected);
      // 更新大赢家
      await this.updateBigWinner();
    }
  }

  dissolveOverMassage() {
    const message = this.allOverMessage()

    if (this.gameState) {

      const playerCards = this.gameState.players.map(p => p.cards)

      Object.assign(message, {playerCards})
    }
    return message
  }

  allOverMessage() {
    const message = {players: {}, roomNum: this._id, juShu: this.game.juIndex, isClubRoom: this.clubMode}
    this.snapshot
      .filter(p => p)
      .forEach(player => {
        message.players[player.model._id] = {
          userName: player.model.name,
          headImgUrl: player.model.headImgUrl
        }
      })

    Object.keys(this.counterMap).forEach(eventKey => {
      this.counterMap[eventKey].forEach(p => {
        message.players[p][eventKey] = (message.players[p][eventKey] || 0) + 1
      })
    })
    this.snapshot.forEach(p => {
      const playerId = p._id
      if (message.players[playerId]) {
        (message.players[playerId].score = this.scoreMap[playerId])
      }
    })
    const creator = message.players[this.creator.model._id]
    if (creator) {
      creator['isCreator'] = true
    }
    return message
  }

  privateRoomFee() {
    return Room.roomFee(this.game.rule)
  }

  applyAgain(player) {
    if (player !== this.creator) {
      player.sendMessage('room/againReply', {ok: false, info: '不是房主'})
      return
    }

    if (!this.enoughCurrency(player)) {
      player.sendMessage('room/againReply', {ok: false, info: '余额不足'})
      return
    }

    this.playAgain()
  }

  enoughCurrency(player) {
    return player.model.gem >= this.privateRoomFee()
  }

  playAgain() {
    this.isPlayAgain = true

    this.game.reset()
    this.clearReady()
    this.noticeAnother()
  }

  noticeAnother() {
    const excludeCreator = this.inRoomPlayers.filter(s => s !== this.creator)
    excludeCreator.forEach(pSocket => pSocket.sendMessage('room/inviteAgain', {}))
  }

  playerOnExit(player) {
    this.leave(player)
    this.removeRoomListeners(player)
  }

  listen(player) {
    this.listenOn = ['room/again', 'room/exit', 'disconnect', 'game/disableRobot']

    player.on('room/again', () => this.applyAgain(player))
    player.on('room/exit', () => this.playerOnExit(player))
    player.on('disconnect', this.disconnectCallback)
    player.on('game/disableRobot', async () => {
      if (this.robotManager) {
        this.robotManager.disableRobot(player._id);
      }
    })
  }

  removeRoomListeners(player) {
    this.listenOn.forEach(name => player.socket.removeAllListeners(name))
  }

  async init() {
    // 初始化以后，再开启机器人
    this.robotManager = new RobotManager(this, this.gameRule.depositCount);
  }

  private sortPlayer(nextStarterIndex: number) {
    if (nextStarterIndex === 0) {
      return
    }

    const playersCopy = new Array(this.players.length);
    const newOrders = new Array(this.players.length);

    for (let i = 0; i < playersCopy.length; i++) {
      const from = (nextStarterIndex + i) % playersCopy.length;
      playersCopy[i] = this.players[from];
      newOrders[i] = this.playersOrder[from];
    }
    this.players = playersCopy;
    this.playersOrder = newOrders
  }
}

export default Room

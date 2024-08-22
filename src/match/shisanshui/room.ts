import {Channel} from 'amqplib'
// @ts-ignore
import {pick} from 'lodash'
import * as mongoose from 'mongoose'
import * as logger from 'winston'
import Club from "../../database/models/club";
import DissolveRecord from '../../database/models/dissolveRecord'
import GameRecord from '../../database/models/gameRecord'
import RoomRecord from '../../database/models/roomRecord'
import {getPlayerRmqProxy} from "../../player/PlayerRmqProxy"
import '../../utils/algorithm'
import {GameTypes} from "../gameTypes"
import {RoomBase} from '../IRoom'
import {autoSerialize, autoSerializePropertyKeys, serialize} from "../serializeDecorator"
import Game from './game'
import {eqlModelId} from "./modelId"
import PlayerState from "./player_state"
import {RobotManager} from "./robotManager";
import Table from "./table"

const ObjectId = mongoose.Types.ObjectId

export class Red {
  playerId: string
  times: number
}

export const rule2Fee = rule => {
  const juShu = rule.juShu;
  const playerCount = rule.playerCount
  const share = rule.share;
  let fee = juShu / 4

  if (rule.clubPersonalRoom === false) {
    return fee || 1;
  }

  if (share) {
    fee = Math.ceil(fee / playerCount)
  }
  return fee || 1;
}

const gameType: string = "shisanshui"

class Room extends RoomBase {
  @serialize
  game: Game

  @autoSerialize
  capacity: number

  @serialize
  gameState: Table

  @autoSerialize
  zhuangCounter: number

  counterMap: any

  currentBase: number

  dissolveReqInfo: Array<{ name: string, _id: string, type: string }> = []

  @autoSerialize
  isQiangZhuang: boolean

  @autoSerialize
  canReady: boolean = false;
  robotManager: RobotManager
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
    if (!this.robotManager) {
      this.robotManager = new RobotManager(this, this.gameRule.depositCount);
    }
    this.charge = rule.share ? this.chargeAllPlayers.bind(this) : this.chargeCreator.bind(this)
    this.autoDissolve();
  }

  autoDissolve() {
    this.autoDissolveTimer = setTimeout(() => {
      if (this.game.juIndex === 0 && !this.gameState) {
        this.autoDissolveFunc()
      }
    }, 30 * 60 * 1000);
  }

  async autoDissolveFunc() {
    this.roomState = ''
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

  static roomFee(rule: any) {
    return rule2Fee(rule)
  }

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<Room> {
    const room = new Room(json.gameRule)
    const gameAutoKeys = autoSerializePropertyKeys(room.game)
    Object.assign(room.game, pick(json.game, gameAutoKeys))

    const keys = autoSerializePropertyKeys(room)
    Object.assign(room, pick(json, keys))

    for (const [index, playerId] of json.playersOrder.entries()) {
      if (playerId) {
        const playerRmq = await getPlayerRmqProxy(playerId, repository.channel, gameType);
        if (json.players[index]) {
          room.players[index] = playerRmq
        }
        room.playersOrder[index] = playerRmq;
      }
    }

    for (const [index, playerId] of json.snapshot.entries()) {
      if (playerId) {
        room.snapshot[index] = await getPlayerRmqProxy(playerId, repository.channel, gameType);
      }
    }

    if (room.clubMode) {
      room.clubOwner = await getPlayerRmqProxy(room.clubOwner, repository.channel, gameType);
    }
    room.creator = await getPlayerRmqProxy(room.creator, repository.channel, gameType);

    if (json.gameState) {
      room.gameState = room.game.createTable(room)
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

  initPlayers() {
    this.snapshot = []
    this.readyPlayers = []
    this.disconnected = []
    this.capacity = this.rule.playerCount || 4
    this.players = new Array(this.capacity).fill(null)
    this.playersOrder = new Array(this.capacity).fill(null)
    this.disconnectCallback = messageBoyd => {

      const disconnectPlayer = this.getPlayerById(messageBoyd.from)
      this.playerDisconnect(disconnectPlayer)
    }
  }

  setQiangZhuang(qiang: boolean) {
    this.isQiangZhuang = qiang
  }

  toJSON() {
    return super.toJSON()
  }

  recordPlayerEvent(evtType, playerId) {
    if (this.counterMap[evtType] == null) {
      this.counterMap[evtType] = []
    }
    this.counterMap[evtType].push(playerId)
  }

  initScore(player) {
    if (this.scoreMap[player._id] === undefined) {
      this.scoreMap[player._id] = 0
    }
  }

  recordScore() {
    const players = Object.keys(this.scoreMap)
    const roomId = this._id

    const playersInRecords = this.players
      .filter(player => player !== null)
      .map(player => {
        const {model: {name, _id}} = player
        return {
          name,
          score: this.scoreMap[_id]
        }
      })

    const recordStructure = {
      records: {
        players: playersInRecords
      },
      players,
      roomId,
    }
    return new GameRecord(recordStructure)
      .save()
      .then(() => {
        players.forEach(playerId => {
          const pSocket = this.players.find(socket => socket && socket.model._id === playerId)
          if (pSocket) {
            pSocket.sendMessage('room/gameRecord', recordStructure)
          }
        })
      })
  }

  async recordDrawGameScore() {
    if (!this.gameState) {
      // 更新大赢家
      await this.updateBigWinner();
      return
    }
    DissolveRecord.create({
        roomNum: this._id,
        juIndex: this.game.juIndex,
        category: this.gameRule.type,
        dissolveReqInfo: this.dissolveReqInfo,
      },
      err => {
        if (err) {
          logger.error(err)
        }
      }
    )
    await this.recordRoomScore('dissolve')
    const players = this.snapshot.map(p => p && p.model._id)
    const playersInfo = this.snapshot.map(player => player && (
      {model: pick(player.model, ['name', 'headImgUrl', 'sex', 'gold', 'shortId'])}
    ))
    const winner = players[0]
    const room = this.uid
    const states = this.gameState.drawGameState()

    const playerArray = this.snapshot.map(player => player && ({
      name: player.model.name,
      score: 0,
    }))

    GameRecord.create({
      room,
      juShu: this.game.juIndex + 1,
      players,
      playersInfo,
      record: playerArray,
      game: {roomId: this._id},
      winner,
      states,
    }, err => {
      if (err) {
        logger.error(err)
      }
    })
    // 更新大赢家
    await this.updateBigWinner();
  }

  recordGameRecord(saveNeed: { cmpResult, gameOverStates: Array<{ model: { _id, name }, score }> }) {
    const {cmpResult: states, gameOverStates} = saveNeed
    const room = this.uid
    const players = gameOverStates.map(state => state.model._id)
    const playersInfo = gameOverStates.map(player => (
      {model: pick(player.model, ['name', 'headImgUrl', 'sex', 'gold', 'shortId'])}
    ))
    const playerArray = gameOverStates.map(state => ({
      name: state.model.name,
      score: state.score,
      _id: state.model._id,
    }))

    const tempGameOverStates = gameOverStates.map(state => state);

    const winner = tempGameOverStates.sort((a, b) => b.score - a.score)[0].model._id

    GameRecord.create({
      room,
      juShu: this.game.juIndex,
      players,
      playersInfo,
      record: playerArray,
      roomId: this._id,
      game: {roomId: this._id},
      winner,
      states,
      type: this.gameRule.type,
    }, err => {
      if (err) {
        logger.error(err)
      }
    })
  }

  updatePosition(player, position) {
    if (position) {
      player.model.position = position

      const positions = this.players.map(p => p && p.model)

      this.broadcast('room/playersPosition', {positions});
    }
  }

  async recordRoomScore(roomState = 'normal') {
    const players = Object.keys(this.scoreMap)
    const scores = this.playersOrder.map(player => player &&　({
      score: this.scoreMap[player.model._id] || 0,
      name: player.model.name,
      headImgUrl: player.model.headImgUrl,
      shortId: player.model.shortId
    }))

    if (!this.charged) {
      roomState = 'zero_ju'
    }
    const stateInfo = this.game.juIndex === this.gameRule.juShu ? roomState + '_last' : roomState
    if (this.gameRule.useClubGold && (this.game.juIndex === this.gameRule.juShu || roomState === "dissolve")) {
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
      category: this.gameRule.type,
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
      console.log(`${__filename}:261 recordRoomScore`, e)
    }
    return roomRecord
  }

  addScore(player, v) {
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

  reconnect(reconnectPlayer) {
    const disconnectedItem = this.disconnected.find(x => eqlModelId(x[0], reconnectPlayer._id))
    reconnectPlayer.room = this

    this.listen(reconnectPlayer)
    this.arrangePos(reconnectPlayer, true)
    this.mergeOrder()

    reconnectPlayer.on('disconnect', this.disconnectCallback)
    this.removeDisconnected(disconnectedItem)

    if (!this.gameState) {
      this.announcePlayerJoin(reconnectPlayer)
    }

    const i = this.playersOrder.findIndex(p => p && p._id === reconnectPlayer._id)
    this.emit('reconnect', reconnectPlayer, i)
    this.broadcastRejoin(reconnectPlayer)
    if (this.dissolveTimeout) {
      this.updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer);
    }
    return true
    // }
    // return false
  }

  inRoom(socket) {
    return this.players.filter(p => p).indexOf(socket) > -1
  }

  joinMessageFor(newJoinPlayer): any {
    const index = this.players.findIndex(p => !p.isRobot());
    return {
      index: this.indexOf(newJoinPlayer),
      model: newJoinPlayer.model,
      ip: newJoinPlayer.getIpAddress(),
      startIndex: index,
      location: newJoinPlayer.location,
      owner: this.ownerId,
      score: this.getScore(newJoinPlayer),
      base: this.currentBase,
      zhuangCounter: this.zhuangCounter,
      juIndex: this.game.juIndex,
      readyPlayers: this.readyPlayers.map(playerId =>
        this.inRoomPlayers
          .find( p => p._id === playerId)
          .seatIndex
      ),
      disconnectedPlayers: this.disconnected.map(item => this.indexOf({_id: item[0]})),
      // 祈福等级
      blessLevel: this.blessLevel[newJoinPlayer.model.shortId] || 0,
    }
  }

  creatorStartGame(player) {
    if (this.gameState) {
      player.sendMessage('room/creatorStartGameReply', {ok: false, reason: '游戏已经开始'})
      return
    }
    if (player.model._id !== this.ownerId) {
      player.sendMessage('room/creatorStartGameReply', {ok: false, reason: '只有房主才能开始游戏'})
      return
    }
    if (this.players.filter(p => p).length < 2) {
      player.sendMessage('room/creatorStartGameReply', {ok: false, reason: '在线玩家需两人或两人以上!'})
      return
    }

    if (this.readyPlayers.length < this.playersOrder.filter(p => p != null).length) {
      player.sendMessage('room/creatorStartGameReply', {ok: false, reason: '房间内玩家没有全部准备!'})
      return
    }
    player.sendMessage('room/creatorStartGameReply', {ok: true, reason: ''})
    this.snapshot = this.players.filter(p => p).slice()
    this.startNewGame({})
  }

  difen() {
    return this.game.rule.ro.difen
  }

  evictFromOldTable(thePlayer) {
    const oldTable = this.gameState
    oldTable.evictPlayer(thePlayer)
  }

  async dissolve(roomCreator) {
    if (roomCreator._id !== this.ownerId) {
      roomCreator.sendMessage('room/dissolveReply', {errorCode: 1})
      return false
    }

    await this.recordDrawGameScore()
    this.dissolveAndDestroyTable()

    roomCreator.sendMessage('room/dissolveReply', {errorCode: 0})
    roomCreator.room = null
    this.players.forEach(player => {
      if (player && player !== roomCreator) {
        player.sendMessage('room/dissolve', {})
        player.room = null
      }
    })
    this.emit('empty', this.disconnected.map(x => x[0]))
    this.players.fill(null)
    return true
  }

  async forceDissolve() {
    clearTimeout(this.autoDissolveTimer)
    await this.recordDrawGameScore();
    this.dissolveReqInfo = [];
    const allOverMessage = this.allOverMessage()
    allOverMessage["location"] = "sss.room";
    clearTimeout(this.dissolveTimeout)
    this.dissolveTimeout = null
    this.players
      .filter(p => p)
      .forEach(player => {
        player.sendMessage('room/dissolve', allOverMessage)
        player.room = null
      })
    this.players.fill(null)
    this.dissolveAndDestroyTable()
    this.emit('empty', this.disconnected.map(x => x[0]))
    return true
  }

  playerDisconnect(player) {
    const p = player
    const index = this.players.indexOf(player)

    if (index === -1) {
      return
    }

    this.cancelReady(player._id)

    p.room = null
    if (!this.gameState) {
      this.removeReadyPlayer(p._id)
    }

    if (this.dissolveTimeout) {
      this.updateDisconnectPlayerDissolveInfoAndBroadcast(player);
    }

    this.broadcast('room/playerDisconnect', {index: this.players.indexOf(player)}, player.msgDispatcher)
    this.removePlayer(player)
    this.disconnected.push([player._id, index])
    this.emit('disconnect', p._id)
  }

  playerOnLastConfirm(player: PlayerState) {
    this.allOverTo(player)
    if (this.allConfirm) {
      this.emit('empty', this.disconnected)
    }
  }

  allOverTo(player) {
    const message = this.allOverMessage()
    player.setLastConfirm()
    player.sendMessage('room/allOver', message)
  }

  get allConfirm() {
    return this.inRoomPlayers.length === 0
  }

  unReady(player) {
    if (this.gameState) {
      return false
    }
    if (!this.isReadyPlayer(player._id)) {
      return false
    }
    this.removeReadyPlayer(player._id)
    return true
  }

  getPlayers() {
    return this.players
  }

  recDissolvePlayerInfo(player) {
    const item = this.dissolveReqInfo.find( x => {
      return x._id === player.model._id;
    });
    if (item) {
      if (item.type === 'agree_offline') {
        item.type = 'agree';
      } else if (item.type !== 'originator') {
        item.type = 'waitConfirm';
      }
    }
    this.broadcast('room/dissolveReq', {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime}, player);
  }

  updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer) {
    const item = this.dissolveReqInfo.find( x => {
      return x._id === reconnectPlayer.model._id
    })
    if (item) {
      if (item.type === 'agree_offline') {
        item.type = 'agree'
      } else if (item.type !== 'originator') {
        item.type = 'waitConfirm'
      }
    }
    this.broadcast('room/dissolveReq',
      {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime})
  }

  updateDisconnectPlayerDissolveInfoAndBroadcast(player) {
    const item = this.dissolveReqInfo.find( x => {
      return x._id === player.model._id
    })
    if (item) {
      if (item.type === 'agree') {
        item.type = 'agree_offline'
      } else if (item.type !== 'originator') {
        item.type = 'offline'
      }
    }
    this.broadcast('room/dissolveReq', {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime})
  }

  async gameOver(saveNeed) {
    this.shuffleData = []
    this.clearReady()
    this.gameState.dissolve()

    this.canReady = true
    await this.recordRoomScore()
    this.recordGameRecord(saveNeed)
    await this.robotManager.nextRound();
    if (this.game.isAllOver()) {
      const message = this.allOverMessage()
      this.broadcast('room/allOver', message)

      this.players.forEach(x => {
        if (x) {
          this.leave(x)
          x.removeAllListeners()
        }
      })
      this.emit('empty', this.disconnected)
      // 更新大赢家
      await this.updateBigWinner();
    }
  }

  protected allOverMessage() {
    const message = {
      players: {}, roomNum: this._id, isPlayAgain: this.isPlayAgain, juShu: this.game.juIndex,
      isClubRoom: this.clubMode
    }
    this.snapshot
      .filter(p => p)
      .forEach(player => {
        message.players[player.model._id] = {
          userName: player.model.name,
          headImgUrl: player.model.headImgUrl
        }
      })
    Object.keys(this.counterMap).forEach(x => {
      this.counterMap[x].forEach(p => {
        message.players[p][x] = (message.players[p][x] || 0) + 1
      })
    })
    Object.keys(this.scoreMap).forEach(playerId => {
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
    return rule2Fee(this.rule)
  }

  applyAgain(player) {
    if (!this.enoughCurrency(player)) {
      player.sendMessage('room/againReply', {ok: false, info: '余额不足'})
      return
    }

    this.becomeCreator(player)
    this.playAgain()
  }

  enoughCurrency(player) {
    return player.model.gem >= this.privateRoomFee()
  }

  becomeCreator(player) {
    this.creator = player
  }

  playAgain() {
    this.isPlayAgain = true

    this.game.reset()
    this.resetCharge()
    this.clearReady()
    this.noticeAnother()

  }

  resetCharge() {
    this.charged = null
  }

  noticeAnother() {
    this.broadcast('room/inviteAgain', {})
  }

  playerOnExit(player) {
    this.leave(player)
    this.removeRoomListeners(player)
  }

  listen(player) {
    this.listenOn = ['room/again', 'room/exit', 'disconnect']

    player.on('room/again', () => this.applyAgain(player))
    player.on('room/exit', () => this.playerOnExit(player))
    player.on('disconnect', this.disconnectCallback)
  }

  removeRoomListeners(player) {
    this.listenOn.forEach(name => player.socket && player.socket.removeAllListeners(name))
  }

  async init() {
    // 初始化以后，再开启机器人
    this.robotManager = new RobotManager(this, this.gameRule.depositCount);
  }

  async updatePlayerClubGold() {
    let score;
    let p;
    let i;
    const club = this.clubId && await Club.findOne({_id: this.clubId})
    if (!club) {
      return
    }
    let goldPay;
    let payPlayer = [];
    // 圈主付
    if (!this.gameRule.share) {
      payPlayer.push(this.creator.model._id);
    }
    if (this.gameRule.winnerPay) {
      payPlayer = [];
      let tempScore = 0;
      for (i = 0; i < this.snapshot.length; i ++) {
        p = this.snapshot[i];
        if (p) {
          score = this.scoreMap[p.model._id] || 0;
          if (tempScore === score) {
            payPlayer.push(p.model._id)
          }
          if (tempScore < score) {
            tempScore = score;
            payPlayer = [p.model._id]
          }
        }
      }
    }
    if (payPlayer.length > 0) {
      goldPay = Math.ceil((this.gameRule.clubGold || 0) / payPlayer.length)
      if (goldPay === 0) {
        goldPay = 1;
      }
      for (i = 0; i < payPlayer.length; i ++) {
        await this.adjustPlayerClubGold(club, -goldPay, payPlayer[i], "游戏消耗，房间号：" + this._id)
      }
      return;
    }

    goldPay = Math.ceil((this.rule.ro.clubGold || 0) / this.snapshot.length);

    for (i = 0; i < this.snapshot.length; i ++) {
      p = this.snapshot[i];
      if (p) {
        score = this.scoreMap[p.model._id] || 0;
        await this.adjustPlayerClubGold(club, -goldPay, p.model._id, "游戏消耗，房间号：" + this._id)
      }
    }
  }
}

export default Room

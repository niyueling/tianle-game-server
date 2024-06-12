import {Channel} from 'amqplib'
// @ts-ignore
import {pick} from 'lodash'
import * as mongoose from 'mongoose'
import * as logger from 'winston'
import Club from '../../database/models/club'
import DissolveRecord from '../../database/models/dissolveRecord'
import GameRecord from '../../database/models/gameRecord'
import PlayerModel from '../../database/models/player'
import RoomRecord from '../../database/models/roomRecord'
import {getPlayerRmqProxy} from "../../player/PlayerRmqProxy"
import '../../utils/algorithm'
import {GameTypes} from "../gameTypes"
import {RoomBase} from "../IRoom"
import {eqlModelId} from "../modelId"
import {autoSerialize, autoSerializePropertyKeys, serialize} from "../serializeDecorator"
import Game from './game'
import NormalTable from "./normalTable"
import {RobotManager} from "./robotManager";
import Table from "./table"
import {GameType} from "@fm/common/constants";

const ObjectId = mongoose.Types.ObjectId

const gameType: GameTypes = GameType.ddz

class Room extends RoomBase {

  @autoSerialize
  juIndex: number

  @autoSerialize
  restJuShu: number

  @serialize
  game: Game

  @serialize
  players: any[]

  @serialize
  gameState: Table

  zhuangCounter: number

  @autoSerialize
  counterMap: any

  @autoSerialize
  currentBase: number

  nextStarterIndex: number = 0

  @autoSerialize
  clubId: number = 0

  @autoSerialize
  clubMode: boolean = false

  @autoSerialize
  clubOwner: any

  robotManager: RobotManager

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<Room> {

    const room = new Room(json.gameRule)
    // Object.assign(room.game.rule.ro, json.game.rule.ro)
    //
    const gameAutoKeys = autoSerializePropertyKeys(room.game)
    Object.assign(room.game, pick(json.game, gameAutoKeys))

    const keys = autoSerializePropertyKeys(room)
    Object.assign(room, pick(json, keys))
    for (const [index, playerId] of json.snapshot.entries()) {
      room.playersOrder[index] = room.players[index] = room.snapshot[index] = await getPlayerRmqProxy(playerId,
        repository.channel, GameType.ddz);
    }
    room.creator = await getPlayerRmqProxy(json.creator, repository.channel, gameType);

    if (json.gameState) {
      room.gameState = new NormalTable(room, room.rule, room.game.juShu)
      room.gameState.resume(json)
    }

    if (room.clubMode) {
      room.clubOwner = await getPlayerRmqProxy(room.clubOwner, repository.channel, gameType);
    }

    if (room.roomState === 'dissolve') {
      const delayTime = room.dissolveTime + 180 * 1000 - Date.now();
      room.dissolveTimeout = setTimeout(() => {
        room.forceDissolve()
      }, delayTime)
    }
    return room
  }

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
    this.charge = rule.share ? this.chargeAllPlayers.bind(this) : this.chargeCreator.bind(this)

    this.restJuShu = rule.juShu
    this.juIndex = 0
    this.autoDissolve();
    this.robotManager = new RobotManager(this, rule.depositCount);
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

  static roomFee(rule): number {
    const creatorFeeMap = {
      6: 1, 12: 2, 18: 3
    }

    const shareFeeMap = {
      6: 1, 12: 1, 18: 2
    }

    const juShu = rule.juShu
    if (rule.share) {
      return shareFeeMap[juShu] || 2
    }

    return creatorFeeMap[juShu] || 6
  }

  initPlayers() {
    this.snapshot = []
    this.readyPlayers = []
    this.disconnected = []
    this.capacity = this.rule.playerCount || 3;
    this.players = new Array(this.capacity).fill(null)
    this.playersOrder = new Array(this.capacity).fill(null)
    this.disconnectCallback = messageBoyd => {

      const disconnectPlayer = this.getPlayerById(messageBoyd.from)
      this.playerDisconnect(disconnectPlayer)
    }
  }

  initScore(player) {
    if (this.scoreMap[player._id] === undefined) {
      this.scoreMap[player._id] = 0
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
        roomId: this._id,
        states,
        events,
        type: GameType.ddz
      },
      err => {
        if (err) {
          logger.error(err)
        }
      }
    )
  }

  async recordDrawGameScore() {
    const lowScoreTimes = this.checkLowScore();
    await this.recordRoomScore('dissolve')
    if (this.gameState) {
      if (lowScoreTimes > 1) {
        // 低分翻 n 倍
        const stateScore = {};
        for (const playerId of Object.keys(this.scoreMap)) {
          stateScore[playerId] = (this.scoreMap[playerId] / lowScoreTimes) * (lowScoreTimes - 1);
        }
        await this.updateClubGoldByScore(stateScore);
      }
    }
    DissolveRecord.create({
        roomNum: this._id,
        juIndex: this.game.juIndex,
        category: GameType.ddz,
        dissolveReqInfo: this.dissolveReqInfo,
      },
      err => {
        if (err) {
          logger.error(err)
        }
      }
    )
    // 记录大赢家
    await this.updateBigWinner();
    return lowScoreTimes;
  }

  updatePosition(player, position) {
    if (position) {
      player.model.position = position

      const positions = this.players.map(p => p && p.model)

      this.broadcast('room/playersPosition', {positions});
    }
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

  // async adjustPlayerClubGold(club, goldPay, playerId, info) {
  //   const memberShip = await ClubMember.findOne({ club: club._id, member: playerId})
  //   if (memberShip) {
  //     memberShip.clubGold -= goldPay;
  //     await ClubGoldRecord.create({
  //       club: club._id,
  //       member: playerId,
  //       gameType,
  //       goldChange: goldPay,
  //       allClubGold: memberShip.clubGold,
  //       info,
  //     })
  //
  //     await memberShip.save()
  //   }
  // }

  async recordRoomScore(roomState = 'normal') {
    const players = this.snapshot.map(p => p._id)
    const scores = this.playersOrder.map(player => ({
      score: this.scoreMap[player.model._id] || 0,
      name: player.model.name,
      headImgUrl: player.model.headImgUrl,
      shortId: player.model.shortId
    }))

    if (!this.charged) {
      roomState = 'zero_ju'
    }
    const stateInfo = this.game.juIndex === this.rule.ro.juShu ? roomState + '_last' : roomState
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
      category: GameType.ddz,
      roomState: stateInfo,
      juIndex: this.game.juIndex,
      rule: this.rule.getOriginData(),
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

  addScore(player, v) {
    switch (typeof player) {
      case 'string':
        const p = this.getPlayerById(player)
        const gains = v
        this.scoreMap[player] += gains

        if (p) {
          p.addGold(gains)
        } else {
          PlayerModel.update({_id: player}, {$inc: {gold: v}},
            err => {
              if (err) {
                logger.error(err)
              }
            })
        }
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

    reconnectPlayer.room = this

    this.listen(reconnectPlayer)
    this.arrangePos(reconnectPlayer, true)
    this.mergeOrder()

    reconnectPlayer.on('disconnect', this.disconnectCallback)
    if (disconnectedItem) {
      this.removeDisconnected(disconnectedItem)
    }

    if (!this.gameState) {
      this.announcePlayerJoin(reconnectPlayer)
    }
    // Fixme the index may be wrong
    console.log('room:', this._id, 'snapshot', JSON.stringify(this.snapshot))
    const i = this.snapshot.findIndex(p => p._id === reconnectPlayer._id)
    this.emit('reconnect', reconnectPlayer, i)
    this.broadcastRejoin(reconnectPlayer)

    if (this.dissolveTimeout) {
      this.updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer);
    }
    return true
  }

  inRoom(socket) {
    return this.players.indexOf(socket) > -1
  }

  joinMessageFor(newJoinPlayer): any {
    return {
      index: this.indexOf(newJoinPlayer),
      model: newJoinPlayer.model,
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
      // 祈福等级
      blessLevel: this.blessLevel[newJoinPlayer.model.shortId] || 0,
    }
  }

  difen() {
    return this.game.rule.ro.difen
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
    const item = this.dissolveReqInfo.find(x => {
      return x.name === player.model.name
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

  playerDisconnect(player) {
    const p = player
    const index = this.players.indexOf(player)
    if (index === -1) {
      return
    }

    if (this.isPublic && !this.gameState) {
      this.leave(player)
      return
    }

    p.room = null
    if (!this.gameState) {
      this.cancelReady(p._id)
    }

    if (this.dissolveTimeout) {
      this.updateDisconnectPlayerDissolveInfoAndBroadcast(player)
    }

    this.broadcast('room/playerDisconnect', {index: this.players.indexOf(player)}, player.msgDispatcher)
    this.removePlayer(player)
    this.disconnected.push([player._id, index])
    this.emit('disconnect', p._id)
  }

  getPlayers() {
    return this.players
  }

  private sortPlayer(nextStarterIndex: number) {
    if (nextStarterIndex === 0) {
      return
    }

    const playersCopy = new Array(this.players.length)
    const newOrders = new Array(this.players.length)

    for (let i = 0; i < playersCopy.length; i++) {
      const from = (nextStarterIndex + i) % playersCopy.length
      playersCopy[i] = this.players[from]
      newOrders[i] = this.playersOrder[from]
    }
    this.players = playersCopy
    this.playersOrder = newOrders
  }

  async gameOver(states, firstPlayerId) {
    this.shuffleData = [];
    let stateScore = {};
    states.forEach(state => {
      state.model.played += 1
      this.addScore(state.model._id, state.score)
      stateScore[state.model._id] = state.score;
    })
    this.clearReady()
    await this.delPlayerBless();
    // 最后一局才翻
    let lowScoreTimes = 1;
    if (!this.game.juIndex === this.gameRule.juShu) {
      lowScoreTimes = this.checkLowScore();
    }
    await this.recordRoomScore()
    this.recordGameRecord(states, this.gameState.recorder.getEvents())
    // 扣除房卡
    await this.charge()
    // 金币场扣金币
    await this.updateClubGoldByScore(stateScore);
    this.gameState.destroy()
    this.gameState = null

    this.nextStarterIndex = this.playersOrder.findIndex(p => p._id === firstPlayerId)
    this.sortPlayer(this.nextStarterIndex)
    await this.robotManager.nextRound();

    // 结束当前房间
    if (this.game.isAllOver()) {
      if (lowScoreTimes > 1) {
        // 低分翻 n 倍
        stateScore = {};
        for (const playerId of Object.keys(this.scoreMap)) {
          stateScore[playerId] = (this.scoreMap[playerId] / lowScoreTimes) * (lowScoreTimes - 1);
        }
        await this.updateClubGoldByScore(stateScore);
      }
      const message = this.allOverMessage(lowScoreTimes)
      this.broadcast('room/allOver', message)
      this.players.forEach(x => x && this.leave(x))
      this.emit('empty', this.disconnected)
      // 更新大赢家
      await this.updateBigWinner();
    }
  }

  allOverMessage(lowScoreTimes) {
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
        message.players[playerId].score = this.scoreMap[playerId]
        message.players[playerId].lowScoreTimes = lowScoreTimes;
      }
    })

    if (this.creator) {
      const creator = message.players[this.creator.model._id]
      if (creator) {
        creator['isCreator'] = true
      }
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

  canDissolve() {
    if (this.dissolveReqInfo.length === 0) {
      return false
    }

    const onLinePlayer = this.dissolveReqInfo
      .filter(reqInfo => {
        const id = reqInfo._id
        return !this.disconnected.some(item => item[0] === id)
      })
    const agreeReqs = onLinePlayer.filter(reqInfo => reqInfo.type === 'agree'
      || reqInfo.type === 'originator' || reqInfo.type === 'agree_offline')

    if (onLinePlayer.length <= 2) {
      return agreeReqs.length === 2;
    }

    return agreeReqs.length > 0 && agreeReqs.length + 1 >= onLinePlayer.length
  }

  // 检查是否要低分翻倍
  checkLowScore() {
    // 检查是否要低分翻倍
    let maxScore = 0;
    const allPlayerId = Object.keys(this.scoreMap);
    for (const playerId of allPlayerId) {
      if (Math.abs(this.scoreMap[playerId]) > maxScore) {
        maxScore = Math.abs(this.scoreMap[playerId]);
      }
    }
    // 总结算中显示的低分翻倍数
    let lowScoreTimes = 1;
    if (maxScore <= this.gameRule.lowScore && this.gameRule.lowScoreTimes > 0) {
      // 最终分要翻 n 倍
      for (const playerId of allPlayerId) {
        this.scoreMap[playerId] *= this.gameRule.lowScoreTimes;
      }
      lowScoreTimes = this.gameRule.lowScoreTimes;
    }
    return lowScoreTimes;
  }

}

export default Room

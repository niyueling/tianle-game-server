/**
 * Created by user on 2016-07-04.
 */
import {GameType, TianleErrorCode} from "@fm/common/constants";
import {Channel} from 'amqplib'
import * as lodash from 'lodash'
// @ts-ignore
import {pick} from 'lodash'
import * as mongoose from 'mongoose'
import * as logger from 'winston'
import Club from '../../database/models/club'
import ConsumeRecord from '../../database/models/consumeRecord'
import DissolveRecord from '../../database/models/dissolveRecord'
import GameRecord from '../../database/models/gameRecord'
import PlayerModel from '../../database/models/player'
import RoomRecord from '../../database/models/roomRecord'
import PlayerManager from '../../player/player-manager'
import '../../utils/algorithm'
import {RedPocketConfig, RoomBase} from '../IRoom'
import {eqlModelId} from "../modelId"
import {getPlayerRmqProxy} from "../PlayerRmqProxy"
import {autoSerialize, autoSerializePropertyKeys, serialize, serializeHelp} from "../serializeDecorator"
import {AuditManager} from "./auditManager";
import Game from './game'
import {RobotManager} from "./robotManager";
import TableState from "./table_state"

const ObjectId = mongoose.Types.ObjectId
const gameType = GameType.xmmj;

class Room extends RoomBase {
  dissolveTimeout: NodeJS.Timer;

  @autoSerialize
  dissolveTime: number

  @serialize
  game: Game

  @autoSerialize
  capacity: number

  @serialize
  players: any[]

  @autoSerialize
  isPublic: boolean

  @serialize
  snapshot: any[]
  disconnectCallback: (anyArgs) => void

  @autoSerialize
  readyPlayers: string[]

  @serialize
  playersOrder: any[]

  @autoSerialize
  glodPerFan: number

  @autoSerialize
  charged: boolean
  // charge: () => void

  @serialize
  gameState: TableState

  @autoSerialize
  gameRule: any

  @autoSerialize
  scoreMap: any

  @autoSerialize
  fanShuMap: any

  @autoSerialize
  disconnected: any[] = []

  @autoSerialize
  initBase: number

  @autoSerialize
  zhuangCounter: number
  counterMap: any

  @autoSerialize
  playerGainRecord: any

  @autoSerialize
  ownerId: string

  @autoSerialize
  creator: any

  @autoSerialize
  currentBase: number

  @autoSerialize
  lunZhuangCount: number

  @autoSerialize
    // tslint:disable-next-line:variable-name
  _id: string | number

  @autoSerialize
  uid: string

  @autoSerialize
  creatorName: string

  @autoSerialize
  roomState: string = ''

  @autoSerialize
  clubMode: boolean

  @autoSerialize
  clubId: number = 0

  @autoSerialize
  clubOwner: any

  @autoSerialize
  dissolveReqInfo: Array<{ name: string, _id: string, type: string, avatar: string }> = []

  @serialize
  waitNextGamePlayers: any[] = []

  autoDissolveTimer: NodeJS.Timer

  @autoSerialize
  redPockets: RedPocketConfig[] = []

  @autoSerialize
  allRedPockets: number = 80

  @autoSerialize
  randomRedPocketArray: number[]

  @autoSerialize
  vaildPlayerRedPocketArray: number[]

  robotManager: RobotManager
  auditManager: AuditManager

  constructor(rule: any, roomNum: number) {
    super()
    this.game = new Game(rule)
    this.gameRule = rule
    this.capacity = rule.playerCount || 4
    this.players = new Array(this.capacity).fill(null)
    this.playersOrder = new Array(this.capacity).fill(null)
    this.snapshot = []
    this.isPublic = rule.isPublic
    this.disconnectCallback = messageBoyd => {

      const disconnectPlayer = this.getPlayerById(messageBoyd.from)
      this.playerDisconnect(disconnectPlayer)
    }

    this.readyPlayers = []
    this.gameState = null
    this.scoreMap = {}
    this.fanShuMap = {}
    this.disconnected = []
    this.counterMap = {}
    this.charged = false
    this.glodPerFan = rule.difen || 1
    this.initBase = this.currentBase = rule.base || 1
    this.zhuangCounter = 1

    this.lunZhuangCount = this.rule.quan * this.rule.playerCount
    this.playerGainRecord = {}

    this.uid = ObjectId().toString()
    this._id = roomNum;

    this.dissolveReqInfo = []
    this.autoDissolve();
  }

  get base() {
    return this.glodPerFan * this.currentBase
  }

  get inRoomPlayers() {
    return this.players.filter(p => p !== null)
  }

  get rule() {
    return this.game.rule
  }

  static publicRoomLowestLimit(rule) {
    if (rule.diFen >= 500) {
      return rule.diFen * 100 / 2 - 1
    }
    return 0
  }

  static roomFee(rule): number {
    if (rule.juShu === 4) {
      return 1
    } else if (rule.juShu === 8) {
      return 2
    } else {
      return 3
    }
  }

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<Room> {
    const room = new Room(json.gameRule, json._id)
    // 还原 uid
    room.uid = json.uid;
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
      room.snapshot[index] = await getPlayerRmqProxy(playerId, repository.channel, gameType);
    }

    if (room.clubMode) {
      room.clubOwner = await getPlayerRmqProxy(room.clubOwner, repository.channel, gameType);
    }
    room.creator = await getPlayerRmqProxy(room.creator, repository.channel, gameType);
    if (json.gameState) {
      room.gameState = new TableState(room, room.rule, room.game.juShu)
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

  listen(player) {
    this.listenOn = ['disconnect', 'game/disableRobot']
    player.on('disconnect', this.disconnectCallback)
    player.on('game/disableRobot', async () => {
      if (this.robotManager) {
        this.robotManager.disableRobot(player._id);
      }
    })
  }

  autoDissolve() {
    this.autoDissolveTimer = setTimeout(() => {
      if (this.game.juIndex === 0 && !this.gameState) {
        this.autoDissolveFunc()
      }
    }, 30 * 60 * 1000);
  }

  async autoDissolveFunc() {
    // await this.refundClubOwner();

    this.roomState = ''
    this.players.forEach(player => {
      if (player) {
        player.sendMessage('room/dissolve', {ok: true, data: {}})
        player.room = null
      }
    })
    this.emit('empty', this.disconnected.map(x => x[0]))
    this.players.fill(null)
    return true
  }

  getPlayerById(id: string) {
    return this.players.find(p => p && p._id === id)
  }

  privateRoomFee(rule): number {
    return Room.roomFee(rule)
  }

  recordPlayerEvent(evtType, playerId) {
    if (this.counterMap[evtType] == null) {
      this.counterMap[evtType] = []
    }
    this.counterMap[evtType].push(playerId)
  }

  initScore(player) {
    if (this.scoreMap[player._id] === undefined) {
      this.scoreMap[player._id] = this.game.rule.juScore
    }
  }

  initFanShu(player) {
    if (this.fanShuMap[player._id] === undefined) {
      this.fanShuMap[player._id] = 8;
    }
  }

  clearScore(playerId) {
    if (!this.isPublic) {
      delete this.scoreMap[playerId]
    }
  }

  toJSON() {
    return serializeHelp(this)
  }

  canJoin(player) {
    if (!player) {
      return false
    }

    if (this.indexOf(player) >= 0) {
      return true
    }

    return this.players.filter(x => x != null).length + this.disconnected.length < this.capacity
  }

  mergeOrder() {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i]) {
        this.playersOrder[i] = this.players[i]
      }
    }
  }

  arrangePos(player, reconnect?) {
    if (reconnect) {

      const indexForPlayer = this.indexOf(player)

      if (indexForPlayer < 0) {
        this.arrangePos(player)
      }

      this.players[indexForPlayer] = player
      return
    }
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i] == null && this.playersOrder[i] == null) {
        this.players[i] = player
        break
      }
    }
  }

  removePlayer(player) {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i] === player) {
        this.players[i] = null
        break
      }
    }
  }

  async shuffleDataApply(payload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(payload);
    }
  }

  isEmpty() {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i] != null) {
        return false
      }
    }
    return true
  }

  getScore(player) {
    return this.scoreMap[player._id]
  }

  getFanShu(player) {
    return this.fanShuMap[player._id]
  }

  async recordGameRecord(table, states) {
    const {players} = table

    for (let index = 0; index < states.length; index++) {
      const state = states[index]
      const id = state.model._id
      const score = state.score
      if (this.playerGainRecord[id]) {
        this.playerGainRecord[id] += score
      } else {
        this.playerGainRecord[id] = score
      }
    }

    const playerArray = states.map(state => {
      return {
        name: state.model.nickname,
        score: state.score,
      }
    })

    const winnerStates = states.filter(x => x.score > 0)
    let winner = null
    if (winnerStates.length > 0) {
      winner = winnerStates[0].model._id
    }

    await GameRecord.create({
      room: this.uid,
      juShu: this.game.juIndex,
      players: players.map(p => p.model._id),
      playersInfo: players.map(player => (
        {model: pick(player.model, ['nickname', 'avatar', 'diamond', 'gold', 'shortId'])}
      )),
      record: playerArray,
      game: {
        base: this.currentBase, caiShen: table.caishen, roomId: this._id,
        rule: this.rule.ro, niaos: table.niaos
      },
      roomId: this._id,
      winner,
      states,
      type: GameType.xmmj,
      events: table.recorder.getEvents()
    })
  }

  updatePosition(player, position) {
    if (position) {
      player.model.position = position

      const positions = this.players.map(p => p && p.model)

      this.broadcast('room/playersPosition', {ok: true, data: {positions}});
    }
  }

  async recordRoomScore(roomState = 'normal'): Promise<any> {
    const players = Object.keys(this.playerGainRecord)

    // const scores = this.playersOrder.map(player => ({
    //   score: this.playerGainRecord[player.model._id] || 0,
    //   name: player.model.name,
    //   headImgUrl: player.model.headImgUrl,
    //   shortId: player.model.shortId
    // }))
    const scores = [];
    this.playersOrder.forEach(player => {
      if (player) {
        scores.push({
          score: this.playerGainRecord[player.model._id] || 0,
          name: player.model.nickname,
          headImgUrl: player.model.avatar,
          shortId: player.model.shortId
        })
      }
    })
    // if (!this.charged) {
    //   roomState = 'zero_ju'
    // }
    const stateInfo = this.game.juIndex === this.rule.ro.juShu ? roomState + '_last' : roomState

    const roomRecord = {
      players, scores,
      roomNum: this._id, room: this.uid,
      category: GameType.xmmj,
      club: null,
      creatorId: this.creator.model.shortId || 0,
      createAt: Date.now(),
      roomState: stateInfo,
      juIndex: this.game.juIndex,
      rule: this.rule.getOriginData()
    }

    if (this.clubId) {
      roomRecord.club = this.clubId;
    }

    // logger.info('roomState:', roomState);

    RoomRecord
      .update({room: this.uid}, roomRecord, {upsert: true, setDefaultsOnInsert: true})
      .catch(e => {
        logger.error('recordRoomScore error', e)
      })

    return roomRecord
  }

  async recordDrawGameScore() {
    // logger.info('gameState:', this.gameState);
    if (this.gameState) {
      await this.gameState.drawGame()
    }

    await this.recordRoomScore('dissolve')
    DissolveRecord.create({
        roomNum: this._id,
        juIndex: this.game.juIndex,
        category: GameType.xmmj,
        dissolveReqInfo: this.dissolveReqInfo,
      },
      err => {
        if (err) {
          logger.error(err)
        }
      }
    )
    // 更新大赢家
    await this.updateBigWinner();
  }

  async addScore(playerId: string, gains: number) {
    const p = PlayerManager.getInstance().getPlayer(playerId)
    this.scoreMap[playerId] += gains

    // if (gains > 0) {
    //   if (p) {
    //     p.addGold(gains)
    //   } else {
    //     PlayerModel.update({_id: playerId}, {$inc: {gold: gains}}, err => {
    //       if (err) {
    //         logger.error(err)
    //       } else {
    //         return;
    //       }
    //     })
    //   }
    // }
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
    this.arrangePos(reconnectPlayer, true)
    this.mergeOrder()
    this.listen(reconnectPlayer);
    // reconnectPlayer.on('disconnect', this.disconnectCallback)
    if (disconnectedItem) {
      this.removeDisconnected(disconnectedItem)
    }

    if (!this.gameState || this.gameState.state === 3) {
      console.warn("gameState is dissolve");
      if (this.isPublic) {
        await this.forceDissolve(false);
        return ;
      } else {
        await this.announcePlayerJoin(reconnectPlayer);
      }
    }

    const i = this.snapshot.findIndex(p => p._id.toString() === reconnectPlayer._id.toString())
    await this.broadcastRejoin(reconnectPlayer);

    const reconnectFunc = async () => {
      this.emit('reconnect', reconnectPlayer, i);
      if (this.dissolveTimeout) {
        this.updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer);
      }
    }

    setTimeout(reconnectFunc, 500);

    return true;
  }

  async broadcastRejoin(reconnectPlayer) {
    this.broadcast('room/rejoin', {ok: true, data: await this.joinMessageFor(reconnectPlayer)})
  }

  async joinMessageFor(newJoinPlayer): Promise<any> {
    return {
      _id: this._id,
      index: this.indexOf(newJoinPlayer),
      model: newJoinPlayer.model,
      ip: newJoinPlayer.getIpAddress(),
      isGameRunning: !!this.gameState,
      location: newJoinPlayer.location,
      owner: this.ownerId,
      score: this.getScore(newJoinPlayer),
      fanShu: this.getFanShu(newJoinPlayer),
      base: this.currentBase,
      zhuangCounter: this.zhuangCounter,
      juIndex: this.game.juIndex,
      readyPlayers: this.readyPlayers.map(playerId => {
        const readyPlayer = this.inRoomPlayers.find(p => p._id === playerId)
        return this.players.indexOf(readyPlayer)
      }),
      disconnectedPlayers: this.disconnected.map(item => this.indexOf({_id: item[0]})),
      maiDi: this.rule.maiDi
    }
  }

  async announcePlayerJoin(newJoinPlayer) {
    this.broadcast('room/joinReply', {ok: true, data: await this.joinMessageFor(newJoinPlayer)})
    for (const alreadyInRoomPlayer of this.players
      .map((p, index) => {
        return p || this.playersOrder[index]
      })
      .filter(x => x !== null && x._id !== newJoinPlayer._id)) {
      newJoinPlayer.sendMessage('room/joinReply', {ok: true, data: await this.joinMessageFor(alreadyInRoomPlayer)});
    }
  }

  indexOf(player) {
    return this.playersOrder.findIndex(playerOrder => playerOrder && playerOrder._id === player._id);
  }

  async join(newJoinPlayer) {

    const isReconnect = this.indexOf(newJoinPlayer) >= 0
    if (isReconnect || this.disconnected.find(x => x[0] === newJoinPlayer._id)) {
      return this.reconnect(newJoinPlayer)
    }

    if (!this.canJoin(newJoinPlayer)) {
      return false
    }
    this.listen(newJoinPlayer);
    newJoinPlayer.room = this
    // newJoinPlayer.on('disconnect', this.disconnectCallback)
    this.arrangePos(newJoinPlayer, false)

    this.mergeOrder()

    this.initScore(newJoinPlayer)
    this.initFanShu(newJoinPlayer)

    this.emit('join')
    await this.announcePlayerJoin(newJoinPlayer)

    this.pushToSnapshot(newJoinPlayer)
    return true
  }

  lowestMultiplier() {
    return;
  }

  lowestLimit(): number {
    if (this.rule.diFen === 500) {
      return 50000
    }
    return 0
  }

  difen() {
    return this.game.rule.ro.difen
  }

  // canDissolve() {
  //   if (this.dissolveReqInfo.length === 0) {
  //     return false
  //   }
  //
  //   const onLinePlayer = this.dissolveReqInfo
  //     .filter( reqInfo => {
  //       const id = reqInfo._id
  //       return !this.disconnected.some( item => item[0] === id)
  //     })
  //   const agreeReqs = onLinePlayer.filter(reqInfo => reqInfo.type === 'agree'
  //     || reqInfo.type === 'originator' || reqInfo.type === 'agree_offline')
  //
  //   if (onLinePlayer.length <= 2) {
  //     return agreeReqs.length === 2;
  //   }
  //
  //   return agreeReqs.length > 0 && agreeReqs.length + 1 >= onLinePlayer.length
  //
  // }

  async nextGame(thePlayer) {
    if (this.game.juShu <= 0) {
      thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.roomIsFinish})
      return false;
    }

    if (this.indexOf(thePlayer) < 0) {
      thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.notInRoom})
      return false;
    }

    await this.announcePlayerJoin(thePlayer);
    return true;
  }

  async dissolve(roomCreator) {
    if (roomCreator._id !== this.ownerId) {
      roomCreator.sendMessage('room/dissolve', {ok: false, data: {}})
      return false
    }
    // await this.refundClubOwner();
    if (this.gameState !== null) {
      // player.sendMessage('room/dissolve', {errorCode: 2});
      // return false;
      this.gameState.dissolve()
    }
    // this.recordScore()
    roomCreator.sendMessage('room/dissolve', {ok: true, data: {}})
    roomCreator.room = null
    this.players.forEach(player => {
      if (player && player !== roomCreator) {
        player.sendMessage('room/dissolve', {ok: true, data: {}})
        player.room = null
      }
    })
    this.emit('empty', this.disconnected.map(x => x[0]))
    this.players.fill(null)
    return true
  }

  async forceDissolve(send = true) {
    clearTimeout(this.autoDissolveTimer)
    await this.recordDrawGameScore()
    this.dissolveReqInfo = [];
    const allOverMessage = this.allOverMessage()

    clearTimeout(this.dissolveTimeout)
    this.roomState = ''
    this.dissolveTimeout = null

    this.players
      .filter(p => p)
      .forEach(player => {
        if (send) {
          player.sendMessage('room/dissolve', {ok: true, data: allOverMessage})
        }

        player.room = null
      })
    // await this.refundClubOwner();
    this.players.fill(null)
    this.emit('empty', this.disconnected.map(x => x[0]))
    return true
  }

  playerDisconnect(player) {
    const p = player
    const index = this.players.indexOf(player)
    if (index === -1) {
      return false;
    }
    p.room = null
    if (!this.gameState) {
      this.removeReadyPlayer(p._id)
    }

    if (this.dissolveTimeout) {
      this.updateDisconnectPlayerDissolveInfoAndBroadcast(player);
    }

    // 测试环境，离线就解散房间
    // this.forceDissolve()

    this.broadcast('room/playerDisconnect', {ok: true, data: {index: this.players.indexOf(player)}}, player.msgDispatcher)
    this.removePlayer(player)
    this.disconnected.push([player._id, index])
    this.emit('disconnect', p._id)
  }

  removeReadyPlayer(playerId: string) {
    const index = this.readyPlayers.indexOf(playerId)
    if (index >= 0) {
      this.readyPlayers.splice(index, 1)
      return true
    }
    return false
  }

  leave(player, dissolve = false) {
    if (this.gameState || !player) {
      console.warn("player is disconnect in room %s", this._id)
      // 游戏已开始 or 玩家不存在
      return false
    }
    const p = player
    if (p.room !== this) {
      console.warn("player is not in this room %s", this._id)
      return false
    }

    if (this.indexOf(player) < 0) {
      console.warn("player is already leave room %s", this._id)
      return true
    }

    if (this.game.juIndex > 0 && !this.game.isAllOver() && !dissolve) {
      console.warn("room %s is not finish", this._id)
      return false
    }

    p.removeListener('disconnect', this.disconnectCallback)
    this.emit('leave', {_id: player._id})
    this.removePlayer(player)

    for (let i = 0; i < this.playersOrder.length; i++) {
      const po = this.playersOrder[i]
      if (po && po.model._id.toString() === player.model._id.toString()) {
        this.playersOrder[i] = null
      }
    }

    p.room = null
    // if (this.players.every(x => (x == null || x.isRobot()))) {
    //   for (let i = 0; i < this.players.length; i++) {
    //     this.players[i] = null
    //   }
    // }
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: p._id, roomId: this._id}})
    this.removeReadyPlayer(p._id.toString())
    this.clearScore(player._id.toString())

    return true
  }

  isReadyPlayer(playerId) {
    for (const readyPlayerId of this.readyPlayers) {
      if (readyPlayerId === playerId) {
        return true
      }
    }
    return false
  }

  getRandomArray() {
    const arrayLength = Math.floor(Math.random() * 4) + 1
    const tempArray = lodash.shuffle([0, 1, 2, 3])
    const resultArray = []
    for (let i = 0; i < arrayLength; i++) {
      resultArray.push(tempArray.pop())
    }
    return resultArray
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

  broadcast(name, message, except?) {
    for (let i = 0; i < this.players.length; ++i) {
      const player = this.players[i]
      if (player && player !== except) {
        player.sendMessage(name, message)
      }
    }
  }

  isFull(player) {
    if (this.players.filter(x => x != null).length >= this.capacity) {
      return true
    }
    if (this.readyPlayers.length >= this.capacity) {
      return !(player && this.isReadyPlayer(player._id))
    }
    return false
  }

  onRequestDissolve(player) {
    if (Date.now() - this.dissolveTime < 60 * 1000) {
      player.sendMessage('game/showInfo', {ok: false, info: TianleErrorCode.dissolveInsufficient})
      return
    }
    const dissolveInfo = this.getDissolvePlayerInfo(player);
    this.broadcast('room/dissolveReq', {ok: true, data: {dissolveReqInfo: dissolveInfo, startTime: this.dissolveTime}});
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
      return x._id.toString() === player.model._id.toString();
    });
    if (item) {
      item.type = 'agree';
    }
    this.broadcast('room/dissolveReq', {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo}});

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
    this.broadcast('room/dissolveReq', {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo}});
    return true;
  }

  getDissolvePlayerInfo(player) {
    this.dissolveReqInfo = [];
    this.dissolveTime = Date.now();
    this.dissolveReqInfo.push({
      type: 'originator',
      name: player.model.nickname,
      avatar: player.model.avatar,
      _id: player.model._id
    });
    for (let i = 0; i < this.players.length; i++) {
      const pp = this.players[i];
      if (pp && pp._id.toString() !== player._id.toString()) {
        this.dissolveReqInfo.push({
          type: 'waitConfirm',
          name: pp.model.nickname,
          avatar: pp.model.avatar,
          _id: pp.model._id
        });
      }
    }

    return this.dissolveReqInfo;
  }

  recDissolvePlayerInfo(player) {
    const item = this.dissolveReqInfo.find(x => {
      return x._id === player.model._id;
    });
    if (item) {
      if (item.type === 'agree_offline') {
        item.type = 'agree';
      } else if (item.type !== 'originator') {
        item.type = 'waitConfirm';
      }
    }
    this.broadcast('room/dissolveReq', {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime}}, player);
  }

  updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer) {
    const item = this.dissolveReqInfo.find(x => {
      return x._id.toString() === reconnectPlayer._id.toString()
    })
    if (item) {
      if (item.type === 'agree_offline') {
        item.type = 'agree'
      } else if (item.type !== 'originator') {
        item.type = 'waitConfirm'
      }
    }
    this.broadcast('room/dissolveReq', {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime}})
  }

  updateDisconnectPlayerDissolveInfoAndBroadcast(player) {
    const item = this.dissolveReqInfo.find(x => {
      return x._id.toString() === player.model._id.toString()
    })
    if (item) {
      if (item.type === 'agree') {
        item.type = 'agree_offline'
      } else if (item.type !== 'originator') {
        item.type = 'offline'
      }
    }
    this.broadcast('room/dissolveReq', {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime}})
  }

  changeZhuang() {
    this.lunZhuangCount -= 1
  }

  isRoomAllOver(states): boolean {
    const loserPlayer = states.findIndex(x => {
      return x != null && this.getScore(x.model) <= 0;
    });
    console.warn("score-%s, juShu-%s, index-%s", loserPlayer !== -1 ? this.getScore(states[loserPlayer].model) : 0, this.game.juShu, loserPlayer);
    const gameOver = this.game.juShu <= 0;
    return loserPlayer !== -1 || gameOver;
  }

  async gameOver(nextZhuangId, states) {
    // 清除洗牌
    this.shuffleData = []
    const nextZhuang = this.players.find(x => x != null && x._id.toString() === nextZhuangId.toString());
    if (nextZhuang._id.toString() === this.players[0]._id.toString()) {
      this.zhuangCounter += 1
    } else {
      this.zhuangCounter = 1
      this.changeZhuang()
    }
    this.sortPlayer(nextZhuang)
    this.clearReady()
    // await this.delPlayerBless();
    // 下一局
    await this.robotManager.nextRound();

    this.gameState.dissolve()
    this.gameState = null

    // const message = this.allOverMessage()
    // this.broadcast('room/gameAllOver', {ok: true, data: message});

    if (this.isRoomAllOver(states) && !this.isPublic) {
      const message = this.allOverMessage()
      this.broadcast('room/allOver', {ok: true, data: message})
      this.players.forEach(x => x && this.leave(x, true))
      this.emit('empty', this.disconnected)
    }
  }

  allOverMessage(): any {
    const message = {players: [], roomNum: this._id, juShu: this.game.juIndex, isClubRoom: this.clubMode, gameType: GameType.xmmj}
    this.snapshot
      .filter(p => p)
      .forEach(player => {
        message.players.push({
          _id: player._id.toString(),
          userName: player.model.nickname,
          avatar: player.model.avatar,
          shortId: player.model.shortId
        });
      })
    Object.keys(this.counterMap).forEach(x => {
      this.counterMap[x].forEach(p => {
        const index = message.players.findIndex(p1 => p1._id === p);
        if (index !== -1) {
          message.players[index][x] = (message.players[index][x] || 0) + 1;
        }
      })
    })
    Object.keys(this.scoreMap).forEach(playerId => {
      const index = message.players.findIndex(p1 => p1._id === playerId);
      if (index !== -1) {
        message.players[index].score = this.playerGainRecord[playerId];
      }
    })

    const index = message.players.findIndex(p1 => p1._id === this.creator.model._id.toString());
    if (index !== -1) {
      message.players[index].isCreator = true;
    }

    return message;
  }

  async chargeCreator() {
    if (!this.charged) {
      this.charged = true
      const createRoomNeed = this.privateRoomFee(this.rule)
      const creatorId = this.creator.model._id
      const playerManager = PlayerManager.getInstance()

      const payee = playerManager.getPlayer(creatorId) || this.creator

      payee.model.gem -= createRoomNeed
      payee.sendMessage('resource/createRoomUsedGem', {
        createRoomNeed,
      })

      PlayerModel.update({_id: creatorId},
        {
          $inc: {
            gem: -createRoomNeed,
          },
        }, err => {
          if (err) {
            logger.error(err)
          }
        })
      new ConsumeRecord({player: creatorId, gem: createRoomNeed}).save()
    }
  }

  async chargeAllPlayers() {
    if (!this.charged) {
      this.charged = true
      const createRoomNeed = this.privateRoomFee(this.rule)
      const playerManager = PlayerManager.getInstance()

      const share = Math.ceil(createRoomNeed / this.capacity)
      for (const player of this.snapshot) {

        const payee = playerManager.getPlayer(player.model._id) || player

        payee.model.gem -= share
        payee.sendMessage('resource/createRoomUsedGem', {
          createRoomNeed: share
        })
        PlayerModel.update({_id: player.model._id},
          {
            $inc: {
              gem: -share,
            },
          }, err => {
            if (err) {
              logger.error(player.model, err)
            }
          })

        new ConsumeRecord({player: player.model._id, gem: share}).save()
      }
    }
  }

  // @once
  // async refundClubOwner() {
  //   if (!this.clubMode) return
  //   if (this.charged) return
  //   if (this.gameRule.clubPersonalRoom) {
  //     // 房主付费
  //     return;
  //   }
  //
  //   const fee = Room.roomFee(this.rule)
  //
  //   if (this.gameRule.clubPersonalRoom === false) {
  //     PlayerModel.update({_id: this.clubOwner._id},
  //       {
  //         $inc: {
  //           gem: fee,
  //         },
  //       }, err => {
  //         if (err) {
  //           logger.error(this.clubOwner, err)
  //         }
  //       })
  //
  //     this.clubOwner.sendMessage('resource/createRoomUsedGem', {
  //       createRoomNeed: -fee
  //     })
  //   }
  // }

  async chargeClubOwner() {
    const fee = Room.roomFee(this.rule)

    PlayerModel.update({_id: this.clubOwner._id},
      {
        $inc: {
          gem: -fee,
        },
      }, err => {
        if (err) {
          logger.error(this.clubOwner._id, err)
        }
      })

    this.clubOwner.sendMessage('resource/createRoomUsedGem', {
      createRoomNeed: fee
    })
  }

  sortPlayer(zhuang) {
    if (zhuang) {
      const playersCopy = new Array(this.players.length)
      const newOrders = new Array(this.players.length)

      const zhuangIndex = this.players.indexOf(zhuang)
      for (let i = 0; i < playersCopy.length; i++) {
        const from = (zhuangIndex + i) % playersCopy.length
        playersCopy[i] = this.players[from]
        newOrders[i] = this.playersOrder[from]
      }
      this.players = playersCopy
      this.playersOrder = newOrders
      // console.warn("players-%s, playersOrder-%s", JSON.stringify(this.players), JSON.stringify(this.playersOrder));
    }
  }

  async init() {
    // 初始化以后，再开启机器人
    this.robotManager = new RobotManager(this, this.gameRule.depositCount);
    this.auditManager = new AuditManager(this.gameRule, this.uid, this._id);
    await this.auditManager.init();
  }
}

// export class PublicRoom extends Room {
//   checkRoomInterval: NodeJS.Timeout = null;
//
//   constructor(rule) {
//     super(rule)
//     this.isPublic = true
//     // this.charge = this.chargePublicPlayers
//
//     if (rule.diFen < 1000) {
//       this.checkRoomInterval = setInterval(() => {
//         const needPlayers = this.players.filter(p => !p).length
//         const hasHuman = this.players.some(p => {
//           return p && !p.isRobot()
//         })
//         if (hasHuman && needPlayers > 0) {
//
//           redisClient.rpoplpush("profiles", "profiles", (err, profileString) => {
//             if (err) return;
//             try {
//               const model = JSON.parse(profileString)
//               const npc = new NpcPlayer(model)
//               if (this.rule.diFen === 500) {
//                 npc.model.ruby += 50000
//               }
//               // this.join(npc)
//               // this.ready(npc)
//             } catch (e) {
//               console.error('error stack', e.stack);
//             }
//           })
//         }
//       }, ms('4s'))
//     }
//   }
//
//   allOverMessage(): any {
//     return {}
//   }
//
//   isRoomAllOver(): boolean {
//     return false
//   }
//
//   private cost(): number {
//     return Math.round((this.rule.diFen || 50) / 2)
//   }
//
//   async chargePublicPlayers() {
//     const cost = this.cost()
//     const playerManager = PlayerManager.getInstance()
//
//     for (const player of this.snapshot) {
//       const payee = playerManager.getPlayer(player.model._id) || player
//       payee.model.ruby -= cost
//       payee.sendMessage('resource/createRoomUsedRuby', {
//         createRoomNeed: cost
//       })
//       PlayerModel.update({_id: player.model._id},
//         {
//           $inc: {
//             ruby: -cost,
//           },
//         }, err => {
//           if (err) {
//             logger.error(player.model, err)
//           }
//         })
//
//       new ConsumeRecord({player: player.model._id, cost: cost / 10}).save()
//     }
//   }
//
//   initScore() {
//     return;
//   }
//
//   getScore(player) {
//     if (player.model) {
//       return player.model.gold || 0
//     }
//     return 0
//   }
//
//   // recordGameRecord() {
//   //   return
//   // }
//
//   // async recordRoomScore() {
//   //   return {}
//   // }
//
//   async addScore(playerId, v) {
//
//     const robot = this.players.find(player => {
//       return player && player.isRobot() && player.model._id === playerId
//     })
//
//     if (robot) {
//       robot.model.ruby += v
//       return
//     }
//
//     const playerManager = PlayerManager.getInstance()
//     playerManager.addRuby(playerId, v)
//
//     return
//   }
//
//   async nextGame(thePlayer) {
//
//     if (thePlayer.ruby <= Room.publicRoomLowestLimit(this.rule)) {
//       thePlayer.sendMessage('room/join-fail', {reason: `钻石不足, 无法继续游戏`})
//       return false
//     }
//
//     if (this.indexOf(thePlayer) < 0) {
//       thePlayer.sendMessage('room/join-fail', {reason: '您已经不属于这个房间.'})
//       return false
//     }
//
//     await this.announcePlayerJoin(thePlayer)
//
//     this.cancelWaitNextGame(thePlayer)
//
//     return true
//   }
//
//   async gameOver(nextZhuangId, states) {
//     this.clearPlayersIfPublic()
//     return super.gameOver(nextZhuangId, states)
//   }
//
//   playerDisconnect(player) {
//     if (super.playerDisconnect(player)) {
//       if (!this.gameState) {
//         this.leave(player)
//         return true
//       }
//       return true
//     }
//     return false
//   }
//
//   leave(player) {
//     if (super.leave(player)) {
//       if (this.isEmpty()) {
//         this.emit('empty', this.disconnected)
//         clearInterval(this.checkRoomInterval)
//         this.readyPlayers = []
//       }
//       return true
//
//     } else {
//       return false
//     }
//   }
//
//   cancelWaitNextGame(player) {
//     remove(this.waitNextGamePlayers, waitPlayer => waitPlayer === player)
//   }
//
//   waitNextGame(player) {
//     this.waitNextGamePlayers.push(player)
//   }
//
//   private WAIT_NEXT_GAME_TIMEOUT = 30 * 1000
//
//   countDownEvictWaiter() {
//     setTimeout(() => {
//       this.waitNextGamePlayers.forEach(player => this.leave(player))
//     }, this.WAIT_NEXT_GAME_TIMEOUT)
//   }
//
//   private evictWaiterTimeout() {
//     this.inRoomPlayers.forEach(player => this.waitNextGame(player))
//     this.countDownEvictWaiter()
//   }
//
//   clearPlayersIfPublic() {
//     this.evictWaiterTimeout()
//     this.clearPlayersOrderBaseOnDisconnected()
//     this.clearDisconnected()
//   }
//
//   clearPlayersOrderBaseOnDisconnected() {
//     this.disconnected.forEach(([_, index]) => this.playersOrder[index] = null)
//   }
//
//   // 赢家付
//   async chargeWinner() {
//     if (this.charged) return
//     this.charged = true
//     const payList = [];
//     for (let j = 0; j < this.players.length; j ++) {
//       // @ts-ignore
//       const p = this.gameState && this.gameState.players[j];
//       if (p) {
//         if (p.huPai()) {
//           payList.push(this.players[j]);
//         }
//       }
//     }
//     if (payList.length < 1) {
//       return;
//     }
//     let fee = this.privateRoomFee(this.rule)
//     fee = Math.ceil(fee / payList.length) || 1;
//     for (const p of payList) {
//       PlayerModel.update({_id: p.model._id},
//         {
//           $inc: {
//             gem: -fee,
//           },
//         }, err => {
//           if (err) {
//             logger.error(p.model._id, err)
//           }
//         })
//
//       p.sendMessage('resource/createRoomUsedGem', {
//         createRoomNeed: fee
//       })
//     }
//   }
//
//   async updateBigWinner() {
//     const record = await RoomRecord.findOne({ room: this.uid });
//     if (!record) {
//       // 出错了
//       console.error('no room record to update winner', this.uid)
//       return;
//     }
//     let winner = [];
//     let tempScore = 0;
//     for (let j = 0; j < this.snapshot.length; j ++) {
//       const p = this.snapshot[j]
//       if (p) {
//         const score = this.playerGainRecord[p.model._id] || 0;
//         if (tempScore === score) {
//           winner.push(p.model.shortId)
//         }
//         if (tempScore < score) {
//           tempScore = score;
//           winner = [p.model.shortId]
//         }
//       }
//     }
//     record.bigWinner = winner;
//     await record.save();
//   }
//   async init() {
//     // 初始化以后，再开启机器人
//     this.robotManager = new RobotManager(this, this.gameRule.depositCount);
//   }
// }

export default Room

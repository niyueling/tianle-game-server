/**
 * Created by user on 2016-07-04.
 */
import {ConsumeLogType, GameType, RobotStep, TianleErrorCode} from "@fm/common/constants";
import {Channel} from 'amqplib'
import * as lodash from 'lodash'
// @ts-ignore
import {pick, values} from 'lodash'
import * as mongoose from 'mongoose'
import * as logger from 'winston'
import ConsumeRecord from '../../database/models/consumeRecord'
import DiamondRecord from "../../database/models/diamondRecord";
import DissolveRecord from '../../database/models/dissolveRecord'
import GameRecord from '../../database/models/gameRecord'
import PlayerModel from '../../database/models/player'
import RoomRecord from '../../database/models/roomRecord'
import PlayerManager from '../../player/player-manager'
import '../../utils/algorithm'
import {GameTypes} from "../gameTypes"
import {RedPocketConfig, RoomBase} from '../IRoom'
import {getPlayerRmqProxy} from "../PlayerRmqProxy"
import {autoSerialize, autoSerializePropertyKeys, serialize, serializeHelp} from "../serializeDecorator"
import Game from './game'
import {eqlModelId} from "./modelId"
import {RobotManager} from "./robotManager";
import TableState from "./table_state"
import roomScoreRecord from "../../database/models/roomScoreRecord";
import PlayerHeadBorder from "../../database/models/PlayerHeadBorder";
import PlayerMedal from "../../database/models/PlayerMedal";
import {service} from "../../service/importService";
import Player from "../../database/models/player";
import Enums from "./enums";

const ObjectId = mongoose.Types.ObjectId

const gameType: GameTypes = "majiang"

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
  _id: string

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
  dissolveReqInfo: Array<{ name: string, _id: string, type: string }> = []

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

  constructor(rule: any) {
    super()
    this.game = new Game(rule)
    this.gameRule = rule
    this.capacity = rule.playerCount || 4
    this.players = new Array(this.capacity).fill(null)
    this.playersOrder = new Array(this.capacity).fill(null)
    this.snapshot = []
    this.isPublic = rule.isPublic
    this.disconnectCallback = async messageBoyd => {
      const disconnectPlayer = this.getPlayerById(messageBoyd.from)
      await this.playerDisconnect(disconnectPlayer)
    }

    this.readyPlayers = []
    this.gameState = null
    this.scoreMap = {}
    this.disconnected = []
    this.counterMap = {}
    this.charged = false

    this.glodPerFan = rule.difen || 1
    this.initBase = this.currentBase = rule.base || 1
    this.zhuangCounter = 1

    this.lunZhuangCount = this.rule.quan * this.rule.playerCount
    this.playerGainRecord = {}

    this.uid = ObjectId().toString()

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
        this.robotManager.disableRobot(player.model._id.toString());
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
    return this.players.find(p => p && p.model._id.toString() === id)
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
    if (this.scoreMap[player.model._id.toString()] === undefined) {
      this.scoreMap[player.model._id.toString()] = this.game.rule.initScore
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

  async shuffleDataApply(payload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(payload);
    }
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
      if (this.players[i] == null) {
        this.players[i] = player
        break
      }
    }
  }

  removePlayer(player) {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i] && player && this.players[i]._id.toString() === player._id.toString()) {
        this.players[i] = null
        break
      }
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
    return this.scoreMap[player.model._id.toString()]
  }

  async recordGameRecord(table, states) {
    const {players} = table

    for (let index = 0; index < states.length; index++) {
      const state = states[index]
      const id = state.model._id.toString()
      const score = state.score

      if (this.playerGainRecord[id]) {
        this.playerGainRecord[id] += score
      } else {
        this.playerGainRecord[id] = score
      }
    }

    const playerArray = states.map(state => {
      return {
        nickname: state.model.nickname,
        avatar: state.model.avatar,
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
        {model: pick(player.model, ['name', 'headImgUrl', 'sex', 'gold', 'shortId'])}
      )),
      record: playerArray,
      game: {
        base: this.currentBase, caiShen: table.caishen, roomId: this._id,
        rule: this.rule.ro, niaos: table.niaos
      },
      roomId: this._id,
      winner,
      states,
      type: 'majiang',
      events: table.recorder.getEvents()
    })
  }

  updatePosition(player, position) {
    if (position) {
      player.model.position = position

      const positions = this.players.map(p => p && p.model)

      this.broadcast('room/playersPosition', {positions});
    }
  }

  async recordRoomScore(roomState = 'normal', scores = [], players = []): Promise<any> {

    const roomRecord = {
      players, scores,
      roomNum: this._id, room: this.uid,
      category: 'majiang',
      club: null,
      creatorId: this.creator.model.shortId || 0,
      createAt: Date.now(),
      roomState: roomState,
      juIndex: this.game.juIndex,
      rule: this.rule.getOriginData()
    }


    await RoomRecord.update({room: this.uid}, roomRecord, {upsert: true, setDefaultsOnInsert: true})
      .catch(e => {
        console.error('recordRoomScore error', e)
      })

    return roomRecord
  }

    async RoomScoreRecord(scores = [], players = []): Promise<any> {

        const roomRecord = {
            players, scores,
            roomNum: this._id,
            room: this.uid,
            category: 'majiang',
            creatorId: this.creator.model.shortId,
            createAt: Date.now(),
            rule: this.rule.getOriginData(),
            roomState: "dissolve"
        }


        await roomScoreRecord.create(roomRecord);

        return roomRecord
    }

  async recordDrawGameScore(scores = []) {
    // logger.info('gameState:', this.gameState);
    if (this.gameState) {
      await this.gameState.drawGame()
    }

    await this.recordRoomScore('dissolve', scores)
    DissolveRecord.create({
        roomNum: this._id,
        juIndex: this.game.juIndex,
        category: 'majiang',
        dissolveReqInfo: this.dissolveReqInfo,
      },
      err => {
        if (err) {
          logger.error(err)
        }
      }
    )
    // 更新大赢家
    // await this.updateBigWinner();
  }

  async addScore(playerId: string, gains: number) {
    const p = PlayerManager.getInstance().getPlayer(playerId)
    this.scoreMap[playerId] += gains

    await PlayerModel.update({_id: playerId}, {$inc: {gold: gains}})
  }

  removeDisconnected(item) {
    for (let i = 0; i < this.disconnected.length; i++) {
      if (this.disconnected[i] === item) {
        this.disconnected.splice(i, 1)
      }
    }
  }

  async reconnect(reconnectPlayer) {
    // console.warn("room reconnect")
    const disconnectedItem = this.disconnected.find(x => eqlModelId(x[0], reconnectPlayer.model._id.toString()))
    reconnectPlayer.room = this
    this.arrangePos(reconnectPlayer, true)
    this.mergeOrder()
    if (disconnectedItem) {
      this.removeDisconnected(disconnectedItem)
    }

    if (!this.gameState) {
      console.warn("gameState is dissolve");
      if (this.isPublic) {
        await this.forceDissolve();
        return ;
      } else {
        await this.announcePlayerJoin(reconnectPlayer);
      }
    }
    // Fixme the index may be wrong
    const i = this.snapshot.findIndex(p => p.model._id.toString() === reconnectPlayer.model._id.toString())
    await this.broadcastRejoin(reconnectPlayer)
    if (this.dissolveTimeout) {
      this.updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer);
    }

    this.emit('reconnect', reconnectPlayer, i);

    return true;
  }

  async broadcastRejoin(reconnectPlayer) {
    this.broadcast('room/rejoin', {ok: true, data: await this.joinMessageFor(reconnectPlayer)})

    this.listen(reconnectPlayer);
  }

  async joinMessageFor(newJoinPlayer): Promise<any> {
    let medalId = null;
    let headerBorderId = null;
    // 获取用户称号
    const playerMedal = await PlayerMedal.findOne({playerId: newJoinPlayer._id, isUse: true});
    if (playerMedal && (playerMedal.times === -1 || playerMedal.times > new Date().getTime())) {
      medalId = playerMedal.propId;
    }

    // 获取用户头像框
    const playerHeadBorder = await PlayerHeadBorder.findOne({playerId: newJoinPlayer._id, isUse: true});
    if (playerHeadBorder && (playerHeadBorder.times === -1 || playerHeadBorder.times > new Date().getTime())) {
      headerBorderId = playerHeadBorder.propId;
    }

    const newModel = {...newJoinPlayer.model, medalId, headerBorderId};
    const index = this.players.findIndex(p => p && !p.isRobot());

    return {
      _id: this._id,
      index: this.indexOf(newJoinPlayer),
      model: newModel,
      medalId,
      headerBorderId,
      isGameRunning: !!this.gameState,
      isZhuang: newJoinPlayer.zhuang,
      ip: newJoinPlayer.getIpAddress(),
      location: newJoinPlayer.location,
      owner: this.ownerId,
      startIndex: index,
      zhuangJia: newJoinPlayer.zhuang,
      score: newJoinPlayer.juScore || 0,
      base: this.currentBase,
      zhuangCounter: this.zhuangCounter,
      juIndex: this.game.juIndex,
      readyPlayers: this.readyPlayers.map(playerId => {
        const readyPlayer = this.inRoomPlayers.find(p => p.model._id.toString() === playerId)
        return this.players.indexOf(readyPlayer)
      }),
      disconnectedPlayers: this.disconnected.map(item => this.indexOf({_id: item[0]})),
    }
  }

  async announcePlayerJoin(newJoinPlayer) {
    if (this.isPublic) {
      // 记录用户正在对局中
      const playerModel = await service.playerService.getPlayerModel(newJoinPlayer._id);
      playerModel.isGame = true;
      playerModel.gameTime = new Date();
      await playerModel.save();
    }

    this.broadcast('room/joinReply', {ok: true, data: await this.joinMessageFor(newJoinPlayer)})
    for (const alreadyInRoomPlayer of this.players
      .map((p, index) => {
        return p || this.playersOrder[index]
      })
      .filter(x => x !== null && x.model._id !== newJoinPlayer.model._id)) {
      newJoinPlayer.sendMessage('room/joinReply', {ok: true, data: await this.joinMessageFor(alreadyInRoomPlayer)});
    }
  }

  indexOf(player) {
    return this.playersOrder.findIndex(playerOrder => playerOrder && player && playerOrder.model._id.toString() === player.model._id.toString())
  }

  async join(newJoinPlayer) {
    const isReconnect = this.indexOf(newJoinPlayer) >= 0
    if (isReconnect || this.disconnected.find(x => x[0] === newJoinPlayer._id.toString())) {
      return this.reconnect(newJoinPlayer)
    }

    if (!this.canJoin(newJoinPlayer)) {
      return false
    }

    this.listen(newJoinPlayer);
    newJoinPlayer.room = this
    this.arrangePos(newJoinPlayer, false)
    this.mergeOrder()

    this.initScore(newJoinPlayer)

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

  async nextGame(thePlayer) {
    if (this.game.juShu <= 0 && !this.isPublic) {
      // console.warn("room error start")
      thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.roomIsFinish})
      return
    }

    if (this.indexOf(thePlayer) < 0) {
      thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.notInRoom})
      return false
    }

    thePlayer.sendMessage("room/nextGameReply", {ok: true, data: {roomId: this._id, juIndex: this.game.juIndex}})

    await this.announcePlayerJoin(thePlayer)

    const joinFunc = async() => {
      this.robotManager.model.step = RobotStep.start;
    }

    setTimeout(joinFunc, 1000);
    return true
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

  async forceDissolve() {
    clearTimeout(this.autoDissolveTimer)
    await this.recordDrawGameScore()
    this.dissolveReqInfo = [];
    const allOverMessage = this.allOverMessage()
    allOverMessage.location = "mj.room";

    // @ts-ignore
    await this.redisClient.hdelAsync("canJoinRooms", this._id);

    clearTimeout(this.dissolveTimeout)
    this.roomState = ''
    this.dissolveTimeout = null

    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i]) {
        const model = await Player.findOne({_id: this.players[i]._id});
        model.isGame = false;

        await model.save();
      }
    }

    this.players
      .filter(p => p)
      .forEach(player => {
        player.sendMessage('room/dissolve', {ok: true, data: allOverMessage})
        player.room = null
      })
    // await this.refundClubOwner();
    this.players.fill(null)
    this.emit('empty', this.disconnected.map(x => x[0]))
    return true
  }

  // 根据币种类型获取币种余额
  async PlayerGoldCurrency(playerId) {
    const model = await service.playerService.getPlayerModel(playerId);

    if (this.game.rule.currency === Enums.goldCurrency) {
      return model.gold;
    }

    return model.tlGold;
  }

  async playerDisconnect(player) {
    const p = player
    const index = this.players.indexOf(player)
    if (index === -1) {
      return false;
    }
    p.room = null
    const readyIndex = this.readyPlayers.indexOf(p._id);
    const currency = await this.PlayerGoldCurrency(p._id);

    // console.warn("gameState-%s readyIndex-%s gold-%s", this.gameState, readyIndex, model.gold);
    if (!this.gameState || readyIndex === -1 || currency <= 0) {
      // this.removeReadyPlayer(p.model._id.toString())
      await this.forceDissolve();
    }

    if (this.dissolveTimeout) {
      this.updateDisconnectPlayerDissolveInfoAndBroadcast(player);
    }

    this.broadcast('room/playerDisconnect', {ok: true, data: {index: this.players.indexOf(player)}}, player.msgDispatcher)
    // this.removePlayer(player)
    // this.disconnected.push([player.model._id.toString(), index])
    this.emit('disconnect', p.model._id.toString())
  }

  removeReadyPlayer(playerId: string) {
    const index = this.readyPlayers.findIndex(_id => _id.toString() === playerId);
    if (index !== -1) {
      this.readyPlayers.splice(index, 1);
      return true
    }
    return false
  }

  leave(player) {
    // console.warn("room")
    if (!player) {
      // 玩家不存在
      console.warn("玩家不存在");
      return false;
    }
    const p = player
    if (p.room !== this) {
      console.warn("用户不在此房间");
      return false
    }

    if (this.indexOf(player) < 0) {
      console.warn("用户已经离开房间");
      return true
    }

    // if (this.game.juIndex > 0 && !this.game.isAllOver()) return false

    p.removeListener('disconnect', this.disconnectCallback)
    this.emit('leave', {_id: player._id.toString()})
    this.removePlayer(player)

    for (let i = 0; i < this.playersOrder.length; i++) {
      const po = this.playersOrder[i]
      if (po && po.model._id.toString() === player.model._id.toString()) {
        this.playersOrder[i] = null
      }
    }

    p.room = null
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: p._id, roomId: this._id, location: "mj.room"}})
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
      player.sendMessage('room/dissolveReq', {ok: false, info: TianleErrorCode.dissolveInsufficient})
      return
    }
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
    this.broadcast('room/dissolveReq', {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime}, player);
  }

  updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer) {
    const item = this.dissolveReqInfo.find(x => {
      return x._id === reconnectPlayer.model._id.toString()
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

  changeZhuang() {
    this.lunZhuangCount -= 1
  }

  isRoomAllOver(): boolean {
    return this.game.juShu < -1;
  }

  async gameOver() {
    // 清除洗牌
    this.shuffleData = []
    this.clearReady()
    await this.delPlayerBless();
    // 下一局
    // await this.robotManager.nextRound();

    this.gameState.dissolve()
    this.gameState = null
    this.readyPlayers = [];
    this.robotManager.model.step = RobotStep.waitRuby;

    if (this.isRoomAllOver() && !this.isPublic) {
      const message = this.allOverMessage()
      this.broadcast('room/allOver', message)
      this.players.forEach(x => x && this.leave(x))
      this.emit('empty', this.disconnected)
    }
  }

  allOverMessage(): any {

    const message = {players: {}, roomNum: this._id, juShu: this.game.juIndex, isClubRoom: this.clubMode, gameType: GameType.mj}
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
        if (message.players[p]) {
          // 玩家未离开房间
          message.players[p][x] = (message.players[p][x] || 0) + 1
        }
      })
    })
    Object.keys(this.scoreMap).forEach(playerId => {
      if (message.players[playerId]) {
        (message.players[playerId].score = this.playerGainRecord[playerId])
      }
    })

    const creator = message.players[this.creator.model._id]
    if (creator) {
      creator['isCreator'] = true
    }

    return message
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
      new DiamondRecord({
        player: this.creator.model._id,
        amount: -createRoomNeed,
        residue: this.creator.model.gem,
        type: ConsumeLogType.chargeRoomFeeByCreator,
        note: ""
      }).save();
    }
  }

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
    }
  }

  async init() {
    // 初始化以后，再开启机器人
    this.robotManager = new RobotManager(this, this.gameRule.depositCount);
  }
}
export default Room

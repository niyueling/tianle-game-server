/**
 * Created by user on 2016-07-04.
 */
import {ConsumeLogType} from "@fm/common/constants";
import {Channel} from 'amqplib'
import * as lodash from 'lodash'
import {pick, values} from 'lodash'
import * as mongoose from 'mongoose'
import * as logger from 'winston'
import Club from '../../database/models/club'
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
    // tslint:disable-next-line:variable-name
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
    this.disconnectCallback = messageBoyd => {

      const disconnectPlayer = this.getPlayerById(messageBoyd.from)
      this.playerDisconnect(disconnectPlayer)
    }

    this.readyPlayers = []
    this.gameState = null
    this.scoreMap = {}
    this.disconnected = []
    this.counterMap = {}
    this.charged = false

    // this.charge = rule.share ? this.chargeAllPlayers.bind(this) : this.chargeCreator.bind(this)

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
    // Object.assign(room.game.rule.ro, json.game.rule.ro)
    //
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
        player.sendMessage('room/dissolve', {})
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
      this.scoreMap[player._id] = this.game.rule.initScore
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

  async recordGameRecord(table, states) {
    const {players} = table
    const club = this.clubId && await Club.findOne({_id: this.clubId})

    for (let index = 0; index < states.length; index++) {
      const state = states[index]
      const id = state.model._id
      const score = state.score
      if (club && this.gameRule.useClubGold) {
        state.model.clubGold += score;
        if (state) {
          await this.adjustPlayerClubGold(club, score, state.model._id, "游戏输赢，房间号：" + this._id)
        }
      }

      if (this.playerGainRecord[id]) {
        this.playerGainRecord[id] += score
      } else {
        this.playerGainRecord[id] = score
      }
    }

    const playerArray = states.map(state => {
      return {
        name: state.model.name,
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

  async recordRoomScore(roomState = 'normal'): Promise<any> {
    const players = Object.keys(this.playerGainRecord)

    // const scores = this.playersOrder.map(player => ({
    //
    // }))
    const scores = [];
    this.playersOrder.forEach(player => {
      if (player) {
        scores.push({
          score: this.playerGainRecord[player.model._id] || 0,
          name: player.model.name,
          headImgUrl: player.model.headImgUrl,
          shortId: player.model.shortId
        })
      }
    })

    // if (!this.charged) {
    //   roomState = 'zero_ju'
    // }
    const stateInfo = this.game.juIndex === this.rule.ro.juShu ? roomState + '_last' : roomState
    if (this.isPayClubGold(roomState)) {
      await this.updatePlayerClubGold();
    }

    const roomRecord = {
      players, scores,
      roomNum: this._id, room: this.uid,
      category: 'majiang',
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

    logger.info('roomState:', roomState);

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
    await this.updateBigWinner();
  }

  async addScore(playerId: string, gains: number) {
    const p = PlayerManager.getInstance().getPlayer(playerId)
    this.scoreMap[playerId] += gains

    if (gains > 0) {
      if (p) {
        p.addGold(gains)
      } else {
        PlayerModel.update({_id: playerId}, {$inc: {gold: gains}}, err => {
          if (err) {
            logger.error(err)
          } else {
            return;
          }
        })
      }
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
    this.arrangePos(reconnectPlayer, true)
    this.mergeOrder()
    this.listen(reconnectPlayer);
    // reconnectPlayer.on('disconnect', this.disconnectCallback)
    if (disconnectedItem) {
      this.removeDisconnected(disconnectedItem)
    }

    if (!this.gameState) {
      await this.announcePlayerJoin(reconnectPlayer)
    }
    // Fixme the index may be wrong
    const i = this.snapshot.findIndex(p => p._id === reconnectPlayer._id)
    this.emit('reconnect', reconnectPlayer, i)
    await this.broadcastRejoin(reconnectPlayer)
    if (this.dissolveTimeout) {
      this.updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer);
    }
    return true
    // }
  }

  async broadcastRejoin(reconnectPlayer) {
    this.broadcast('room/rejoin', await this.joinMessageFor(reconnectPlayer))
  }

  async joinMessageFor(newJoinPlayer): Promise<any> {
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
      maiDi: this.rule.maiDi
    }
  }

  async announcePlayerJoin(newJoinPlayer) {
    this.broadcast('room/join', await this.joinMessageFor(newJoinPlayer))
    for (const alreadyInRoomPlayer of this.players
      .map((p, index) => {
        return p || this.playersOrder[index]
      })
      .filter(x => x !== null && x.model._id !== newJoinPlayer.model._id)) {
      newJoinPlayer.sendMessage('room/join', await this.joinMessageFor(alreadyInRoomPlayer));
    }
  }

  indexOf(player) {
    return this.playersOrder.findIndex(playerOrder => playerOrder && playerOrder._id === player._id)
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
      thePlayer.sendMessage('room/join-fail', {reason: '牌局已经结束.'})
      return
    }

    if (this.indexOf(thePlayer) < 0) {
      thePlayer.sendMessage('room/join-fail', {reason: '您已经不属于这个房间.'})
      return false
    }

    await this.announcePlayerJoin(thePlayer)
    return true
  }

  async dissolve(roomCreator) {
    if (roomCreator._id !== this.ownerId) {
      roomCreator.sendMessage('room/dissolveReply', {errorCode: 1})
      return false
    }
    // await this.refundClubOwner();
    if (this.gameState !== null) {
      // player.sendMessage('room/dissolveReply', {errorCode: 2});
      // return false;
      this.gameState.dissolve()
    }
    // this.recordScore()
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
    await this.recordDrawGameScore()
    this.dissolveReqInfo = [];
    const allOverMessage = this.allOverMessage()

    clearTimeout(this.dissolveTimeout)
    this.roomState = ''
    this.dissolveTimeout = null

    this.players
      .filter(p => p)
      .forEach(player => {
        player.sendMessage('room/dissolve', allOverMessage)
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

    this.broadcast('room/playerDisconnect', {index: this.players.indexOf(player)}, player.msgDispatcher)
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

  leave(player) {
    if (this.gameState || !player) {
      // 游戏已开始 or 玩家不存在
      return false
    }
    const p = player
    if (p.room !== this) {
      return false
    }

    if (this.indexOf(player) < 0) {
      return true
    }

    if (this.game.juIndex > 0 && !this.game.isAllOver()) return false

    p.removeListener('disconnect', this.disconnectCallback)
    this.emit('leave', {_id: player._id})
    this.removePlayer(player)

    for (let i = 0; i < this.playersOrder.length; i++) {
      const po = this.playersOrder[i]
      if (po && po.model._id === player.model._id) {
        this.playersOrder[i] = null
      }
    }

    p.room = null
    // if (this.players.every(x => (x == null || x.isRobot()))) {
    //   for (let i = 0; i < this.players.length; i++) {
    //     this.players[i] = null
    //   }
    // }
    this.broadcast('room/leave', {_id: p._id})
    this.removeReadyPlayer(p._id)
    this.clearScore(player._id)

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
      player.sendMessage('game/showInfo', {ok: false, info: '1分钟时间内不能再次发起解散'})
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
    return this.game.juShu <= 0
  }

  someoneOverLostLimit() {
    return values(this.scoreMap).some(score => score <= this.rule.lostLimit)
  }

  // clearDisconnected() {
  //   this.disconnected.forEach(arr => {
  //     const disConnectedPlayer = arr[0]
  //     lobby.getInstance().clearDisConnectedPlayer(disConnectedPlayer)
  //   })
  //   this.disconnected = []
  // }

  async gameOver(nextZhuangId, states) {
    // 清除洗牌
    this.shuffleData = []
    const nextZhuang = this.players.find(x => x != null && x._id === nextZhuangId)
    if (nextZhuang === this.players[0]) {

      const zhuangState = states.filter(state => state.model._id === nextZhuangId)[0]

      if (zhuangState.events.hu && zhuangState.events.hu.length > 0) {
        this.zhuangCounter += 1
        this.currentBase += 1
      }
    } else {
      this.currentBase = this.initBase
      this.zhuangCounter = 1
      this.changeZhuang()
    }
    this.sortPlayer(nextZhuang)
    this.clearReady()
    await this.delPlayerBless();
    // 下一局
    await this.robotManager.nextRound();
    // await this.recordRoomScore()
    // this.recordGameRecord(states, this.gameState.recorder.getEvents())

    this.gameState.dissolve()
    this.gameState = null

    if (this.isRoomAllOver()) {
      const message = this.allOverMessage()
      this.broadcast('room/allOver', message)
      this.players.forEach(x => x && this.leave(x))
      this.emit('empty', this.disconnected)
    }
    // else {
    //   for (const x of this.players) {
    //     if (x && x.isRobot()) {
    //       if (await this.nextGame(x)) {
    //         setTimeout(() => {
    //           this.leave(x)
    //         }, ms('5s'))
    //       } else {
    //         setTimeout(() => {
    //           this.leave(x)
    //         }, ms('5s'))
    //       }
    //     }
    //   }
    // }
  }

  allOverMessage(): any {

    const message = {players: {}, roomNum: this._id, juShu: this.game.juIndex, isClubRoom: this.clubMode}
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
        new DiamondRecord({
          player: player.model._id,
          amount: -share,
          residue: player.model.gem,
          type: ConsumeLogType.chargeRoomFeeByShare,
          note: ""
        }).save();
      }
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

//
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

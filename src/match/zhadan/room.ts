/**
 * Created by user on 2016-07-04.
 */
import {GameType, RobotStep, shopPropType, TianleErrorCode} from "@fm/common/constants";
import {Channel} from 'amqplib'
// @ts-ignore
import {pick} from 'lodash'
import * as mongoose from 'mongoose'
import * as logger from 'winston'
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
import Player from "../../database/models/player";
import GameCategory from "../../database/models/gameCategory";
import CombatGain from "../../database/models/combatGain";
import PlayerMedal from "../../database/models/PlayerMedal";
import PlayerHeadBorder from "../../database/models/PlayerHeadBorder";
import RoomFeeConfig from "../../database/models/roomFeeConfig";
import PlayerProp from "../../database/models/PlayerProp";

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

  @autoSerialize
  isWaitRecharge: boolean = false;
  @autoSerialize
  waitRechargeLists: any[] = [];

  constructor(rule: any) {
    super()
    this.uid = ObjectId().toString()
    this.game = new Game(rule)
    this.isPublic = rule.isPublic
    this.gameRule = rule

    this.initPlayers()
    // this.init();

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

  static async roomFee(rule): Promise<number> {
    const configList = await RoomFeeConfig.find({game: GameType.zd}).sort({diamond: 1});
    const configIndex = configList.findIndex(c => c.juShu === rule.juShu);
    console.warn("configIndex-%s, rule-%s， config-%s", configIndex, JSON.stringify(rule), JSON.stringify(configList[configIndex]));

    if (rule.ruleId) {
      if (configIndex !== -1) {
        if (configList[configIndex].clubMode) {
          return configList[configIndex].diamond;
        }

        return configList[configList.length - 1].diamond;
      }

      return configList[configList.length - 1].diamond;
    }

    if (configIndex !== -1) {
      if (configList[configIndex].personMode) {
        return configList[configIndex].diamond;
      }

      return 0;
    }

    return configList[configList.length - 1].diamond;
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
        player.sendMessage('room/dissolve', {ok: true, data: {}})
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
      model: pick(player.model, ['nickname', 'avatar', 'tlGold', 'gold', 'shortId'])
    }))
    const playerArray = states.map(state => ({
      nickname: state.model.nickname,
      avatar: state.model.avatar,
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
        type: 'zhadan'
      },
      err => {
        if (err) {
          logger.error(err)
        }
      }
    )
  }

  async updatePosition() {
    const positions = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p) {
        const position = i;
        positions.push({_id: p._id, shortId: p.model.shortId, position});
      }
    }

    this.broadcast("game/updatePosition", {ok: true, data: {positions}});
  }

  async recordRoomScore(roomState = 'normal') {
    const players = this.snapshot.map(p => p._id);
    // console.warn("playersOrder-%s", JSON.stringify(this.playersOrder));
    const scores = this.playersOrder.map(player => {
      if (player) {
        return {
          score: this.scoreMap[player._id] || 0,
          name: player.model.nickname,
          headImgUrl: player.model.avatar,
          shortId: player.model.shortId
        }
      }

    })

    if (!this.charged) {
      roomState = 'zero_ju'
    }
    const stateInfo = this.game.juIndex === this.rule.ro.juShu ? roomState + '_last' : roomState

    const roomRecord = {
      players,
      scores,
      roomNum: this._id,
      room: this.uid,
      creatorId: this.creator.model.shortId || 0,
      createAt: Date.now(),
      club: null,
      category: GameType.zd,
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

  async recordDrawGameScore() {

  }

  async addScore(playerId, v) {
    console.warn("_id-%s, score-%s", playerId, v);
    this.scoreMap[playerId] += v;
  }

  async addBombScore(winnerId, failId, score) {
    console.warn("winnerId %s failId %s score %s", winnerId, failId, score);
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

    // 如果离线的时候房间已结束
    if (!this.gameState || (this.gameState && this.gameState.state === 'gameOver')) {
      if (this.isPublic) {
        await this.forceDissolve();
        return ;
      } else {
        await this.announcePlayerJoin(reconnectPlayer);
      }
    }

    const i = this.snapshot.findIndex(p => p._id === reconnectPlayer._id)
    await this.broadcastRejoin(reconnectPlayer)

    const reconnectFunc = async () => {
      this.emit('reconnect', reconnectPlayer, i);
      if (this.dissolveTimeout) {
        this.updateReconnectPlayerDissolveInfoAndBroadcast(reconnectPlayer);
      }
    }

    setTimeout(reconnectFunc, 500);
  }

  inRoom(socket) {
    return this.players.indexOf(socket) > -1
  }

  async joinMessageFor(newJoinPlayer): Promise<any> {
    let medalId = null;
    let headerBorderId = null;
    let emojiIds = [];
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

    // 获取用户表情
    const playerEmojis = await PlayerProp.find({playerId: newJoinPlayer._id, propType: shopPropType.emoji});
    for (let i = 0; i < playerEmojis.length; i++) {
      const playerEmoji = playerEmojis[i];
      if (playerEmoji && (playerEmoji.times === -1 || playerEmoji.times > new Date().getTime())) {
        emojiIds.push(playerEmoji.propId);
      }
    }

    const newModel = {...newJoinPlayer.model, medalId, headerBorderId, emojiIds};
    const index = this.players.findIndex(p => p && !p.isRobot());
    return {
      index: this.indexOf(newJoinPlayer),
      model: newModel,
      medalId,
      headerBorderId,
      emojiIds,
      ip: newJoinPlayer.getIpAddress(),
      location: newJoinPlayer.location,
      owner: this.ownerId,
      startIndex: index,
      gameState: this.gameState ? this.gameState.state : null,
      isWaitRecharge: this.waitRechargeLists.includes(newJoinPlayer._id.toString()),
      gameWaitRecharge: this.isWaitRecharge,
      isGameRunning: !!this.gameState,
      _id: this._id,
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

  async shuffleDataApply(payload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(payload);
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
    if (this.game.juShu <= 0 && !this.isPublic) {
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

  onRequestDissolve(player) {
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
      return x._id === player.model._id;
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

  evictFromOldTable(thePlayer) {
    const oldTable = this.gameState
    oldTable.evictPlayer(thePlayer)
  }

  getDissolvePlayerInfo(player) {
    this.dissolveReqInfo = [];
    this.dissolveTime = Date.now();
    this.dissolveReqInfo.push({
      type: 'originator',
      name: player.model.nickname,
      _id: player.model._id
    });
    for (let i = 0; i < this.players.length; i++) {
      const pp = this.players[i];
      if (pp && pp.isRobot()) {
        this.dissolveReqInfo.push({
          type: 'agree',
          name: pp.model.nickname,
          _id: pp.model._id
        });
      } else if (pp && pp !== player) {
        this.dissolveReqInfo.push({
          type: 'waitConfirm',
          name: pp.model.nickname,
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
      {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime}});
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
    this.broadcast('room/dissolveReq', {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime}});
  }

  async playerDisconnect(player) {
    const p = player
    const index = this.players.indexOf(player)

    if (index === -1) {
      return
    }

    p.room = null
    if (!this.gameState) {
      this.cancelReady(p._id)
    }

    if (this.dissolveTimeout) {
      this.updateDisconnectPlayerDissolveInfoAndBroadcast(player);
    }

    // 如果离线的时候房间已结束
    if (!this.gameState || (this.gameState && this.gameState.state === 'gameOver')) {
      // 金豆房直接解散房间
      if (this.isPublic) {
        await this.forceDissolve();
      }
    }

    this.broadcast('room/playerDisconnect', {ok: true, data: {index: this.players.indexOf(player)}}, player.msgDispatcher)
    // this.removePlayer(player)
    // 避免消息重试
    // const disconnectedIndex = this.disconnected.findIndex(value => value[0] === player._id);
    // if (disconnectedIndex === -1) {
    //   this.disconnected.push([player._id, index])
    // }
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

    this.cancelReady(player._id)

    this.emit('leave', {_id: player._id})
    if (this.isEmpty() && this.isPublic) {
      this.emit('empty', this.disconnected);
      this.readyPlayers = [];
    }
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: player._id, roomId: this._id, location: "zd.room"}})
    this.removeReadyPlayer(player._id);
    return true
  }

  isRoomAllOver(): boolean {
    return this.game.isAllOver()
  }

  async gameOver(states, firstPlayerId) {
    this.shuffleData = []

    for (let i = 0; i < states.length; i++) {
      const player = this.players[i];
      const state = states[i];
      if (this.isPublic && player) {
        await this.savePublicCombatGain(player, state.score);
        await this.setPlayerGameConfig(player, state.score);
      }

      state.model.played += 1
      await this.addScore(state.model._id, state.score);

      const playerModel = await service.playerService.getPlayerModel(player._id);
      this.broadcast('resource/updateGold', {ok: true, data: {index: i, data: pick(playerModel, ['gold', 'diamond', 'tlGold'])}})
    }

    this.clearReady()
    await this.recordRoomScore()
    this.recordGameRecord(states, this.gameState.recorder.getEvents())
    await this.charge();

    this.nextStarterIndex = this.playersOrder.findIndex(p => p._id.toString() === firstPlayerId.toString())
    this.sortPlayer(this.nextStarterIndex)
    await this.delPlayerBless();
    // 可能没人离线，需要手动初始化

    await this.robotManager.nextRound();

    // 更新玩家位置
    await this.updatePosition();

    const updateNoRubyFunc = async() => {
      if (this.isPublic) {
        // 判断机器人是否需要补充金豆
        await this.updateNoRuby();
      }

      this.gameState.destroy();
      this.gameState = null
      this.readyPlayers = [];
      this.robotManager.model.step = RobotStep.waitRuby;

      // 好友房总结算
      if (this.isRoomAllOver()) {
        const message = this.allOverMessage()
        this.broadcast('room/allOver', {ok: true, data: message});
        // this.players.forEach(x => x && this.leave(x));
        this.emit('empty', this.disconnected);
        // 更新大赢家
        await this.updateBigWinner();
      }
    }

    setTimeout(updateNoRubyFunc, 1200);
  }

  async updateNoRuby() {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p || !p.isRobot()) {
        continue;
      }

      const resp = await service.gameConfig.rubyRequired(p._id.toString(), this.gameRule);
      if (resp.isNeedRuby || resp.isUpgrade) {
        this.isWaitRecharge = true;
        this.waitRechargeLists.push(p._id.toString());
        this.broadcast('resource/robotIsNoRuby', {ok: true, data: {index: i, isUpgrade: resp.isUpgrade, isNeedRuby: resp.isNeedRuby, conf: resp.conf}})
      }
    }

    return true;
  }

  async savePublicCombatGain(player, score) {
    const category = await GameCategory.findOne({_id: this.gameRule.categoryId}).lean();

    await CombatGain.create({
      uid: this._id,
      room: this.uid,
      juIndex: this.game.juIndex,
      playerId: player._id,
      gameName: "浦城炸弹",
      caregoryName: category.title,
      currency: this.rule.currency,
      time: new Date(),
      score
    });
  }

  async setPlayerGameConfig(player, score) {
    const model = await Player.findOne({_id: player._id});

    model.isGame = false;
    model.juCount++;

    if (!model.gameJuShu[GameType.zd]) {
      model.gameJuShu[GameType.zd] = 0;
    }
    model.gameJuShu[GameType.zd]++;
    await Player.update({_id: model._id}, {$set: {gameJuShu: model.gameJuShu}});

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

  async dissolveOverMassage() {
    const message = this.allOverMessage()

    if (this.gameState) {

      const playerCards = this.gameState.players.map(p => p.cards)

      Object.assign(message, {playerCards})
    }
    return message
  }

  allOverMessage() {
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
        message.players[index].score = this.scoreMap[playerId];
      }
    })

    const index = message.players.findIndex(p1 => p1._id === this.creator.model._id.toString());
    if (index !== -1) {
      message.players[index].isCreator = true;
    }

    return message;
  }

  async privateRoomFee(rule) {
    return await Room.roomFee(rule)
  }

  async applyAgain(player) {
    if (player._id.toString() !== this.creator._id.toString()) {
      player.sendMessage('room/againReply', {ok: false, info: TianleErrorCode.isNotCreator})
      return
    }

    const isEnough = await this.enoughCurrency(player);

    if (!isEnough) {
      player.sendMessage('room/againReply', {ok: false, info: TianleErrorCode.diamondInsufficient})
      return
    }

    this.playAgain()
  }

  async enoughCurrency(player) {
    return player.model.diamond >= await this.privateRoomFee(this.game.rule.ro)
  }

  playAgain() {
    this.isPlayAgain = true

    this.game.reset()
    this.clearReady()
    this.noticeAnother()
  }

  noticeAnother() {
    const excludeCreator = this.inRoomPlayers.filter(s => s !== this.creator)
    excludeCreator.forEach(pSocket => pSocket.sendMessage('room/inviteAgain', {ok: true, data: {}}))
  }

  playerOnExit(player) {
    this.leave(player)
    this.removeRoomListeners(player)
  }

  listen(player) {
    this.listenOn = ['room/again', 'room/exit', 'disconnect', 'game/disableRobot']

    player.on('room/again', async () => await this.applyAgain(player))
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
    console.warn("init room RobotManager %s", this.gameRule.depositCount);
    if (!this.robotManager) {
      this.robotManager = new RobotManager(this, this.gameRule.depositCount);
    }
  }

  private sortPlayer(nextStarterIndex: number) {
    if (nextStarterIndex === 0) {
      return
    }
    console.warn("nextStarterIndex-%s", nextStarterIndex);

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
}

export default Room

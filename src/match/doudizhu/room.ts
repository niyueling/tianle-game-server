import {Channel} from 'amqplib'
// @ts-ignore
import {pick} from 'lodash'
import * as mongoose from 'mongoose'
import * as logger from 'winston'
import Club from '../../database/models/club'
import DissolveRecord from '../../database/models/dissolveRecord'
import GameRecord from '../../database/models/gameRecord'
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
import {GameType, RobotStep, shopPropType, TianleErrorCode} from "@fm/common/constants";
import {service} from "../../service/importService";
import GameCategory from "../../database/models/gameCategory";
import CombatGain from "../../database/models/combatGain";
import Player from "../../database/models/player";
import {stateGameOver} from "./table";
import RoomTimeRecord from "../../database/models/roomTimeRecord";
import PlayerMedal from "../../database/models/PlayerMedal";
import PlayerHeadBorder from "../../database/models/PlayerHeadBorder";
import RoomFeeConfig from "../../database/models/roomFeeConfig";
import PlayerProp from "../../database/models/PlayerProp";

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

  // 房间是否已经解散
  dissolveState: string

  @autoSerialize
  isWaitRecharge: boolean = false;
  @autoSerialize
  waitRechargeLists: any[] = [];

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<Room> {

    const room = new Room(json.gameRule, json._id)
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
    // await room.init();
    return room
  }

  constructor(rule: any, roomNum: number) {
    super()
    this.uid = ObjectId().toString()
    this.game = new Game(rule)
    this.isPublic = rule.isPublic
    this.gameRule = rule
    this._id = roomNum;

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
    this.robotManager = new RobotManager(this, rule.depositCount);
    this.dissolveState = null;
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
        player.sendMessage('room/dissolve', {ok: true, data: {}})
        player.room = null
      }
    })
    this.emit('empty', this.disconnected.map(x => x[0]))
    this.players.fill(null)
    return true
  }

  static async roomFee(rule): Promise<number> {
    const configList = await RoomFeeConfig.find({game: GameType.ddz}).sort({diamond: 1});
    const configIndex = configList.findIndex(c => c.juShu === rule.juShu);

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

  initPlayers() {
    this.snapshot = []
    this.readyPlayers = []
    this.disconnected = []
    this.capacity = this.rule.playerCount || 3;
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

  recordGameRecord(states, events) {

    const room = this.uid
    const players = states.map(state => state.model._id)
    const playersInfo = states.map(player => ({
      model: pick(player.model, ['nickname', 'avatar', 'diamond', 'gold', 'shortId'])
    }))
    const playerArray = states.map(state => {
      return {
        nickname: state.model.nickname,
        avatar: state.model.avatar,
        score: state.score,
        playerId: state.model._id
      }
    })

    GameRecord.create({
        room,
        players,
        landload: this.gameState.landload,
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

  async shuffleDataApply(payload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(payload);
    }
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

  async addScore(playerId, v) {
    this.scoreMap[playerId] += v;
  }

  removeDisconnected(item) {
    for (let i = 0; i < this.disconnected.length; i++) {
      if (this.disconnected[i] === item) {
        this.disconnected.splice(i, 1)
      }
    }
  }

  async broadcastStartGame(payload) {
    let conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.gameRule.categoryId);

    // @ts-ignore
    await this.redisClient.hdelAsync("canJoinRooms", this._id);

    const startGame = async() => {
      let m = await RoomTimeRecord.findOne({ roomId: this._id });
      if (m) {
        m.juIndex = this.game.juIndex;
        m.createAt = new Date();
        await m.save();
      } else {
        await RoomTimeRecord.create({
          roomId: this._id,
          rule: this.gameRule,
          category: this.gameRule.gameType,
          juIndex: this.game.juIndex
        })
      }

      this.broadcast('room/startGame', {ok: true, data: {
          juIndex: this.game.juIndex,
          playersPosition: this.players.filter(x => x).map(x => x.model),
          // 获取底分
          diFen: conf ? conf.Ante : 1,
        }})
    }

    setTimeout(startGame, 500)
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

    if (!this.gameState || (this.gameState && this.gameState.state === 4)) {
      console.warn("gameState is dissolve");
      if (this.isPublic) {
        await this.forceDissolve();
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
    return true
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
      _id: this._id,
      startIndex: index,
      ip: newJoinPlayer.getIpAddress(),
      location: newJoinPlayer.location,
      isWaitRecharge: this.waitRechargeLists.includes(newJoinPlayer._id.toString()),
      gameWaitRecharge: this.isWaitRecharge,
      isGameRunning: !!this.gameState && this.gameState.state !== stateGameOver,
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
      {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo, startTime: this.dissolveTime}})
  }

  updateDisconnectPlayerDissolveInfoAndBroadcast(player) {
    const item = this.dissolveReqInfo.find(x => {
      return x.name === player.model.nickname
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

  async playerDisconnect(player) {
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

    // 如果离线的时候房间已结束
    if (!this.gameState || (this.gameState && this.gameState.state === 4)) {
      // 金豆房直接解散房间
      if (this.isPublic) {
        await this.forceDissolve();
      }
    }

    this.broadcast('room/playerDisconnect', {
      ok: true,
      data: {index: this.players.indexOf(player)}
    }, player.msgDispatcher)
    // this.removePlayer(player)
    // this.disconnected.push([player._id, index])
    this.emit('disconnect', p._id)
  }

  getPlayers() {
    return this.players
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

  private async sortPlayer(nextStarterIndex: number) {
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

  async savePublicCombatGain(player, score) {
    const category = await GameCategory.findOne({_id: this.gameRule.categoryId}).lean();

    await CombatGain.create({
      uid: this._id,
      room: this.uid,
      juIndex: this.game.juIndex,
      playerId: player._id,
      gameName: "斗地主",
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

    if (!model.gameJuShu[GameType.ddz]) {
      model.gameJuShu[GameType.ddz] = 0;
    }
    model.gameJuShu[GameType.ddz]++;
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

  async gameOver(states, firstPlayerId) {
    this.shuffleData = [];
    let stateScore = {};
    for (let i = 0; i < states.length; i++) {
      const player = this.players[i];
      const state = states[i];
      if (this.isPublic && player) {
        await this.savePublicCombatGain(player, state.score);
        await this.setPlayerGameConfig(player, state.score);
      }

      state.model.played += 1
      await this.addScore(state.model._id, state.score);
      stateScore[state.model._id] = state.score;

      const playerModel = await service.playerService.getPlayerModel(player._id);
      this.broadcast('resource/updateGold', {ok: true, data: {index: i, shortId: player.model.shortId, data: pick(playerModel, ['gold', 'diamond', 'tlGold', 'redPocket'])}});
    }
    this.nextStarterIndex = this.playersOrder.findIndex(p => p._id.toString() === firstPlayerId.toString())
    await this.sortPlayer(this.nextStarterIndex)
    this.clearReady();
    await this.charge();
    await this.robotManager.nextRound();

    await this.recordRoomScore()
    this.recordGameRecord(states, this.gameState.recorder.getEvents())

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
      this.dissolveState = "dissolve";

      // 好友房总结算
      if ((this.game.isAllOver() && !this.isPublic)) {
        const message = await this.allOverMessage()
        this.broadcast('room/allOver', {ok: true, data: message})
        // this.players.forEach(x => x && this.leave(x))
        this.emit('empty', this.disconnected)
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
      if (resp.isNeedRuby) {
        this.isWaitRecharge = true;
        this.waitRechargeLists.push(p._id.toString());
        this.broadcast('resource/robotIsNoRuby', {
          ok: true, data: {
            index: i,
            shortId: p.model.shortId,
            player: this.players.map(pp => {return {shortId: pp.model.shortId}}),
            isUpgrade: resp.isUpgrade,
            isNeedRuby: resp.isNeedRuby,
            conf: resp.conf
          }
        })
      }
    }

    return true;
  }

  async allOverMessage() {
    const message = {players: [], roomNum: this._id, juShu: this.game.juIndex, isClubRoom: this.clubMode, gameType: GameType.ddz}
    const filteredPlayers = this.snapshot.filter(p => p);
    for (const player of filteredPlayers) {
      const gameRecords = await GameRecord.find({roomId: this._id});
      let landloadCount = 0;
      let winnerCount = 0;

      for (let i = 0; i < gameRecords.length; i++) {
        const game = gameRecords[i];
        // 用户是地主，则累计地主次数
        if (game.landload === player._id.toString()) {
          landloadCount++;
        }

        for (let j = 0; j < game.record.length; j++) {
          const record = game.record[j];
          console.warn("record-%s", JSON.stringify(record));
          if (record && record.playerId === player._id.toString() && record.score > 0) {
            winnerCount++;
          }
        }
      }

      // 但在这个例子中，我们直接使用player的数据
      const playerData = {
        _id: player._id.toString(),
        userName: player.model.nickname,
        avatar: player.model.avatar,
        shortId: player.model.shortId,
        landloadCount,
        winnerCount
      };

      message.players.push(playerData);
    }

    Object.keys(this.counterMap).forEach(x => {
      this.counterMap[x].forEach(p => {
        const index = message.players.findIndex(p1 => p1._id.toString() === p.toString());
        if (index !== -1) {
          message.players[index][x] = (message.players[index][x] || 0) + 1;
        }
      })
    })

    Object.keys(this.scoreMap).forEach(playerId => {
      const index = message.players.findIndex(p1 => p1._id.toString() === playerId.toString());
      if (index !== -1) {
        message.players[index].score = this.scoreMap[playerId];
      }
    })

    const index = message.players.findIndex(p1 => p1._id.toString() === this.creator.model._id.toString());
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
      player.sendMessage('room/againReply', {ok: false, info: TianleErrorCode.playerIsNotCreator})
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
    return 1;
  }

}

export default Room

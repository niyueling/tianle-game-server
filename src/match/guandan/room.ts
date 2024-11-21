/**
 * Created by user on 2016-07-04.
 */
import {GameType, RobotStep, TianleErrorCode} from "@fm/common/constants";
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
import Table, {genFullyCards} from "./table"
import Player from "../../database/models/player";
import GameCategory from "../../database/models/gameCategory";
import CombatGain from "../../database/models/combatGain";
import alg from "../../utils/algorithm";
import Card, {CardType} from "./card";

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
        const playerRmq = await getPlayerRmqProxy(playerId, repository.channel, GameType.guandan);
        if (json.players[index]) {
          room.players[index] = playerRmq;
        }
        room.playersOrder[index] = playerRmq;
      }
    }

    for (const [index, playerId] of json.snapshot.entries()) {
      room.snapshot[index] = await getPlayerRmqProxy(playerId, repository.channel, GameType.guandan);
    }

    if (room.clubMode) {
      room.clubOwner = await getPlayerRmqProxy(room.clubOwner, repository.channel, GameType.guandan);
    }
    // contest模式房间recover报错  待测
    const creatorModel = await service.playerService.getPlayerPlainModel(room.creator)
    if (creatorModel)
      room.creator = new PlayerRmqProxy(creatorModel, repository.channel, GameType.guandan)
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
    return 0;
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

  async testFaPai(player) {
    const types = [CardType.Club, CardType.Diamond, CardType.Heart, CardType.Spades];
    const cards = [];

    types.forEach((type: CardType) => {
      for (let v = 1; v <= 13; v += 1) {
        cards.push(new Card(type, v, 2), new Card(type, v, 2));
      }
    })

    cards.push(new Card(CardType.Joker, 16, 2), new Card(CardType.Joker, 16, 2));
    cards.push(new Card(CardType.Joker, 17, 2), new Card(CardType.Joker, 17, 2));

    alg.shuffleForZhadan(cards);

    player.sendMessage('game/testFaPaiReply', {ok: true, data: {cards: cards.slice(0, 27)}});
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

  recordGameRecord(states, events, firstPlayerId = null) {

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
        winnerId: firstPlayerId,
        juShu: this.game.juIndex,
        playersInfo,
        record: playerArray,
        game: {roomId: this._id, rule: this.rule.getOriginData()},
        roomId: this._id,
        states,
        events,
        type: 'guandan'
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
      category: GameType.guandan,
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
    console.warn("_id-%s, score-%s", playerId, v);
    this.scoreMap[playerId] += v;
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
    const index = this.players.findIndex(p => p && !p.isRobot());
    return {
      index: this.indexOf(newJoinPlayer),
      model: await service.playerService.getPlayerPlainModel(newJoinPlayer.model._id),
      ip: newJoinPlayer.getIpAddress(),
      location: newJoinPlayer.location,

      owner: this.ownerId,
      startIndex: index,
      gameState: this.gameState ? this.gameState.state : null,
      isGameRunning: !!this.gameState,
      _id: this._id,
      score: this.getScore(newJoinPlayer),
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

  getNextLevelCard() {
    console.warn("juShu %s", this.gameRule.juShu);
    if (this.gameRule.juShu === 1) {
      return 5;
    }

    if (this.gameRule.juShu === 2) {
      return 8;
    }

    if (this.gameRule.juShu === 3) {
      return 10;
    }

    return 14;
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

    this.broadcast('room/playerDisconnect', {ok: true, data: {index: this.players.indexOf(player)}}, player.msgDispatcher);
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
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: player._id, roomId: this._id, location: "guandan.room"}})
    this.removeReadyPlayer(player._id);
    return true
  }

  isRoomAllOver(): boolean {
    return this.isAllOver
  }

  calcLevelCard() {
    // 计算级牌升级
    const firstWinnerPlayer = this.winOrderLists.find(p => p.winOrder === 1);
    if (firstWinnerPlayer) {
      // 判断用户属于哪个阵营
      const team = firstWinnerPlayer.team;
      // 判断升级倍数
      const upgradeMultiple = this.upgradeMultiple;
      this.oldHomeTeamCard = this.homeTeamCard;
      this.oldAwayTeamCard = this.awayTeamCard;

      const nextLevelCard = this.getNextLevelCard();

      // 给赢家队伍升级级牌
      if (team === 0) {
        // 判断我方级牌已经封顶，判断是否过级牌
        if (this.homeTeamCard === nextLevelCard || this.homeTeamCard === 1) {
          const winOrderList = this.winOrderLists.filter(p => p.team === 0).map(p => p.winOrder);

          // 如果用户头游并且不是末游，则游戏结束
          console.warn("winOrderList %s", JSON.stringify(winOrderList));
          if(winOrderList.includes(1) && !winOrderList.includes(4)) {
            return this.isAllOver = true;
          }

          // 如果用户过牌失败，记录过牌失败次数
          if (!this.isAllOver) {
            this.homeFailCount++;
            this.broadcast("game/passThroughCard", {ok: true, data: {card: this.homeTeamCard, team : 0}});

            if (this.homeFailCount === 3 && this.gameRule.juShu === 5) {
              this.homeFailCount = 0;
              this.homeTeamCard = 2;
              this.currentLevelCard = this.homeTeamCard;
            }
          }
        } else {
          this.homeTeamCard = (this.homeTeamCard + upgradeMultiple >= nextLevelCard ? (nextLevelCard !== 14 ? nextLevelCard : nextLevelCard - 13) : this.homeTeamCard + upgradeMultiple);
          this.currentLevelCard = this.homeTeamCard;
        }
      }

      if (team === 1) {
        if (this.awayTeamCard === nextLevelCard || this.awayTeamCard === 1) {
          const winOrderList = this.winOrderLists.filter(p => p.team === 1).map(p => p.winOrder);
          console.warn("winOrderList %s", JSON.stringify(winOrderList));

          // 如果用户头游并且不是末游，则游戏结束
          if(winOrderList.includes(1) && !winOrderList.includes(4)) {
            return this.isAllOver = true;
          }

          // 如果用户过牌失败，记录过牌失败次数
          if (!this.isAllOver) {
            this.awayFailCount++;
            this.broadcast("game/passThroughCard", {ok: true, data: {card: this.awayTeamCard, team : 1}});

            if (this.awayFailCount === 3 && this.gameRule.juShu === 5) {
              this.awayFailCount = 0;
              this.awayTeamCard = 2;
              this.currentLevelCard = this.awayTeamCard;
            }
          }
        } else {
          this.awayTeamCard = (this.awayTeamCard + upgradeMultiple >= nextLevelCard ? (nextLevelCard !== 14 ? nextLevelCard : nextLevelCard - 13) : this.awayTeamCard + upgradeMultiple);
          this.currentLevelCard = this.awayTeamCard;
        }
      }

      console.warn("firstWinnerPlayer %s team %s oldHomeTeamCard %s homeTeamCard %s oldAwayTeamCard %s awayTeamCard %s currentLevelCard %s nextLevelCard %s", JSON.stringify(firstWinnerPlayer), team, this.oldHomeTeamCard,
        this.homeTeamCard, this.oldAwayTeamCard, this.awayTeamCard, this.currentLevelCard, nextLevelCard);
    }
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
    this.recordGameRecord(states, this.gameState.recorder.getEvents(), firstPlayerId)
    await this.charge();
    this.calcLevelCard();

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
        const message = await this.allOverMessage()
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
      gameName: "掼蛋",
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

    if (!model.gameJuShu[GameType.guandan]) {
      model.gameJuShu[GameType.guandan] = 0;
    }
    model.gameJuShu[GameType.guandan]++;
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
    const message = await this.allOverMessage()

    if (this.gameState) {

      const playerCards = this.gameState.players.map(p => p.cards)

      Object.assign(message, {playerCards})
    }
    return message
  }

  async allOverMessage() {
    const message = {
      players: [],
      roomNum: this._id,
      juShu: this.game.juIndex,
      isClubRoom: this.clubMode,
      gameType: GameType.guandan
    };
    const filteredPlayers = this.snapshot.filter(p => p);

    for (const player of filteredPlayers) {
      const gameRecords = await GameRecord.find({roomId: this._id});
      let winnerCount = 0;

      for (let i = 0; i < gameRecords.length; i++) {
        const game = gameRecords[i];
        // 用户是头游，则累计头游次数
        if (game.winnerId === player._id.toString()) {
          winnerCount++;
        }
      }

      const playerData = {
        _id: player._id.toString(),
        userName: player.model.nickname,
        avatar: player.model.avatar,
        shortId: player.model.shortId,
        winnerCount
      };

      message.players.push(playerData);
    }

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

  privateRoomFee() {
    return Room.roomFee(this.game.rule)
  }

  applyAgain(player) {
    if (player !== this.creator) {
      player.sendMessage('room/againReply', {ok: false, info: TianleErrorCode.isNotCreator})
      return
    }

    if (!this.enoughCurrency(player)) {
      player.sendMessage('room/againReply', {ok: false, info: TianleErrorCode.diamondInsufficient})
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
    excludeCreator.forEach(pSocket => pSocket.sendMessage('room/inviteAgain', {ok: true, data: {}}))
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

  protected recordDrawGameScore(): any {

  }
}

export default Room

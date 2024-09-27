import {ConsumeLogType, GameType, playerAttributes, TianleErrorCode} from "@fm/common/constants";
import * as EventEmitter from 'events'
import * as logger from 'winston'
import * as config from "../config";
import Club from '../database/models/club'
import ClubGoldRecord from "../database/models/clubGoldRecord";
import ClubMember from '../database/models/clubMember'
import GoodsLive from "../database/models/goodsLive";
import LuckyBless from "../database/models/luckyBless";
import Player from "../database/models/player";
import PlayerModel from '../database/models/player'
import RoomRecord from "../database/models/roomRecord";
import {service} from "../service/importService";
import { IGame, IRoom, ITable, SimplePlayer } from './interfaces';
import {once} from "./onceDecorator"
import {autoSerialize, Serializable, serialize, serializeHelp} from "./serializeDecorator"
import {eqlModelId} from "./pcmajiang/modelId";
import createClient from "../utils/redis";
import {stateGameOver} from "./xmmajiang/table_state";

export const playerInClub = async (clubShortId: string, playerId: string) => {
  if (!clubShortId) {
    return false
  }
  const club = await Club.findOne({shortId: clubShortId})
  if (!club) {
    return false
  }

  if (club.owner === playerId) {
    return true;
  }

  return ClubMember.findOne({club: club._id, member: playerId}).exec()
}

export interface RedPocketConfig {
  _id: string
  name: string
  taken: boolean
  amountInFen: number
}

export abstract class RoomBase extends EventEmitter implements IRoom, Serializable {
  @autoSerialize
  dissolveTime: number

  dissolveTimeout: NodeJS.Timer

  @autoSerialize
  players: SimplePlayer[]

  @serialize
  playersOrder: any[]

  @autoSerialize
  readyPlayers: string[]

  @autoSerialize
  snapshot: any[]

  @autoSerialize
  disconnected: Array<[string, number]>

  @autoSerialize
  scoreMap: any

  redisClient = createClient()

  @serialize
  gameState: ITable

  @serialize
  game: IGame

  disconnectCallback: (player) => void

  @autoSerialize
  isPublic: boolean
  @autoSerialize
  charged: boolean

  capacity: number

  listenOn: string[]
  isPlayAgain: boolean = false

  @autoSerialize
  ownerId: string
  @autoSerialize
  creatorName: any

  @autoSerialize
  creator: any

  // noinspection TsLint
  @autoSerialize
  _id: string | number
  @autoSerialize
  uid: string
  @autoSerialize
  roomState: string = ''

  @autoSerialize
  gameRule: any

  @autoSerialize
  dissolveReqInfo: Array<{ name: string, _id: string, type: string }> = []

  @autoSerialize
  clubId: number

  @autoSerialize
  clubMode: boolean = false

  @autoSerialize
  clubOwner: any
  protected autoDissolveTimer: NodeJS.Timer

  @autoSerialize
  redPockets: RedPocketConfig[] = []

  @autoSerialize
  allRedPockets: number = 50

  @autoSerialize
  randomRedPocketArray: number[]

  @autoSerialize
  vaildPlayerRedPocketArray: number[]

  emitter: any

  // 本局是否有红包
  isHasRedPocket: boolean = false;

  // 是否洗牌
  @autoSerialize
  shuffleData: any = []

  // 抵挡输豆次数
  @autoSerialize
  preventTimes: any = {}

  abstract initScore(player)

  // 保存祈福等级
  @autoSerialize
  blessLevel: any = {}

  // 机器人管理
  robotManager?: any

  broadcast(name, message, except?) {
    for (let i = 0; i < this.players.length; ++i) {
      const player = this.players[i]
      if (player && player !== except) {
        player.sendMessage(name, message)
      }
    }
  }

  async setClub(clubId, clubOwner) {
    this.clubId = clubId;
    this.clubOwner = clubOwner
    this.clubMode = true;
  }

  abstract privateRoomFee(rule: any): number

  canJoin(player) {
    if (!player) {
      return false
    }

    if (this.indexOf(player) >= 0) {
      return true
    }
    // 过滤机器人
    return this.playersOrder.filter(x => x).length < this.capacity
  }

  mergeOrder() {
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i]) {
        this.playersOrder[i] = this.players[i]
      }
    }
  }

  getScore(player) {
    return this.scoreMap[player._id]
  }

  getScoreBy(playerId) {
    return this.scoreMap[playerId] || 0
  }

  indexOf(player) {
    return this.playersOrder.findIndex(playerOrder => playerOrder && player && playerOrder._id === player._id)
  }

  isReadyPlayer(playerId) {
    for (const readyPlayerId of this.readyPlayers) {
      if (readyPlayerId === playerId) {
        return true
      }
    }
    return false
  }

  async ready(player) {
    if (!player) {
      console.warn("player is disconnect");
      return ;
    }

    if (this.isReadyPlayer(player._id.toString())) {
      console.warn("player is ready");
      return
    }

    if (this.gameState) {
      console.warn("game is not start");
      return
    }

    this.readyPlayers.push(player._id.toString())
    this.broadcast('room/readyReply', {
      ok: true,
      data: {
        index: this.players.indexOf(player),
        readyPlayers: this.readyPlayers
      }
    })

    if (this.allReady) {
      if (!this.game.isAllOver()) {
        // 先播动画
        this.playShuffle();
      }
    }
  }

  clearReady() {
    this.readyPlayers = []
  }

  get allReady() {
    if (this.game.juIndex >= 1) {
      return this.readyPlayers.length === this.playersOrder.filter(p => p).length;
    }
    return this.readyPlayers.length === this.capacity
  }

  async startGame(payload) {
    if (this.disconnected.length > 0 && !this.robotManager) {
      // 有人掉线了且没有机器人
      console.info(`some one offline ${JSON.stringify(this.disconnected)}`);
      return;
    }
    this.readyPlayers = this.players.filter(p => p).map(x => x._id);
    this.playersOrder = this.players.slice();
    this.snapshot = this.players.slice();
    this.isPlayAgain = false;
    this.destroyOldGame()
    await this.startNewGame(payload)
    this.isHasRedPocket = false;
    // 保存游戏开始信息
    return service.roomRegister.saveRoomInfoToRedis(this)
  }

  destroyOldGame() {
    if (this.gameState) {
      this.forceDissolve();
      this.gameState.destroy()
    }
  }

  async startNewGame(payload) {
    this.destroyOldGame()
    const gameState = this.game.startGame(this)
    this.gameState = gameState
    await gameState.start(payload)
    await this.broadcastStartGame(payload)
  }

  async broadcastStartGame(payload) {
    let conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.gameRule.categoryId);

    // @ts-ignore
    await this.redisClient.hdelAsync("canJoinRooms", this._id);

    const startGame = async() => {
      this.broadcast('room/startGame', {ok: true, data: {
          juIndex: this.game.juIndex,
          playersPosition: this.players.filter(x => x).map(x => x.model),
          // 获取底分
          diFen: conf ? conf.Ante : 1,
        }})
    }

    setTimeout(startGame, this.gameRule.type === GameType.xmmj ? 2000 : 500)
  }

  async join(newJoinPlayer) {
    const isReconnect = this.indexOf(newJoinPlayer) >= 0

    if (isReconnect || this.disconnected.find(x => x[0] === newJoinPlayer._id.toString())) {
      return this.reconnect(newJoinPlayer)
    }

    if (!this.canJoin(newJoinPlayer)) {
      return false
    }
    newJoinPlayer.room = this
    this.listen(newJoinPlayer)

    this.arrangePos(newJoinPlayer, isReconnect)

    this.mergeOrder()

    this.initScore(newJoinPlayer)

    this.emit('join')
    await this.announcePlayerJoin(newJoinPlayer)

    this.pushToSnapshot(newJoinPlayer)

    // this.joinInHalf(newJoinPlayer);
    return true
  }

  joinInHalf(newJoinPlayer) {
    if (this.gameRule.share && this.game.juIndex > 1) {
      const fee = this.privateRoomFee(this.rule)
      this.payUseGem(newJoinPlayer, fee, this._id, ConsumeLogType.chargeRoomFeeByShare)
    }
  }

  leave(player) {
    if (this.gameState || !player) {
      // 游戏已开始 or 玩家不存在
      console.debug('player is disconnect in room %s', this._id);
      return false
    }
    if (this.indexOf(player) < 0) {
      return true
    }
    player.removeListener('disconnect', this.disconnectCallback)
    this.removePlayer(player)
    this.removeOrder(player);
    player.room = null
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: player.model._id, location: "IRoom"}})
    this.removeReadyPlayer(player.model._id)
    this.clearScore(player.model._id)

    return true
  }

  clearScore(playerId) {
    if (!this.isPublic) {
      // delete this.scoreMap[playerId];
    }
  }

  cancelReady(playerId: string) {
    const index = this.readyPlayers.indexOf(playerId)
    if (index >= 0) {
      this.readyPlayers.splice(index, 1)
      return true
    }
    return false
  }

  removeReadyPlayer(playerId: string) {
    const index = this.readyPlayers.findIndex(_id => _id.toString() === playerId);
    if (index !== -1) {
      this.readyPlayers.splice(index, 1);
      return true
    }
    return false
  }

  isEmpty() {
    return this.inRoomPlayers.length + this.disconnected.length === 0
  }

  get inRoomPlayers() {
    return this.players.filter(p => p)
  }

  // 开始下一局
  async nextGame(thePlayer): Promise<boolean> {
    console.log(this.game.juShu, this.isPublic, 'IRoom')
    if (!this.isPublic && this.game.juShu <= 0) {
      console.warn("IRoom error start")
      thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.roomIsFinish})
      return
    }
    if (this.indexOf(thePlayer) === -1) {
      thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.notInRoom})
      return false
    }

    await this.announcePlayerJoin(thePlayer)
    // this.evictFromOldTable(thePlayer)

    return true
  }

  abstract async reconnect(reconnectPlayer: SimplePlayer): Promise<any>

  protected pushToSnapshot(newJoinPlayer: any) {
    for (const p of this.snapshot) {
      if (p.model._id === newJoinPlayer.model._id) {
        return;
      }
    }
    this.snapshot.push(newJoinPlayer);
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
      if (this.players[i] && this.players[i]._id.toString() === player._id.toString()) {
        this.players[i] = null
        break
      }
    }
  }

  // 通知其它人，有玩家加入
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
      .filter(x => x !== null && x._id !== newJoinPlayer._id)) {
      newJoinPlayer.sendMessage('room/joinReply', {ok: true, data: await this.joinMessageFor(alreadyInRoomPlayer)});
    }
  }

  async broadcastRejoin(reconnectPlayer) {
    if (!reconnectPlayer) {
      return
    }
    this.broadcast('room/rejoin', {ok: true, data: await this.joinMessageFor(reconnectPlayer)})
  }

  abstract async joinMessageFor(newJoinPlayer): Promise<any>

  isFull(player) {
    if (this.players.filter(x => x != null).length >= this.capacity) {
      return true
    }
    if (this.readyPlayers.length >= this.capacity) {
      return !(player && this.isReadyPlayer(player._id))
    }
    return false
  }

  // 房主支付
  async chargeCreator() {
    if (this.charged) return
    this.charged = true
    const createRoomNeed = this.privateRoomFee(this.rule)
    this.payUseGem(this.creator, createRoomNeed, this._id, ConsumeLogType.chargeRoomFeeByCreator)
    await this.updateRoomGem({ [this.creator.model.shortId]: createRoomNeed });
  }

  getPlayerById(id: string) {
    return this.players.find(p => p && p._id === id)
  }

  // aa 支付房费
  async chargeAllPlayers() {
    if (this.charged) return
    this.charged = true
    const fee = this.privateRoomFee(this.rule)
    const gemList = {};
    for (const player of this.snapshot) {
      gemList[player.model.shortId] = fee;
      this.payUseGem(player, fee, this._id, ConsumeLogType.chargeRoomFeeByShare)
    }
    await this.updateRoomGem(gemList);
  }

  // 战队主付费
  async chargeClubOwner() {
    if (this.charged) return
    this.charged = true
    const fee = this.privateRoomFee(this.rule)
    this.payUseGem(this.clubOwner, fee, this._id, ConsumeLogType.chargeRoomFeeByClubOwner)
    await this.updateRoomGem({ [this.clubOwner.model.shortId]: fee });
  }

  async chargePublicPlayers() {
    console.log('no charge for public players');
    return;
  }

  // 赢家付
  async chargeWinner() {
    if (this.charged) return
    this.charged = true
    let payList = [];
    let tempScore = 0;
    for (let j = 0; j < this.players.length; j ++) {
      const p = this.players[j];
      if (p) {
        const score = this.scoreMap[p.model._id] || 0;
        if (tempScore === score) {
          payList.push(p)
        }
        if (tempScore < score) {
          tempScore = score;
          payList = [p]
        }
      }
    }
    if (payList.length < 1) {
      return;
    }
    let fee = this.privateRoomFee(this.rule)
    fee = Math.ceil(fee / payList.length) || 1;
    const gemList = {};
    for (const p of payList) {
      this.payUseGem(p, fee, this._id, ConsumeLogType.chargeRoomFeeByWinner)
      gemList[p.model.shortId] = fee;
    }
    await this.updateRoomGem(gemList);
  }

  // 选择房费支付人
  async charge() {
    if (!config.game.useGem) {
      // 球扣房卡
      this.charged = true;
      return;
    }
    // 战队房间都是战队主付房卡
    if (this.clubMode) {
      return this.chargeClubOwner();
    }
    if (this.gameRule.share) {
      // aa 支付
      return this.chargeAllPlayers();
    }
    if (this.gameRule.winnerPay) {
      // 赢家付
      return this.chargeWinner()
    }
    if (this.gameRule.creatorPay) {
      // 房主付
      return this.chargeCreator()
    }
    if (this.gameRule.clubOwnerPay) {
      // 战队主付
      return this.chargeClubOwner();
    }
    if (this.isPublic) {
      return this.chargePublicPlayers();
    }
  }

  // @once
  // async refundClubOwner() {
  //   if (!this.clubMode) return
  //   if (this.charged) return
  //   if (!this.gameRule.clubOwnerPay) {
  //     return;
  //   }
  //
  //   const fee = this.privateRoomFee(this.rule)
  //
  //   PlayerModel.update({_id: this.clubOwner._id},
  //     {
  //       $inc: {
  //         gem: fee,
  //       },
  //     }, err => {
  //       if (err) {
  //         logger.error(this.clubOwner, err)
  //       }
  //     })
  //
  //   this.clubOwner.sendMessage('resource/createRoomUsedGem', {
  //     createRoomNeed: -fee
  //   })
  // }

  abstract listen(player)

  protected removeOrder(player: SimplePlayer) {
    for (let i = 0; i < this.playersOrder.length; i++) {
      const po = this.playersOrder[i]
      if (po && eqlModelId(po, player)) {
        this.playersOrder[i] = null
      }
    }
  }

  get rule() {
    return this.game.rule
  }

  toJSON() {
    return serializeHelp(this)
  }

  initDissolveByPlayer(simplePlayer: SimplePlayer) {
    this.dissolveReqInfo = []
    this.dissolveTime = Date.now();
    this.dissolveReqInfo.push({
      type: 'originator',
      name: simplePlayer.model.nickname,
      _id: simplePlayer.model._id
    })
    for (let i = 0; i < this.players.length; i++) {
      const pp = this.players[i]
      if (pp && pp.isRobot()) {
        this.dissolveReqInfo.push({
          type: 'offline',
          name: pp.model.nickname,
          _id: pp.model._id
        })
      } else if (pp && pp !== simplePlayer) {
        this.dissolveReqInfo.push({
          type: 'waitConfirm',
          name: pp.model.nickname,
          _id: pp.model._id
        })
      }
    }
    if (this.robotManager) {
      // 有机器人, 离线会自动同意
      return this.dissolveReqInfo;
    }
    for (let i = 0; i < this.disconnected.length; i++) {
      const pp = this.disconnected[i]
      this.snapshot.forEach(player => {
          if (player && player.model._id === pp[0]) {
            this.dissolveReqInfo.push({
              type: 'offline',
              name: player.model.nickname,
              _id: player.model._id
            })
          }
        }
      )
    }
    return this.dissolveReqInfo
  }

  canDissolve() {
    if (this.dissolveReqInfo.length === 0) {
      return false
    }
    const agreeReqs = this.dissolveReqInfo
      .filter(reqInfo => reqInfo.type === 'agree'
        || reqInfo.type === 'originator' || reqInfo.type === 'agree_offline')

    return (this.rule.playerCount === 2 && agreeReqs.length === 2) || (this.rule.playerCount > 2 && agreeReqs.length >= this.rule.playerCount - 1);
    // 所有人都同意了，才能解散
    // const agreeReqs = this.dissolveReqInfo.filter(reqInfo => reqInfo.type === 'agree'
    //   || reqInfo.type === 'originator' || reqInfo.type === 'agree_offline')
    // return agreeReqs.length >= this.dissolveReqInfo.length;
  }

  onRequestDissolve(player) {
    const dissolveInfo = this.initDissolveByPlayer(player)
    this.broadcast('room/dissolveReq',
      {ok: true, data: {dissolveReqInfo: dissolveInfo, startTime: this.dissolveTime}})
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

    return true
  }

  dissolveOverMassage(lowScoreTimes?: number) {
    return this.allOverMessage(lowScoreTimes)
  }

  @once
  async forceDissolve() {
    clearTimeout(this.autoDissolveTimer)
    const lowScoreTimes = await this.recordDrawGameScore()
    const allOverMessage = this.dissolveOverMassage(lowScoreTimes)
    allOverMessage.location = "IRoom";

    // @ts-ignore
    await this.redisClient.hdelAsync("canJoinRooms", this._id);

    clearTimeout(this.dissolveTimeout)
    this.roomState = ''
    this.dissolveTimeout = null
    this.players
      .filter(p => p)
      .forEach(player => {
        player.sendMessage('room/dissolve', {ok: true, data: allOverMessage})
        player.room = null
      })
    this.players.fill(null)
    this.dissolveAndDestroyTable()
    this.emit('empty', this.disconnected.map(x => x[0]))
    return true
  }

  dissolveAndDestroyTable() {
    if (this.gameState) {
      this.gameState.destroy()
    }
  }

  onAgreeDissolve(player) {
    const item = this.dissolveReqInfo.find(x => {
      return x._id === player.model._id
    })
    if (item) {
      item.type = 'agree'
    }
    this.broadcast('room/dissolveReq', {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo}})

    if (this.canDissolve()) {
      this.forceDissolve()
      return
    }
    return true
  }

  onDisagreeDissolve(player) {

    const item = this.dissolveReqInfo.find(x => {
      return x._id === player.model._id
    })
    if (item) {
      item.type = 'disAgree'
      clearTimeout(this.dissolveTimeout)
      this.roomState = ''
      this.dissolveTimeout = null
    }
    this.broadcast('room/dissolveReq',
      {ok: true, data: {dissolveReqInfo: this.dissolveReqInfo}})
    return true
  }

  async specialDissolve() {
    try {
      if (this.autoDissolveTimer) {
        clearTimeout(this.autoDissolveTimer)
      }
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
      return {ok: true, roomNum: this._id}
    } catch (e) {
      return {ok: false, roomNum: this._id}
    }
  }

  async dissolve(roomCreator) {
    if (roomCreator._id !== this.ownerId) {
      roomCreator.sendMessage('room/dissolve', {ok: false, data: {}})
      return false
    }
    if (this.autoDissolveTimer) {
      clearTimeout(this.autoDissolveTimer)
    }
    this.dissolveAndDestroyTable()
    roomCreator.sendMessage('room/dissolve', {ok: true, data: {}})
    roomCreator.room = null
    this.players.forEach(player => {
      if (player && player._id.toString() !== roomCreator._id.toString()) {
        player.sendMessage('room/dissolve', {ok: true, data: {}})
        player.room = null
      }
    })
    this.emit('empty', this.disconnected.map(x => x[0]))
    this.players.fill(null)
    return true
  }

  payUseGem(player, toPay: number, note: string | number = '', type: number = 1) {
    const condition = {_id: player.model._id};
    const update = {$inc: {diamond: -toPay}};
    const options = {new: true};
    const callback = (err, newDoc) => {
      if (err) {
        logger.error(player.model, err);
        return
      }

      if (newDoc) {
        player.model.diamond = newDoc.diamond
        // player.sendMessage('resource/createRoomUsedDiamond', {ok: true, data: {diamondFee: toPay}})
        service.playerService.logGemConsume(player.model._id, type, -toPay, player.model.diamond, note);
      }
    }

    PlayerModel.findOneAndUpdate(condition, update, options, callback);
  }

  protected abstract allOverMessage(lowScoreTimes?: number): any

  protected abstract recordDrawGameScore(): any

  abstract async gameOver(nextZhuangId: string, states: any, currentZhuangId: string)

  async addShuffle(player) {
    const model = await service.playerService.getPlayerModel(player._id);
    if (model.diamond < config.game.payForReshuffle) {
      player.sendMessage('room/addShuffleRely', {ok: false, info: TianleErrorCode.diamondInsufficient});
      return
    }
    this.shuffleData.push(player.model._id);
    this.payUseGem(player, config.game.payForReshuffle, this._id, ConsumeLogType.reshuffleCard);
    player.sendMessage('room/addShuffleRely', {ok: true, data: {seatIndex: this.indexOf(player), diamondFee: config.game.payForReshuffle}})

    this.updateResource2Client(player);
  }

  playShuffle() {
    // 洗牌动画
    const shuffleData = this.shuffleData.map(x => {
      // 查找 index
      return this.players.findIndex(y => y.model._id === x)
    })
    // 多延时 1 秒
    const shuffleDelayTime = this.shuffleData.length * config.game.playShuffleTime + 1000;
    this.broadcast('game/shuffleData', {ok: true, data: {shuffleData, shuffleDelayTime}});
    return shuffleDelayTime;
  }

  // 进房间战队金币消耗
  async updatePlayerClubGold() {
    const club = this.clubId && await Club.findOne({_id: this.clubId})
    if (!club) {
      return
    }
    let goldPay;
    let payResult;
    let payPlayer = [];
    // if (this.gameRule.creatorPayGold) {
    //   // 创建者支付
    //   payPlayer.push(this.creator.model._id);
    // }
    // if (this.gameRule.clubOwnerPayGold) {
    //   // 战队主支付
    //   payPlayer.push(this.clubOwner.model._id);
    // }
    if (this.gameRule.winnerPayGold) {
      // 大赢家付金币
      payPlayer = [];
      let tempScore = 0;
      for (let j = 0; j < this.snapshot.length; j ++) {
        const p = this.snapshot[j]
        if (p) {
          const score = this.scoreMap[p.model._id] || 0;
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
      for (let i = 0; i < payPlayer.length; i ++) {
        payResult = await service.club.calculateGold(club.shortId, payPlayer[i], goldPay);
        if (payResult.inviterGold > 0) {
          // 需要给邀请人分成
          await this.adjustPlayerClubGold(club, -goldPay, payPlayer[i],
            "游戏消耗，房间号：" + this._id)
          await this.adjustPlayerClubGold(club, payResult.inviterGold, payResult.inviterPlayerId,
          "游戏金币分成，房间号：" + this._id)
        } else {
          await this.adjustPlayerClubGold(club, -goldPay, payPlayer[i], "游戏消耗，房间号：" + this._id)
        }
      }
      return;
    }
    // aa支付, 每个人都扣相同金币
    goldPay = this.gameRule.clubGold || 0;
    for (let i = 0; i < this.snapshot.length; i ++) {
      const p = this.snapshot[i]
      if (p) {
        payResult = await service.club.calculateGold(club.shortId, p.model._id, goldPay);
        if (payResult.inviterGold > 0) {
          // 需要给邀请人分成
          await this.adjustPlayerClubGold(club, -goldPay, p.model._id, "游戏消耗，房间号：" + this._id)
          await this.adjustPlayerClubGold(club, payResult.inviterGold, payResult.inviterPlayerId,
            "游戏金币分成，房间号：" + this._id)
        } else {
          await this.adjustPlayerClubGold(club, -goldPay, p.model._id, "游戏消耗，房间号：" + this._id)
        }
      }
    }
  }

  async adjustPlayerClubGold(club, goldPay, playerId, info) {
    let memberShip = await ClubMember.findOne({ club: club._id, member: playerId});
    if (!memberShip) {
      // 检查联盟战队
      memberShip = await ClubMember.findOne({
        unionClubShortId: club.shortId,
        member: playerId,
      })
    }
    if (memberShip) {
      memberShip.clubGold += goldPay;
      await ClubGoldRecord.create({
        club: club._id,
        member: playerId,
        gameType: this.gameRule.type,
        goldChange: goldPay,
        allClubGold: memberShip.clubGold,
        info,
      })
      await memberShip.save()
    }
  }

  // 结算金币分
  async updateClubGoldByScore(scores: { [playerId: string]: number }) {
    if (!this.clubId) {
      return;
    }
    const club = await Club.findOne({_id: this.clubId})
    if (club && this.gameRule.useClubGold) {
      for (const playerId of Object.keys(scores)) {
        const p = this.players.find(value => {
          return value && value._id === playerId
        });
        if (!p) {
          continue;
        }
        p.model.clubGold += scores[playerId];
        await this.adjustPlayerClubGold(club, scores[playerId], playerId, "游戏输赢，房间号：" + this._id)
      }
    }
  }

  // 是否支付战队金币
  isPayClubGold(roomState = 'normal') {
    return this.gameRule.useClubGold && (this.game.juIndex === this.gameRule.juShu || roomState === "dissolve")
  }

  // 更新房卡记录
  async updateRoomGem(value) {
    const record = await RoomRecord.findOne({ room: this.uid });
    if (record) {
      record.gemCount = value;
      record.markModified('gemCount');
      await record.save();
    }
  }

  // 更新大赢家
  async updateBigWinner() {
    const record = await RoomRecord.findOne({ room: this.uid });
    if (!record) {
      // 出错了
      console.error('no room record to update winner', this.uid)
      return;
    }
    let winner = [];
    let tempScore = 0;
    for (let j = 0; j < this.snapshot.length; j ++) {
      const p = this.snapshot[j]
      if (p) {
        const score = this.scoreMap[p.model._id] || 0;
        if (tempScore === score) {
          winner.push(p.model.shortId)
        }
        if (tempScore < score) {
          tempScore = score;
          winner = [p.model.shortId]
        }
        if (!this.isPublic) {
          // 非金豆房, 记录勋章得分王
          await service.medal.updateScoreKingMedal(p.model._id, p.model.shortId, score, this.gameRule.type);
        }
      }
    }
    record.bigWinner = winner;
    await record.save();
  }

  async init() {
    console.log('init room');
    this.preventTimes = {};
  }

  // 兑换复活礼包
  async exchangeLiveGift(player, msg) {
    const key = 'game/exchangeLiveGift';
    const gift = await GoodsLive.findById(msg.giftId);
    if (!gift) {
      return this.replyFail(player, key, '礼包不存在');
    }
    const times = await service.gameConfig.goodsLiveTimes(this._id);
    gift.gem *= times;
    gift.ruby *= times;
    const model = await service.playerService.getPlayerModel(player.model._id);
    if (model.gem < gift.gem) {
      return this.replyFail(player, key, '钻石不足');
    }
    await Player.update({_id: model._id},
      {$inc: {gem: -gift.gem, ruby: gift.ruby}});
    model.gem -= gift.gem;
    model.ruby += gift.ruby;
    // 抵挡输豆次数
    if (gift.preventTimes > 0) {
      // 更新抵挡输豆次数
      this.preventTimes[model.shortId] = gift.preventTimes;
    }
    this.replySuccess(player, key, { gem: model.gem, ruby: gift.ruby });
  }

  // 删除玩家的祈福信息
  async delPlayerBless() {
    for (const p of this.players) {
      if (p) {
        await service.qian.delBlessLevel(p.model.shortId, this._id);
      }
    }
    this.blessLevel = {};
  }

  // 钻石祈福
  async blessByGem(player, message) {
    const key = 'game/blessByGem';
    const list = await LuckyBless.find().sort({orderIndex: 1});
    let bless;
    let blessIndex;
    for (let i = 0; i < list.length; i++) {
      if (list[i]._id.toString() === message._id) {
        bless = list[i];
        blessIndex = i;
        break;
      }
    }
    if (!bless) {
      console.error(`no such bless ${message._id}`);
      return this.replyFail(player, key, '祈福失败')
    }
    // 更新祈福时长
    const lastBless = await service.playerService.getPlayerAttrValueByShortId(player.model.shortId,
      playerAttributes.blessEndAt, message._id);
    const index = bless.times.indexOf(message.times);
    if (index === -1) {
      console.error(`no such times ${message.times}`);
      return this.replyFail(player, key, '祈福失败')
    }
    let needGem = 0;
    if (lastBless) {
      // 不是第一次，要扣钻石
      needGem = bless.gem[index]
    }
    if (needGem > 0) {
      const result = await service.playerService.logAndConsumeGem(player.model._id, ConsumeLogType.bless,
        needGem, '祈福扣钻石')
      if (!result.isOk) {
        return this.replyFail(player, key, '祈福失败')
      }
      player.model = result.model;
    }
    await service.playerService.createOrUpdatePlayerAttr(player.model._id, player.model.shortId,
      playerAttributes.blessEndAt, Math.floor(Date.now() / 1000), message._id)
    const model = await service.qian.saveBlessLevel(player.model.shortId, this._id, index + 1);
    this.blessLevel[player.model.shortId] = model.blessLevel;
    this.replySuccess(player, key, { index: blessIndex, blessLevel: model.blessLevel });
    this.updateResource2Client(player);
    // 通知祈福等级更新
    this.broadcast('game/updateBlessLevel', {index: this.indexOf(player), blessLevel: model.blessLevel })
  }

  replyFail(player, key, info) {
    player.sendMessage(key + 'Reply', {ok: false, info})
  }

  replySuccess(player, key, data) {
    player.sendMessage(key + 'Reply', {ok: true, data})
  }

  // 转发，通知客户端
  updateResource2Client(player) {
    player.sendMessage('resource/update', {ok: true, data: {gold: player.model.gold, diamond: player.model.diamond, tlGold: player.model.tlGold}})
  }

  async payRubyForStart() {
    return;
  }
}

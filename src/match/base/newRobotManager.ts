import {RobotStep} from "@fm/common/constants";
import * as config from '../../config'
import {RobotMangerModel} from '../../database/models/robotManager';
import {service} from "../../service/importService";
import { RobotRmqProxy } from "./robotRmqProxy";

// 机器人出牌
export class NewRobotManager {
  room: any
  disconnectPlayers: { [key: string]: RobotRmqProxy }
  // 等待间隔
  waitInterval: {}
  // 没有金豆
  noRubyInterval: {}
  // 托管局数
  depositCount: number
  model: any
  watchTimer: any
  isWatching: boolean
  waitPublicRobot: number
  isPlayed: boolean
  selectModeTimes: number
  constructor(room, depositCount) {
    // 房间管理器
    this.room = room;
    this.disconnectPlayers = {};
    this.noRubyInterval = {};
    this.depositCount = depositCount || 0;
    this.waitInterval = {};
    this.isWatching = false;
    this.waitPublicRobot = 0;
    this.isPlayed = true;
    this.selectModeTimes = 0;
    this.startMonit();
  }

  async init() {
    const m = await RobotMangerModel.findOne({ roomId: this.room._id });
    if (m) {
      this.model = m;
      if (!m.depositPlayer) {
        m.depositPlayer = {};
      }
      if (!m.offlineTimes) {
        m.offlineTimes = {};
      }
      if (!m.publicRoomRobot) {
        m.publicRoomRobot = [];
      }
    } else {
      this.model = await RobotMangerModel.create({
        roomId: this.room._id,
        depositCount: this.depositCount || 0,
        depositPlayer: {},
        offlineTimes: {},
        publicRoomRobot: [],
        step: RobotStep.start,
      });
    }
  }

  // 还原机器人
  async beforeMonit() {
    // 还原
    for (const disconnect of [...this.room.disconnected, ...this.model.publicRoomRobot]) {
      const playerId = disconnect[0]
      const posIndex = disconnect[1];
      await this.addRobot(playerId, posIndex)
    }
    return;
  }

  // 每秒开始监控
  startMonit() {
    console.log('monit start ', this.room._id);
    this.watchTimer = setInterval(async () => {
      if (this.isWatching) {
        // 上次还没处理完
        return;
      }
      this.isWatching = true;
      if (!this.model) {
        // 初始化
        await this.init();
        await this.beforeMonit();
        // 添加房间数
        if (this.room.isPublic) {
          await service.roomRegister.incPublicRoomCount(this.room.gameRule.gameType, this.room.gameRule.categoryId);
        }
      }
      await this.onMonit();
      this.isWatching = false;
    }, 1000);
  }

  async onMonit() {
    if (this.room.gameRule.isPublic) {
      return this.publicRoomMonit();
    } else {
      return this.normalRoomMonit();
    }
  }

  // 金豆房
  async publicRoomMonit() {
    let isOk;
    // 更新金豆房离线时间
    await this.updatePublicRobotTime();
    // 更新离线时间
    await this.updateOfflineTime();
    // 更新出牌时间
    await this.updateWaitPlayTime();
    // 添加离线机器人
    // await this.addOfflineRobot();
    // 添加公共房机器人
    await this.addRobotForPublicRoom();

    // 查看金豆
    if (this.model.step === RobotStep.waitRuby) {
      return ;
    }

    isOk = await this.isNoPlayerAbsent();
    if (!isOk) {
      // 人没到齐
      // console.log('some one absent %s', this.room._id);
      if (!this.room.gameState) {
        await this.room.forceDissolve();
      }
      return;
    }

    // 检查是不是全是机器人
    isOk = await this.dissolvePublicRoom();
    if (isOk) {
      return;
    }

    await this.readyAndPlay();
  }

  // 房卡房
  async normalRoomMonit() {
    let isOk;
    await this.updateOfflineTime();
    await this.updateWaitPlayTime();
    // await this.addOfflineRobot();
    isOk = await this.isNoPlayerAbsent();
    if (!isOk) {
      // 人没到齐
      // console.log('some one absent', this.room._id);
      return;
    }
    isOk = this.isNeedDeposit();
    if (!isOk) {
      // console.log(' room %s not player need deposit', this.room._id);
      // 不需要托管
      return;
    }
    await this.readyAndPlay();
  }

  // 默认出牌间隔 5s
  getWaitSecond() {
    if (this.room.gameRule.isPublic) {
      return Math.floor(Math.random() * 3 + 1);
    }
    return config.game.waitDelayTime;
  }

  // 创建机器人代理
  async createProxy(playerId) {
    const model = await service.playerService.getPlayerPlainModel(playerId);
    return new RobotRmqProxy(model, this.room.gameRule.gameType)
  }

  // 更新离线时间
  async updateOfflineTime() {
    let playerId;
    for (const offline of this.room.disconnected) {
      playerId = offline[0];
      const isOnline = this.isProxyOnline(playerId);
      if (isOnline) {
        continue;
      }
      // 掉线时间加1
      if (!this.model.offlineTimes[playerId]) {
        this.model.offlineTimes[playerId] = 1;
      } else {
        this.model.offlineTimes[playerId]++;
      }
      await this.save();
    }
  }

  // 更新金豆房离线时间
  async updatePublicRobotTime() {
    // 检查是否要加机器人
    const someOneExit = this.room.players.filter(x => !x);
    if (someOneExit.length === 0) {
      // 不需要加机器人
      return;
    }
    this.waitPublicRobot++;
  }

  // 添加机器人
  async addRobot(playerId, posIndex) {
    // 替换 rmq proxy
    const robotProxy = await this.createProxy(playerId)
    robotProxy.seatIndex = posIndex;
    robotProxy.room = this.room;
    this.room.players[posIndex] = robotProxy;
    // 替换 playerState
    // if (this.room.gameState) {
    //   // 游戏已经开始了
    //   const oldPlayerState = this.room.gameState.players[posIndex];
    //   await oldPlayerState.reconnect(robotProxy);
    // }
    if (!this.model.depositPlayer[playerId]) {
      // 第一次离线
      this.model.depositPlayer[playerId] = this.depositCount;
      await this.save();
    }
    this.disconnectPlayers[playerId] = robotProxy;
    // console.warn("add robot index-%s shortId-%s gameState-%s disconnectPlayers-%s", posIndex, robotProxy.model.shortId, this.room.gameState, JSON.stringify(this.disconnectPlayers));
  }

  // 是否需要托管
  isNeedDeposit() {
    // 第一局没开始，不托管
    if (this.room.game.juIndex === 0) {
      return false;
    }
    const values = Object.values(this.model.depositPlayer);
    for (const value of values) {
      if (value > 0) {
        // 还有人有离线托管机会
        return true;
      }
    }
    return false;
  }

  // 不再需要机器人
  disableRobot(playerId) {
    delete this.disconnectPlayers[playerId];
    if (this.model && this.model.offlineTimes) {
      delete this.model.offlineTimes[playerId];
    }
  }

  // 记录托管次数
  async decreaseDepositTimes() {
    // 每个人的托管次数+1
    for (const key of Object.keys(this.model.depositPlayer)) {
      this.model.depositPlayer[key]--;
    }

    await this.save();
  }

  // 更新玩家位置
  async updatePlayerOrder() {
    for (const key of Object.keys(this.disconnectPlayers)) {
      const index = this.room.players.findIndex(value => value && value._id.toString() === key.toString());
      if (index === -1) {
        console.log('no such player to order', key, 'room id', this.room._id)
        delete this.disconnectPlayers[key];
      } else {
        const proxy = this.disconnectPlayers[key];
        proxy.seatIndex = index;
      }
      // 更新京豆房中机器人的位置
      for (const robot of this.model.publicRoomRobot) {
        if (robot[0] === key) {
          robot[1] = index;
          break;
        }
      }
      // 更新 disconnected 中的位置
      for (const offline of this.room.disconnected) {
        if (offline[0] === key) {
          offline[1] = index;
          break;
        }
      }
    }
    await this.save();
  }

  // 游戏结束
  async gameOver() {
    clearInterval(this.watchTimer);
    if (this.disconnectPlayers) {
      console.log('destroy robot', this.room._id);

      // 扣除房间数
      this.disconnectPlayers = null;
      await service.roomRegister.decrPublicRoomCount(this.room.gameRule.gameType, this.room.gameRule.categoryId);
    }
    // 删除 mongo
    // if (this.model) {
    //   await this.model.remove();
    // }
  }

  // 玩家是否到齐
  async isNoPlayerAbsent() {
    const count = this.room.players.filter(x => x).length;
    return count === this.room.gameRule.playerCount;
  }

  // 代理用户是否在线
  isProxyOnline(playerId) {
    return this.room.players.filter(x => x && x.model && x.model._id === playerId).length > 0;
  }

  isHumanPlayerOffline(proxy) {
    const isOffline = this.room.disconnected.filter(value => value[0] === proxy.model._id).length > 0;
    if (isOffline) {
      return true;
    }
    // 检查是否是机器人
    return proxy.isRobot();
  }

  async save() {
    if (this.model) {
      // 告知 mongoose 保存
      this.model.markModified('depositPlayer');
      this.model.markModified('offlineTimes');
      this.model.markModified('publicRoomRobot');
      await this.model.save();
    }
  }

  async isHumanPlayerReady() {
    let index;
    let isOffline;
    for (const proxy of this.room.players) {
      if (!proxy) {
        continue;
      }
      isOffline = this.isHumanPlayerOffline(proxy);
      if (!isOffline) {
        // 在线用户且非机器人
        index = this.room.readyPlayers.findIndex((p: any) => p.toString() === proxy.model._id.toString());
        if (index === -1) {
          // 有在线用户没点下一局
          // console.log(`human player ${proxy.model.shortId} not ready in room ${this.room._id}`);
          return false;
        }
      }
    }
    return true;
  }

  // 机器人准备
  async robotPlayerReady() {
    if (this.room.gameState || this.room.readyPlayers.length === this.room.capacity) {
      // 不需要准备
      return true;
    }
    let index;
    let flag = true;
    for (const proxy of Object.values(this.disconnectPlayers)) {
      index = this.room.readyPlayers.indexOf(proxy.model._id.toString());
      if (index === -1) {
        this.room.ready(proxy);
        flag = false;
        break;
      }
    }
    return flag;
  }

  // 添加离线机器人
  async addOfflineRobot() {
    for (let i = 0; i < this.room.players.length; i++) {
      const playerId = await this.getOfflinePlayerByIndex(i)
      if (playerId !== "") {
        // console.warn("playerId-%s offlineTimes-%s offlineDelayTime-%s", playerId, this.model.offlineTimes[playerId], config.game.offlineDelayTime);
        // 有人离线
        if (this.model.offlineTimes[playerId] > config.game.offlineDelayTime) {
          // 离线时间超过 5s
          await this.addRobot(playerId, i);
          this.model.offlineTimes[playerId] = 0;
          await this.save();
          // 保存到redis中
          await service.roomRegister.saveRoomInfoToRedis(this.room);
        }
      }
    }
  }

  async addRobotForPublicRoom() {
    if (this.waitPublicRobot < config.game.waitRubyPlayer || this.room.gameState) {
      // 时间未到，或者已经有机器人
      return;
    }

    for (let i = 1; i < this.room.players.length; i++) {
      const playerId = await this.getOfflinePlayerByIndex(i)
      if (playerId !== "" || this.room.players[i] ) {
        continue;
      }

      const model = await service.playerService.getRobot(this.room.gameRule.categoryId, this.room._id, this.room.game.rule.currency);
      const robotProxy = await this.createProxy(model._id.toString());
      robotProxy.seatIndex = i;
      robotProxy.isPublicRobot = true;
      // 加入房间
      const isOk = await this.room.join(robotProxy);
      if (isOk) {
        // console.warn("add robot index-%s shortId-%s", i, model.shortId);
        // 公共房托管的机器人
        this.model.publicRoomRobot.push([model._id, i]);
        await this.addPublicRobot(model._id, robotProxy, i);
        // 添加离线时间
        this.model.offlineTimes[model._id] = config.game.offlineDelayTime;
      }
    }
    // 保存房间信息
    await service.roomRegister.saveRoomInfoToRedis(this.room);
  }

  async addPublicRobot(playerId, robotProxy, posIndex) {
    if (!this.model.depositPlayer[playerId]) {
      // 第一次离线
      this.model.depositPlayer[playerId] = this.depositCount;
      await this.save();
    }

    if (this.room.gameState) {
      // 游戏已经开始了
      const oldPlayerState = this.room.gameState.players[posIndex];
      await oldPlayerState.reconnect(robotProxy);
    }

    if (this.disconnectPlayers) {
      this.disconnectPlayers[playerId] = robotProxy;
    }
  }

  async dissolvePublicRoom() {
    // 金豆房,所有人都是机器人的时候解散
    // let isDissolve = true;
    let isAllRobot = true;
    // 防止处理时，位置被调换
    const oldPlayers = this.room.players.slice();
    for (let i = 0; i < oldPlayers.length; i++) {
      if (!oldPlayers[i]) {
        // 人没到齐
        isAllRobot = false
        break
      }
      if (!oldPlayers[i].isRobot()) {
        // 不全是机器人
        isAllRobot = false
      }
    }
    if (isAllRobot && !this.room.gameState) {
      console.log('dissolve room by robotManager', this.room._id);
      // 所有人都是机器人，解散房间
      await this.room.forceDissolve();
      return true;
    }
    return false;
  }

  // 检查金豆情况
  async updateNoRuby() {
    let waitRuby = false;
    for (let i = 0; i < this.room.gameState.players.length; i++) {
      const p = this.room.gameState.players[i];
      if (!p || p.isBroke || !this.room.gameState) {
        continue;
      }
      const resp = await service.gameConfig.rubyRequired(
        p.model._id.toString(),
        this.room.gameRule.categoryId);
      if (resp.isResurrection) {
        if (!this.noRubyInterval[p.model._id.toString()]) {
          this.noRubyInterval[p.model._id.toString()] = 0;
        }
        this.noRubyInterval[p.model._id.toString()]++;
        // 等待 30s 充值时间
        if (this.noRubyInterval[p.model._id.toString()] > config.game.waitForRuby) {
          // 30s 过了，金豆还是不够，用户破产
          console.warn("index-%s is already broke", i);
          // p.emitter.emit(Enums.broke);
        } else {
          waitRuby = true;
        }
      } else {
        // 删除等待时间
        delete this.noRubyInterval[p.model._id.toString()];
      }

      this.waitInterval[p._id] = 0;
    }


    return waitRuby;
  }

  // 更新出牌时间
  async updateWaitPlayTime() {
    if (!this.room.gameState) {
      return;
    }
    const keys = Object.keys(this.disconnectPlayers);
    let proxy;
    for (const key of keys) {
      proxy = this.disconnectPlayers[key];
      if (proxy.seatIndex === this.room.gameState.currentPlayerStep) {
        if (this.waitInterval[key]) {
          this.waitInterval[key]++;
        } else {
          this.waitInterval[key] = 1;
        }
      }
    }
  }

  async nextRound() {
    // 更新位置
    if (this.model.step !== RobotStep.running) {
      return;
    }
    await this.updatePlayerOrder();
    await this.decreaseDepositTimes();
    if (this.room.isPublic) {
      // 金豆房，要检查金豆
      this.model.step = RobotStep.waitRuby;
    } else {
      this.model.step = RobotStep.start;
    }
    await this.save();
    console.log('next round', this.room._id)
  }

  async readyAndPlay() {
    let isOk;
    if (this.model.step === RobotStep.start) {
      // 离线用户准备
      const flag = await this.robotPlayerReady();
      isOk = await this.isHumanPlayerReady();
      if (!isOk) {
        // console.log(`human player not ready`, this.room._id);
        return;
      }
      if ((flag && this.room.isPublic) || !this.room.isPublic) {
        this.model.step = RobotStep.running;
      }
      await this.save();
    }

    if (this.model.step === RobotStep.waitOherDa) {
      return;
    }

    if (this.model.step === RobotStep.running && this.isPlayed) {
      this.isPlayed = false;
      await this.playCard();

      this.isPlayed = true;
    }
  }

  // 出牌
  async playCard() {
    if (!this.room.gameState || !this.isPlayed) {
      return;
    }
    this.isPlayed = false;
    const keys = Object.keys(this.disconnectPlayers);
    let proxy;
    let playerId;
    for (const key of keys) {
      proxy = this.disconnectPlayers[key];
      playerId = proxy.model._id;
      const seatIndex = await this.getPlayerIndexByPlayerId(playerId)
      if (seatIndex === this.room.gameState.currentPlayerStep) {
        if (this.waitInterval[key] >= this.getWaitSecond()) {
          this.waitInterval[key] = 0;
          await proxy.playCard();
          console.log(playerId, 'play card', this.room._id)
        }
        break;
      }
    }

    this.isPlayed = true;
  }

  // 有位置离线
  async getOfflinePlayerByIndex(index) {
    for (const item of this.room.disconnected) {
      if (item[1] === index) {
        // 这个位置有人了
        return item[0]
      }
    }
    return ""
  }

  async getPlayerIndexByPlayerId(playerId) {
    for (let i = 0; i < this.room.players.length; i++) {
      if (this.room.players[i] && this.room.players[i].model._id === playerId) {
        return i
      }
    }
    console.error("no seatIndex found", playerId, this.room._id)
    return -1
  }
}

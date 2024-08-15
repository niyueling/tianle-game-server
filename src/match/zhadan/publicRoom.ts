import {GameType, TianleErrorCode} from "@fm/common/constants";
import {Errors, getCodeByError} from "@fm/common/errors";
import {Channel} from "amqplib";
// @ts-ignore
import {pick} from "lodash";
import {service} from "../../service/importService";
import {getPlayerRmqProxy, PlayerRmqProxy} from "../PlayerRmqProxy";
import {autoSerializePropertyKeys} from "../serializeDecorator";
import NormalTable from "./normalTable";
import Room from "./room";

// 金豆房
export class PublicRoom extends Room {

  constructor(rule) {
    super(rule);
    this.isPublic = true;
  }

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<Room> {
    const room = new PublicRoom(json.gameRule)
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
    // contest模式房间recover报错  待测
    const creatorModel = await service.playerService.getPlayerPlainModel(room.creator)
    if (creatorModel)
      room.creator = new PlayerRmqProxy(creatorModel, repository.channel, GameType.zd)
    else {
      room.creator = {model: {_id: 'tournament'}}
    }
    if (json.gameState) {
      room.gameState = new NormalTable(room, room.rule, room.game.juShu)
      room.gameState.resume(json)
    }

    if (room.roomState === 'dissolve') {
      const delayTime = room.dissolveTime + 180 * 1000 - Date.now();
      room.dissolveTimeout = setTimeout(async () => {
        await room.forceDissolve()
      }, delayTime)
    }
    await room.init();
    return room
  }

  async shuffleDataApply(payload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(payload);
    }
  }

  // 有人离开房间，牌局已开始，不让离开
  leave(player): boolean {
    if (!player) return true
    if (this.gameState && this.gameState.state !== 'gameOver') {
      // 游戏已经开始，不让退出
      console.debug('game start');
      return false;
    }
    this.removePlayer(player)
    this.removeOrder(player)
    player.room = null
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: player._id, roomId: this._id}})
    this.cancelReady(player._id)
    this.emit('leave', {_id: player._id})
    return true;
  }

  // 更新 ruby
  async addScore(playerId, v) {
    const findPlayer = this.players.find(player => {
      return player && player.model._id === playerId
    })
    // 添加倍率
    let conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.gameRule.categoryId);
    if (!conf) {
      console.error('game config lost', this.gameRule.categoryId);
      conf = {
        roomRate: 10000,
        minAmount: 10000,
      }
    }
    // 保存金豆输赢情况
    let restoreRuby = v
    if (!conf.isOpenDouble) {
      // 不让翻
      restoreRuby = 0
    }
    await service.playerService.updateRoomRuby(this._id.toString(), findPlayer.model._id, findPlayer.model.shortId,
      restoreRuby)
    const model = await this.updatePlayer(playerId, v);
    if (findPlayer.isRobot()) {
      // 机器人,自动加金豆
      if (model.ruby < conf.minAmount) {
        // 金豆不足，添加金豆
        const rand = service.utils.randomIntBetweenNumber(2, 3) / 10;
        const max = conf.minAmount + Math.floor(rand * (conf.maxAmount - conf.minAmount));
        model.ruby = service.utils.randomIntBetweenNumber(conf.minAmount, max);
        await model.save();
      }
      return;
    }
    findPlayer.model = await service.playerService.getPlayerPlainModel(playerId);
    findPlayer.sendMessage('resource/update', {ok: true, data: pick(findPlayer.model, ['gold', 'diamond', 'tlGold'])})
  }

  // 更新 player model
  async updatePlayer(playerId, addRuby = 0, addGem = 0) {
    const model = await service.playerService.getPlayerModel(playerId);
    if (!model) {
      console.error('player not exists');
      return;
    }
    // 添加金豆
    if (model.ruby + addRuby <= 0) {
      model.ruby = 0;
    } else {
      model.ruby += addRuby;
    }
    // 添加房卡
    if (model.gem + addGem <= 0) {
      model.gem = 0;
    } else {
      model.gem += addGem;
    }
    await model.save();
    return model;
  }
  async joinMessageFor(newJoinPlayer): Promise<any> {
    const message = await super.joinMessageFor(newJoinPlayer);
    // const lastRecord = await service.rubyReward.getLastRubyRecord(this.uid);
    // if (lastRecord) {
    //   // 奖池
    //   message.roomRubyReward = lastRecord.balance;
    //   message.mvpTimes = lastRecord.mvpTimes[newJoinPlayer.model.shortId] || 0;
    // } else {
    //   message.roomRubyReward = 0;
    //   message.mvpTimes = 0;
    // }
    message.roomRubyReward = 0;
    message.mvpTimes = 0;
    return message;
  }

  // 检查房间是否升级
  async nextGame(thePlayer) {
    if (!this.robotManager && thePlayer) {
      return thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.roomIsFinish})
    }
    // 检查金豆
    const resp = await service.gameConfig.rubyRequired(thePlayer.model._id, this.gameRule.categoryId);
    if (resp.isNeedRuby) {
      return thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.goldInsufficient})
    }
    return super.nextGame(thePlayer);
  }

  // 每局开始扣除进房金豆
  async payRubyForStart() {
    let conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.gameRule.categoryId);
    if (!conf) {
      console.error('game config lost', this.gameRule.categoryId);
      conf = {
        roomRate: 10000,
        minAmount: 10000,
      }
    }
    for (const p of this.players) {
      if (p) {
        p.model = await this.updatePlayer(p.model._id, -conf.roomRate);
        // 通知客户端更新金豆
        await this.updateResource2Client(p)
      }
    }
  }

  async reconnect(reconnectPlayer) {
    // 检查最少金豆是否够
    const resp = await service.gameConfig.rubyRequired(
      reconnectPlayer.model._id,
      this.gameRule.categoryId);
    if (resp.isNeedRuby) {
      // 等待金豆补充，退出房间
      this.leave(reconnectPlayer);
      return;
    }
    return super.reconnect(reconnectPlayer);
  }
}

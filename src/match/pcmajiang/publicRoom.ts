import {GameType, TianleErrorCode} from "@fm/common/constants";
import {Errors, getCodeByError} from "@fm/common/errors";
import {Channel} from "amqplib";
// @ts-ignore
import {pick} from "lodash";
import {service} from "../../service/importService";
import {getPlayerRmqProxy} from "../PlayerRmqProxy";
import {autoSerializePropertyKeys} from "../serializeDecorator";
import Room from "./room";
import TableState, {stateGameOver} from "./table_state";

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
        const playerRmq = await getPlayerRmqProxy(playerId, repository.channel, GameType.pcmj);
        playerRmq.room = room;
        if (json.players[index]) {
          room.players[index] = playerRmq
        }
        room.playersOrder[index] = playerRmq;
      }
    }

    for (const [index, playerId] of json.snapshot.entries()) {
      room.snapshot[index] = await getPlayerRmqProxy(playerId, repository.channel, GameType.pcmj);
    }

    if (room.clubMode) {
      room.clubOwner = await getPlayerRmqProxy(room.clubOwner, repository.channel, GameType.pcmj);
    }
    room.creator = await getPlayerRmqProxy(room.creator, repository.channel, GameType.pcmj);
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

  leave(player) {
    if (this.gameState && this.gameState.state !== stateGameOver || !player) {
      // 游戏已开始 or 玩家不存在
      console.debug('game start', this.gameState.state);
      return false
    }
    if (this.indexOf(player) < 0) {
      return true
    }
    player.removeListener('disconnect', this.disconnectCallback)
    this.removePlayer(player)
    this.removeOrder(player);
    this.removeReadyPlayer(player.model._id)
    player.room = null
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: player._id.toString(), roomId: this._id, location: "pcmj.publicRoom"}})
    this.clearScore(player.model._id)

    return true
  }

  // 更新 ruby
  async addScore(playerId, v) {
    const findPlayer = this.players.find(player => {
      return player && player.model._id.toString() === playerId.toString()
    })
    // 添加倍率
    let conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.gameRule.categoryId);
    if (!conf) {
      console.error('game config lost', this.gameRule.categoryId);
      return ;
    }
    // await service.playerService.updateRoomRuby(this._id.toString(), findPlayer.model._id, findPlayer.model.shortId,
    //   v)
    const model = await this.updatePlayer(playerId, v);
    if (findPlayer.isPublicRobot) {
      // 金豆机器人,自动加金豆
      if (model.gold < conf.minAmount) {
        // 金豆不足，添加金豆
        const rand = service.utils.randomIntBetweenNumber(2, 3) / 10;
        const max = conf.minAmount + Math.floor(rand * (conf.maxAmount - conf.minAmount));
        model.gold = service.utils.randomIntBetweenNumber(conf.minAmount, max);
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
    if (model.gold + addRuby <= 0) {
      model.gold = 0;
    } else {
      model.gold += addRuby;
    }
    // 添加房卡
    if (model.diamond + addGem <= 0) {
      model.diamond = 0;
    } else {
      model.diamond += addGem;
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
    // 更新 model
    message.model = await service.playerService.getPlayerPlainModel(newJoinPlayer.model._id);
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

  async shuffleDataApply(payload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(payload);
    }
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

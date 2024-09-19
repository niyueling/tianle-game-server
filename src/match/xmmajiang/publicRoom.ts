import {GameType, TianleErrorCode} from "@fm/common/constants";
import {Channel} from "amqplib";
// @ts-ignore
import {pick} from "lodash";
import {service} from "../../service/importService";
import {getPlayerRmqProxy} from "../PlayerRmqProxy";
import {autoSerializePropertyKeys} from "../serializeDecorator";
import Room from "./room";
import TableState, {stateGameOver} from "./table_state";
import Enums from "./enums";

// 金豆房
export class PublicRoom extends Room {

  constructor(rule, roomNum) {
    super(rule, roomNum);
    this.isPublic = true;
  }

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<Room> {
    const room = new PublicRoom(json.gameRule, json._id)
    // 还原 uid
    room.uid = json.uid;
    const gameAutoKeys = autoSerializePropertyKeys(room.game)
    Object.assign(room.game, pick(json.game, gameAutoKeys))
    const keys = autoSerializePropertyKeys(room)
    Object.assign(room, pick(json, keys))

    for (const [index, playerId] of json.playersOrder.entries()) {
      if (playerId) {
        const playerRmq = await getPlayerRmqProxy(playerId, repository.channel, GameType.mj);
        playerRmq.room = room;
        if (json.players[index]) {
          room.players[index] = playerRmq
        }
        room.playersOrder[index] = playerRmq;
      }
    }

    for (const [index, playerId] of json.snapshot.entries()) {
      room.snapshot[index] = await getPlayerRmqProxy(playerId, repository.channel, GameType.mj);
    }

    if (room.clubMode) {
      room.clubOwner = await getPlayerRmqProxy(room.clubOwner, repository.channel, GameType.mj);
    }
    room.creator = await getPlayerRmqProxy(room.creator, repository.channel, GameType.mj);
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
      // console.debug('game start', this.gameState.state);
      return false
    }
    if (this.indexOf(player) < 0) {
      return true
    }
    player.removeListener('disconnect', this.disconnectCallback)
    this.removePlayer(player)
    this.removeOrder(player);
    player.room = null
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: player.model._id, location: "xmmj.publicRoom"}})
    this.removeReadyPlayer(player.model._id)
    this.clearScore(player.model._id)

    return true
  }

  async shuffleDataApply(payload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(payload);
    }
  }

  // 更新 ruby
  async addScore(playerId, v) {
    const findPlayer = this.players.find(player => {
      return player && player.model._id.toString() === playerId.toString()
    })
    await this.updatePlayer(playerId, v);
    findPlayer.model = await service.playerService.getPlayerPlainModel(playerId);
    findPlayer.sendMessage('resource/update', {ok: true, data: pick(findPlayer.model, ['gold', 'diamond', 'tlGold'])})
  }

  // 根据币种类型获取币种余额
  async PlayerGoldCurrency(playerId) {
    const model = await service.playerService.getPlayerModel(playerId);

    if (this.game.rule.currency === Enums.goldCurrency) {
      return model.gold;
    }

    return model.tlGold;
  }

  // 根据币种类型设置币种余额
  async setPlayerGoldCurrency(playerId, currency) {
    const model = await service.playerService.getPlayerModel(playerId);

    if (this.game.rule.currency === Enums.goldCurrency) {
      model.gold = currency;
    } else {
      model.tlGold = currency;
    }

    await model.save();
  }

  // 更新 player model
  async updatePlayer(playerId, addRuby = 0) {
    // 添加金豆
    const currency = await this.PlayerGoldCurrency(playerId);
    if (currency + addRuby <= 0) {
      await this.setPlayerGoldCurrency(playerId, 0);
    } else {
      await this.setPlayerGoldCurrency(playerId, currency + addRuby);
    }
    return await service.playerService.getPlayerModel(playerId);
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
        await this.updateResource2Client(p);
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

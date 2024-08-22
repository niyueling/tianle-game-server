import {ConsumeLogType, GameType, TianleErrorCode} from "@fm/common/constants";
import {Channel} from "amqplib";
// @ts-ignore
import {pick} from "lodash";
import {service} from "../../service/importService";
import {getPlayerRmqProxy} from "../PlayerRmqProxy";
import {autoSerializePropertyKeys} from "../serializeDecorator";
import Room from "./room";
import NormalTable from "./normalTable"
import {GameTypes} from "../gameTypes";
import Enums from "./enums";

const gameType: GameTypes = GameType.ddz

// 金豆房
export class PublicRoom extends Room {

  constructor(rule, roomNum) {
    super(rule, roomNum);
    this.isPublic = true;
  }

  static async recover(json: any, repository: { channel: Channel, userCenter: any }): Promise<Room> {

    const room = new PublicRoom(json.gameRule, json._id);
    room.uid = json.uid;
    const gameAutoKeys = autoSerializePropertyKeys(room.game);
    Object.assign(room.game, pick(json.game, gameAutoKeys));

    const keys = autoSerializePropertyKeys(room);
    Object.assign(room, pick(json, keys));

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

    room.creator = await getPlayerRmqProxy(json.creator, repository.channel, gameType);

    if (json.gameState) {
      room.gameState = new NormalTable(room, room.rule, room.game.juShu);
      room.gameState.resume(json);
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

    return room;
  }

  leave(player) {
    if (!player) {
      // 玩家不存在
      return false;
    }
    if (this.indexOf(player) < 0) {
      return true
    }
    player.removeListener('disconnect', this.disconnectCallback)
    this.removePlayer(player)
    this.removeReadyPlayer(player.model._id.toString())
    player.room = null
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: player.model._id.toString(), roomId: this._id, location: "ddz.publicRoom"}})
    this.clearScore(player.model._id.toString())

    return true
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

  async joinMessageFor(newJoinPlayer): Promise<any> {
    const message = await super.joinMessageFor(newJoinPlayer);
    message.roomRubyReward = 0;
    message.mvpTimes = 0;
    message.zhuangJia = newJoinPlayer.zhuang;
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

  async awaitInfo() {
    if (!this.allReady) {
      return ;
    }

    const players = [];
    this.playersOrder.forEach(player => {
      if (player) {
        players.push({
          gold: player.model.gold,
          diamond: player.model.diamond,
          nickname: player.model.nickname,
          avatar: player.model.avatar,
          shortId: player.model.shortId
        })
      }
    })

    this.broadcast('room/waitInfoReady', {
      ok: true,
      data: {
        players: players,
        roomNum: this._id,
        roomId: this.uid,
        gameType: this.gameRule.gameType
      }
    })
  }

  async shuffleDataApply(playload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(playload);
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
        await service.playerService.logGoldConsume(p._id, ConsumeLogType.payGameFee, -conf.roomRate,
          p.model.gold, `扣除房费`);
        // 通知客户端更新金豆
        this.updateResource2Client(p)
      }
    }
  }
  async reconnect(reconnectPlayer) {
    // 检查最少金豆是否够
    const resp = await service.gameConfig.rubyRequired(
      reconnectPlayer.model._id.toString(),
      this.gameRule.categoryId);
    if (resp.isNeedRuby) {
      // 等待金豆补充，退出房间
      this.forceDissolve();
      return ;
    }

    return super.reconnect(reconnectPlayer);
  }
}

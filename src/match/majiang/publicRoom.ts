import {ConsumeLogType, GameType, TianleErrorCode} from "@fm/common/constants";
import {Channel} from "amqplib";
// @ts-ignore
import {pick} from "lodash";
import {service} from "../../service/importService";
import {getPlayerRmqProxy} from "../PlayerRmqProxy";
import {autoSerializePropertyKeys} from "../serializeDecorator";
import Room from "./room";
import TableState from "./table_state";
import Enums from "./enums";

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
    // console.warn("publicRoom", this._id)
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
    this.broadcast('room/leaveReply', {ok: true, data: {playerId: player._id.toString(), roomId: this._id, location: "mj.publicRoom"}})
    this.clearScore(player.model._id.toString())

    return true
  }

  // 更新 ruby
  async addScore(playerId, v) {
    const findPlayer = this.players.find(player => {
      return player && player.model._id.toString() === playerId
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
    const model = await this.updatePlayer(playerId, v);
    if (findPlayer && findPlayer.isPublicRobot) {
      const currency = await this.PlayerGoldCurrency(playerId);
      // 金豆机器人,自动加金豆
      if (currency < conf.minAmount && !this.gameState) {
        // 金豆不足，添加金豆
        const rand = service.utils.randomIntBetweenNumber(2, 3) / 10;
        const max = conf.minAmount + Math.floor(rand * (conf.maxAmount - conf.minAmount));
        const gold = service.utils.randomIntBetweenNumber(conf.minAmount, max);
        await this.setPlayerGoldCurrency(playerId, gold);

        await service.playerService.logGoldConsume(model._id, ConsumeLogType.robotAutoAdd, await this.PlayerGoldCurrency(playerId),
          await this.PlayerGoldCurrency(playerId), `机器人自动加金豆`);
      }
      return;
    }

    if (findPlayer) {
      findPlayer.model = await service.playerService.getPlayerPlainModel(playerId);
      findPlayer.sendMessage('resource/update', {ok: true, data: {gold: findPlayer.model.gold, diamond: findPlayer.model.diamond, tlGold: findPlayer.model.tlGold}})
    }
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
    message.roomRubyReward = 0;
    message.mvpTimes = 0;
    message.zhuangJia = newJoinPlayer.zhuang;
    // 更新 model
    message.model = await service.playerService.getPlayerPlainModel(newJoinPlayer.model._id);
    message.model.score = newJoinPlayer.juScore;

    return message;
  }

  // 检查房间是否升级
  async nextGame(thePlayer) {
    if (!this.robotManager && thePlayer) {
      // console.warn("public room error start")
      return thePlayer.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.roomIsFinish})
    }
    // 检查金豆
    const resp = await service.gameConfig.rubyRequired(thePlayer.model._id, this.gameRule);
    if (resp.isNeedRuby) {
      return this.broadcast('room/joinReply', {ok: false, info: TianleErrorCode.goldInsufficient, data: {index: thePlayer.seatIndex}})
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
          tlGold: player.model.tlGold,
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

  async shuffleDataApply(payload) {
    if (this.allReady && !this.gameState) {
      return await this.startGame(payload);
    }
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
        const currency = await this.PlayerGoldCurrency(p._id);
        await service.playerService.logGoldConsume(p._id, ConsumeLogType.payGameFee, -conf.roomRate, currency, `扣除房费`);
        // 通知客户端更新金豆
        this.updateResource2Client(p)
      }
    }
  }
  async reconnect(reconnectPlayer) {
    // console.warn("public reconnect")
    // 检查最少金豆是否够
    const resp = await service.gameConfig.rubyRequired(
      reconnectPlayer.model._id.toString(),
      this.gameRule.categoryId);
    if (resp.isNeedRuby) {
      // 等待金豆补充，退出房间
      this.forceDissolve();
      return;
    }
    return super.reconnect(reconnectPlayer);
  }
}

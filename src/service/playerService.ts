import * as mongoose from 'mongoose';
import * as config from "../config";
import {getNewPlayerInviteCode, getNewShortPlayerId} from "../database/init";
import ConsumeRecord from "../database/models/consumeRecord";
import DiamondRecord from "../database/models/diamondRecord";
import PlayerModel from "../database/models/player";
import Player from "../database/models/player";
import PlayerAttr from "../database/models/playerAttr";
import PlayerRoomRuby from "../database/models/playerRoomRuby";
import BaseService from "./base";
import {service} from "./importService";
import GoldRecord from "../database/models/goldRecord";
import {ConsumeLogType} from "@fm/common/constants";
import UserRechargeOrder from "../database/models/userRechargeOrder";
import CombatGain from "../database/models/combatGain";

// 玩家信息
export default class PlayerService extends BaseService {
  async getPlayerPlainModel(playerId: string): Promise<any> {
    // 将 model 转换为 plain 对象
    return Player.findById(playerId).lean().exec();
  }

  async getPlayerModel(playerId: string): Promise<any> {
    return Player.findById(playerId);
  }

  async getPlayerModelByShortId(shortId: number): Promise<any> {
    return Player.findOne({ shortId });
  }

  // 根据用户名获取玩家
  async getPlayerByName(name) {
    return Player.find({ name });
  }

  async findOrCreatePlayerByName(name) {
    const players = await this.getPlayerByName(name);
    if (players.length < 1) {
      return this.createNewPlayer({ name });
    }
    return players[0];
  }

  // 创建用户
  async createNewPlayer(opt) {
    const shortId = await getNewShortPlayerId()
    return PlayerModel.create({
      unionid: null,
      openid: null,
      shortId,
      avatar: opt.avatar,
      nickname: opt.nickname,
      sessionKey: null,
      source: 0,
      robot: opt.robot
    })
  }

  // 获取机器人
  async getRobot(categoryId, roomId) {
    // 金豆
    const rubyRequired = await service.gameConfig.getPublicRoomCategoryByCategory(categoryId);
    if (!rubyRequired) {
      throw new Error('房间错误')
    }

    // 如果场次最高无限制，则最高携带金豆为门槛*10
    if (rubyRequired.maxAmount === -1) {
      rubyRequired.maxAmount = rubyRequired.minAmount * 3;
    }
    // 最高为随机下限的 20% - 30%
    const rand = service.utils.randomIntBetweenNumber(1000, 2000) / 100;
    const max = rubyRequired.minAmount + Math.floor(rand * (rubyRequired.maxAmount - rubyRequired.minAmount));
    const gold = service.utils.randomIntBetweenNumber(rubyRequired.minAmount, max);
    const result = await Player.aggregate([
      {$match: { robot: true, isGame: false }},
      {$sample: { size: 1}}
    ]);
    // console.warn("minAmount %s maxAmount %s rand %s max %s gold %s", rubyRequired.minAmount, rubyRequired.maxAmount, rand, max, gold);
    const randomPlayer = await this.getPlayerModel(result[0]._id);
    // 重新随机设置 ruby
    randomPlayer.gold = gold;
    randomPlayer.isGame = true;

    // 记录金豆日志
    await service.playerService.logGoldConsume(randomPlayer._id, ConsumeLogType.robotSetGold, gold,
      randomPlayer.gold, `机器人开局设置金豆:${roomId}`);

    await randomPlayer.save();
    return randomPlayer;
  }

  async logOldGemConsume(playerId, note, gem) {
    new ConsumeRecord({
      player: playerId,
      note,
      createAt: new Date(),
      gem,
    }).save();
  }

  // 记录房卡消耗
  async logGemConsume(playerId, type, amount, totalAmount, note) {
    await DiamondRecord.create({
      player: playerId,
      amount,
      residue: totalAmount,
      type,
      note,
      createAt: new Date(),
    })
  }

  // 记录金豆消耗
  async logGoldConsume(playerId, type, amount, totalAmount, note) {
    await GoldRecord.create({
      player: playerId,
      amount,
      residue: totalAmount,
      type,
      note,
      createAt: new Date(),
    })
  }

  // 扣除并记录房卡
  async logAndConsumeGem(playerId, type, amount, note) {
    const model = await this.getPlayerModel(playerId);
    if (model.gem < amount) {
      return { isOk: false };
    }
    model.gem -= amount;
    await model.save();
    await this.logGemConsume(model._id, type, -amount, model.gem, note);
    return { isOk: true, model };
  }

  // 获取玩家属性值
  async getPlayerAttrValueByShortId(shortId, attrType, name) {
    const record = await PlayerAttr.findOne({
      shortId,
      attrType,
      name,
    })
    if (record) {
      return record.value;
    }
    return null;
  }

  // 添加或更新用户属性
  async createOrUpdatePlayerAttr(playerId, shortId, attrType, attrValue, name) {
    let record = await PlayerAttr.findOne({
      shortId,
      attrType,
      name,
    })
    if (record) {
      record.value = attrValue;
      await record.save();
    } else {
      record = await PlayerAttr.create({
        playerId,
        shortId,
        attrType,
        name,
        value: attrValue,
      })
    }
    return record;
  }

  // 保留每局的金豆情况
  async updateRoomRuby(roomNum, playerId, shortId, ruby) {
    const record = await PlayerRoomRuby.findOne({
      playerId,
    })
    if (record) {
      record.roomNum = roomNum
      record.ruby = ruby
      await record.save()
      return record
    } else {
      return PlayerRoomRuby.create({
        playerId,
        playerShortId: shortId,
        ruby,
        roomNum,
      })
    }
  }

  // 获取上局金豆输赢情况
  async getLastRoomRuby(playerId, roomId) {
    return CombatGain.findOne({playerId, uid: roomId}).sort({time: -1});
  }

  // 玩家金豆救助次数
  async playerHelpRubyTimes(model) {
    if (model.lastRubyGiftAt) {
      if (model.lastRubyGiftAt.getTime() < service.times.startOfTodayDate().getTime()) {
        // 今天还没开始救助
        return config.game.rubyHelpTimes
      }
      // 今日剩余求助次数
      return config.game.rubyHelpTimes - model.rubyHelpTimes
    }
    return config.game.rubyHelpTimes
  }

  async todayRubyHelp(model, isDouble) {
    const times = await this.playerHelpRubyTimes(model)
    if (times > 0) {
      if (isDouble) {
        // 翻倍
        model.ruby += config.game.rubyHelpAmount
      }
      model.ruby += config.game.rubyHelpAmount
      model.rubyHelpTimes = config.game.rubyHelpTimes - (times - 1)
      model.lastRubyGiftAt = new Date()
      await model.save()
      return true
    }
    return false
  }

  async playerRecharge(orderId, thirdOrderNo) {
    const order = await UserRechargeOrder.findOne({_id: orderId});
    if (!order) {
      return false;
    }

    const user = await Player.findOne({_id: order.playerId});
    if (!user) {
      return false;
    }

    user.diamond += order.diamond;
    user.dominateCount = Math.floor(Math.random() * 5) + 1;
    await user.save();

    order.status = 1;
    order.transactionId = thirdOrderNo;
    await order.save();

    // 增加日志
    await this.logGemConsume(user._id, ConsumeLogType.chargeByWechat, order.diamond, user.diamond, "微信充值");

    return true;
  }
}

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
    const modelId = new mongoose.Types.ObjectId();
    return PlayerModel.create({
      _id: opt._id ? opt._id : modelId,
      name: opt.name ? opt.name : modelId,
      // 房卡
      gem: config.game.initModelGemCount,
      headImgUrl: opt.headImgUrl ? opt.headImgUrl : '',
      sex: opt.sex || 1,
      gold: opt._id ? config.game.initModelGoldCount : 0,
      ruby: opt.ruby || config.game.initModelRuby,
      platform: opt.platform || '',
      luckyDraw: {
        date: new Date().toLocaleDateString(),
        time: 1,
      },
      phone: opt.phoneNum || '',
      isTourist: !opt._id,
      openId: opt.openId || '',
      miniOpenid: opt.miniOpenid || '',
      appleId: opt.appleId || '',
      shortId: await getNewShortPlayerId(),
      inviteCode: await getNewPlayerInviteCode(),
    })
  }

  // 获取机器人
  async getRobot(categoryId) {
    // 金豆
    const rubyRequired = await service.gameConfig.getPublicRoomCategoryByCategory(categoryId);
    if (!rubyRequired) {
      throw new Error('房间错误')
    }
    // 最高为随机下限的 20% - 30%
    const rand = service.utils.randomIntBetweenNumber(2, 3) / 10;
    const max = rubyRequired.minAmount + Math.floor(rand * (rubyRequired.maxAmount - rubyRequired.minAmount));
    const ruby = service.utils.randomIntBetweenNumber(rubyRequired.minAmount, max);
    const result = await Player.aggregate([
      {$match: { platform: 'robot' }},
      {$sample: { size: 1}}
    ]);
    const randomPlayer = await this.getPlayerModel(result[0]._id);
    // 重新随机设置 ruby
    randomPlayer.ruby = ruby;
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
  async getLastRoomRuby(playerId) {
    return PlayerRoomRuby.findOne({
      playerId,
    })
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
}

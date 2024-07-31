import GameCategory from "../database/models/gameCategory";
import GoodsLive from "../database/models/goodsLive";
import BaseService from "./base";
import {service} from "./importService";
import Enums from "../match/majiang/enums";

export default class GameConfig extends BaseService {

  async getPublicRoomCategory(message) {
    const result = await GameCategory.find({
      category: 'gold',
      game: message.gameType,
      isOpen: true
    });

    // 获取游戏人数
    result.sort((a, b) => {
      return a.level - b.level
    });

    return result;
  }

  async getPublicRoomOpenDouble(categoryId) {
    const result = await GameCategory.findOne({
      category: 'gold',
      isOpen: true,
      _id: categoryId
    });

    return {open: result.isOpenDouble};
  }

  async getCategoryByGameType(items, categories, gameType) {
    const counter = await service.roomRegister.getPublicRoomCount(gameType);
    const list = [];
    let count;
    let categoryId;
    let row;
    for (const item of items) {
      if (item.gameType !== gameType) {
        continue;
      }
      categoryId = item._id.toString();
      row = {
        name: item.name,
        gameType: item.gameType,
        list: []
      }
      for (const r of categories) {
        if (r.gameCategory !== categoryId) {
          continue;
        }
        count = 0;
        if (counter[r._id]) {
          count = counter[r._id] * 4;
        }
        count += r.playerCount;
        row.list.push({
          _id: r._id,
          onlineAccount: count,
          minAmount: r.minAmount,
          maxAmount: r.maxAmount,
          minScore: r.minScore,
          level: r.level,
          title: r.title,
        })
      }
      if (row.list.length > 0) {
        list.push(row);
      }
    }
    return list;
  }

  // 根据等级获取金豆房配置
  async getPublicRoomCategoryByCategory(categoryId) {
    return GameCategory.findById(categoryId);
  }

  // 获取更高等级的场次
  async getUpperPublicRoomCategory(gameCategory, maxAmount) {
    return GameCategory.findOne({
      isOpen: true,
      maxAmount: {
        $gt: maxAmount,
      },
      category: 'gold',
      gameCategory,
    });
  }

  // 检查房间是否需要升级
  async rubyRequired(playerId, rule) {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(rule.categoryId);
    if (!conf) {
      // 配置错了，继续玩吧
      return {isUpgrade: false, isNeedRuby: false};
    }

    const model = await service.playerService.getPlayerModel(playerId);
    // 房间要升级
    const isUpgrade = conf.maxAmount !== -1 && (rule.currency === Enums.goldCurrency ? model.gold > conf.maxAmount : model.tlGold > conf.maxAmount);
    // 需要更金豆
    const isNeedRuby = rule.currency === Enums.goldCurrency ? model.gold < conf.minAmount : model.tlGold < conf.minAmount;
    // 是否复活成功
    const isResurrection = Enums.goldCurrency ? model.gold <= 0 : model.tlGold <= 0;

    return {isUpgrade, isNeedRuby, isResurrection, minAmount: conf.minAmount, conf}
  }

  // 复活礼包倍数
  async goodsLiveTimes(roomNum) {
    const roomInfo = await service.roomRegister.getRoomInfo(roomNum);
    if (roomInfo) {
      const goodsList = await GoodsLive.find().sort({ruby: 1});
      if (goodsList.length > 0) {
        const conf = await service.gameConfig.getPublicRoomCategoryByCategory(roomInfo.gameRule.categoryId);
        if (conf) {
          const times = Math.ceil(conf.minAmount / goodsList[0].ruby);
          if (times > 1) {
            return times;
          }
        }
      }
    }
    return 1;
  }
}

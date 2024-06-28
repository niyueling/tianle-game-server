import LuckyQian from "../database/models/luckyQian";
import PlayerBless from "../database/models/playerBless";
import PlayerQian from "../database/models/playerQian";
import BaseService from "./base";
import {service} from "./importService";
import {GlobalConfigKeys, playerAttributes, shopPropType} from "@fm/common/constants";
import LuckyBless from "../database/models/luckyBless";

// 求签
export default class QianService extends BaseService {

  // 祈福列表
  async blessList(player) {
    const list = await LuckyBless.find().sort({orderIndex: 1});
    const result = [];
    for (let j = 0; j < list.length; j++) {
      const item = list[j];
      const rows = [];
      for (let i = 0; i < item.times.length; i++) {
        rows.push({
          // 倍数
          times: item.times[i],
          // 钻石消耗
          gem: item.gem[i],
          // 运势
          bless: item.bless[i]
        })
      }
      let itemCount = await service.item.getItemCount(player._id, shopPropType.qiFuCard, list[j].orderIndex);
      let isFree = await service.playerService.getPlayerAttrValueByShortId(player.model.shortId, playerAttributes.blessEndAt, item._id);
      result.push({
        _id: item._id,
        name: item.name,
        // 是否免费
        isFree: !isFree,
        rows,
        index: j,
        // 道具数量
        itemCount,
      })
    }

    return result;
  }

  async qianList(player) {
    const resp = {
      // 今日签文
      record: null,
      // 求签钻石
      qianCost: 0,
      // 道具数量
      itemCount: 0,
    };
    const todayQian = await service.qian.getTodayQian(player.model.shortId);
    if (todayQian.record) {
      resp.record = todayQian.record;
      // 获取改签需要的钻石
      resp.qianCost = await service.utils.getGlobalConfigByName(GlobalConfigKeys.changeQianCostGem) || 200;
      resp.qianCost = parseInt(resp.qianCost.toString(), 10);
    } else {
      resp.record = null;
      if (todayQian.isFirst) {
        resp.qianCost = 0;
      } else {
        // 当天第一次抽签
        resp.qianCost = await service.utils.getGlobalConfigByName(GlobalConfigKeys.firstQianCostGem) || 100;
        resp.qianCost = parseInt(resp.qianCost.toString(), 10);
      }
    }
    resp.itemCount = await service.item.getItemCount(player._id, shopPropType.qiuqianCard);

    return resp;
  }
  // 求签
  async createQian(playerShortId) {
    // 随机选一签
    const randomQian = await LuckyQian.aggregate([
      {$sample: {size: 1}}
    ]);
    const pos = ['正东', '正北', '正西', '正南', '东北', '西北', '西南', '西南'];
    const seed = playerShortId + new Date().getTime();
    const index = service.utils.randomIntLessMax(pos.length, seed.toString());
    const record = randomQian[0];
    const saveQian = {
      qianId: record.qianId,
      // 签名
      name: record.name,
      // 财神位置
      position: pos[index],
      // 签文
      content: record.content,
      // 运势
      bless: record.bless,
      // 签语
      summary: record.summary,
      // 吉凶级别
      luckyLevel: record.luckyLevel,
    }
    const posList = record.position.split(',');
    // 从中随机选一个方位, 选中以后运势+1
    if (posList.includes(pos[index])) {
      saveQian.bless += 1;
    }
    return saveQian;
  }

  // 保存当天签文
  async saveQian(playerShortId, content) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // 当天 0 点
    const todaySeconds = Math.floor(startOfDay.getTime() / 1000);
    let model = await PlayerQian.findOne({ playerShortId });
    if (model) {
      model.content = content;
      model.timeStamp = todaySeconds;
      model.markModified('content');
      await model.save();
    } else {
      model = await PlayerQian.create({
        playerShortId,
        content,
        timeStamp: todaySeconds,
      })
    }
    return model;
  }

  // 获取今日签
  async getTodayQian(playerShortId) {
    const record = await PlayerQian.findOne({
      playerShortId
    });
    if (!record) {
      // 没有，一次都没抽
      return { record: null, isFirst: true };
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // 当天 0 点
    const todaySeconds = Math.floor(startOfDay.getTime() / 1000);
    if (record.timeStamp === todaySeconds) {
      return { record: record.content, isFirst: false }
    }
    // 今天还没抽签
    return { record: null, isFirst: false };
  }

  // 保存祈福等级
  async saveBlessLevel(playerShortId, roomNum, blessLevel) {
    const playerBless = await PlayerBless.findOne({
      playerShortId,
      roomNum,
    });
    if (!playerBless) {
      return PlayerBless.create({
        playerShortId,
        roomNum,
        blessLevel,
      })
    }
    if (playerBless.blessLevel < blessLevel) {
      playerBless.blessLevel = blessLevel;
    }
    await playerBless.save();
    return playerBless;
  }

  // 删除祈福等级
  async delBlessLevel(playerShortId, roomNum) {
    await PlayerBless.remove({
      playerShortId,
      roomNum,
    })
  }
}

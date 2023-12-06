import LuckyQian from "../database/models/luckyQian";
import PlayerBless from "../database/models/playerBless";
import PlayerQian from "../database/models/playerQian";
import BaseService from "./base";
import {service} from "./importService";

// 求签
export default class QianService extends BaseService {

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
      playerShortId,
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

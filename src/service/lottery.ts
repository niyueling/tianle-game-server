import {ConsumeLogType, LotterySource, RedisKey} from "@fm/common/constants";
import * as moment from "moment/moment";
import * as config from "../config"
import LotteryBox from "../database/models/lotteryBox";
import LotteryEntityRecord from "../database/models/lotteryEntityRecord";
import LotteryPrize from "../database/models/lotteryPrize";
import LotteryRecord from "../database/models/lotteryRecord";
import MailModel, {GiftState, MailState, MailType} from "../database/models/mail";
import PlayerModel from "../database/models/player";
import PlayerDailyLottery from "../database/models/playerDailyLottery";
import PlayerRankLottery from "../database/models/playerRankLottery";
import BaseService from "./base";
import {service} from "./importService";

// 抽奖
export default class Lottery extends BaseService {

  // 奖品包含未中奖
  async randomWithNoPrize(randomList) {
    const newList = [];
    let summary = 0;
    for (let i = 0; i < randomList.length; i++) {
      // 保证 float 相加为整数
      summary = service.utils.accAdd(randomList[i].probability, summary);
      let p = randomList[i].probability;
      if (newList[i - 1]) {
        // 加上前一个概率
        p += newList[i - 1];
      }
      newList.push(p);
    }
    if (isNaN(summary) || summary > 1 || summary < 0) {
      // 概率错了，无法抽奖
      console.error('invalid prize probability, summary', summary, JSON.stringify(randomList));
      return null;
    }
    // 写入未中奖
    newList.push(1);
    const hit = Math.random();
    for (let j = 0; j < newList.length; j++) {
      if (hit <= newList[j]) {
        // 抽中了
        return randomList[j] || null;
      }
    }
    // 奖品出错了，连未中奖都抽不中
    throw new Error('invalid randomWithNoPrize' + JSON.stringify(randomList));
  }

  // 在数组中随机抽取
  async randomWithinArray(randomList) {
    let summary = 0;
    randomList.map(value => summary += value.probability);
    if (isNaN(summary) || summary <= 0) {
      throw new Error('invalid probability' + JSON.stringify(randomList));
    }
    const newList = [];
    // 重新计算概率
    for (let i = 0 ; i < randomList.length; i++) {
      let p = randomList[i].probability / summary;
      if (newList[i - 1]) {
        // 加上前一个概率
        p += newList[i - 1];
      }
      newList.push(p);
    }
    const hit = Math.random();
    for (let j = 0; j < newList.length; j++) {
      if (hit <= newList[j]) {
        // 抽中了
        return randomList[j];
      }
    }
    throw new Error('invalid randomWithinArray' + JSON.stringify(randomList) + JSON.stringify(newList) + summary);
  }

  // 检查奖品是否存在
  async getPrize(prizeId) {
    return await LotteryPrize.findById(prizeId);
  }

  // 记录抽奖记录
  async recordLottery(playerId, shortId, prizeId, rankId) {
    // 是否中奖
    const isHit = !!prizeId;
    let conf;
    if (prizeId) {
      conf = await this.getPrize(prizeId);
      if (!conf) {
        // 没有奖品配置
        console.error('no lottery prize', prizeId, playerId, shortId);
        return null;
      }
      // 实际数量-1
      conf.residueNum--;
      await conf.save();
    }
    const record = await LotteryRecord.create({
      playerId,
      shortId,
      prizeConfig: conf || null,
      isReceive: false,
      receiveAt: new Date(),
      prizeId: conf && conf._id || null,
      createAt: new Date(),
      rankId: rankId || null,
      isHit,
    })
    // 发送邮件
    if (record.isHit) {
      await this.receivePrize(record._id);
      // await this.sendPrizeEmail(record);
    }
    return record;
  }

  // 查找常规抽奖配置
  async getOrCreatePlayerDailyLottery(playerId, shortId) {
    const player = await PlayerDailyLottery.findOne({
      shortId,
    })
    if (player) {
      return player;
    }
    return PlayerDailyLottery.create({
      playerId,
      shortId,
      times: 0,
      createAt: new Date(),
    })
  }

  // 获取排行榜数据
  async getPlayerRankLottery(shortId, rankId) {
    return PlayerRankLottery.findOne({
      shortId,
      rankId,
    })
  }

  async getPlayerRankLotteryByPlayerId(playerId, rankId) {
    return PlayerRankLottery.findOne({
      playerId,
      rankId,
    })
  }

  // 每日活跃抽奖
  async activeLottery(playerId) {
    const model = await service.playerService.getPlayerModel(playerId);
    if (!model) {
      // 用户不存在
      return { isOk: false };
    }
    const lock = await service.utils.grantLockOnce(RedisKey.dailyLottery + model.shortId, 3);
    if (!lock) {
      // 稍后重试
      return { isOk: false };
    }
    // 查找抽奖次数
    const playerLottery = await this.getOrCreatePlayerDailyLottery(model._id, model.shortId);
    if (playerLottery.times < 1) {
      // 没有抽奖次数了
      await lock.unlock();
      return { isOk: false };
    }
    const list = await LotteryPrize.find({
      type: 'player',
      // 忽略空奖励
      source: {$ne: LotterySource.empty},
      // 实际数量大于 0
      residueNum: {
        $gt: 0,
      },
    });
    const hitPrize = await this.randomWithNoPrize(list);
    // 抽奖记录
    const record = await this.recordLottery(model._id, model.shortId, hitPrize && hitPrize._id || null, null);
    // 抽奖次数减一
    playerLottery.times --;
    await playerLottery.save();
    await lock.unlock();
    return { isOk: true, playerLottery, record };
  }

  // 排行榜抽奖
  async rankLottery(playerId, rankId, boxId) {
    const model = await service.playerService.getPlayerModel(playerId);
    if (!model) {
      // 用户不存在
      return { isOk: false };
    }
    const playerLottery = await this.getPlayerRankLottery(model.shortId, rankId);
    if (!playerLottery || playerLottery.times < 1) {
      // 未上榜或者没有抽奖次数
      return { isOk: false };
    }
    const lock = await service.utils.grantLockOnce(RedisKey.rankLottery + boxId, 3);
    if (!lock) {
      // 稍后重试
      return { isOk: false };
    }
    const box = await this.getRankBoxById(boxId);
    if (box.isOpen) {
      // 宝箱已开启
      await lock.unlock();
      return { isOk: false }
    }
    let record;
    // 根据抽奖配置进行抽奖
    const hitPrize = await this.randomRankLottery(playerLottery, rankId);
    if (hitPrize) {
      hitPrize.isHit = true;
      await hitPrize.save();
      record = await this.recordLottery(playerLottery.playerId, playerLottery.shortId, hitPrize._id, rankId);
      box.isHit = true;
      box.prizeId = hitPrize._id
    } else {
      // 未中奖
      record = await this.recordLottery(playerLottery.playerId, playerLottery.shortId, null, rankId);
      box.isHit = false;
    }
    box.isOpen = true;
    playerLottery.times --;
    await playerLottery.save();
    await box.save();
    await lock.unlock();
    return { isOk: true, playerLottery, record, box };
  }

  async randomRankLottery(playerLottery, rankId) {
    // 推广员
    const list = await LotteryPrize.find({
      type: 'gem',
      rankId,
      // 忽略空奖励
      source: {$ne: LotterySource.empty},
    });
    // 查找有没有一定要给用户奖品
    const commonPrize = {};
    const myPrize = {};
    for (const conf of list) {
      if (conf.isHit) {
        // 没货了
        continue;
      }
      const key = `${conf.source}-${conf.quantity}`;
      if (conf.playerShortId === 0) {
        // 普通奖品
        commonPrize[key] = conf;
      } else if (conf.playerShortId === playerLottery.shortId) {
        myPrize[key] = conf;
      }
    }
    if (Object.values(myPrize).length >= playerLottery.times) {
      // 剩下在指定的奖品中抽
      return this.randomWithinArray(Object.values(myPrize));
    }
    // 抽奖次数有多
    for (const k of Object.keys(myPrize)) {
      if (commonPrize[k]) {
        // 随机添加指定奖品
        const random = Math.random();
        if (random < 0.5) {
          // 替换成指定奖品
          commonPrize[k] = myPrize[k];
        }
      } else {
        commonPrize[k] = myPrize[k];
      }
    }
    return this.randomWithNoPrize(Object.values(commonPrize));
  }

  // 领奖
  async receivePrize(recordId) {
    const lock = await service.utils.grantLockOnce(RedisKey.receiveLottery + recordId, 3);
    if (!lock) {
      // 稍后重试
      return { isOk: false };
    }
    const record = await LotteryRecord.findById(recordId);
    if (!record || !record.isHit || record.isReceive) {
      // 没有领奖记录 or 未中奖 or 已经领取
      await lock.unlock();
      return { isOk: false };
    }

    const model = await service.playerService.getPlayerModel(record.playerId);

    switch (record.prizeConfig.source) {
      case LotterySource.gem:
        // 添加钻石
        await PlayerModel.update({_id: record.playerId }, {$inc: { gem: record.prizeConfig.quantity }});

        await service.playerService.logGemConsume(record.playerId,
          ConsumeLogType.chargeByActive,
          record.prizeConfig.quantity, model.gem + record.prizeConfig.quantity,
          `邮件赠送获得钻石${record.prizeConfig.quantity}个`);
        break;
      case LotterySource.money:
        // redPocket 红包
        await PlayerModel.update({_id: record.playerId }, {$inc: { redPocket: record.prizeConfig.quantity }});
        break;
      case LotterySource.ruby:
        // 金豆
        await PlayerModel.update({_id: record.playerId }, {$inc: { ruby: record.prizeConfig.quantity }});
        break;
      case LotterySource.mobile:
        // 手机, 后台添加实物单
        await LotteryEntityRecord.create({
          playerId: record.playerId,
          shortId: record.shortId,
          createAt: new Date(),
          prizeId: record.prizeId,
          rankId: record.rankId,
          isReceive: false,
          receiveAt: new Date(),
          prizeConfig: record.prizeConfig,
          expressNo: '',
          address: '',
        })
        break;
      default:
    }
    record.isReceive = true;
    record.receiveAt = new Date();
    await record.save();
    await lock.unlock();
    return { isOk: true, model };
  }

  // 添加普通抽奖次数
  async addDailyLotteryTimes(playerId, shortId, juIndex, juShu) {
    // 总局数大于8局，且只有第6局才加
    if (juIndex !== 6 || juShu < 8) {
      return false;
    }
    const conf = await this.getOrCreatePlayerDailyLottery(playerId, shortId);
    conf.times++;
    await conf.save();
    return true;
  }

  // 发送奖励
  async sendPrizeEmail(lotteryRecord) {
    let giftDetail = '';
    const gift = {
      gem: 0,
      redpocket: 0,
      prizeRecordId: lotteryRecord._id,
      mobile: 0,
      ruby: 0,
    };
    if (lotteryRecord.prizeConfig.source === LotterySource.gem) {
      // 房卡
      giftDetail += `钻石${lotteryRecord.prizeConfig.quantity}个`;
      gift.gem = lotteryRecord.prizeConfig.quantity;
    } else if (lotteryRecord.prizeConfig.source === LotterySource.money) {
      // 红包
      giftDetail += `红包${lotteryRecord.prizeConfig.quantity / 100}元`;
      gift.redpocket = lotteryRecord.prizeConfig.quantity / 100;
    } else if (lotteryRecord.prizeConfig.source === LotterySource.mobile) {
      giftDetail += `价值${lotteryRecord.prizeConfig.price}元的手机。请联系客服领取`;
      gift.mobile = 1;
    } else if (lotteryRecord.prizeConfig.source === LotterySource.ruby) {
      giftDetail += `金豆${lotteryRecord.prizeConfig.quantity}个`;
      gift.ruby = lotteryRecord.prizeConfig.quantity;
    } else {
      // 未中奖
      return;
    }
    let title = '幸运转盘中奖通知';
    let content = '您在幸运转盘中抽中了' + giftDetail;
    if (lotteryRecord.rankId) {
      // 排行榜奖励
      title = '排行榜抽奖中奖通知';
      content = '您在排行榜抽中' + giftDetail;
    }
    return MailModel.create({
      to: lotteryRecord.playerId,
      type: MailType.GIFT,
      title,
      content,
      state: MailState.UNREAD,
      giftState: GiftState.AVAILABLE,
      createAt: new Date(),
      gift,
    });
  }

  // 获取排行榜宝箱
  async findOrCreateRankBox(rankId) {
    const allBox = await LotteryBox.find({
      rankId
    });
    if (allBox.lenght > 0) {
      return allBox;
    }
    // 新建 45 个宝箱
    const records = [];
    for (let i = 0; i < config.game.rankBoxCount; i++) {
      records.push({
        boxNumber: i + 1,
        prizeId: null,
        rankId,
        createAt: new Date(),
        isHit: false,
        isOpen: false,
      })
    }
    return LotteryBox.create(records);
  }

  // 根据宝箱 id 获取宝箱
  async getRankBoxById(boxId) {
    return LotteryBox.findById(boxId);
  }

  // 今日抽奖次数
  async todayLotteryCount(playerId, shortId) {
    const start = moment().startOf('day').toDate()
    const end = moment().endOf('day').toDate()
    return LotteryRecord.count({
      playerId,
      shortId,
      createAt: {
        $gte: start,
        $lte: end,
      }
    })
  }
}

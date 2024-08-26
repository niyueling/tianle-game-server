import {ConsumeLogType, GlobalConfigKeys, TianleErrorCode, shopPropType, playerAttributes} from "@fm/common/constants";
import {addApi} from "../../common/api";
import {service} from "../../service/importService";
import {BaseApi} from "./baseApi";
import RoomGoldRecord from "../../database/models/roomGoldRecord";
import GameFeedback from "../../database/models/GameFeedback";
import Enums from "../../match/majiang/enums";
import LuckyBless from "../../database/models/luckyBless";

// 游戏
export class GameApi extends BaseApi {
  // 获取金豆房配置
  @addApi({
    rule: {
      gameType: 'string'
    }
  })
  async getPublicRoomCategory(message) {
    const resp = await this.service.gameConfig.getPublicRoomCategory(message);
    this.replySuccess(resp);
  }

  @addApi({
    rule: {
      categoryId: "string", // 场次id
    }
  })
  async getPublicRoomOpenDouble(msg) {
    const resp = await service.gameConfig.getPublicRoomOpenDouble(msg.categoryId);
    this.replySuccess(resp);
  }

  // 解散反馈
  @addApi({
    rule: {
      roomId: "number", // 房间号
      gameReason: "array", // 游戏原因
      otherReason: "array", // 其他原因
      juShu: "number", // 局数
      gameType: "string", // 游戏类型
      expectateGame: "string?", // 期待玩法
      wechatId: "string?", // 微信号
    }
  })
  async dissolveFeedback(msg) {
    const recordCount = await GameFeedback.count({roomId: msg.roomId});
    if (recordCount) {
      await GameFeedback.remove({roomId: msg.roomId});
    }

    const data = {
      playerId: this.player._id,
      gameReason: msg.gameReason,
      otherReason: msg.otherReason,
      juShu: msg.juShu,
      roomId: msg.roomId,
      gameType: msg.gameType,
      expectateGame: msg.expectateGame,
      wechatId: msg.wechatId
    }

    await GameFeedback.create(data);

    this.replySuccess(data);
  }

  // 战绩
  @addApi()
  async getRecordList(message) {
    let params = {roomId: message.roomId};
    if (message.juIndex) {
      params["juIndex"] = message.juIndex;
    }
    const records = await RoomGoldRecord.where(params).find();
    const scoreRecords = [];
    let totalGold = 0;

    for (let i = 0; i < records.length; i++) {
      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(records[i].categoryId);

      if (this.player._id === records[i].winnerId) {
        totalGold += records[i].winnerGoldReward;
        scoreRecords.push({
          playerId: this.player._id,
          gold: records[i].winnerGoldReward,
          cardTypes: records[i].cardTypes,
          winnerIndex: records[i].winnerFrom,
          conf
        });
      }

      if (records[i].failList.includes(this.player._id)) {
        const index = records[i].failList.findIndex(p => p === this.player._id);
        totalGold -= records[i].failGoldList[index];
        scoreRecords.push({
          playerId: this.player._id,
          gold: records[i].failGoldList[index],
          cardTypes: records[i].cardTypes,
          winnerIndex: records[i].winnerFrom,
          conf
        });
      }
    }

    return this.replySuccess({totalGold, scoreRecords});
  }

  // 金豆翻倍 or 金豆免输
  @addApi({
    rule: {
      roomId: "number", // 房间号
      currency: "string", // 币种
    }
  })
  async restoreOrDoubleRuby(msg) {
    const record = await service.playerService.getLastRoomRuby(this.player.model._id, msg.roomId);
    const player = await service.playerService.getPlayerModel(this.player.model._id);
    const random = Math.random();
    const score = Math.floor(record.score * random);
    if (record && record.roomNum === msg.roomNum) {
      if (record.score < 0) {
        // 免输
        msg.currency === Enums.goldCurrency ? player.gold -= score : player.tlGold -= score;
        await service.playerService.logGoldConsume(player._id, ConsumeLogType.doubleWinOrFail, -score,
          msg.currency === Enums.goldCurrency ? player.gold : player.tlGold, `结算免输:${msg.roomId}`);
      } else {
        // 翻倍
        msg.currency === Enums.goldCurrency ? player.gold += score : player.tlGold += score;
        await service.playerService.logGoldConsume(player._id, ConsumeLogType.doubleWinOrFail, score,
          msg.currency === Enums.goldCurrency ? player.gold : player.tlGold, `结算双倍奖励:${msg.roomId}`);
      }
      await player.save();
      await this.player.updateResource2Client();
      this.replySuccess({scoreChange: Math.abs(score)})
    } else {
      this.replyFail(TianleErrorCode.configNotFound);
    }
  }

  // 祈福列表
  @addApi()
  async getBlessList() {
    const blessList = await service.qian.blessList(this.player);
    this.replySuccess(blessList);
  }

  // 钻石祈福
  @addApi()
  async blessByGem(message) {
    const list = await LuckyBless.find().sort({orderIndex: 1});
    let blessIndex = list.findIndex(bless => bless._id.toString() === message._id);
    let bless = list[blessIndex];
    if (!bless) {
      console.error(`no such bless ${message._id}`);
      return this.replyFail(TianleErrorCode.blessFail);
    }
    let index;
    if (message.isUseItem) {
      // 使用道具祈福，默认只祈福第一级
      index = 0;
      const isOk = await service.item.useItem(this.player._id, shopPropType.qiFuCard, 1, bless.orderIndex);
      if (!isOk) {
        return this.replyFail(TianleErrorCode.propInsufficient)
      }
    } else {
      // 钻石祈福
      index = bless.times.indexOf(message.times);
      if (index === -1) {
        console.error(`no such times ${message.times}`);
        return this.replyFail(TianleErrorCode.blessFail)
      }
      let needGem = 0;
      // 更新祈福时长
      const lastBless = await service.playerService.getPlayerAttrValueByShortId(this.player.model.shortId, playerAttributes.blessEndAt, message._id);
      if (lastBless) {
        // 不是第一次，要扣钻石
        needGem = bless.gem[index];
      }
      if (needGem > 0) {
        const result = await service.playerService.logAndConsumeDiamond(this.player.model._id, ConsumeLogType.bless, needGem, '祈福扣钻石')
        if (!result.isOk) {
          return this.replyFail(TianleErrorCode.blessFail)
        }
        this.player.model = result.model;
      }
    }
    await service.playerService.createOrUpdatePlayerAttr(this.player.model._id, this.player.model.shortId, playerAttributes.blessEndAt, Math.floor(Date.now() / 1000), message._id);
    const model = await service.qian.saveBlessLevel(this.player.model.shortId, message.roomId, index + 1);
    // this.blessLevel[player.model.shortId] = model.blessLevel;
    this.replySuccess({ index: blessIndex, blessLevel: model.blessLevel });
    await this.player.updateResource2Client();
  }

  // 求签
  @addApi()
  async blessQian(msg) {
    const todayQian = await service.qian.getTodayQian(this.player.model.shortId);
    // 第一次求签消耗房卡
    const firstCost = await service.utils.getGlobalConfigByName(GlobalConfigKeys.firstQianCostGem) || 10;
    // 改签消耗房卡
    const changeCost = await service.utils.getGlobalConfigByName(GlobalConfigKeys.changeQianCostGem) || 20;
    // 下次求签消耗
    if (!todayQian.isFirst) {
      let needGem;
      if (todayQian.record) {
        // 改签
        needGem = changeCost;
      } else {
        needGem = firstCost;
      }
      if (msg.isUseItem) {
        // 使用道具求签
        const isOk = await service.item.useItem(this.player._id, shopPropType.qiuqianCard, 1)
        if (!isOk) {
          return this.replyFail(TianleErrorCode.propInsufficient);
        }
      } else {
        // 检查房卡
        const result = await service.playerService.logAndConsumeDiamond(this.player.model._id, ConsumeLogType.blessQian, needGem, '抽签扣钻石')
        if (!result.isOk) {
          return this.replyFail(TianleErrorCode.blessQianFail);
        }
        this.player.model = result.model;
        await this.player.updateResource2Client();
      }
    }
    const newQian = await service.qian.createQian(this.player.model.shortId);
    await service.qian.saveQian(this.player.model.shortId, newQian)

    const itemCount = await service.item.getItemCount(this.player._id, shopPropType.qiuqianCard);
    this.replySuccess({ record: newQian, qianCost: changeCost, itemCount });
  }

  // 进入求签界面
  @addApi({})
  async enterQian() {
    const resp = await service.qian.qianList(this.player);
    this.replySuccess(resp);
  }
}

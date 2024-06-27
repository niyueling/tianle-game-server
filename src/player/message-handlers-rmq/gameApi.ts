import {ConsumeLogType, GlobalConfigKeys, TianleErrorCode} from "@fm/common/constants";
import {addApi} from "../../common/api";
import * as config from "../../config";
import {service} from "../../service/importService";
import {BaseApi} from "./baseApi";
import RoomGoldRecord from "../../database/models/roomGoldRecord";
import GameFeedback from "../../database/models/GameFeedback";
import Enums from "../../match/majiang/enums";

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
    const records = await RoomGoldRecord.where({roomId: message.roomId}).find();
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

  // 求签
  @addApi()
  async blessQian() {
    const todayQian = await service.qian.getTodayQian(this.player.model.shortId);
    // 第一次求签消耗房卡
    const firstCost = await service.utils.getGlobalConfigByName(GlobalConfigKeys.firstQianCostGem) || 100;
    // 改签消耗房卡
    const changeCost = await service.utils.getGlobalConfigByName(GlobalConfigKeys.changeQianCostGem) || 200;
    // 下次求签消耗
    if (!todayQian.isFirst) {
      let needGem;
      if (todayQian.record) {
        // 改签
        needGem = changeCost;
      } else {
        needGem = firstCost;
      }
      // 检查房卡
      const result = await service.playerService.logAndConsumeGem(this.player.model._id, ConsumeLogType.blessQian,
        needGem, '抽签扣钻石')
      if (!result.isOk) {
        return this.replyFail('抽签失败');
      }
      this.player.model = result.model;
      this.player.updateResource2Client();
    }
    const newQian = await service.qian.createQian(this.player.model.shortId);
    await service.qian.saveQian(this.player.model.shortId, newQian)
    this.replySuccess({record: newQian, qianCost: changeCost});
  }

  // 进入求签界面
  @addApi({})
  async enterQian() {
    const resp = {
      // 今日签文
      record: null,
      // 求签钻石
      qianCost: 0,
    };
    const todayQian = await service.qian.getTodayQian(this.player.model.shortId);
    if (todayQian.record) {
      resp.record = todayQian.record;
      // 获取改签需要的钻石
      resp.qianCost = await service.utils.getGlobalConfigByName(GlobalConfigKeys.changeQianCostGem) || 20;
      resp.qianCost = parseInt(resp.qianCost.toString(), 10);
    } else {
      resp.record = null;
      if (todayQian.isFirst) {
        resp.qianCost = 0;
      } else {
        // 当天第一次抽签
        resp.qianCost = await service.utils.getGlobalConfigByName(GlobalConfigKeys.firstQianCostGem) || 10;
        resp.qianCost = parseInt(resp.qianCost.toString(), 10);
      }
    }
    this.replySuccess(resp);
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

  // 获取救助次数
  @addApi()
  async queryRubyHelpTimes() {
    const model = await service.playerService.getPlayerModel(this.player.model._id)
    let times = await service.playerService.playerHelpRubyTimes(model)
    if (times < 0) {
      console.error("玩家剩余次数为负", times)
      times = 0;
    }
    this.replySuccess({ruby: config.game.rubyHelpAmount, times})
  }

  @addApi({
    rule: {
      isDouble: "bool"
    }
  })
  async receiveRubyHelp(msg) {
    const model = await service.playerService.getPlayerModel(this.player.model._id)
    const oldRuby = model.ruby
    const isOk = await service.playerService.todayRubyHelp(model, !!msg.isDouble)
    if (isOk) {
      this.replySuccess({rubyChange: model.ruby - oldRuby})
      await this.player.updateResource2Client()
    } else {
      this.replyFail("领取失败")
    }
  }
}

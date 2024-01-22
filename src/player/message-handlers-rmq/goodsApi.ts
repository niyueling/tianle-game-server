import {ApplePrice, ConsumeLogType, TianleErrorCode} from "@fm/common/constants";
import {addApi} from "../../common/api";
import GoodsModel from "../../database/models/goods";
import GoodsExchangeRuby from "../../database/models/goodsExchangeRuby";
import GoodsLive from "../../database/models/goodsLive";
import {service} from "../../service/importService";
import {BaseApi} from "./baseApi";
import GoodsReviveRuby from "../../database/models/goodsReviveRuby";
import PlayerModel from "../../database/models/player";

// 商品
export class GoodsApi extends BaseApi {
  // 所有商品列表
  @addApi()
  async getGoodsList() {
    const goodsList = await GoodsModel.find({ isOnline: true });
    for (const r of goodsList) {
      r.applePrice = ApplePrice[r.applePriceId] || '无';
    }
    const rubyList = await GoodsExchangeRuby.find();
    this.replySuccess({ goodsList, rubyList });
  }

  // 复活礼包列表
  @addApi({
    rule: {
      roomNum: 'number'
    }
  })
  async liveGiftList(msg) {
    const goodsList = await GoodsLive.find().sort({ruby: 1});
    let times = 1;
    if (goodsList.length > 0) {
      times = await service.gameConfig.goodsLiveTimes(msg.roomNum);
    }
    // 按比例翻倍
    for (const g of goodsList) {
      g.ruby *= times;
      g.gem *= times;
    }
    this.replySuccess(goodsList);
  }

  // 复活礼包列表
  @addApi()
  async getReviveList(message) {
    const reviveList = await GoodsReviveRuby.find({ category: message.category }).sort({diamond: 1});

    this.replySuccess(reviveList);
  }

  // 兑换复活礼包
  @addApi()
  async exchangeRevive(message) {
    const exchangeConf = await GoodsReviveRuby.findById(message._id);
    if (!exchangeConf) {
      return this.replyFail(TianleErrorCode.configNotFound);
    }

    const model = await service.playerService.getPlayerModel(this.player.model._id);
    if (exchangeConf.diamond > model.diamond) {
      return this.replyFail(TianleErrorCode.diamondInsufficient);
    }

    let temp = '';
    if (exchangeConf.gold > 100000000) {
      temp = (exchangeConf.gold / 100000000) + "亿";
    } else if (exchangeConf.gold > 1000000000000) {
      temp = (exchangeConf.gold / 1000000000000) + "兆";
    }

    await PlayerModel.update({_id: model._id}, {$inc: {diamond: -exchangeConf.diamond, gold: exchangeConf.gold}});
    this.player.model.diamond = model.diamond - exchangeConf.diamond;
    this.player.model.gold = model.gold + exchangeConf.gold;
    // 增加日志
    await service.playerService.logGemConsume(model._id, ConsumeLogType.gemForRuby, -exchangeConf.diamond, this.player.model.diamond, `成功兑换${exchangeConf.diamond}钻石成${temp}金豆`);

    this.replySuccess({diamond: exchangeConf.diamond, gold: exchangeConf.gold});
    await this.player.updateResource2Client();
  }
}

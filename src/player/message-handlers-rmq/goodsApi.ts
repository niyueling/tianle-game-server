import {ApplePrice} from "@fm/common/constants";
import {addApi} from "../../common/api";
import GoodsModel from "../../database/models/goods";
import GoodsExchangeRuby from "../../database/models/goodsExchangeRuby";
import GoodsLive from "../../database/models/goodsLive";
import {service} from "../../service/importService";
import {BaseApi} from "./baseApi";

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
}

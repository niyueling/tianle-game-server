import {ConsumeLogType} from "@fm/common/constants";
import {addApi} from "../../common/api";
import GoodsExchangeRuby from "../../database/models/goodsExchangeRuby";
import Player from "../../database/models/player";
import {service} from "../../service/importService";
import {BaseApi} from "./baseApi";

// 资源
export class ResourceApi extends BaseApi {

  // 将房卡转为金豆
  @addApi()
  async gem2ruby(message) {
    const exchangeConf = await GoodsExchangeRuby.findById(message._id);
    if (!exchangeConf) {
      return this.replyFail('兑换失败')
    }
    const gem2ExchangeNum = exchangeConf.gemCount;
    let reason: string;
    // model 可能有更新, 重新从数据拉取
    const model = await this.service.playerService.getPlayerPlainModel(this.player.model._id);
    const ruby = exchangeConf.rubyAmount;
    if (gem2ExchangeNum > model.gem && gem2ExchangeNum > 0) {
      reason = '钻石不足';
      this.player.model = model;
    } else {
      await Player.update({_id: model._id},
        {$inc: {gem: -gem2ExchangeNum, ruby}});
      model.gem -= gem2ExchangeNum;
      model.ruby += ruby
      let temp = '';
      if (ruby > 100000000) {
        temp = (ruby / 100000000).toFixed(2) + "亿";
      } else if (ruby > 10000) {
        temp = (ruby / 10000).toFixed(2) + "万";
      } else {
        temp = ruby;
      }
      reason = `成功兑换${gem2ExchangeNum}钻石成${temp}金豆`;

      // 增加日志
      await service.playerService.logGemConsume(model._id, ConsumeLogType.gemForRuby, -gem2ExchangeNum, model.gem,
        reason);
      this.player.model = model;
      this.player.updateResource2Client();
    }
    this.replySuccessWithName('resource/exchange', '', {message: reason})
  }
}

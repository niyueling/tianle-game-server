import Enums from "./enums";

/**
 * Created by Color on 2016/9/2.
 */
class Rule {
  ro: any

  constructor(ruleObj: any) {
    this.ro = ruleObj;
  }

  getOriginData() {
    return this.ro
  }

  get juShu() {
    return this.ro.juShu || 0
  }

  get test() {
    return this.ro.test || false
  }

  get playerCount() {
    return this.ro.playerCount || 3
  }

  get specialReward() {
    return this.ro.specialReward || 0
  }

  get luckyReward(): number {
    return this.ro.luckyReward || 0
  }

  // 封顶倍数(完成)
  get capping() {
    return this.ro.capping || -1;
  }

  // 是否允许加倍
  get allowDouble() {
    return this.ro.allowDouble;
  }

  // 是否允许明牌(完成)
  get allowOpenCard() {
    return this.ro.allowOpenCard;
  }

  // 是否使用记牌器(完成)
  get useRecorder() {
    return this.ro.useRecorder;
  }

  // 是否剩余三张才显示牌数(客户端内容)
  get remainCard3() {
    return this.ro.remainCard3;
  }

  // 双王/4个二必叫(完成)
  get mustCallLandlord() {
    return this.ro.mustCallLandlord;
  }

  // 炸弹是否计分
  get countBoomScore() {
    return !!this.ro.countBoomScore
  }

  // 币种
  get currency(): string {
    if (!this.ro.currency) {
      return Enums.goldCurrency;
    }

    return this.ro.currency;
  }
}

export default Rule;

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
    return this.ro.test || true
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

  // 封顶倍数
  get capping() {
    return this.ro.capping || -1;
  }

  // 是否允许加倍
  get allowDouble() {
    return this.ro.allowDouble || true;
  }

  // 是否允许明牌
  get allowopenCard() {
    return this.ro.allowopenCard || true;
  }

  // 是否使用记牌器
  get useRecorder() {
    return this.ro.useRecorder || true;
  }

  // 是否剩余三张才显示牌数
  get remainCard3() {
    return this.ro.remainCard3 || true;
  }

  // 双王/4个二必叫
  get mustCallLandlord() {
    return this.ro.mustCallLandlord || true;
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

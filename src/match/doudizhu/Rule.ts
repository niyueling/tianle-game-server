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

  // 是否允许4带2
  get boomPlus2() {
    return !!this.ro.boomPlus2;
  }

  // 3张可以带0, 1张，2张
  get triplePlusX() {
    return !!this.ro.triplePlusX;
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

  // 是否赢家先出
  get winnerFirst() {
    return !!this.ro.winnerFirst
  }
}

export default Rule;

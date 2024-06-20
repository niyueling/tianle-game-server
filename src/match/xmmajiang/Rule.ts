/**
 * Created by Color on 2016/9/2.
 */
import Enums from './enums';

class Rule {
  ro: any

  constructor(ruleObj: any) {
    this.ro = ruleObj;
  }

  get test() {
    if (!this.ro.test) {
      return false;
    }

    return this.ro.test;
  }

  get juShu() {
    return this.ro.juShu || 8
  }

  get juScore() {
    return this.ro.juScore || 100;
  }

  get gameJuCount() {
    return this.ro.gameJuCount || Enums.yiKe;
  }

  get initScore() {
    return 0
  }

  get playerCount() {
    return this.ro.playerCount || 4
  }

  get useCaiShen() {
    return this.ro.useCaiShen
  }

  get diFen(): number {
    return this.ro.diFen || 1
  }

  // 是否无大牌, true = 无大牌
  get noBigCard() {
    let noBigCard = !!this.ro.noBigCard;
    if (this.ro.isPublic) noBigCard = false;
    return noBigCard
  }

  // 双金只能游金
  get doubleGoldYouJin() {
    let doubleGoldYouJin = !!this.ro.doubleGoldYouJin;
    if (this.ro.isPublic) doubleGoldYouJin = true;
    return doubleGoldYouJin;
  }

  // 3金倒必起手
  get sanJinMustQiShou() {
    let sanJinMustQiShou = !!this.ro.sanJinMustQiShou;
    if (this.ro.isPublic) sanJinMustQiShou = true;
    return sanJinMustQiShou
  }

  getOriginData() {
    return this.ro
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

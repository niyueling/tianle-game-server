/**
 * Created by Color on 2016/9/2.
 */
import Enums from './enums';

class Rule {
  ro: any

  constructor(ruleObj: any) {
    this.ro = ruleObj;
  }

  // 玩法
  get wanFa(): string {
    return this.ro.wanFa
  }

  getOriginData() {
    return this.ro
  }

  // 局数, 过5：1，过8：2，过10：3， 过A：4， 3把不过回2：5, 随机级牌：6
  get juShu() {
    // return this.ro.juShu || 6;
    return 6;
  }

  // 升级，双下升3级：1，双下升4级
  get upgrade() {
    return this.ro.upgrade || 1
  }

  // 还贡，点数10以下：1，任意牌(红桃级牌除外)：2
  get resoreTribute() {
    return this.ro.resoreTribute || 1
  }

  // 报牌，剩余10张：1，实时报牌：2
  get showRemainCard() {
    return this.ro.showRemainCard || 1
  }

  // 是否允许加倍
  get allowDouble() {
    return this.ro.allowDouble || false;
  }

  // 发牌，随即发牌：1， 不洗牌：2
  get shuffleType() {
    return this.ro.shuffleType || 1;
  }

  // 人数
  get playerCount() {
    return this.ro.playerCount || 4
  }

  // 托管时间
  get autoCommit() {
    return this.ro.autoCommit || 15
  }

  // 币种
  get currency(): string {
    if (!this.ro.currency) {
      return Enums.goldCurrency;
    }

    return this.ro.currency;
  }

  // 是否有王玩法
  get useJoker(): boolean {
    return this.ro.useJoker
  }

  // 王的数量
  get jokerCount(): number {
    return this.ro.jokerCount || 4
  }
}

export default Rule;

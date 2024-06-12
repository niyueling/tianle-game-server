/**
 * Created by Color on 2016/9/2.
 */
import Card, {CardType} from "./card";
import Enums from './enums';

class Rule {
  ro: any

  constructor(ruleObj: any) {
    if (ruleObj.ruleType) {
      if (ruleObj.ruleType === Enums.ruleType.lobby4Player) {
        ruleObj.playerCount = 4
      } else if (ruleObj.ruleType === Enums.ruleType.lobby3Player) {
        ruleObj.playerCount = 3
      } else if (ruleObj.ruleType === Enums.ruleType.lobby2Player) {
        ruleObj.playerCount = 2
      }
    }

    this.ro = ruleObj;
  }

  get wanFa(): string {
    return this.ro.wanFa
  }

  get isLuoSong(): boolean {
    return this.wanFa === 'luoSong'
  }

  getOriginData() {
    return this.ro
  }

  get share(): boolean {
    return !!this.ro.share
  }

  get ruleType() {
    return this.ro.ruleType || Enums.ruleType.lobby4Player;
  }

  get juShu() {
    return this.ro.juShu || 0
  }

  get playerCount() {
    return this.ro.playerCount || 3
  }

  get maPaiArray(): Card[] {
    const maPaiArr = this.ro.maPaiArray || []
    return maPaiArr.map(maPai => new Card(CardType.Heart, maPai))
  }

  get yaPai(): boolean {
    return this.ro.yaPai || false;
  }

  get longTou(): boolean {
    return this.ro.longTou || false;
  }

  get useJoker(): boolean {
    return this.ro.useJoker
  }

  get guanPai(): boolean {
    return this.ro.guanPai
  }

  get specialReward() {
    return this.ro.specialReward || 0
  }

  get luckyReward(): number {
    return this.ro.luckyReward || 0
  }

  // 是否允许4带3
  get boomPlus3() {
    return !!this.ro.boomPlus3;
  }

  // 是否允许4带2
  get boomPlus2() {
    return !!this.ro.boomPlus2;
  }

  // aaa 炸最大
  get boom3A() {
    return !!this.ro.boom3A;
  }

  // 最后3张可以带0, 1张，2张，
  get lastTriplePlusX() {
    return !!this.ro.lastTriplePlusX;
  }

  // 3张可以带0, 1张，2张
  get triplePlusX() {
    return !!this.ro.triplePlusX;
  }

  // 最后一张牌是否算分
  get lastCard2Score() {
    return !!this.ro.lastCard2Score;
  }

  // 低分, 总结算翻倍
  get lowScore() {
    return this.ro.lowScore || 0;
  }

  // 低分翻倍数, 0 = 不翻倍
  get lowScoreTimes() {
    return this.ro.lowScoreTimes || 0;
  }

  // 炸弹是否计分
  get countBoomScore() {
    return !!this.ro.countBoomScore
  }

  // 炸弹不能拆
  get noSingleBoomCard() {
    return !!this.ro.noSingleBoomCard
  }

  // 是否赢家先出
  get winnerFirst() {
    return !!this.ro.winnerFirst
  }

  // 是否计算反春天
  get antiSpring() {
    return !!this.ro.antiSpring;
  }
}

export default Rule;

/**
 * Created by Color on 2016/9/2.
 */
import Card, {CardType} from "./card";
import Enums from './enums';

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

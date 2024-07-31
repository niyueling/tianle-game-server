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

  get clubPersonalRoom(){
    return this.ro.clubPersonalRoom
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
    return this.ro.playerCount || 4
  }

  get useJoker() {
    return this.ro.useJoker
  }

  get autoCommit() {
    return this.ro.autoCommit
  }

  get maPaiArray(): Card[] {
    const maPaiArr = this.ro.maPaiArray || []
    return maPaiArr.map(maPai => new Card(CardType.Diamond, maPai))
  }

  get specialReward() {
    return this.ro.specialReward || 0
  }

  get luckyReward(): number {
    return this.ro.luckyReward || 0
  }
}

export default Rule;

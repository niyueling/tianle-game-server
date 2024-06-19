/**
 * Created by Color on 2016/9/2.
 */
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
    return this.ro.juShu
  }

  get initScore() {
    return 0;
  }

  get playerCount() {
    return this.ro.playerCount || 4
  }


  get useCaiShen() {
    return this.ro.useCaiShen
  }

  get keJiePao(): boolean {
    return this.ro.keJiePao || true
  }

  get diFen(): number {
    return this.ro.diFen || 1
  }

  get test(): number {
    return this.ro.test || false
  }

  get currency(): string {
    if (!this.ro.currency) {
      return Enums.goldCurrency;
    }

    return this.ro.currency;
  }
}
export default Rule;

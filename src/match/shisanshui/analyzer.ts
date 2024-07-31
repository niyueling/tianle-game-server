import Card from './card'
import Combiner, {Suit, VerifyResult} from "./combiner";
import Combo from './combo'
import {CalcResult, uniqueByHash} from "./patterns/base"
import createCalculators from './patterns/index'

function hashCalcResult(res: CalcResult): string {

  return res.cards.slice().sort(Card.compare)
    .map(c => c.toString())
    .join('_')
}

export default class Analyzer {

  constructor(readonly cards: Card[]) {
    this.cards = cards.map(Card.from)
    if (cards.length <= 0) {
      throw new Error('cards length must greater than 0')
    }
  }

  // 查找牌型
  analyze(): Combo[] {
    const calcs = createCalculators({cards: this.cards})
    return calcs
      .map(calc => calc.max())
      .filter(calcResult => calcResult.found)
      .sort((a, b) => b.score - a.score)
  }

  analyzeSuits(): { isQiPai: boolean, qiPai: any, suits: Suit[] } {
    const qiPai = new Combiner(this.cards).detectQiPai()
    const result = {isQiPai: false, qiPai, suits: []}
    if (qiPai) {
      result.isQiPai = true
      return result
    }

    result.suits = new Combiner(this.cards).findAllSuit()
    return result
  }

  // share with front-end
  // noinspection JSUnusedGlobalSymbols
  detectQiPai(): { isQiPai: boolean, qiPai: any, suits: Suit[] } {
    const qiPai = new Combiner(this.cards).detectQiPai()
    const result = {isQiPai: false, qiPai, suits: []}
    if (qiPai) {
      result.isQiPai = true
    }
    return result
  }

  analyzeAll() {
    return createCalculators({cards: this.cards})
      .map(function (calc) {
        return uniqueByHash(calc.all(), hashCalcResult)
      })
      .filter(results => results.length > 0)
  }

  verifyQiPai(name): VerifyResult {
    return new Combiner(this.cards).verifyQiPai(name)
  }
}

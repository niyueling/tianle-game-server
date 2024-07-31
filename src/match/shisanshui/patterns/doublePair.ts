import Card from "../card"
import {groupBy, intersectComposite} from "../utils"
import {
  CalcResult,
  ComboTypes,
  createJokerMatcher,
  PatternMatcherBase,
  replaceJokersUseSpadeWithAllSameValues,
  sortCardArray
} from "./base"

export class DoublePair extends PatternMatcherBase {
  whatName(): string {
    return '两对'
  }

  type() {
    return ComboTypes.DOUBLE_PAIR
  }

  score(): number {
    return 30
  }

  getTwins() {
    return groupBy(this.cards, card => card.value)
      .filter(cs => cs.length >= 2)
      .map(cs => cs.length === 2 ? cs : cs.slice(0, 2))
      .sort(sortCardArray)
  }

  findAll() {
    return [this.maxOne()]
  }

  private maxOne() {
    const twinsArray = this.getTwins()
    return twinsArray.length >= 2 ?
      this.snapshot(this.padding([...twinsArray.shift(), ...twinsArray.pop()], 1)) : CalcResult.fail()
  }

  findOne() {
    return this.maxOne()
  }
}


export const DoublePairWithJoker = createJokerMatcher(DoublePair, replaceJokersUseSpadeWithAllSameValues)

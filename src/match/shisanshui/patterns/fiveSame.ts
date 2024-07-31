import {groupBy} from "../utils"
import {
  CalcResult,
  ComboTypes,
  createJokerMatcher,
  PatternMatcherBase,
  replaceJokersUseSpadeWithAllSameValues
} from "./base"

export class FiveSame extends PatternMatcherBase {
  whatName(): string {
    return '五同'
  }

  score(): number {
    return 2000
  }

  type(): string {
    return ComboTypes.FIVE_SAME
  }

  findAll(): CalcResult[] {
    return groupBy(this.cards, card => card.value)
      .filter(cs => cs.length >= 5)
      .map(cs => this.snapshot(cs.slice(0, 5)))
  }
}

export const FiveSameWithJoker = createJokerMatcher(FiveSame, replaceJokersUseSpadeWithAllSameValues)

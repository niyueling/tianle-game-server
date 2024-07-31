import {groupBy} from "../utils"
import {ComboTypes, createJokerMatcher, PatternMatcherBase, replaceJokersUseSpadeWithAllSameValues} from "./base"

export class Triple extends PatternMatcherBase {
  whatName(): string {
    return '三条'
  }

  type() {
    return ComboTypes.TRIPLE
  }

  score(): number {
    return 40
  }

  findAll() {
    const tripleArray = groupBy(this.cards, card => card.value)
      .filter(cards => cards.length >= 3)
      .map(cards => cards.length === 3 ? cards : cards.slice(0, 3))

    if (this.cards.length > 3) {
      tripleArray.forEach( triple => this.padding(triple, 2))
    }

    return tripleArray.map( triple => this.snapshot(triple))
  }
}

export const TripleWithJoker = createJokerMatcher(Triple, replaceJokersUseSpadeWithAllSameValues)

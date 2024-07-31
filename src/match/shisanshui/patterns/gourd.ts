import Card from "../card"
import {groupBy, intersectComposite} from "../utils"
import {
  ComboTypes,
  createJokerMatcher,
  PatternMatcherBase,
  replaceJokersUseSpadeWithAllSameValues,
  sortCardArray
} from "./base"

// 3条+1对
export class Gourd extends PatternMatcherBase {
  whatName(): string {
    return '葫芦'
  }

  type() {
    return ComboTypes.GOURD
  }

  score(): number {
    return 700
  }

  findAll() {
    const sameCardGroup = groupBy(this.cards, card => card.value)
    const tripleArray = sameCardGroup.filter(arr => arr.length === 3).reverse()
    const twinsArray = sameCardGroup.filter(arr => arr.length === 2)

    const copyTripleToTwins = tripleArray.map(triple => triple.slice(0, 2))
    const tripleDemotionWithTwins = [...twinsArray].concat(copyTripleToTwins).sort(sortCardArray)

    const composites: Card[][][] =
      intersectComposite<Card[]>(
        tripleDemotionWithTwins,
        tripleArray,
        (a, b) => a[0].value === b[0].value)

    return composites.map(([twins, triple]) => this.snapshot([...twins, ...triple]))
  }
}

export const GourdWithJoker = createJokerMatcher(Gourd, replaceJokersUseSpadeWithAllSameValues)

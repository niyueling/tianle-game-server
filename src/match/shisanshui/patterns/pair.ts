import Card from "../card"
import {groupBy} from "../utils"
import {ComboTypes, createJokerMatcher, PatternMatcherBase, replaceJokersUseSpadeWithAllSameValues} from "./base"

const reverseSortCardArray = (a: Card[], b: Card[]) => -1 * Card.compare(a[0], b[0])

export class Pair extends PatternMatcherBase {
  whatName(): string {
    return '一对'
  }

  type() {
    return ComboTypes.PAIR
  }

  score(): number {
    return 20
  }

  private getPairs(cards: Card[]) {
    return groupBy(cards, card => card.value)
      .filter(cards => cards.length >= 2)
      .map(cards => cards.length === 2 ? cards : cards.slice(0, 2))
      .sort(reverseSortCardArray)
  }

  findAll() {
    const isFive = this.cards.length > 3

    return this.getPairs(this.cards)
      .map(pair => this.padding(pair, isFive ? 3 : 1))
      .map(pair => this.snapshot(pair))
  }
}


export const PairWithJoker = createJokerMatcher(Pair, replaceJokersUseSpadeWithAllSameValues)

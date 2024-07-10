import Card from "../card"
import {
  groupBy, IMatcher, IPattern, PatterNames, promptWithWildJoker,
  verifyWithJoker, patternCompare
} from "./base"

export default class TriplePlusXMatcher implements IMatcher {

  verify(cards: Card[]): IPattern | null {
    if (cards.length >= 3 && cards.length <= 4) {

      const groups = groupBy(cards, (card: Card) => card.point).sort((grp1, grp2) => {
        return grp2.length - grp1.length
      })

      if (groups[0].length >= 3) {
        return {
          name: PatterNames.triplePlus2,
          score: groups[0][0].point,
          cards
        }
      }
      return null
    }
    return null
  }

  promptWithPattern(target, cards: Card[]): Card[][] {
    if (cards.length >= 5) {
      return []
    }

    const pattern = this.verify(cards)

    if (patternCompare(pattern, target) > 0) {
      return [cards]
    }
    return []
  }
}

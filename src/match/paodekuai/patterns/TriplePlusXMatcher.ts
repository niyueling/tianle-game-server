import Card from "../card";
import {groupBy, IMatcher, IPattern, PatterNames, patternCompare} from "./base";

// 最后3张带1
export default class TriplePlusXMatcher implements IMatcher {
  name: string = PatterNames.triplePlusX;
  verify(cards: Card[]): IPattern | null {
    if (cards.length >= 3 && cards.length <= 4) {
      const groups = groupBy(cards, (card: Card) => card.point).sort((grp1, grp2) => {
        return grp2.length - grp1.length
      })

      if (groups[0].length >= 3) {
        return {
          name: this.name,
          score: groups[0][0].point,
          cards
        }
      }
      return null
    }
    return null
  }

  promptWithPattern(target, cards: Card[]): Card[][] {
    if (target.name !== this.name || cards.length >= 5) {
      return []
    }
    const pattern = this.verify(cards)
    if (patternCompare(pattern, target) > 0) {
      return [cards]
    }
    return []
  }
}

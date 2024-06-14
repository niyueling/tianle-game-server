import Card from "../card";
import {
  arraySubtract,
  groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames
} from "./base";

// 3带2
export default class TriplePlus2Matcher implements IMatcher {
  name: string = PatterNames.triplePlus2;
  verify(cards: Card[]): IPattern | null {
    if ([4, 5].includes(cards.length)) {
      const groups = groupBy(cards, (card: Card) => card.point).sort((grp1, grp2) => {
        return grp2.length - grp1.length
      })
      console.warn("groups-%s", JSON.stringify(groups));
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
    if (target.name !== this.name || cards.length < 5) {
      return []
    }
    return groupBy(cards.filter(c => c.point > target.score), c => c.point)
      .filter(grp => grp.length === 3)
      .sort(lengthFirstThenPointGroupComparator)
      .map(group => {
        console.warn("group-%s", JSON.stringify(group));
        const triple = group.slice(0, 3)
        const leftCards = [].concat(...groupBy(arraySubtract(cards, triple), c => c.point)
          .sort(lengthFirstThenPointGroupComparator))
        const simpleCards = leftCards[0] === leftCards[1] ? leftCards : [leftCards[1]];


        return [...triple, ...simpleCards]
      })
  }
}

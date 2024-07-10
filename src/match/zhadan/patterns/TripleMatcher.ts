import Card from "../card";
import {groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames} from "./base";

export default class TripleMatcher implements IMatcher {
  verify(cards: Card[]): IPattern | null {
    if (cards.length === 3) {
      const sameCount = cards.filter(c => c.point === cards[0].point).length
      if (sameCount === 3) {
        return {
          name: PatterNames.triple,
          score: cards[0].point,
          cards
        }
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    return groupBy(cards.filter(c => c.point > target.score), card => card.point)
      .filter(g => g.length >= 3)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => {
        return [grp[0], grp[1], grp[2]]
      })
  }
}

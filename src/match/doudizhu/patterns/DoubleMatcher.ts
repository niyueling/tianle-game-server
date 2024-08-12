import Card from "../card";
import {
  groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames
} from "./base";

export default class DoubleMatcher implements IMatcher {
  name: string = PatterNames.double;
  // 出对子
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length === 2 && cards[0].point === cards[1].point) {
      return {
        name: this.name,
        score: cards[0].point,
        cards
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    if (target.name !== this.name) {
      return [];
    }
    return groupBy(cards.filter(c => c.point > target.score), card => card.point)
      .filter(g => g.length === 2)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => {
        return [grp[0], grp[1]]
      })
  }
}

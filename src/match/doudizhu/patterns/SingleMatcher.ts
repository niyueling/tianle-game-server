import Card from "../card";
import {groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames} from "./base";

export default class SingleMatcher implements IMatcher {
  name: string = PatterNames.single;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length === 1) {
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
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => [grp[0]])
  }
}

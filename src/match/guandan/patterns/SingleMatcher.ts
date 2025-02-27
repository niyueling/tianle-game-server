import Card, {CardType} from "../card";
import {groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames} from "./base";

export default class SingleMatcher implements IMatcher {
  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length === 1) {
      return {
        name: PatterNames.single,
        score: cards[0].point,
        cards
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[], levelCard?: Number): Card[][] {
    const prompts = groupBy(cards.filter(c => c.point > target.score), card => card.point)
    .filter(g => g.length < 4)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => [grp[0]]);

    return prompts.filter(g => g[0].type !== CardType.Heart || g[0].value !== levelCard);
  }
}

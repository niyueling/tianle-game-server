import Card from "../card";
import {groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames} from "./base";

export default class SingleMatcher implements IMatcher {
  verify(cards: Card[]): IPattern | null {
    if (cards.length === 1) {
      return {
        name: PatterNames.single,
        score: cards[0].point,
        cards
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    // 炸弹包括普通炸弹和王炸弹
    const haveBomb = groupBy(cards, card => card.point)
      .filter(g => g.length >= 4).length > 0 || cards.filter(c => c.point >= 16).length >= 4;

    const haveBombFilter = function (g: Card[]) {
      return g.length < 4 && g[0].point < 16
    }
    const noBombFilter = function (g: Card[]) {
      return g.length < 4;
    }
    const filterFun = haveBomb ? haveBombFilter : noBombFilter;

    return groupBy(cards.filter(c => c.point > target.score), card => card.point)
    .filter(filterFun)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => [grp[0]])
  }
}

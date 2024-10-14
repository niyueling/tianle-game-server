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
    const singleCards = groupBy(cards.filter(c => c.point > target.score), card => card.point)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => [grp[0]]);

    console.warn("singleCards %s", JSON.stringify(singleCards));

    // 如果有王炸， 过滤王炸
    const jokerCount = singleCards.filter(c => c[0].point === 16 || c[0].point === 17).length;
    if (jokerCount === 2) {
      const littleJokerIndex = singleCards.findIndex(c => c[0].point === 16);
      const bigJokerIndex = singleCards.findIndex(c => c[0].point === 17);
      singleCards.splice(littleJokerIndex, 1);
      singleCards.splice(bigJokerIndex, 1);
    }

    return singleCards;
  }
}

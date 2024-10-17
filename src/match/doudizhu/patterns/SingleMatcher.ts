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
      .filter(grp => grp.length < 4)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => [grp[0]]);

    // 如果有王炸， 过滤王炸
    const jokerCount = singleCards.filter(c => c[0].point === 16 || c[0].point === 17).length;
    // console.warn("singleCards %s jokerCount %s", JSON.stringify(singleCards), jokerCount);
    if (jokerCount === 2) {
      const littleJokerIndex = singleCards.findIndex(c => c[0].point === 16);
      singleCards.splice(littleJokerIndex, 1);
      const bigJokerIndex = singleCards.findIndex(c => c[0].point === 17);
      singleCards.splice(bigJokerIndex, 1);

      // console.warn("littleJokerIndex %s, bigJokerIndex %s singleCards %s", littleJokerIndex, bigJokerIndex, JSON.stringify(singleCards));
    }

    return singleCards;
  }
}

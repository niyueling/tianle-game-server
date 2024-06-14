import Card from "../card";
import {
  arraySubtract,
  groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames
} from "./base";

// 3带2
export default class TriplePlus2Matcher implements IMatcher {
  name: string = PatterNames.triplePlus2;
  verify(cards: Card[]): IPattern | null {
    if ([3, 4, 5].includes(cards.length)) {
      const groups = groupBy(cards, (card: Card) => card.point).sort((grp1, grp2) => {
        return grp2.length - grp1.length
      })
      // console.warn("groups-%s", JSON.stringify(groups));
      if (groups[0].length >= 3) {
        if (groups[0].length === 4 && groups[0][0].point === groups[0][3].point) {
          return null;
        }
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
    if (target.name !== this.name || cards.length < 3) {
      return []
    }
    return groupBy(cards.filter(c => c.point > target.score), c => c.point)
      .filter(grp => grp.length === 3)
      .sort(lengthFirstThenPointGroupComparator)
      .map(group => {
        // console.warn("cards-%s, group-%s", JSON.stringify(cards), JSON.stringify(group));
        const triple = group.slice(0, 3)
        const leftCards = [].concat(...groupBy(arraySubtract(cards, triple), c => c.point).sort(lengthFirstThenPointGroupComparator));
        let simpleCards = [];
        if (leftCards.length === 1) {
          simpleCards.push(leftCards[0]);
        }
        if (leftCards.length > 1) {
          leftCards[0] === leftCards[1] ? simpleCards = [...simpleCards, ...leftCards] : simpleCards.push(leftCards[0]);
        }


        return [...triple, ...simpleCards];
      })
  }
}

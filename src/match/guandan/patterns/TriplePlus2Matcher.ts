import Card from "../card";
import {
  arraySubtract,
  groupBy,
  IMatcher,
  IPattern,
  lengthFirstThenPointGroupComparator,
  lengthFirstThenPointXXGroupComparator,
  PatterNames,
} from "./base";

export default class TriplePlus2Matcher implements IMatcher {

  verify(cards: Card[]): IPattern | null {
    if (cards.length === 5) {

      const groups = groupBy(cards, (card: Card) => card.point).sort((grp1, grp2) => {
        return grp2.length - grp1.length
      })

      if (groups[0].length === 3 && groups[1].length === 2) {
        return {
          name: PatterNames.triplePlus2,
          score: groups[0][0].point,
          cards
        }
      }

      return null
    }
    return null
  }

  promptWithPattern(target, cards: Card[], levelCard?: Card): Card[][] {
    if (cards.length < 5) {
      return []
    }

     // 炸弹包括普通炸弹和王炸弹
    const haveBomb = groupBy(cards, card => card.point)
      .filter(g => g.length >= 4).length > 0 || cards.filter(c => c.point >= 16).length >= 4;

    const haveBombFilter = function (g: Card[]) {
      return g.length === 3 && g[0].point < 16
    }
    const noBombFilter = function (g: Card[]) {
      return g.length === 3
    }
    const filterFun = haveBomb ? haveBombFilter : noBombFilter;

    return groupBy(cards.filter(c => c.point > target.score), c => c.point)
      .filter(filterFun)
      .sort(lengthFirstThenPointGroupComparator)
      .map(group => {
        const triple = group.slice(0, 3);
        const leftCards = [].concat(...groupBy(arraySubtract(cards, triple), c => c.point).filter(g => g.length >= 2)
          .sort(lengthFirstThenPointXXGroupComparator))

        if (leftCards.length < 2) {
          // 可以选择返回一个空数组或null，或者执行其他逻辑
          console.warn("Not enough cards to form a valid 'three with a pair'");
          return [];
        }

        // console.warn("cards %s, triple %s, leftCards %s", JSON.stringify(cards), JSON.stringify(triple), JSON.stringify(leftCards));

        return [...triple, leftCards[0], leftCards[1]];
      }).filter(result => result.length > 0);  // 过滤掉空结果
  }
}

import Card from "../card";
import {
  arraySubtract,
  groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames
} from "./base";

// 3带2
export default class TriplePlus2Matcher implements IMatcher {
  name: string = PatterNames.triplePlus2;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length === 5) {
      const groups = groupBy(cards, (card: Card) => card.point).sort((grp1, grp2) => {
        return grp2.length - grp1.length
      })
      // console.warn("triple++ groups-%s", JSON.stringify(groups));
      if (groups[0].length === 3) {
        if (groups.length > 2) {
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
    if (target.name !== this.name || cards.length < 5) {
      return [];
    }

    // 假设groupBy和arraySubtract函数已经定义并可以正确使用
    const filteredCards = cards.filter(c => c.point > target.score);
    const groupedByPoint = groupBy(filteredCards, c => c.point);
    const triples = groupedByPoint.filter(grp => grp.length === 3).sort(lengthFirstThenPointGroupComparator);

    let results = [];
    for (const group of triples) {
      const triple = group.slice(0, 3);
      const remainingCards = arraySubtract(cards, triple);
      const leftGroupedByPoint = groupBy(remainingCards, c => c.point).filter(grp1 => grp1.length >= 2).sort(lengthFirstThenPointGroupComparator);
      console.warn("targetName-%s, name-%s, triple-%s, leftCards-%s", target.name, this.name, JSON.stringify(triple), JSON.stringify(leftGroupedByPoint));

      if (leftGroupedByPoint.length === 0) {
        // 如果没有足够的对子来匹配三个一组，则跳过当前的三张组合
        continue; // 使用continue来跳过当前循环的剩余部分
      }

      results.push([...triple, ...leftGroupedByPoint[0].slice(0, 2)]);
    }

    return results;
  }
}

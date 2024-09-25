import Card from "../card";
import {
  arraySubtract,
  groupBy,
  IMatcher,
  IPattern,
  lengthFirstThenPointGroupComparator,
  PatterNames,
  patternCompare
} from "./base";

// 3带1
export default class TriplePlusXMatcher implements IMatcher {
  name: string = PatterNames.triplePlusX;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length === 4) {
      const groups = groupBy(cards, (card: Card) => card.point).sort((grp1, grp2) => {
        return grp2.length - grp1.length
      })

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
    if (target.name !== this.name || cards.length < 4) {
      return []
    }

    const filteredCards = cards.filter(c => c.point > target.score);
    const groupedByPoint = groupBy(filteredCards, c => c.point);
    const triples = groupedByPoint.filter(grp => grp.length === 3).sort(lengthFirstThenPointGroupComparator);

    let results = [];
    for (const group of triples) {
      const triple = group.slice(0, 3);
      const remainingCards = arraySubtract(cards, triple);
      const leftGroupedByPoint = groupBy(remainingCards, c => c.point).filter(grp1 => grp1.length >= 1).sort(lengthFirstThenPointGroupComparator);
      console.warn("targetName-%s, name-%s, triple-%s, leftCards-%s", target.name, this.name, JSON.stringify(triple), JSON.stringify(leftGroupedByPoint));

      if (leftGroupedByPoint.length === 0) {
        // 如果没有足够的单张来匹配三个一组，则跳过当前的三张组合
        continue; // 使用continue来跳过当前循环的剩余部分
      }

      results.push([...triple, ...leftGroupedByPoint[0].slice(0, 1)]);
    }

    return results;
  }
}

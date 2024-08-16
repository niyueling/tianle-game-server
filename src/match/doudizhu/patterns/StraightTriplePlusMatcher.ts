import Card from "../card";
import Enums from "../enums"
import {
  arraySubtract,
  groupBy,
  IMatcher,
  IPattern,
  lengthFirstThenPointGroupComparator,
  PatterNames,
  patternCompare
} from "./base";

export default class StraightTriplePlusMatcher implements IMatcher {
  name: string = PatterNames.straightTriples;

  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    let pattern: IPattern = null
    if (cards.length >= 6) {
      const groups = groupBy(cards, (card: Card) => card.point)
        .filter(group => group.length >= 3 && group[0].point < Enums.c2.point)
        .sort((grp1, grp2) => {
          return grp1[0].point - grp2[0].point
        })
      let start = 0
      while (start < groups.length) {
        let prevGroup = groups[start].slice(0, 3)
        const stripes = [...prevGroup]
        for (let i = start + 1; i < groups.length; i++) {
          const currentGroup = groups[i].slice(0, 3)
          if (currentGroup[0].point - prevGroup[0].point === 1) {
            prevGroup = currentGroup
            stripes.push(...currentGroup)
            if (this.isFit(stripes, cards, allCards)) {
              const newPattern = {
                name: this.name + Math.round(stripes.length / 3),
                score: stripes[0].point,
                cards: [...stripes, ...arraySubtract(cards, stripes)]
              }
              if (this.isGreater(newPattern, pattern)) {
                pattern = newPattern
              }
            }
          } else {
            start = i - 1
            break;
          }
        }
        start++
      }
    }
    return pattern
  }

  promptWithPattern(target, cards: Card[]): Card[][] {
    if (!target.name.startsWith(this.name)) {
      return [];
    }

    const tripleLen = 2 * 3;

    const tripleGroups = groupBy(cards.filter(c => c.point > target.score && c.point < Enums.c2.point), c => c.point)
      .filter(grp => grp.length >= 3)
      .sort((g1, g2) => g1[0].point - g2[0].point);

    const prompts = [];

    let start = 0;
    while (start < tripleGroups.length) {
      const prompt = [...tripleGroups[start].slice(0, 3)];
      let prevGroup = tripleGroups[start];
      for (let i = start + 1; i < tripleGroups.length; i++) {
        const currentGroup = tripleGroups[i].slice(0, 3);

        if (currentGroup[0].point - prevGroup[0].point === 1) {
          prevGroup = currentGroup;
          prompt.push(...currentGroup);

          if (prompt.length === tripleLen) {
            break;
          }

          start = i - 1;
        }
      }

      start++;
    }

    return prompts;
  }

  private isGreater(p1: IPattern, p2: IPattern): boolean {
    if (p2 === null) {
      return true
    }

    const nameCompareResult = p1.name.localeCompare(p2.name)

    if (nameCompareResult === 0) {
      return p1.score > p2.score
    }

    return nameCompareResult > 0
  }

  private isFit(stripes: Card[], allCards: Card[], playerCards: Card[]): boolean {
    const nLeftCards = allCards.length - stripes.length;// 带出去的牌数
    // 带单张，则直接出牌成功
    return nLeftCards === 0;
  }
}

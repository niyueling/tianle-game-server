import Card from "../card";
import {
  arraySubtract, flatten, groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames,
} from "./base";

// 4带2
export default class QuadruplePlusTwo implements IMatcher {
  name: string = PatterNames.quadPlus2;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    // 四带2单张
    if (cards.length !== 6) {
      return null;
    }

    const groups = groupBy(cards, c => c.point)
    const quads = groups.filter(g => g.length === 4)
    if (quads.length === 1) {
      const quad = quads[0];
      const remainingCards = arraySubtract(cards, quad);

      // 检查剩余牌是否可以组成两对或四张单牌
      if (remainingCards.length === 2) {
        // 如果剩余2张，检查是否为一对
        return {
          name: this.name,
          score: quad[0].point,
          cards: [...quad, ...remainingCards]
        };
      }
    }

    return null;
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    if (target.name !== this.name || cards.length < 6) {
      return []
    }
    const sortedQuad = groupBy(cards, c => c.point)
      .filter(grp => grp.length === 4)
      .sort((grp1, grp2) => grp1[0].point - grp2[0].point)

    return sortedQuad
      .map(quad => {
        const reset = arraySubtract(cards, quad)
        const grps = groupBy(reset, c => c.point)
          .sort(lengthFirstThenPointGroupComparator)
        const two = flatten(grps.slice(0, 2)).slice(0, 2)
        return [...quad, ...two]
      })
      .filter(grp => {
        return this.verify(grp).score > target.score
      })
  }
}

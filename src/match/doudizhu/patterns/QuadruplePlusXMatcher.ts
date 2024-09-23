import Card from "../card";
import {
  arraySubtract, flatten, groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames,
} from "./base";

// 4带2
export default class QuadruplePlusXMatcher implements IMatcher {
  name: string = PatterNames.quadPlusX;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    // 四带二对子
    if (cards.length !== 8) {
      return null;
    }

    const groups = groupBy(cards, c => c.point)
    const quads = groups.filter(g => g.length === 4)
    if (quads.length === 1) {
      const quad = quads[0];
      const remainingCards = arraySubtract(cards, quad);

      // 检查剩余牌是否可以组成两对
      if (remainingCards.length === 4) {
        const pairs = groupBy(remainingCards, c => c.point).filter(g => g.length === 2);
        if (pairs.length === 2) {
          return {
            name: this.name,
            score: quad[0].point,
            cards: [...quad, ...remainingCards]
          };
        }
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
        const grps = groupBy(reset, c => c.point).filter(grp => grp.length === 2)
          .sort(lengthFirstThenPointGroupComparator);
        console.warn("grps %s", JSON.stringify(grps));
        if (grps.length >= 2) {
          // 选择任意两对
          const selectedPairs = grps.slice(0, 2);
          return [...quad, ...flatten(selectedPairs)]
        }

        return [];
      })
      .filter(grp => {
        return this.verify(grp).score > target.score
      })
  }
}

import Card from "../card";
import {
  arraySubtract, flatten, groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames
} from "./base";

// 4带3
export default class QuadruplePlusThree implements IMatcher {
  name: string = PatterNames.quadPlus3;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length !== 7) {
      return null
    }
    const groups = groupBy(cards, c => c.point)
    const quads = groups.filter(g => g.length === 4)
    if (quads.length === 1) {
      const quad = quads[0]
      const reset = arraySubtract(cards, quad)
      return {
        name: this.name,
        score: quads[0][0].point,
        cards: [...quad, ...reset]
      }
    }
    return null;
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    if (target.name !== this.name || cards.length < 7) {
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
        const three = flatten(grps.slice(0, 3)).slice(0, 3)
        return [...quad, ...three]
      })
      .filter(grp => {
        return this.verify(grp).score > target.score
      })
  }

}

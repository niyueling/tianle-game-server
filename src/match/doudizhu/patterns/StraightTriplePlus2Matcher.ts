import Card from "../card";
import Enums from "../enums"

import {
  arraySubtract,
  groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames
} from "./base";

// 飞机带翅膀 333444 5566
export default class StraightTriplePlus2Matcher implements IMatcher {
  name: string = PatterNames.straightTriplePlus2;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    let pattern: IPattern = null
    if (cards.length % 4 === 0) {
      const allTriplesLen = (cards.length / 4) * 3
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

            if (stripes.length === allTriplesLen) {
              pattern = {
                name: this.name + (allTriplesLen / 3),
                score: stripes[0].point,
                cards: [...stripes, ...arraySubtract(cards, stripes)]
              }
              break;
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

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    if (!target.name.startsWith(this.name) || target.cards.length > cards.length) {
      return [];
    }
    const triples = parseInt(target.name.replace('triples++_', ''), 10) || 0
    if (triples <= 1) {
      return [];
    }

    const tripleLen = triples * 3

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
            const leftCards = [].concat(...groupBy(arraySubtract(cards, prompt), card => card.point).sort(lengthFirstThenPointGroupComparator));
            prompts.push([...prompt, ...leftCards.slice(0, triples)]);
            break;
          } else {
            start = i - 1;
          }
        }
      }

      start++
    }

    return prompts
  }

}

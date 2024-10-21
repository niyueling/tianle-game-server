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
    const len = target.cards.length
    if (!target.name.startsWith(this.name) || target.cards.length > cards.length) {
      return [];
    }
    const triples = parseInt(target.name.replace('triples++_', ''), 10) || 0
    if (triples <= 1) {
      return [];
    }

    const groups = groupBy(
      cards.filter(c => c.point > target.score && c.point < Enums.c2.point),
      card => card.point)
      .filter(g => g.length >= 3)
      .sort((grp1, grp2) => {
        return grp1[0].point - grp2[0].point;
      })

    const prompts = [];
    for (let i = 0; i < groups.length;) {
      let prevCard = groups[i][0];
      const prompt = [...groups[i].slice(0, 3)];

      let j = i + 1;
      for (; j < groups.length; j++) {
        const nextCard = groups[j][0];
        if (nextCard.point - prevCard.point === 1) {
          prevCard = nextCard;
          prompt.push(...groups[j].slice(0, 3));
        } else {
          break;
        }
      }

      if (prompt.length >= len) {
        const leftCards = groupBy(arraySubtract(cards, prompt), card => card.point).filter(grp1 => grp1.length >= 1).sort(lengthFirstThenPointGroupComparator);
        if (leftCards.length >= prompt.length) {
          const carryCards = [];
          for (let h = 0; h < prompt.length; h++) {
            carryCards.push(...leftCards[i].slice(0, 1));
          }
          prompts.push([...prompt, ...carryCards]);
          i++;
          break;
        } else {
          // 判断是否可以少带出完
          const subtract = arraySubtract(cards, prompt);
          if (subtract.length < prompt.length) {
            prompts.push([...prompt, ...subtract]);
            i++;
            break;
          }
        }
      } else {
        i = j;
      }

    }

    return prompts;
  }

}

import Card from "../card";
import Enums from "../enums"
import {groupBy, IMatcher, IPattern, last, PatterNames} from "./base";

// 连对
export default class StraightDoublesMatcher implements IMatcher {
  name: string = PatterNames.doubles;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length >= 6 && cards.length % 2 === 0) {
      const sortedGroups = groupBy(cards.slice(), card => card.point)
        .sort((grp1, grp2) => {
          return grp1[0].point - grp2[0].point
        })

      if (last(sortedGroups)[0].point >= 15) return null;

      if (!sortedGroups.every(grp => grp.length === 2)) {
        return null
      }

      let prevGroup = sortedGroups[0]
      for (let i = 1; i < sortedGroups.length; i++) {
        const currentGroup = sortedGroups[i]
        if (currentGroup[0].point - prevGroup[0].point === 1) {
          prevGroup = currentGroup
        } else {
          return null
        }
      }
      return {
        name: this.name + sortedGroups.length,
        score: sortedGroups[0][0].point,
        cards
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    console.warn("target-%s", JSON.stringify(target));
    const len = target.cards.length
    if (!target.name.startsWith(this.name) || cards.length < len) {
      return []
    }

    const groups = groupBy(
      cards.filter(c => c.point > target.score && c.point < Enums.c2.point),
      card => card.point)
      .filter(g => g.length >= 2)
      .sort((grp1, grp2) => {
        return grp1[0].point - grp2[0].point;
      })

    const prompts = [];
    for (let i = 0; i < groups.length;) {
      let prevCard = groups[i][0];
      const prompt = [...groups[i].slice(0, 2)];

      let j = i + 1;
      for (; j < groups.length; j++) {
        const nextCard = groups[j][0];
        if (nextCard.point - prevCard.point === 1) {
          prevCard = nextCard;
          prompt.push(...groups[j].slice(0, 2));
          if (prompt.length === len) {
            break;
          }
        } else {
          break;
        }
      }

      if (prompt.length >= len) {
        i++
        prompts.push(prompt);
      } else {
        i = j;
      }

    }

    return prompts;
  }
}

import Card from "../card"
import Enums from "../enums"
import {groupBy, IMatcher, IPattern, last, PatterNames} from "./base"

export default class StraightTriplesMatcher implements IMatcher {
  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length >= 6 && cards.length % 3 === 0) {

      const sortedGroups = groupBy(cards.slice(), card => card.point)
        .sort((grp1, grp2) => {
          return grp1[0].point - grp2[0].point
        });
      let result = {
        name: PatterNames.triples + sortedGroups.length,
        score: sortedGroups[0][0].point,
        cards,
        level: sortedGroups.length
      }

      if (last(sortedGroups)[0].point > Enums.c1.point) {
        return null;
      }

      if (!sortedGroups.every(grp => grp.length === 3)) {
        return null;
      }

      let prevGroup = sortedGroups[0]
      for (let i = 1; i < sortedGroups.length; i++) {
        const currentGroup = sortedGroups[i]
        if (currentGroup[0].point - prevGroup[0].point === 1) {
          prevGroup = currentGroup
        } else {
          result = null;
        }
      }

      if (result) {
        return result;
      }

      const sortedGroupsByValue = groupBy(cards.slice(), card => card.value)
        .sort((grp1, grp2) => {
          return grp1[0].value - grp2[0].value
        });

      if (last(sortedGroupsByValue)[0].value > Enums.c13.value) {
        return null;
      }

      console.warn("sortedGroupsByValue %s", JSON.stringify(sortedGroupsByValue));

      let prevGroup1 = sortedGroupsByValue[0];
      for (let i = 1; i < sortedGroupsByValue.length; i++) {
        const currentGroup = sortedGroupsByValue[i];
        if (currentGroup[0].value - prevGroup1[0].value === 1) {
          prevGroup1 = currentGroup;
        } else {
          return null;
        }
      }

      return {
        name: PatterNames.triples + sortedGroupsByValue.length,
        score: sortedGroupsByValue[0][0].point,
        cards,
        level: sortedGroupsByValue.length
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[], levelCard?: Number): Card[][] {
    const len = target.cards.length;

    if (cards.length < len) {
      return [];
    }

    // 查找正常的钢板
    const groups = groupBy(
      cards.filter(c => c.point > target.score && c.point < Enums.c2.point),
      card => card.point)
      .filter(g => g.length === 3)
      .sort((grp1, grp2) => {
        return grp1[0].point - grp2[0].point
      })

    const prompts = []
    for (let i = 0; i < groups.length;) {
      let prevCard = groups[i][0]
      const prompt = [...groups[i].slice(0, 3)]

      let j = i + 1
      for (; j < groups.length; j++) {
        const nextCard = groups[j][0]
        if (nextCard.point - prevCard.point === 1) {
          prevCard = nextCard
          prompt.push(...groups[j].slice(0, 3))
          if (prompt.length === len) {
            break
          }
        } else {
          break
        }
      }

      if (prompt.length === len) {
        i++
        prompts.push(prompt)
      } else {
        i = j
      }
    }

    if (prompts.length) {
      return prompts;
    }

    // A最小的钢板
    const groupsByValue = groupBy(
      cards.filter(c => c.value > target.score && c.value <= Enums.c13.value),
      card => card.value)
      .filter(g => g.length === 3)
      .sort((grp1, grp2) => {
        return grp1[0].value - grp2[0].value
      })

    for (let i = 0; i < groupsByValue.length;) {
      let prevCard = groupsByValue[i][0]
      const prompt = [...groupsByValue[i].slice(0, 3)]

      let j = i + 1
      for (; j < groupsByValue.length; j++) {
        const nextCard = groupsByValue[j][0]
        if (nextCard.value - prevCard.value === 1) {
          prevCard = nextCard
          prompt.push(...groupsByValue[j].slice(0, 3))
          if (prompt.length === len) {
            break
          }
        } else {
          break
        }
      }

      if (prompt.length === len) {
        i++
        prompts.push(prompt)
      } else {
        i = j
      }
    }

    return prompts
  }
}

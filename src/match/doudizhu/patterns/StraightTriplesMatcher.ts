import Card from "../card";
import Enums from "../enums"
import {groupBy, IMatcher, IPattern, last, PatterNames} from "./base";

export default class StraightTriplesMatcher implements IMatcher {
  name: string = PatterNames.triples;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length >= 9 && cards.length % 3 === 0) {
      const sortedGroups = groupBy(cards.slice(), card => card.point)
        .sort((grp1, grp2) => {
          return grp1[0].point - grp2[0].point
        })

      if (last(sortedGroups)[0].point >= Enums.c2.point) return null

      if (!sortedGroups.every(grp => grp.length === 3)) {
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
    const len = target.cards.length
    if (!target.name.startsWith(this.name) || cards.length < len) {
      return []
    }

    const groups = groupBy(
      cards.filter(c => c.point > target.score && c.point < Enums.c2.point),
      card => card.point)
      .filter(g => g.length >= 3)
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
            break;
          }
        } else {
          break;
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

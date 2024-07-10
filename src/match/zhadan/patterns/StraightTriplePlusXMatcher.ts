import Card from "../card"
import Enums from "../enums"
import {
  arraySubtract,
  groupBy,
  IMatcher, IPattern, PatterNames, patternCompare
} from "./base"

export default class StraightTriplesPlusXMatcher implements IMatcher {

  constructor(private readonly desireLevel: number) {

  }

  verify(cards: Card[]): IPattern | null {
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

            if (this.isFit(stripes, cards)) {
              const newPattern = {
                name: PatterNames.straightTriplePlus2 + Math.round(stripes.length / 3),
                score: stripes[0].point,
                cards: [...stripes, ... arraySubtract(cards, stripes)],
                level: Math.round(stripes.length / 3)
              }

              if (this.isGreater(newPattern, pattern)) {
                pattern = newPattern
              }
            }
          } else {
            start = i - 1
            break
          }
        }

        start++
      }
    }
    return pattern
  }

  promptWithPattern(target, cards: Card[]): Card[][] {
    const foundPattern = this.verify(cards)
    if (this.verify(cards)) {
      if (patternCompare(foundPattern, target) > 0) {
        return [cards]
      }
    }

    return []
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

  private isFit(stripes: Card[], allCards: Card[]): boolean {
    const nLeftCards = allCards.length - stripes.length
    const nTriples = stripes.length / 3
    if (this.desireLevel !== 0 && nTriples !== this.desireLevel) {
      return false
    }

    return nLeftCards <= nTriples * 2
  }


}

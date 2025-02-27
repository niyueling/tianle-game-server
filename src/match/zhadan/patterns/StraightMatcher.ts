import Card from "../card"
import Enums from "../enums"
import {groupBy, IMatcher, IPattern, last, PatterNames, promptWithWildJoker, verifyWithJoker} from "./base"

export default class StraightMatcher implements IMatcher {

  verify(cards: Card[]): IPattern | null {
    if (cards.length >= 5) {
      const copyCards = cards.slice().sort(Card.compare)

      if (last(copyCards).point >= 15) return null

      let lastCard = copyCards[0]
      for (let i = 1; i < copyCards.length; i++) {
        const currentCard = copyCards[i]
        if (currentCard.point - lastCard.point === 1) {
          lastCard = currentCard
        } else {
          return null
        }
      }

      return {
        name: PatterNames.straight + copyCards.length,
        score: copyCards[0].point,
        cards,
        level: copyCards.length
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    const len = target.cards.length

    if (cards.length < len) {
      return []
    }

    const groups = groupBy(
      cards.filter(
        c => c.point > target.score && c.point < Enums.c2.point),
      c => c.point)
      .filter(g => g.length < 4)
      .sort((grp1, grp2) => grp1[0].point - grp2[0].point)

    const prompts = []
    for (let i = 0; i < groups.length;) {
      let prevCard = groups[i][0]
      const prompt = [prevCard]

      let j = i + 1
      for (; j < groups.length; j++) {
        const nextCard = groups[j][0];
        if (nextCard.point - prevCard.point === 1) {
          if (prompt.length < len || (prompt.length >= len && groups[j].length === 1)) {
            prevCard = nextCard;
            prompt.push(nextCard);
          } else {
            break;
          }
        } else {
          break;
        }
      }

      if (prompt.length >= len) {
        i++;
        prompts.push(prompt);
      } else {
        i = j;
      }
    }

    return prompts;
  }
}

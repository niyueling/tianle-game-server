import Card, {CardType} from "../card";
import {groupBy, IMatcher, IPattern, PatterNames} from "./base";

// noinspection JSUnusedLocalSymbols
function mustBeRealBomb(target, propKey: string, propDesc: PropertyDescriptor) {
  const originVerify = propDesc.value as   (cards: Card[]) => IPattern | null
  propDesc.value = function (cards: Card[]): IPattern | null {
    const pattern = originVerify.call(this, cards)
    if (!pattern) {
      return pattern
    }
    const normalCards = pattern.cards.filter(c => c.type !== CardType.Joker)
    if (normalCards.length <= 3 && normalCards.length !== 0) {
      return null
    }
    return pattern
  }
}

// function appendJokers(prototype, propKey: string, propDesc: PropertyDescriptor) {
//   const originVerify = propDesc.value as (target, cards: Card[]) => Card[][]
//   propDesc.value = function (target, cards: Card[]): Card[][] {
//     const prompts = originVerify.call(this, target, cards)
//
//     const jokers = cards.filter(c => c.type === CardType.Joker).sort(Card.compare)
//
//     const allBombs = groupBy(cards, c => c.point).filter(grp => grp.length >= 4)
//
//     if (jokers.length > 0) {
//       const promptsWithJokers = allBombs
//         .map(bomb => [...bomb, ...jokers])
//         .filter(newBomb => isGreaterThanPattern(newBomb, target))
//       return [...prompts, ...promptsWithJokers].sort((cs1, cs2) => this.verify(cs1).score - this.verify(cs2).score)
//     }
//
//     return prompts
//   }
// }

export default class BombMatcher implements IMatcher {
  name: string = PatterNames.bomb;
  // @mustBeRealBomb
  // @verifyWithJoker
  verify(cards: Card[]): IPattern | null {
    if (cards.length >= 4) {
      const firstCard = cards[0]
      const sameAsFirst = cards.filter(c => firstCard.point === c.point).length
      if (sameAsFirst === cards.length) {
        return {
          name: PatterNames.bomb,
          score: cards.length * 100 + cards[0].point,
          cards
        }
      }
    }

    if (cards.length === 4) {
      const jokers = cards.filter(c => c.type === CardType.Joker).length
      if (jokers === 4) {
        return {
          name: this.name,
          score: 1000,
          cards
        }
      }
    }

    return null
  }

  // @appendJokers
  promptWithPattern(target, cards: Card[]): Card[][] {
    if (target.name !== this.name) {
      return [];
    }
    return groupBy(cards, c => c.point)
      .filter(grp => grp.length >= 4)
      .sort((grp1, grp2) => {
        if (grp1.length !== grp2.length) {
          return grp1.length - grp2.length
        }
        return grp1[0].point - grp2[0].point
      })
      .filter(group => this.verify(group).score > target.score)
  }
}

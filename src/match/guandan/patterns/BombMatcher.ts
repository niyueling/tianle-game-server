import Card, {CardType} from "../card"
import Enums from '../enums'
import {groupBy, IMatcher, IPattern, PatterNames, patternCompare, verifyWithJoker} from "./base"

// noinspection JSUnusedLocalSymbols
function mustBeRealBomb(target, propKey: string, propDesc: PropertyDescriptor) {
  const originVerify = propDesc.value as (cards: Card[]) => IPattern | null

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

export default class BombMatcher implements IMatcher {

  @mustBeRealBomb
  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length >= 4) {
      const firstCard = cards[0]
      const sameAsFirst = cards.filter(c => firstCard.point === c.point).length
      if (sameAsFirst === cards.length) {
        return {
          name: PatterNames.bomb,
          score: cards.length * 100 + cards[0].point,
          cards,
          level: cards.length
        }
      }
    }

    if (cards.length === 4) {
      const jokers = cards.filter(c => c.type === CardType.Joker).length
      if (jokers === 4) {
        return {
          name: PatterNames.bomb,
          score: 1000,
          cards
        }
      }
    }
    if (cards.length === 5) {
      const jokers = cards.filter(c => c.type === CardType.Joker).length
      if (jokers === 5) {
        return {
          name: PatterNames.bomb,
          score: 2000,
          cards
        }
      }
    }
    if (cards.length === 6) {
      const jokers = cards.filter(c => c.type === CardType.Joker).length
      if (jokers === 6) {
        return {
          name: PatterNames.bomb,
          score: 3000,
          cards
        }
      }
    }

    return null
  }

  promptWithPattern(target, cards: Card[], levelCard?: Number): Card[][] {

    const minScore = target.name === PatterNames.bomb ? target.score : 0

    const normalBomb = groupBy(cards, c => c.point)
      .filter(grp => grp.length >= 4)
      .sort((grp1, grp2) => {
        if (grp1.length !== grp2.length) {
          return grp1.length - grp2.length
        }

        return grp1[0].point - grp2[0].point
      })
      .filter(group => this.verify(group, levelCard).score > minScore)

    const jockerCount = cards.filter(c => c.type === CardType.Joker).length;

    if (jockerCount === 4) {
      normalBomb.push(cards.filter(c => c.type === CardType.Joker));
    }

    return normalBomb
  }
}

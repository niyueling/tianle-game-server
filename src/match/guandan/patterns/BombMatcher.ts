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

function appendJokers(prototype, propKey: string, propDesc: PropertyDescriptor) {
  const originVerify = propDesc.value as (target, cards: Card[]) => Card[][]

  propDesc.value = function (target, cards: Card[]): Card[][] {
    const prompts = originVerify.call(this, target, cards)

    const jokers = cards.filter(c => c.type === CardType.Joker).sort(Card.compare)

    const allBombs = groupBy(cards.filter(c => c.type !== CardType.Joker), c => c.point).filter(grp => grp.length >= 4)

    if (jokers.length > 0) {
      const promptsWithJokers = allBombs
        .map(bomb => [...bomb, ...jokers])
        .filter(newBomb => patternCompare(this.verify(newBomb), target) > 0)

      return [...prompts, ...promptsWithJokers].sort((cs1, cs2) => this.verify(cs1).score - this.verify(cs2).score)
    }

    return prompts
  }
}

export default class BombMatcher implements IMatcher {

  @mustBeRealBomb
  @verifyWithJoker
  verify(cards: Card[]): IPattern | null {
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

  @appendJokers
  promptWithPattern(target, cards: Card[]): Card[][] {

    const minScore = target.name === PatterNames.bomb ? target.score : 0

    const normalBomb = groupBy(cards, c => c.point)
      .filter(grp => grp.length >= 4)
      .sort((grp1, grp2) => {
        if (grp1.length !== grp2.length) {
          return grp1.length - grp2.length
        }

        return grp1[0].point - grp2[0].point
      })
      .filter(group => this.verify(group).score > minScore)

    const jockerCount = cards.filter(c => c.type === CardType.Joker).length
    if (normalBomb.length === 1) { // 如果只有一个炸弹，并且有1-3个王的情况下
      if (jockerCount > 0 && jockerCount < 4) {
        // 带上王，防止烧机
        // normalBomb[0].push(...cards.filter(c => c.type === CardType.Joker));
        normalBomb.shift()
        return normalBomb;
      }
    }

    if (jockerCount >= 4) {
      normalBomb.push(cards.filter(c => c.type === CardType.Joker));
    }
      // if (cards.filter(c => c.point === 17).length === 2) {
      //   normalBomb.push([Enums.j1, Enums.j1, Enums.j2, Enums.j2])
      // }
      //
      // if (cards.filter(c => c.point === 17).length === 3) {
      //   normalBomb.push([Enums.j1, Enums.j2, Enums.j2, Enums.j2])
      // }
      // if (cards.filter(c => c.point === 16).length === 3) {
      //   normalBomb.push([Enums.j1, Enums.j1, Enums.j1, Enums.j2])
      // }
    // }
    // if (jockerCount === 5) {
    //   if (cards.filter(c => c.point === 17).length === 3) {
    //     normalBomb.push([Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2])
    //   } else {
    //     normalBomb.push([Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2])
    //   }
    // }
    // if (jockerCount === 6) {
    //   normalBomb.push([Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2])
    // }

    return normalBomb
  }
}

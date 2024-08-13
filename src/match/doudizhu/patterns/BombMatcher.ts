import Card, {CardType} from "../card";
import {groupBy, IMatcher, IPattern, PatterNames} from "./base";

export default class BombMatcher implements IMatcher {
  name: string = PatterNames.bomb;
  // @mustBeRealBomb
  // @verifyWithJoker
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length === 4) {
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

    if (cards.length === 2) {
      const jokers = cards.filter(c => c.type === CardType.Joker).length
      if (jokers === 2) {
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
    const bombs = groupBy(cards, c => c.point)
      .filter(grp => grp.length >= 4)
      .sort((grp1, grp2) => {
        if (grp1.length !== grp2.length) {
          return grp1.length - grp2.length
        }
        return grp1[0].point - grp2[0].point
      })
      .filter(group => this.verify(group).score > target.score);

    // 检查王炸
    const jokers = cards.filter(c => c.type === CardType.Joker);
    if (jokers.length === 2) {
      // 创建一个只包含王炸的数组（作为单个数组元素）
      bombs.push(jokers);
    }

    return bombs;
  }
}

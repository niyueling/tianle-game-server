import Card, {CardType} from "../card";
import {groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames} from "./base";

export default class TripleMatcher implements IMatcher {
  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length === 3) {
      const sameCount = cards.filter(c => c.point === cards[0].point).length;
      const cardIndex = cards.findIndex(c => c.type !== CardType.Heart || c.value !== levelCard);
      const doubleCount = cards.filter(c => c.point === cards[cardIndex].point).length;
      const caiShenCount = cards.filter(c => c.type === CardType.Heart && c.value === levelCard).length;
      // 三张或者单张+2癞子或者1癞子+对子
      if (sameCount === 3 || caiShenCount === 2 || (caiShenCount === 1 && doubleCount === 2)) {
        return {
          name: PatterNames.triple,
          score: cards[cardIndex].point,
          cards
        }
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[], levelCard?: Number): Card[][] {
    const prompts = groupBy(cards.filter(c => c.point > target.score), card => card.point)
      .filter(g => g.length === 3)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => {
        return [grp[0], grp[1], grp[2]]
      })

    if (prompts && prompts.length) {
      return prompts;
    }

    // 如果检测不到对子，则检测对子+红心级牌
    const cardIndex = cards.findIndex(c => c.type === CardType.Heart && c.value === levelCard);
    if (cardIndex === -1) {
      return [];
    }

    return groupBy(cards.filter(c => c.point > target.score), card => card.point)
      .filter(g => g.length > 1 && g.length < 4 && (g[0].value !== levelCard))
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => {
        console.warn("levelCard %s grp %s card %s", levelCard, JSON.stringify(grp), JSON.stringify(cards[cardIndex]));
        return [grp[0], grp[1], cards[cardIndex]]
      });
  }
}

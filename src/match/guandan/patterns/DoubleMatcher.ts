import Card, {CardType} from "../card";
import {groupBy, IMatcher, IPattern, lengthFirstThenPointGroupComparator, PatterNames} from "./base";

export default class DoubleMatcher implements IMatcher {

  verify(cards: Card[], levelCard?: Number): IPattern | null {
    // 对子或者单张带红心级牌
    if (cards.length === 2 && (cards[0].point === cards[1].point || (cards[0].type === CardType.Heart && cards[0].value === levelCard)
      || (cards[1].type === CardType.Heart && cards[1].value === levelCard))) {
      // 查找是否有非红心级牌
      const cardIndex = cards.findIndex(c => c.type !== CardType.Heart || c.value !== levelCard);

      return {
        name: PatterNames.double,
        score: cardIndex !== -1 ? cards[cardIndex].point : cards[0].point,
        cards
      }
    }
    return null
  }

  promptWithPattern(target: IPattern, cards: Card[], levelCard?: Number): Card[][] {
    if (cards.length < 2) {
      return [];
    }
    //是否有王炸
    let haveBomb = cards.filter(c => c.point >= 16).length === 4;

    const haveBombFilter = function (g: Card[]) {
      return g.length >= 2 && g.length < 4 && g[0].point < 16
    }
    const noBombFilter = function (g: Card[]) {
      return g.length >= 2 && g.length < 4
    }
    let filterFun = haveBomb ? haveBombFilter : noBombFilter;

    const prompts = groupBy(cards.filter(c => c.point > target.score), card => card.point)
      .filter(filterFun)
      .sort(lengthFirstThenPointGroupComparator)
      .map(grp => {
        return [grp[0], grp[1]]
      });

    if (prompts.length) {
      return prompts;
    }

    // 如果检测不到对子，则检测单张+红心级牌
    const cardIndex = cards.findIndex(c => c.type === CardType.Heart && c.value === levelCard);
    if (cardIndex === -1) {
      return [];
    }

     return groupBy(cards.filter(c => c.point > target.score), card => card.point)
       .filter(g => g.length === 1 && (g[0].type !== CardType.Heart || g[0].value !== levelCard))
       .sort(lengthFirstThenPointGroupComparator)
       .map(grp => {
         return [grp[0], cards[cardIndex]]
       });
  }
}

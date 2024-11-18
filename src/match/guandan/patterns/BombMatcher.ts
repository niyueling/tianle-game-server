import Card, {CardType} from "../card"
import {groupBy, IMatcher, IPattern, PatterNames} from "./base"

export default class BombMatcher implements IMatcher {

  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length >= 4) {
      const sortCards = cards.sort((grp1, grp2) => {
        return grp1.point - grp2.point
      });
      const firstCard = sortCards.find(c => c.type !== CardType.Heart || c.value !== levelCard);
      const sameAsFirst = sortCards.filter(c => firstCard.point === c.point).length;
      const caiShenCount = sortCards.filter(c => c.type === CardType.Heart && c.value === levelCard).length;
      // console.warn("sortCards %s firstCard %s sameAsFirst %s caiShenCount %s", JSON.stringify(sortCards), JSON.stringify(firstCard), sameAsFirst, caiShenCount);
      if (sameAsFirst === sortCards.length || sameAsFirst + caiShenCount === sortCards.length) {
        return {
          name: PatterNames.bomb,
          score: sortCards.length * 100 + sortCards[0].point,
          cards: sortCards,
          level: sortCards.length
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

    return null;
  }

  promptWithPattern(target, cards: Card[], levelCard?: Number): Card[][] {

    const minScore = target.name === PatterNames.bomb ? target.score : 0;
    const caiShen = cards.filter(c => c.type === CardType.Heart && c.value === levelCard);
    const haveLevelFilter = function (g: Card[]) {
      return g.length >= 4 - caiShen.length && (g.length < 4 && g[0].value !== levelCard)
    }
    const noLevelFilter = function (g: Card[]) {
      return g.length >= 4
    }
    const filterFun = caiShen.length ? haveLevelFilter : noLevelFilter;

    const normalBomb = groupBy(cards, c => c.point)
      .filter(filterFun)
      .sort((grp1, grp2) => {
        if (grp1.length !== grp2.length) {
          return grp1.length - grp2.length
        }

        return grp1[0].point - grp2[0].point
      })
      .filter(group => {
        if (caiShen.length) {
          group = [...group, ...caiShen];
        }

        return this.verify(group, levelCard).score > minScore;
      })

    for (let i = 0; i < normalBomb.length; i++) {
      if (caiShen.length && normalBomb[i].length < 4 && normalBomb[i][0].value !== levelCard) {
        normalBomb[i] = [...normalBomb[i], ...caiShen];
      }
    }

    const jockerCount = cards.filter(c => c.type === CardType.Joker).length;

    if (jockerCount === 4) {
      normalBomb.push(cards.filter(c => c.type === CardType.Joker));
    }

    return normalBomb;
  }
}

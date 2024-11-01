import Card, {CardType} from "../card";
import {
  arraySubtract,
  groupBy,
  IMatcher,
  IPattern, lengthFirstThenPointGroupAscComparator,
  lengthFirstThenPointGroupDescComparator,
  lengthFirstThenPointXXGroupComparator,
  PatterNames,
} from "./base";

export default class TriplePlus2Matcher implements IMatcher {

  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length === 5) {
      let groups = groupBy(cards, (card: Card) => card.point).sort((grp1, grp2) => {
        return grp2.length - grp1.length
      });

      if (groups[0].length === 3 && groups[1].length === 2) {
        return {
          name: PatterNames.triplePlus2,
          score: groups[0][0].point,
          cards
        }
      }

      // 计算红心级牌数量
      const caiShen = cards.filter(c => c.type === CardType.Heart && c.value === levelCard);
      if (!caiShen.length) {
        return null;
      }

      // 去除红心级牌
      const subtractCards = arraySubtract(cards.slice(), caiShen);

      // 根据新的数组分组
      groups = groupBy(subtractCards, (card: Card) => card.point).sort(lengthFirstThenPointGroupDescComparator);
      const prompts = [];

      if (groups.length > 2) {
        return null;
      }

      // 区分4种情况，剩下一个三张，剩下一个单张一个对子，剩下两个对子，剩下三带一
      if (groups.length === 1 && caiShen.length === 2) {
        prompts.push({
          name: PatterNames.triplePlus2,
          score: groups[0][0].point,
          cards: [...groups[0], ...caiShen]
        })
      }

      if (groups.length === 2 && caiShen.length === 2) {
        const maxCardIndex = groups[0][0].point > groups[1][0].point ? 0 : 1;
        const caiShenSlice = caiShen.slice();
        let caiShenCount = caiShenSlice.length;

        const addCount = 3 - groups[maxCardIndex].length;
        for (let i = 0; i < addCount; i++) {
          if (caiShenCount > 0) {
            groups[maxCardIndex].push(caiShenSlice[i]);
            caiShenCount--;
          }
        }

        if (caiShenCount > 0) {
          const addCount = 2 - groups[1 - maxCardIndex].length;
          for (let i = 0; i < addCount; i++) {
            groups[1 - maxCardIndex].push(caiShenSlice[i]);
            caiShenSlice.splice(i, 1);
          }
        }

        prompts.push({
          name: PatterNames.triplePlus2,
          score: groups[maxCardIndex][0].point,
          cards: groups
        })
      }

      if (groups.length === 2 && caiShen.length === 1 && groups[0].length === 2) {
        const maxCardIndex = groups[0][0].point > groups[1][0].point ? 0 : 1;
        const caiShenSlice = caiShen.slice();

        if (caiShenSlice.length > 0) {
          groups[maxCardIndex].push(caiShenSlice[0]);
          caiShenSlice.splice(0, 1);
        }

        prompts.push({
          name: PatterNames.triplePlus2,
          score: groups[maxCardIndex][0].point,
          cards: groups
        })
      }

      if (groups.length === 2 && caiShen.length === 1 && (groups[0].length === 3 || groups[1].length === 3)) {
        const maxCardIndex = groups[0].length === 3 ? 1 : 0;
        const caiShenSlice = caiShen.slice();

        if (caiShenSlice.length > 0) {
          groups[maxCardIndex].push(caiShenSlice[0]);
        }

        prompts.push({
          name: PatterNames.triplePlus2,
          score: groups[1 - maxCardIndex][0].point,
          cards: groups
        })
      }

      if (!prompts.length) {
        return null;
      }

      // console.warn("triplePlus2 verify prompts %s", JSON.stringify(prompts));

      // 计算分数最大的情况返回
      let maxInfo = prompts[0];
      for (let i = 1; i < prompts.length; i++) {
        if (prompts[i].score > maxInfo.score) {
          maxInfo = prompts[i];
        }
      }

      return maxInfo;
    }

    return null;
  }

  promptWithPattern(target, cards: Card[], levelCard?: Number): Card[][] {
    if (cards.length < 5) {
      return []
    }

    // 计算红心级牌数量
    const caiShen = cards.filter(c => c.type === CardType.Heart && c.value === levelCard);

    const haveLevelFilter = function (g: Card[]) {
      return g.length >= 3 - caiShen.length && g.length < 4 && g[0].value !== levelCard
    }
    const noLevelFilter = function (g: Card[]) {
      return g.length === 3
    }
    const filterFun = caiShen.length ? haveLevelFilter : noLevelFilter;

    const prompts = groupBy(cards.filter(c => c.point > target.score), c => c.point)
      .filter(filterFun)
      .sort(lengthFirstThenPointGroupAscComparator)
      .map(group => {
        const triple = (group.length >= 3 ? group.slice(0, 3): group);
        const addCount = 3 - triple.length;
        const caiShenSlice = caiShen.slice();

        if (caiShenSlice.length >= addCount) {
          for (let i = 0; i < addCount; i++) {
            triple.push(caiShenSlice[i]);
          }
        }

        // console.warn("tripleCount %s addCount %s triple %s", triple.length, addCount, JSON.stringify(triple));

        const leftCards = [].concat(...groupBy(arraySubtract(cards, triple), c => c.point).filter(g => g.length >= 2)
          .sort(lengthFirstThenPointXXGroupComparator))

        if (leftCards.length < 2) {
          // 可以选择返回一个空数组或null，或者执行其他逻辑
          console.warn("Not enough cards to form a valid 'three with a pair'");
          return [];
        }

        return [...triple, leftCards[0], leftCards[1]];
      }).filter(result => result.length > 0);

    console.warn("triplePlus2 promptWithPattern prompts %s", JSON.stringify(prompts));

    return prompts;
  }
}

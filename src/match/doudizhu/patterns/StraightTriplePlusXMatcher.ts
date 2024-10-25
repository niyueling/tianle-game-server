import Card from "../card";
import Enums from "../enums"
import {
  arraySubtract,
  groupBy,
  IMatcher,
  IPattern,
  lengthFirstThenPointGroupComparator,
  PatterNames,
  patternCompare
} from "./base";

export default class StraightTriplesPlusXMatcher implements IMatcher {
  name: string = PatterNames.straightTriplePlusX;

  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
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
            if (this.isFit(stripes, cards, allCards)) {
              const newPattern = {
                name: this.name + Math.round(stripes.length / 3),
                score: stripes[0].point,
                cards: [...stripes, ...arraySubtract(cards, stripes)]
              }
              if (this.isGreater(newPattern, pattern)) {
                pattern = newPattern
              }
            }
          } else {
            start = i - 1
            break;
          }
        }
        start++
      }
    }
    return pattern
  }

  promptWithPattern(target, cards: Card[]): Card[][] {
    if (!target.name.startsWith(this.name)) {
      return [];
    }

    const triples = parseInt(target.name.replace('triplesX_', ''), 10) || 0
    if (triples <= 1) {
      return [];
    }

    const groups = groupBy(
      cards.filter(c => c.point > target.score && c.point < Enums.c2.point),
      card => card.point)
      .filter(g => g.length >= 3)
      .sort((grp1, grp2) => {
        return grp1[0].point - grp2[0].point;
      })

    const prompts = [];
    for (let i = 0; i < groups.length;) {
      let prevCard = groups[i][0];
      const prompt = [...groups[i].slice(0, 3)];

      let j = i + 1;
      for (; j < groups.length; j++) {
        const nextCard = groups[j][0];
        if (nextCard.point - prevCard.point === 1) {
          prevCard = nextCard;
          prompt.push(...groups[j].slice(0, 3));
        } else {
          break;
        }
      }

      const len = prompt.length / 3;
      console.warn("prompt %s straightTripleCount %s len %s", JSON.stringify(prompt), triples * 3, len);

      if (prompt.length >= triples * 3) {
        const leftCards = groupBy(arraySubtract(cards, prompt), card => card.point).filter(grp1 => grp1.length >= 2).sort(lengthFirstThenPointGroupComparator);
        if (leftCards.length >= len) {
          const carryCards = [];
          for (let h = 0; h < len; h++) {
            carryCards.push(...leftCards[h].slice(0, 2));
          }
          prompts.push([...prompt, ...carryCards]);
          i++;
          break;
        }
      } else {
        i = j;
      }
    }

    console.warn("straightTriplePrompts %s", JSON.stringify(prompts));

    return prompts;
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

  private isFit(stripes: Card[], allCards: Card[], playerCards: Card[]): boolean {
    const nLeftCards = allCards.length - stripes.length;// 带出去的牌数
    const nTriples = stripes.length / 3; // 飞机连续的数量
    const residueCards = this.filterCards(allCards, stripes);

    // 检查是否符合带牌都为对子
    if (nLeftCards === nTriples * 2) {
      return this.areAllPairs(residueCards);
    }

    return false;
  }

  private areAllPairs(cards: Card[]): boolean {
    // 使用一个Map来记录每个point出现的次数
    const pointCounts = new Map<number, number>();

    // 遍历每张牌，更新point的计数
    for (const card of cards) {
      const count = pointCounts.get(card.point) || 0;
      pointCounts.set(card.point, count + 1);
    }

    // 检查每个point的计数是否都是偶数
    for (const count of pointCounts.values()) {
      if (count % 2 !== 0) {
        // 如果存在奇数计数的point，则不能全部组成对子
        return false;
      }
    }

    // 如果没有奇数计数的point，则可以全部组成对子
    return true;
  }

  private filterCards(allCards: Card[], stripes: Card[]): Card[] {
    return allCards.filter(card => {
      return !stripes.find(stripe =>
        stripe.type === card.type &&
        stripe.value === card.value &&
        stripe.point === card.point
      );
    });
  }
}

import Card, {CardTag, CardType} from "./card";
import {arraySubtract, groupBy, IMatcher, IPattern, PatterNames} from "./patterns/base";
import BombMatcher from "./patterns/BombMatcher";
import DoubleMatcher from "./patterns/DoubleMatcher";
import QuadruplePlusTwo from "./patterns/QuadruplePlusTwo";
import QuadruplePlusXMatcher from "./patterns/QuadruplePlusXMatcher";
import SingleMatcher from "./patterns/SingleMatcher";
import StraightDoublesMatcher from "./patterns/StraightDoublesMatcher";
import StraightMatcher from "./patterns/StraightMatcher";
import StraightTriplePlus2Matcher from "./patterns/StraightTriplePlus2Matcher";
import TriplePlus2Matcher from "./patterns/TriplePlus2Matcher";
import Rule from "./Rule";
import StraightTriplesPlusXMatcher from "./patterns/StraightTriplePlusXMatcher";
import StraightTriplePlusMatcher from "./patterns/StraightTriplePlusMatcher";
import TripleMatcher from "./patterns/TripleMatcher";
import TriplePlusXMatcher from "./patterns/TriplePlusXMatcher";

const nameOrder = {
  'triplesX_2': 1,
  'triples++_2': 2,
  triples: 3,
  doubles_: 4,
  straight_: 5,
  'triple++': 6,
  tripleX: 7,
  triple: 8,
  double: 10,
  single: 9,
  bomb: 11
}

// 第一次出牌顺序
const firstCardPatternOrder = [
  {
    // 3带1
    name: PatterNames.triplePlusX,
    score: 0,
    cards: [],
  },
  {
    // 顺子(5)
    name: PatterNames.straight,
    score: 0,
    cards:  Array.from({ length: 5 }),
  },
  {
    // 飞机带翅膀
    name: PatterNames.straightTriplePlus2 + '2',
    score: 0,
    cards:  Array.from({ length: 8 }),
  },
  {
    // 连对(6张)
    name: PatterNames.doubles,
    score: 0,
    cards:  Array.from({ length: 6 }),
  },
  {
    // 飞机带对子
    name: PatterNames.straightTriplePlusX + '2',
    score: 0,
    cards:  Array.from({ length: 10 }),
  },
  {
    // 3带2
    name: PatterNames.triplePlus2,
    score: 0,
    cards:  Array.from({ length: 5 }),
  },
  {
    // 飞机不带
    name: PatterNames.straightTriples,
    score: 0,
    cards: [],
  },
  {
    // 3张不带
    name: PatterNames.triple,
    score: 0,
    cards: [],
  },
  {
    // 对子
    name: PatterNames.double,
    score: 0,
    cards: [],
  },
  {
    // 单张
    name: PatterNames.single,
    score: 0,
    cards: [],
  },
  {
    // 炸弹
    name: PatterNames.bomb,
    score: 0,
    cards: [],
  },
]

// 出牌规则
export class PlayManager {
  // 规则
  private rule: Rule;
  // 禁止出的牌型
  noPattern: Array<(playCard: Card[], remainCard: Card[]) => boolean>;
  private allowPattern: IMatcher[];

  // 炸弹牌型
  private boomPattern: IMatcher[];
  constructor(rule: Rule) {
    this.rule = rule;
    this.buildNoPattern();
    this.buildAllowPattern();
  }

  // 是否允许出牌
  isAllowPlayCard(playCard: Card[], remainCard: Card[]) {
    if (this.noPattern.length > 0) {
      for (const checker of this.noPattern) {
        const isOk = checker(playCard, remainCard);
        if (!isOk) {
          // 有禁止出的牌
          return false;
        }
      }
    }
    return true;
  }

  // 获取出牌的牌型
  getPatternByCard(playCard: Card[], remainCard: Card[]) {
    for (const matcher of this.allowPattern) {
      const pattern = matcher.verify(playCard, remainCard)
      if (pattern) return pattern
    }
    // 没有找到出牌的牌型
    return null;
  }

  // 根据牌型查找相同牌
  getCardByPattern(pattern: IPattern, remainCards: Card[], mode, lastPlayerMode): Card[][] {
    // 如果本轮轮到自己出牌
    if (!pattern) {
      const cards = this.firstPlayCard(remainCards);
      return [cards];
    }

    const prompts = [];
    for (const matcher of this.allowPattern) {
      const result = matcher.promptWithPattern(pattern, remainCards);
      if (result.length > 0) {
        // 如果上一个出牌的是队友，并且队友出炸弹，则不吃
        if (pattern.name === PatterNames.bomb && mode === lastPlayerMode) {
          continue;
        }

        prompts.push(...result);
      }
    }
    // 上一个不是队友，并且没有相同牌型可吃，可以出炸
    if (pattern.name !== PatterNames.bomb && mode !== lastPlayerMode) {
      for (const matcher of this.boomPattern) {
        const result = matcher.promptWithPattern({ name: PatterNames.bomb, score: 0, cards: null }, remainCards);
        if (result.length > 0) {
          prompts.push(...result);
        }
      }
    }

    // 如果上家不是队友打出大牌，则必吃牌。
    if (mode === lastPlayerMode) {
      return this.checkCardIsTeamMate(prompts, remainCards);
    }

    return prompts;
  }

  // 判断用户是否能吃牌
  getPlayerCardByPattern(pattern: IPattern, remainCards: Card[]): Card[][] {
    // 如果本轮轮到自己出牌
    if (!pattern) {
      const cards = this.firstPlayCard(remainCards);
      return [cards];
    }

    const prompts = [];
    for (const matcher of this.allowPattern) {
      const result = matcher.promptWithPattern(pattern, remainCards);
      if (result.length > 0) {
        prompts.push(...result);
      }
    }
    // 上一个不是队友，并且没有相同牌型可吃，可以出炸
    if (pattern.name !== PatterNames.bomb) {
      for (const matcher of this.boomPattern) {
        const result = matcher.promptWithPattern({ name: PatterNames.bomb, score: 0, cards: null }, remainCards);
        if (result.length > 0) {
          prompts.push(...result);
        }
      }
    }

    return prompts;
  }

  // 如果是队友打的K以上大牌，则放弃吃牌
  checkCardIsTeamMate(prompts, remainCards) {
    const possibles = [];
    for (let i = 0; i < prompts.length; i++) {
      const cards = prompts[i];

      // 判断吃这个牌后游戏是否能结束
      const remainingCardsCopy = remainCards.slice();
      const remainingCardsSlice = arraySubtract(remainingCardsCopy, cards);

      console.warn("remainingCardsCopy %s remainingCardsSlice %s point %s", remainingCardsCopy.length, remainingCardsSlice.length, cards[0].point);

      if (cards[0].point < CardTag.hk || remainingCardsSlice.length === 0) {
        possibles.push(cards);
      }
    }

    return possibles;
  }

  // 允许出牌的牌型
  buildAllowPattern() {
    // 添加基本牌型
    this.allowPattern = [
      new TriplePlusXMatcher(), // 三带一
      new StraightMatcher(), // 顺子
      new StraightTriplePlus2Matcher(), // 飞机+2单张
      new StraightDoublesMatcher(), // 连对
      new StraightTriplesPlusXMatcher(), // 飞机+2对子
      new TriplePlus2Matcher(), // 三带二
      new StraightTriplePlusMatcher(), // 飞机不带
      new TripleMatcher(), // 三张不带
      new SingleMatcher(),// 单张
      new DoubleMatcher(), // 对子
      new QuadruplePlusTwo(), // 4带二
      new QuadruplePlusXMatcher(), // 4带二对
      new BombMatcher(), // 炸弹
    ];
    this.boomPattern = [ new BombMatcher() ];
  }

  buildNoPattern() {
    this.noPattern = [];
  }

  // 过滤牌
  excludeCard(target: Card[], source: Card[]) {
    for (const t of target) {
      for (let i = 0; i < source.length; i++) {
        if (t.equal(source[i])) {
          source.splice(i, 1);
          break;
        }
      }
    }
  }

  // 获取第一次出的牌
  firstPlayCard(cards: Card[]) {
    let res;
    let remain;
    let allPossibles = [];
    // const sortFirstCardPatternOrder = this.shuffleArray(firstCardPatternOrder);
    for (const p of firstCardPatternOrder) {
      for (const allowPattern of this.allowPattern) {
        res = allowPattern.promptWithPattern(p as IPattern, cards);
        for (let i = 0; i < res.length; i++) {
          remain = cards.slice();
          this.excludeCard(res[0], remain);
          if (this.isAllowPlayCard(res[0], remain) && this.checkCardIsBomb(cards.slice(), res[0])) {
            const patternSimpleCount = this.getCardSimpleCount(cards.slice(), res[0]);
            allPossibles.push({simpleCount: patternSimpleCount, name: p.name, data: res[0]});
          }
        }
      }
    }

    if (allPossibles.length > 0) {
      return this.getPossibleResultCard(allPossibles);
    }

    // 没有牌能出
    return [];
  }

  checkCardIsBomb(cards: Card[], chooseCards: Card[]) {
    let flag = true;
    let isBoom = false;
    const card = chooseCards[0];

    if (card.type !== CardType.Joker) {
      const valueCount = chooseCards.filter(c => c.point === card.point).length;
      if (chooseCards.length === 4 && valueCount === 4) {
        return true;
      }
    }

    if (card.type === CardType.Joker) {
      const valueCount = chooseCards.filter(c => c.type === CardType.Joker).length;
      if (chooseCards.length === 2 && valueCount === 2) {
        return true;
      }
    }

    for (let i = 0; i < chooseCards.length; i++) {
      const card = chooseCards[i];

      if (card.type !== CardType.Joker) {
        const valueCount = cards.filter(c => c.point === card.point).length;
        if (valueCount === 4) {
          flag = false;
          break;
        }
      }

      if (card.type === CardType.Joker) {
        const valueCount = cards.filter(c => c.type === CardType.Joker).length;
        if (valueCount === 2) {
          flag = false;
          break;
        }
      }
    }

    return flag;
  }

  // 从所有出牌选择单牌最少的选择
  getPossibleResultCard(allPossibles) {
    const bestPlay = this.findBestFirstPlay(allPossibles);
    if (bestPlay) {
      console.warn("bestPlay %s", JSON.stringify(bestPlay));
      return bestPlay.data; // 返回单张数量最少的牌型
    }

    return [];
  }

  // 自定义排序函数
  compareNames(a: { name: string }, b: { name: string }): number {
    // 从映射中获取排序值，如果某个name不在映射中，则给它一个很大的值以确保它排在最后
    const orderA = nameOrder[a.name] || Number.MAX_SAFE_INTEGER;
    const orderB = nameOrder[b.name] || Number.MAX_SAFE_INTEGER;

    // 返回排序值的比较结果
    return orderA - orderB;
  }

  findBestFirstPlay(allPossibles: { simpleCount: number, name: string, data: Card[] }[]): { simpleCount: number, name: string, data: Card[] } | undefined {
    if (allPossibles.length === 0) {
      console.warn("allPossibles is empty");
      return undefined; // 没有可用的牌型
    }

    // 首先找到simpleCount最小的值
    const minSimpleCount = Math.min(...allPossibles.map(p => p.simpleCount));

    // 然后筛选出所有simpleCount等于最小值的元素
    const bestPlays = allPossibles.filter(p => p.simpleCount === minSimpleCount);

    // 根据name进行排序
    bestPlays.sort(this.compareNames);

    // 取第一个
    return bestPlays[0]; // 返回第一个单牌数量最少且按name排序的牌型
  }

  getCardSimpleCount(cards: Card[], chooseCards: Card[]) {
    const residueCards = arraySubtract(cards, chooseCards);
    return groupBy(residueCards.filter(c => c.point <= CardTag.hk), card => card.point)
      .filter(g => g.length === 1).length;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]]; // 使用ES6的数组解构来交换元素
    }
    return array;
  }
}

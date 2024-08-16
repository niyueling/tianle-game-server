import Card, {CardTag} from "./card";
import {
  arraySubtract,
  groupBy,
  IMatcher,
  IPattern,
  lengthFirstThenPointGroupComparator,
  PatterNames
} from "./patterns/base";
import BombMatcher from "./patterns/BombMatcher";
import DoubleMatcher from "./patterns/DoubleMatcher";
import QuadruplePlusTwo from "./patterns/QuadruplePlusTwo";
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
    // 3带2
    name: PatterNames.triplePlus2,
    score: 0,
    cards:  Array.from({ length: 5 }),
  },
  {
    // 单张
    name: PatterNames.single,
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
  getCardByPattern(pattern: IPattern, remainCards: Card[]): Card[][] {
    // 如果本轮轮到自己出牌，默认出单张

    if (!pattern) {
      const cards = this.firstPlayCard(remainCards);
      return [cards];
    }

    const prompts = [];
    for (const matcher of this.allowPattern) {
      const result = matcher.promptWithPattern(pattern, remainCards);
      if (result.length > 0) {
        prompts.push(...result);
        break;
      }
    }
    // 没有相同牌型，可以出炸
    if (pattern.name !== PatterNames.bomb) {
      for (const matcher of this.boomPattern) {
        const result = matcher.promptWithPattern({ name: PatterNames.bomb, score: 0, cards: null }, remainCards);
        if (result.length > 0) {
          prompts.push(...result);
          break;
        }
      }
    }
    return prompts;
  }

  // 允许出牌的牌型
  buildAllowPattern() {
    // 添加基本牌型
    this.allowPattern = [
      new SingleMatcher(),// 单张
      new DoubleMatcher(), // 对子
      new StraightMatcher(), // 顺子
      new StraightDoublesMatcher(), // 连对
      new StraightTriplePlusMatcher(), // 飞机不带
      new StraightTriplePlus2Matcher(), // 飞机+2单张
      new StraightTriplesPlusXMatcher(), // 飞机+2对子
      new TripleMatcher(), // 三张不带
      new TriplePlusXMatcher(), // 三带一
      new TriplePlus2Matcher(), // 三带二
      new QuadruplePlusTwo(), // 4带二
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
          if (this.isAllowPlayCard(res[0], remain)) {
            allPossibles.push(res[0]);
          }
        }
      }
    }

    if (allPossibles.length > 0) {
      console.warn("allPossibles-%s", JSON.stringify(allPossibles));
      return allPossibles[0];
    }

    // 没有牌能出
    return [];
  }

  getCardSimpleCount(cards: Card[], chooseCards: Card[]) {
    const residueCards = arraySubtract(cards, chooseCards);
    return groupBy(residueCards.filter(c => c.point <= CardTag.hk), card => card.point)
      .filter(g => g.length === 1)
      .sort(lengthFirstThenPointGroupComparator).length;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]]; // 使用ES6的数组解构来交换元素
    }
    return array;
  }
}

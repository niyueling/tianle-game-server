import Card from "./card";
import {IMatcher, IPattern, PatterNames} from "./patterns/base";
import BombMatcher from "./patterns/BombMatcher";
import DoubleMatcher from "./patterns/DoubleMatcher";
import QuadruplePlusThree from "./patterns/QuadruplePlusThree";
import QuadruplePlusTwo from "./patterns/QuadruplePlusTwo";
import SingleMatcher from "./patterns/SingleMatcher";
import StraightDoublesMatcher from "./patterns/StraightDoublesMatcher";
import StraightMatcher from "./patterns/StraightMatcher";
import StraightTriplePlus2Matcher from "./patterns/StraightTriplePlus2Matcher";
import TripleABomb from "./patterns/TripleABomb";
import TriplePlus2Matcher from "./patterns/TriplePlus2Matcher";
import TriplePlusXMatcher from "./patterns/TriplePlusXMatcher";
import Rule from "./Rule";

// 第一次出牌顺序
const firstCardPatternOrder = [
  {
    // 飞机带翅膀
    name: PatterNames.straightTriplePlus2 + '2',
    score: 0,
    cards:  Array.from({ length: 8 }),
  },
  {
    // 连对(4张)
    name: PatterNames.doubles,
    score: 0,
    cards:  Array.from({ length: 4 }),
  },
  {
    // 顺子(5)
    name: PatterNames.straight,
    score: 0,
    cards:  Array.from({ length: 5 }),
  },
  {
    // 3带2
    name: PatterNames.triplePlus2,
    score: 0,
    cards:  Array.from({ length: 5 }),
  },
  {
    // 3带0, 1
    name: PatterNames.triplePlusX,
    score: 0,
    cards: [],
  },
  {
    // 4带2
    name: PatterNames.quadPlus2,
    score: 0,
    cards: [],
  },
  {
    // 4带3
    name: PatterNames.quadPlus3,
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
  {
    // aaa 炸弹
    name: PatterNames.bomb,
    score: 413,
    cards: [],
  },
]

// 出牌规则
export class PlayManager {
  // 规则
  private rule: Rule;
  // 禁止出的牌型
  private noPattern: Array<(playCard: Card[], remainCard: Card[]) => boolean>;
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
      const pattern = matcher.verify(playCard)
      if (pattern) return pattern
    }
    if (playCard.length === remainCard.length && this.rule.lastTriplePlusX) {
      // 检查是不是最后少带的牌型
      const matcher =  new TriplePlusXMatcher();
      const pattern = matcher.verify(playCard);
      if (pattern) {
        return pattern;
      }
    }
    // 没有找到出牌的牌型
    return null;
  }

  // 根据牌型查找相同牌
  getCardByPattern(pattern: IPattern, remainCards: Card[]): Card[][] {
    // 如果本轮轮到自己出牌，默认出单张
    const cards = this.firstPlayCard(remainCards);
    if (!pattern) return [cards[0]];

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
      new SingleMatcher(),
      new DoubleMatcher(),
      new StraightMatcher(),
      new StraightDoublesMatcher(),
      new StraightTriplePlus2Matcher(),
      new TriplePlus2Matcher(),
      new BombMatcher(),
    ];
    this.boomPattern = [ new BombMatcher() ];
    // 3个A
    if (this.rule.boom3A) {
      this.allowPattern.push(new TripleABomb());
      this.boomPattern.push(new TripleABomb());
    }
    if (this.rule.boomPlus3) {
      this.allowPattern.push(new QuadruplePlusThree());
    }
    if (this.rule.boomPlus2) {
      this.allowPattern.push(new QuadruplePlusTwo());
    }
    if (this.rule.triplePlusX) {
      // 3张可以少带
      this.allowPattern.push(new TriplePlusXMatcher());
    }
  }

  buildNoPattern() {
    this.noPattern = [];
    if (this.rule.noSingleBoomCard) {
      this.noPattern.push(this.noSingleBoomCard.bind(this));
    }
  }

  // 不能拆炸
  noSingleBoomCard(playCard: Card[], remainCard: Card[]) {
    const remainGroup = this.groupByValue(remainCard);
    const playGroup = this.groupByValue(playCard);
    for (const value of Object.keys(playGroup)) {
      if (value === '1') {
        // A只有3张,且要为炸
        if (this.rule.boom3A) {
          // 3个A当炸
          if (remainGroup[value].length === 3 && playGroup[value].length !== 3) {
            // 有A炸且没有一起出
            return false;
          }
        }
      } else {
        if (remainGroup[value].length === 4 && playGroup[value].length !== 4) {
          // 有炸,没一起出
          return false;
        }
      }
    }
    // 没有禁止出的牌
    return true;
  }

  // 归类相同数值的牌
  groupByValue(list: Card[]) {
    const group = {};
    for (const card of list) {
      if (group[card.value]) {
        group[card.value].push(card);
      } else {
        group[card.value] = [ card ];
      }
    }
    return group;
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
    for (const p of firstCardPatternOrder) {
      for (const allowPattern of this.allowPattern) {
        res = allowPattern.promptWithPattern(p as IPattern, cards);
        if (res.length > 0) {
          remain = cards.slice();
          this.excludeCard(res[0], remain)
          if (this.isAllowPlayCard(res[0], remain)) {
            return res[0]
          }
        }
      }
    }
    // 没有牌能出
    return [];
  }
}

import Card, {CardType} from './card'
import {IMatcher, IPattern, NullCheck, PatterNames} from './patterns/base'

import BombMatcher from './patterns/BombMatcher'
import DoubleMatcher from './patterns/DoubleMatcher'
import SingleMatcher from './patterns/SingleMatcher'
import StraightDoublesMatcher from './patterns/StraightDoublesMatcher'
import StraightMatcher from './patterns/StraightMatcher'
import StraightTriplesMatcher from './patterns/StraightTriplesMatcher'
import TriplePlus2Matcher from './patterns/TriplePlus2Matcher'
import TripleMatcher from "./patterns/TripleMatcher";
import StraightFlushMatcher from "./patterns/StraightFlushMatcher";

class Pattern {
  room: any
  matchers: IMatcher[] = [];
  firstPattern: any = [];

  constructor(room) {
    this.room = room;
    this.matchers = [
      new BombMatcher(),// 炸弹
      new StraightMatcher(),// 顺子
      new StraightDoublesMatcher(),// 连对
      new TriplePlus2Matcher(),// 三带对
      new TripleMatcher(),// 三张不带
      new DoubleMatcher(),// 对子
      new SingleMatcher(),// 单张
      new StraightTriplesMatcher(),// 钢板
      new StraightFlushMatcher()// 同花顺
    ];
    this.firstPattern = [
      {
        matcher: new StraightTriplesMatcher(),
        // 钢板
        pattern: {
          name: PatterNames.straightTriplePlus2 + '0',
          score: 0,
          cards: Array.from({ length: 6 }),
        },
      },
      {
        matcher: new TriplePlus2Matcher(),
        // 三带对
        pattern: {
          name: PatterNames.triplePlus2,
          score: 0,
          cards: Array.from({ length: 5 }),
        },
      },
      {
        // 连对
        matcher: new StraightDoublesMatcher(),
        pattern: {
          name: PatterNames.doubles + '3',
          score: 0,
          cards: Array.from({ length: 6 }),
        }
      },
      {
        // 顺子
        matcher: new StraightMatcher(),
        pattern: {
          name: PatterNames.straight + '5',
          score: 0,
          cards: Array.from({ length: 5 }),
        },
      },
      {
        // 3张
        matcher: new TripleMatcher(),
        pattern: {
          name: PatterNames.triple,
          score: 0,
        },
        cards: Array.from({ length: 3 }),
      },
      {
        // 对子
        matcher: new DoubleMatcher(),
        pattern: {
          name: PatterNames.double,
          score: 0,
        },
      },
      {
        // 单张
        matcher: new SingleMatcher(),
        pattern: {
          name: PatterNames.single,
          score: 0,
        },
      },
      {
        // 炸弹
        matcher: new BombMatcher(),
        pattern: {
          name: PatterNames.bomb,
          score: 0,
          cards: Array.from({ length: 4 }),
        },
      },
      {
        // 同花顺
        matcher: new StraightFlushMatcher(),
        pattern: {
          name: PatterNames.straightFlush + '5',
          score: 0,
          cards: Array.from({ length: 5 }),
        },
      },
    ]
  }

  patternNameToPatternMatcher(name: string): IMatcher {
    if (name === PatterNames.single) return new SingleMatcher()
    if (name === PatterNames.bomb) return new BombMatcher()
    if (name === PatterNames.double) return new DoubleMatcher()
    if (name === PatterNames.triplePlus2) return new TriplePlus2Matcher() // 三带二
    if (name === PatterNames.triple) return new TripleMatcher() // 三张

    if (name.startsWith(PatterNames.straight)) return new StraightMatcher() // 顺子
    if (name.startsWith(PatterNames.doubles)) return new StraightDoublesMatcher() // 连对
    if (name.startsWith(PatterNames.triples)) return new StraightTriplesMatcher() // 钢板
    if (name.startsWith(PatterNames.straightFlush)) return new StraightFlushMatcher() // 同花顺

    return new NullCheck()
  }

  findFullMatchedPattern(cards: Card[]): IPattern | null {
    for (let i = 0; i < this.matchers.length; i++) {
      const matcher = this.matchers[i];
      const pattern = matcher.verify(cards, this.room.currentLevelCard);
      if (pattern) {
        if (pattern.name.startsWith(PatterNames.straightTriplePlus2)) {
          // console.warn("foundPattern %s", JSON.stringify(pattern));
        }

        return pattern;
      }
    }

    return null;
  }

  isGreaterThanPattern(cards: Card[], pattern: IPattern, cardCount: number = 0): IPattern | null {
    let foundPattern = this.findFullMatchedPattern(cards);
    if (foundPattern) {
      if (!pattern) {
        return foundPattern;
      }

      if (foundPattern.name === pattern.name) {
        if (foundPattern.score > pattern.score) {
          return foundPattern;
        }
        return null;
      }

      if (foundPattern.name === PatterNames.bomb) {
        return foundPattern;
      }

      if ((pattern.name !== PatterNames.bomb || pattern.level < 6) && foundPattern.name === PatterNames.straightFlush + 5) {
        return foundPattern;
      }
    }
    return null;
  }

  findMatchedPatternByPattern(pattern: IPattern, cards: Card[], flag = true): Card[][] {
    if (!pattern) {
      if (cards.length === 2) {
        // 最后2张，先出大的
        cards.sort((c1, c2) => c2.point - c1.point);
        return [[cards[0]]];
      }
      cards.sort((c1, c2) => c1.point - c2.point);
      return [[cards[0]]];
    }

    const matcher = this.patternNameToPatternMatcher(pattern.name);
    let prompts = matcher.promptWithPattern(pattern, cards, this.room.currentLevelCard);

    // 计算同花顺
    let straightFlushPrompts = [];
    if (![PatterNames.bomb, PatterNames.straightFlush + "5"].includes(pattern.name) && flag) {
      straightFlushPrompts = new StraightFlushMatcher().promptWithPattern(pattern, cards, this.room.currentLevelCard);

      prompts = [...prompts, ...straightFlushPrompts];
    }

    let bombPrompts = [];
    if (pattern.name !== PatterNames.bomb && flag) {
      bombPrompts = new BombMatcher().promptWithPattern(pattern, cards, this.room.currentLevelCard);

      // 判断是否是同花顺
      if (pattern.name !== PatterNames.straightFlush + "5") {
        return [...prompts, ...bombPrompts];
      }

      // 将王炸和6星以下炸弹排除掉
      const filterPrompts = [];
      for (let i = 0; i < bombPrompts.length; i++) {
        const prompt = bombPrompts[i];

        if (prompt.length === 4) {
          const jokerCount = prompt.filter(c => c.type === CardType.Joker).length;
          if (jokerCount === 4) {
            filterPrompts.push(prompt);
          }
        }

        if (prompt.length > 5) {
          filterPrompts.push(prompt);
        }
      }

      return [...prompts, ...filterPrompts];
    }

    return prompts;
  }

  findFullMatchedPatternForPlainCard(cards: any[]): IPattern | null {
    return this.findFullMatchedPattern(cards.map(pc => Card.from(pc)));
  }

  findMatchedPatternByPatternForPlainCard(pattern: IPattern, plainCards: any[]): Card[][] {
    const cards = plainCards.map(pc => Card.from(pc));
    return this.findMatchedPatternByPattern(pattern, cards);
  }

  isGreaterThanPatternForPlainCards(plainCards: any[], pattern: IPattern, cardCount: number): IPattern | null {
    const cards = plainCards.map(Card.from);
    return this.isGreaterThanPattern(cards, pattern, cardCount);
  }

  firstPlayCard(cards: Card[], excludePattern: string[]) {
    const bombMatcher = new BombMatcher();
    const bombPattern = {
      name: PatterNames.bomb,
      score: 0,
      cards: Array.from({ length: 4 }),
    };
    const bombCard = bombMatcher.promptWithPattern( bombPattern as IPattern, cards, this.room.currentLevelCard);
    // 没有炸弹卡
    const noBomb = bombCard.length === 0;
    let nextResult;
    for (const { matcher, pattern } of this.firstPattern) {
      if (excludePattern && excludePattern.includes(pattern.name)) {
        continue;
      }
      nextResult = false;
      const result = matcher.promptWithPattern(pattern as IPattern, cards, this.room.currentLevelCard);
      for (const cardList of result) {
        if (!noBomb) {
          // 有炸弹，普通牌不能带鬼牌
          const jokerCount = cardList.filter(value => value.type === CardType.Joker).length;
          const patternResult = bombMatcher.verify(cardList, this.room.currentLevelCard);
          if (jokerCount > 0 && !patternResult) {
            // 非炸弹，带鬼牌，跳过
            nextResult = true;
          } else {
            // 没有鬼牌
            return cardList;
          }
        }
      }
      if (nextResult) {
        continue;
      }
      if (pattern.name === PatterNames.single && cards.length === 2) {
        if (result.length >= 2) {
          return result[1];
        }
      }
      if (result.length > 0) {
        return result[0];
      }
      // 试试单张
    }

    throw new Error('no card to play for cards ' + JSON.stringify(cards))
  }
}

export default Pattern;

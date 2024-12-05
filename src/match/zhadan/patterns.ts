import Card from './card'
import {IMatcher, IPattern, NullCheck, PatterNames} from './patterns/base'

import BombMatcher from './patterns/BombMatcher'
import DoubleMatcher from './patterns/DoubleMatcher'
import SingleMatcher from './patterns/SingleMatcher'
import StraightDoublesMatcher from './patterns/StraightDoublesMatcher'
import StraightMatcher from './patterns/StraightMatcher'
import StraightTriplePlus2Matcher from "./patterns/StraightTriplePlus2Matcher"
import StraightTriplePlusXMatcher, {default as StraightTriplesPlusXMatcher} from "./patterns/StraightTriplePlusXMatcher"
import StraightTriplesMatcher from './patterns/StraightTriplesMatcher'
import TriplePlus2Matcher from './patterns/TriplePlus2Matcher'
import TriplePlusXMatcher from "./patterns/TriplePlusXMatcher"

const matchers: IMatcher[] = [
  new BombMatcher(),

  new StraightMatcher(),
  new StraightDoublesMatcher(),

  new StraightTriplePlus2Matcher(),

  new TriplePlus2Matcher(),
  new DoubleMatcher(),
  new SingleMatcher(),
]

class TriplePlus2MatcherExtra implements IMatcher {

  tpx: IMatcher
  tp2: IMatcher

  constructor() {
    this.tp2 = new TriplePlus2Matcher()
    this.tpx = new TriplePlusXMatcher()
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    const tp2Prompts = this.tp2.promptWithPattern(target, cards)
    if (tp2Prompts.length > 0) {
      return tp2Prompts
    }

    return this.tpx.promptWithPattern(target, cards)
  }

  verify(cards: Card[]): IPattern {
    return null
  }
}

class StraightTriplePlusXMatcherExtra implements IMatcher {

  tsp2: IMatcher

  constructor() {
    this.tsp2 = new StraightTriplePlus2Matcher()
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    const tp2Prompts = this.tsp2.promptWithPattern(target, cards)
    if (tp2Prompts.length > 0) {
      return tp2Prompts
    }

    if (target) {
      if (target.name.startsWith(PatterNames.straightTriplePlus2)) {
        const tspx = new StraightTriplesPlusXMatcher(target.level)
        return tspx.promptWithPattern(target, cards)
      }
    } else {
      const tspx = new StraightTriplesPlusXMatcher(0)
      return tspx.promptWithPattern(target, cards)
    }

    return []
  }

  verify(cards: Card[]): IPattern {
    return null
  }
}

function patternNameToPatternMatcher(name: string): IMatcher {
  if (name === PatterNames.single) return new SingleMatcher()
  if (name === PatterNames.bomb) return new BombMatcher()
  if (name === PatterNames.double) return new DoubleMatcher()
  if (name === PatterNames.triplePlus2) return new TriplePlus2MatcherExtra()

  if (name.startsWith(PatterNames.straight)) return new StraightMatcher()
  if (name.startsWith(PatterNames.doubles)) return new StraightDoublesMatcher()
  if (name.startsWith(PatterNames.triples)) return new StraightTriplesMatcher()
  if (name.startsWith(PatterNames.straightTriplePlus2)) return new StraightTriplePlusXMatcherExtra()

  return new NullCheck()
}

export function findFullMatchedPattern(cards: Card[]): IPattern | null {
  for (let i = 0; i < matchers.length; i++) {
    const matcher = matchers[i]
    const pattern = matcher.verify(cards)
    if (pattern) return pattern
  }

  return null
}

const triplePlusX = new TriplePlusXMatcher()

export function isGreaterThanPattern(cards: Card[], pattern: IPattern, cardCount: number = 0): IPattern | null {
  let foundPattern = findFullMatchedPattern(cards)

  if (!foundPattern && cards.length === cardCount) {
    foundPattern = triplePlusX.verify(cards)

    if (pattern) {
      if (pattern.name.startsWith(PatterNames.straightTriplePlus2)) {
        const straightTriplePlusX = new StraightTriplePlusXMatcher(pattern.level)
        foundPattern = foundPattern || straightTriplePlusX.verify(cards)
      }
    } else {
      const straightTriplePlusX = new StraightTriplePlusXMatcher(0)
      foundPattern = foundPattern || straightTriplePlusX.verify(cards)
    }
  }

  if (foundPattern) {
    if (!pattern) return foundPattern

    if (foundPattern.name === pattern.name) {
      if (foundPattern.score > pattern.score) {
        return foundPattern
      }
      return null
    }

    if (foundPattern.name === PatterNames.bomb) {
      return foundPattern
    }

    if (cardCount === cards.length && pattern.name.startsWith(PatterNames.straightTriplePlus2)) {
      const straightTriplePlusX = new StraightTriplePlusXMatcher(pattern.level)
      foundPattern = straightTriplePlusX.verify(cards)

      if (foundPattern && foundPattern.name === pattern.name) {
        if (foundPattern.score > pattern.score) {
          return foundPattern
        }
      }
    }
  }

  return null
}

export function findMatchedPatternByPattern(pattern: IPattern, cards: Card[]): Card[][] {
  if (!pattern) {
    cards.sort((c1, c2) => c1.point - c2.point)
    return [[cards[0]]]
  }

  const matcher = patternNameToPatternMatcher(pattern.name)
  const prompts = matcher.promptWithPattern(pattern, cards)

  let bombPrompts = []
  if (pattern.name !== PatterNames.bomb) {
    bombPrompts = new BombMatcher().promptWithPattern(pattern, cards)
  }

  return [...prompts, ...bombPrompts]
}

/* share with client side */

// noinspection JSUnusedGlobalSymbols
export function findFullMatchedPatternForPlainCard(cards: any[]): IPattern | null {
  return findFullMatchedPattern(cards.map(pc => Card.from(pc)))
}

// noinspection JSUnusedGlobalSymbols
export function findMatchedPatternByPatternForPlainCard(pattern: IPattern, plainCards: any[]): Card[][] {
  const cards = plainCards.map(pc => Card.from(pc))
  return findMatchedPatternByPattern(pattern, cards)
}

// noinspection JSUnusedGlobalSymbols
export function isGreaterThanPatternForPlainCards(plainCards: any[],
                                                  pattern: IPattern,
                                                  cardCount: number): IPattern | null {
  const cards = plainCards.map(Card.from)
  return isGreaterThanPattern(cards, pattern, cardCount)
}

// 先出 飞机，连对，顺子，对子，单张，炸弹
const firstPattern = [
  {
    matcher: new StraightTriplePlus2Matcher(),
    // 333444 xxxx
    pattern: {
      name: PatterNames.straightTriplePlus2 + '4',
      score: 0,
      cards: Array.from({ length: 10 }),
    },
  },
  {
    matcher: new TriplePlus2Matcher(),
    // 333 xx
    pattern: {
      name: PatterNames.triplePlus2,
      score: 0,
      cards: Array.from({ length: 5 }),
    },
  },
  {
    // 33445566
    matcher: new StraightDoublesMatcher(),
    pattern: {
      name: PatterNames.doubles + '4',
      score: 0,
      cards: Array.from({ length: 8 }),
    }
  },
  {
    // 334455
    matcher: new StraightDoublesMatcher(),
    pattern: {
      name: PatterNames.doubles + '3',
      score: 0,
      cards: Array.from({ length: 6 }),
    }
  },
  {
    // 3344
    matcher: new StraightDoublesMatcher(),
    pattern: {
      name: PatterNames.doubles + '2',
      score: 0,
      cards: Array.from({ length: 4 }),
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
    // 顺子
    matcher: new StraightMatcher(),
    pattern: {
      name: PatterNames.straight + '6',
      score: 0,
      cards: Array.from({ length: 6 }),
    },
  },
  {
    // 顺子
    matcher: new StraightMatcher(),
    pattern: {
      name: PatterNames.straight + '7',
      score: 0,
      cards: Array.from({ length: 7 }),
    },
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
]
// 第一次出牌的卡
export function firstPlayCard(cards: Card[]) {
  for (const { matcher, pattern } of firstPattern) {
    const result = matcher.promptWithPattern(pattern as IPattern, cards);
    if (result.length > 0) {
      return result[0];
    }
  }
  throw new Error('no card to play for cards' + JSON.stringify(cards))
}

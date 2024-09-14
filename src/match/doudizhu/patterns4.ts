import Card from './card'
import {IMatcher, IPattern, NullCheck, PatterNames} from './patterns/base'

import BombMatcher from './patterns/BombMatcher'
import DoubleMatcher from './patterns/DoubleMatcher'
import SingleMatcher from './patterns/SingleMatcher'
import StraightDoublesMatcher from './patterns/StraightDoublesMatcher'
import StraightMatcher from './patterns/StraightMatcher'
import StraightTriplePlus2Matcher from "./patterns/StraightTriplePlus2Matcher";
import StraightTriplePlusXMatcher from "./patterns/StraightTriplePlusXMatcher";
import StraightTriplesMatcher from './patterns/StraightTriplesMatcher'
import TriplePlus2Matcher from './patterns/TriplePlus2Matcher'
import TriplePlusXMatcher from "./patterns/TriplePlusXMatcher";
import Rule from "./Rule";
import {StraightTriplePlusXMatcherExtra, TriplePlus2MatcherExtra} from "./SepecialPrompters"

function patternNameToPatternMatcher(name: string): IMatcher {
  if (name === PatterNames.single) return new SingleMatcher()
  if (name === PatterNames.double) return new DoubleMatcher()
  if (name === PatterNames.triplePlus2) return new TriplePlus2MatcherExtra()
  if (name.startsWith(PatterNames.straight)) return new StraightMatcher()
  if (name.startsWith(PatterNames.doubles)) return new StraightDoublesMatcher()
  if (name.startsWith(PatterNames.triples)) return new StraightTriplesMatcher()
  if (name.startsWith(PatterNames.straightTriplePlus2)) return new StraightTriplePlusXMatcherExtra()

  return new NullCheck()
}

const matchers: IMatcher[] = [
  new SingleMatcher(),
  new DoubleMatcher(),
  new TriplePlus2Matcher(),
  new StraightMatcher(),
  new StraightDoublesMatcher(),
  new BombMatcher(),
  new StraightTriplePlus2Matcher(),
]

export function findFullMatchedPattern(cards: Card[]): IPattern | null {
  for (let i = 0; i < matchers.length; i++) {
    const matcher = matchers[i]
    const pattern = matcher.verify(cards)
    if (pattern) return pattern
  }

  return null
}

const triplePlusX = new TriplePlusXMatcher()
const straightTriplePlusX = new StraightTriplePlusXMatcher()

export function isGreaterThanPattern(cards: Card[], pattern: IPattern, cardCount: number = 0): IPattern | null {
  let foundPattern = findFullMatchedPattern(cards)

  if (!foundPattern && cards.length === cardCount) {
    foundPattern = triplePlusX.verify(cards) || straightTriplePlusX.verify(cards)
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
  }

  return null
}

export function findMatchedPatternByPattern(pattern: IPattern, cards: Card[], rule: Rule): Card[][] {
  if (!pattern) return [[cards[0]]]

  const matcher = patternNameToPatternMatcher(pattern.name)
  return matcher.promptWithPattern(pattern, cards)
}

/* share with client side */
// noinspection JSUnusedGlobalSymbols
export function findFullMatchedPatternForPlainCard(cards: any[]): IPattern | null {
  return findFullMatchedPattern(cards.map(pc => Card.from(pc)))
}

// noinspection JSUnusedGlobalSymbols
export function findMatchedPatternByPatternForPlainCard(pattern: IPattern, plainCards: any[], rule: Rule): Card[][] {
  const cards = plainCards.map(pc => Card.from(pc))
  return findMatchedPatternByPattern(pattern, cards, rule)
}

// noinspection JSUnusedGlobalSymbols
export function isGreaterThanPatternForPlainCards(plainCards: any[],
                                                  pattern: IPattern,
                                                  cardCount: number): IPattern | null {
  const cards = plainCards.map(Card.from)
  return isGreaterThanPattern(cards, pattern, cardCount)
}

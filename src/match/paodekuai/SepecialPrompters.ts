import Card from "./card"
import {IMatcher, IPattern} from "./patterns/base"
import StraightTriplePlus2Matcher from "./patterns/StraightTriplePlus2Matcher"
import StraightTriplePlusXMatcher from "./patterns/StraightTriplePlusXMatcher"
import TriplePlus2Matcher from "./patterns/TriplePlus2Matcher"
import TriplePlusXMatcher from "./patterns/TriplePlusXMatcher"

export class TriplePlus2MatcherExtra implements IMatcher {

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

export class StraightTriplePlusXMatcherExtra implements IMatcher {

  tspx: IMatcher
  tsp2: IMatcher

  constructor() {
    this.tsp2 = new StraightTriplePlus2Matcher()
    this.tspx = new StraightTriplePlusXMatcher()
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    const tp2Prompts = this.tsp2.promptWithPattern(target, cards)
    if (tp2Prompts.length > 0) {
      return tp2Prompts
    }
    return this.tspx.promptWithPattern(target, cards)
  }

  verify(cards: Card[]): IPattern {
    return null
  }
}

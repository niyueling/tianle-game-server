import Card, {CardType} from "../card"
import {groupBy} from "../utils"
import {
  ComboTypes,
  createJokerMatcher,
  PatternMatcherBase,
  replaceJokersWithGaps,
  uniqueByHash
} from "./base"
import {Straight} from "./straight"

export class Flush extends PatternMatcherBase {

  whatName(): string {
    return '同花顺'
  }

  type() {
    return ComboTypes.FLUSH
  }

  score(): number {
    return 1000
  }

  findAll() {
    const result = []
    groupBy(this.cards, c => c.type)
      .forEach(cards => {
        if (cards.length < 3) return
        const sts = new Straight({cards, capacity: this.capacity}).all()
        result.push(...sts)
      })

    return result.map(({cards}) => this.snapshot(cards))
  }
}

function replaceJokerForFlush(cards: Card[]): Card[][] {

  const jokers = cards.filter(c => c.type === CardType.Joker)
  const normalCards = cards.filter(c => c.type !== CardType.Joker)

  const allTypes = uniqueByHash(normalCards, c => `${c.type}`).map(c => c.type)

  if (jokers.length === 0) return [[]]

  const wildCards = []
  allTypes.forEach( type => {

    const typeCards = cards.filter(c => c.type === type)
    if (typeCards.length + jokers.length < 3) {
      return
    }

    const cardsGroup = replaceJokersWithGaps(jokers, typeCards, type)

    wildCards.push(...cardsGroup)
  })

  if (wildCards.length === 0) return [[]]

  return wildCards
}

export const FlushWithJoker = createJokerMatcher(Flush, replaceJokerForFlush)

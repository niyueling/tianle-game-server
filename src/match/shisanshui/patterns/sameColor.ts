import Card, {CardType} from "../card"
import {combinations, groupBy} from "../utils"
import {
  CalcResult,
  ComboTypes,
  createJokerMatcher,
  PatternMatcherBase,
  replaceJokersUseSpadeWithAllSameValues, uniqueByHash
} from "./base"

export class SameColor extends PatternMatcherBase {

  whatName(): string {
    return '同花'
  }

  type() {
    return ComboTypes.SAME_COLOR
  }

  score(): number {
    return 60
  }

  findAll() {
    Card.sort(this.cards)

    const sameColos = groupBy(this.cards, card => card.type)
      .filter(cs => cs.length >= this.capacity)

    const allSameColorSuit = sameColos
      .map(cards => combinations(cards, this.capacity))
      .reduce((a, b) => [...a, ...b], [])
    const rs = allSameColorSuit.map(cards => this.snapshot(cards))

    return rs.sort((a, b) => b.score - a.score)
  }

  findOne() {
    const rs = this.findAll()
    return rs.length > 0 ? rs[0] : CalcResult.fail()
  }
}

function replaceJokerWithSameTypeAndAer(cards: Card[]): Card[][] {
  const jokers = cards.filter(c => c.type === CardType.Joker)
  const normalCards = cards.filter(c => c.type !== CardType.Joker)

  const allTypes = uniqueByHash(normalCards, c => `${c.type}`)
    .map(c => c.type)

  if (jokers.length > 0) {

    const wildCards = []

    allTypes.forEach(t => {

      const nTypeCards = cards.filter(c => c.type === t).length
      if (nTypeCards + jokers.length < 3)
        return

      const replcers = jokers.map(j => {
        const r = new Card(t, 1)
        r.fakeBy = j.clone()
        return r
      })

      wildCards.push(replcers)
    })

    if (wildCards.length > 0)
      return wildCards
  }

  return [[]]
}

export const SameColorWithJoker = createJokerMatcher(SameColor, replaceJokerWithSameTypeAndAer)

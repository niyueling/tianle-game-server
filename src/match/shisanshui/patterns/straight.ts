import Card, {CardType} from "../card"
import {
  ComboTypes,
  createJokerMatcher,
  PatternMatcherBase,
  replaceAToOne,
  replaceJokersUseSpadeWithAllSameValues, replaceJokersWithGaps, uniqueByHash
} from "./base"

export class Straight extends PatternMatcherBase {
  queue: Card[] = []

  whatName(): string {
    return '顺子'
  }

  type() {
    return ComboTypes.STRAIGHT
  }

  score(): number {
    return 50
  }

  sortCards() {
    this.cards.sort(Card.compare).reverse()
  }

  findAll() {
    const sourceRs = this.find(this.cards)
    const newCards = replaceAToOne(this.cards)
    const replaceARs = this.find(newCards)

    return uniqueByHash([...sourceRs, ...replaceARs],
      res => res.cards.map(c => `${c.type}_${c.value}`).join('_'))
  }

  find(cards) {
    const rs = []
    this.sortCards()

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]

      this.addNextCard(card)
      if (this.success()) {
        rs.push(this.snapshot(this.successfulCards()))
        this.dequeue()
      }
    }
    return rs
  }


  startWithNewCard(card: Card) {
    this.queue = [card]
  }

  add(card: Card) {
    this.queue.push(card)
  }

  dequeue() {
    this.queue.shift()
  }

  empty() {
    return this.queue.length === 0
  }

  successfulCards(): Card[] {
    return this.queue.slice().sort(Card.compare)
  }

  success() {
    return this.queue.length === this.capacity
  }

  addNextCard(card: Card) {
    if (this.empty()) {
      this.add(card)
      return
    }

    const gap = this.tailGapWith(card)
    const isSerial = gap === 1
    const isSame = gap === 0

    if (isSerial) {
      this.add(card)
    } else if (!isSame) {
      this.startWithNewCard(card)
    }
  }

  tailGapWith(card) {
    const tail = this.queue[this.queue.length - 1]
    const gap = tail.point - card.point
    return gap
  }
}


function replaceJokersWithSpadeGaps(cards: Card[]): Card[][] {
  const jokers = cards.filter(c => c.type === CardType.Joker)
  const normalCards = cards.filter(c => c.type !== CardType.Joker)

  return replaceJokersWithGaps(jokers, normalCards, CardType.Spades)
}


export const StraightWithJoker = createJokerMatcher(Straight, replaceJokersWithSpadeGaps)

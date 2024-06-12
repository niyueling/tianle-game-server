import Card from './card'

export default class Combo {

  cards: Card[]

  constructor(readonly name: string, readonly type: string,
              cards: Card[], readonly score: number) {
    this.cards = cards
  }

  compare(other: Combo): boolean {
    return this.score > other.score
  }
}

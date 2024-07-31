export enum CardType {
  Spades = 1,
  Heart,
  Club,
  Diamond,
  Joker
}

const cardType2Symbol = {
  [CardType.Spades]: '♠',
  [CardType.Heart]: '♥',
  [CardType.Diamond]: '♦',
  [CardType.Club]: '♣',
  [CardType.Joker]: '🃏'
}

export default class Card {
  point: number
  fakeBy: Card = null
  private _actAs: Card = null

  constructor(readonly type: CardType, readonly value: number) {
    this.point = this.value !== 1 ? this.value : 14

  }

  actAs(card: Card) {
    this._actAs = card.clone()
  }

  clone(): Card {
    return new Card(this.type, this.value)
  }

  toJSON() {
    return {
      type: this.type, value: this.value, point: this.point
    }
  }

  static littleAce(type: CardType): Card {
    const ace = new Card(type, 1)
    ace.point = 1
    return ace
  }

  static from({type, value}): Card {
    return new Card(type, value)
  }

  equal(other: Card) {
    return this.value === other.value && this.type === other.type
  }

  toString() {
    let symbol = cardType2Symbol[this.type]
    let value

    if (this.value === 1) {
      value = 'A'
    } else if (this.value <= 10) {
      value = this.value
    } else if (this.value >= 15) {
      return this.value === 15 ? `小${symbol}` : `大${symbol}`
    } else {
      let JQkCode = ['J', 'Q', 'K']
      value = JQkCode[this.value - 11]
    }

    return `${symbol}${value}`

  }

  static compare(card1: Card, card2: Card) {
    const cmp = card1.point - card2.point
    if (cmp === 0) {
      return card1.type - card2.type
    } else {
      return cmp
    }
  }

  static sort(cards: Card[]) {
    return cards.sort(Card.compare)
  }
}

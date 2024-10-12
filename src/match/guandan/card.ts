export enum CardType {
  Joker = 0,
  Spades,
  Heart,
  Club,
  Diamond,
  Wild
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
  currentLevelCard: number

  constructor(readonly type: CardType, readonly value: number, readonly levelCard: number) {
    if (type === CardType.Joker) {
      this.point = this.value
    } else if (levelCard && value === levelCard) {
      this.point = 14;
    } else {
      this.point = this.value > 1 ? this.value : 13 + value
    }
  }

  static from({type, value, levelCard}): Card {
    return new Card(type, value, levelCard)
  }

  equal(other: Card) {
    return this.value === other.value && this.type === other.type
  }

  toString() {
    const symbol = cardType2Symbol[this.type]
    let value

    if (this.value === 1) {
      value = 'A'
    } else if (this.value <= 10) {
      value = this.value
    } else {
      const JQkCode = ['J', 'Q', 'K']
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

  fen(): number {
    if (this.value === 5) return 5
    if (this.value === 10 || this.value === 13) {
      return 10
    }
    return 0
  }
}

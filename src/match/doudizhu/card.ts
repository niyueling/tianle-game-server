export enum CardType {
  Joker = 0,
  Spades,
  Heart,
  Club,
  Diamond,
  Wild
}

export enum CardTag {
  // 红桃 heart
  ha = 1,
  h2,
  h3,
  h4,
  h5,
  h6,
  h7,
  h8,
  h9,
  h10,
  hj,
  hq,
  hk,

  // 梅花 club
  ca,
  c2,
  c3,
  c4,
  c5,
  c6,
  c7,
  c8,
  c9,
  c10,
  cj,
  cq,
  ck,

  // 黑桃 spades
  sa,
  s2,
  s3,
  s4,
  s5,
  s6,
  s7,
  s8,
  s9,
  s10,
  sj,
  sq,
  sk,

  // 方块 diamond
  da,
  d2,
  d3,
  d4,
  d5,
  d6,
  d7,
  d8,
  d9,
  d10,
  dj,
  dq,
  dk,

  // joker
  // 大王
  bigJoker,
  // 小王
  littleJoker,
}

const cardType2Symbol = {
  [CardType.Spades]: '♠',
  [CardType.Heart]: '♥',
  [CardType.Diamond]: '♦',
  [CardType.Club]: '♣',
  [CardType.Joker]: '🃏'
}

// 所有红桃
export const hearts = [CardTag.ha, CardTag.h2, CardTag.h3, CardTag.h4, CardTag.h5, CardTag.h6, CardTag.h7,
  CardTag.h8, CardTag.h9, CardTag.h10, CardTag.hj, CardTag.hq, CardTag.hk];

// 所有梅花
export const clubs = [CardTag.ca, CardTag.c2, CardTag.c3, CardTag.c4, CardTag.c5, CardTag.c6, CardTag.c7,
  CardTag.c8, CardTag.c9, CardTag.c10, CardTag.cj, CardTag.cq, CardTag.ck];

// 所有黑桃
export const spades = [CardTag.sa, CardTag.s2, CardTag.s3, CardTag.s4, CardTag.s5, CardTag.s6, CardTag.s7,
  CardTag.s8, CardTag.s9, CardTag.s10, CardTag.sj, CardTag.sq, CardTag.sk];

// 所有方块
export const diamonds = [CardTag.da, CardTag.d2, CardTag.d3, CardTag.d4, CardTag.d5, CardTag.d6, CardTag.d7,
  CardTag.d8, CardTag.d9, CardTag.d10, CardTag.dj, CardTag.dq, CardTag.dk];

export default class Card {
  point: number

  constructor(readonly type: CardType, readonly value: number) {
    if (type === CardType.Joker) {
      this.point = this.value
    } else {
      // 2最大, 然后A
      this.point = this.value > 2 ? this.value : 13 + value
    }
  }

  static from({type, value}): Card {
    return new Card(type, value)
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
}

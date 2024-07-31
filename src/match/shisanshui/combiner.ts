import Card, {CardType} from "./card"
import Combo from "./combo"
import {
  generateWildCardGroup,
  PatternMatcherBase,
  replaceJokersUseSpadeWithAllSameValues,
  replaceJokersWithGaps,
  uniqueByHash
} from "./patterns/base"
import {Flush} from "./patterns/flush"
import createCalculators from "./patterns/index"
import {Straight} from "./patterns/straight"
import {groupBy, isSameColor, isStraight} from "./utils"

export class VerifyResult {
  verify: boolean
  score: number
  sorted: Card[]
  name?: string
  extra: string
}

export class Suit {
  constructor(readonly head: Combo, readonly middle: Combo, readonly tail: Combo,
              readonly isQiPai: boolean, readonly name: string, readonly score: number) {

  }

  static notQiPai(head, middle, tail) {
    return new Suit(head, middle, tail, false, '', 0)
  }

  static qiPai(cards, name, score) {
    const head = cards.slice(0, 3)
    const middle = cards.slice(3, 8)
    const tail = cards.slice(8, 13)

    return new Suit(
      { cards: head} as Combo,
      {cards: middle} as Combo,
      {cards: tail} as Combo,
      true, name, score)
  }
}

const qiPaiOrdered = [
  '至尊清龙',
  '一条龙',
  '三同花顺',
  '七同',
  '四套三条',
  '六同',
  '五对三条',
  '六对半',
  '三顺子',
  '三同花'
]

export default class Combiner {

  spend: number

  constructor(readonly cards: Card[]) {
    this.spend = 0
  }

  findAllSuit(): Suit[] {
    const cards = this.cards
    const allSuit: Suit[] = []
    const tails = this.getAllCombos(cards)

    for (let i = 0; i < tails.length; i++) {
      const tail = tails[i]
      const rest = restCards(cards, tail)
      const middles = this.getAllCombos(rest)

      for (let j = 0; j < middles.length; j++) {
        const middle = middles[j]
        if (middle.score >= tail.score) break
        const final = restCards(rest, middle)
        const heads = this.getAllCombos(final)

        for (let k = 0; k < heads.length; k++) {
          const head = heads[k]
          if (head.score >= middle.score) break
          allSuit.push(Suit.notQiPai(head, middle, tail))
        }
      }
    }

    return allSuit
  }

  getAllCombos(cards: Card[]): Combo[] {
    return createCalculators({cards})
      .map(calc => calc.max())
      .filter(c => !c.isFail)
  }

  detectQiPai(): VerifyResult {
    this.cards.sort(Card.compare)
    for (let i = 0; i < qiPaiOrdered.length; i++) {
      const name = qiPaiOrdered[i]

      const verifier = this.getVerifier(name)
      const result = verifier(this.cards)
      result.name = name

      if (result.verify) {
        return result
      }
    }
  }

  verifyQiPai(name): VerifyResult {
    Card.sort(this.cards)
    return this.getVerifier(name)(this.cards)
  }

  private validValue(v) {
    return v >= 1 && v <= 13
  }

  private threeFlushWildCards(cards: Card[]) {
    const jokers = cards.filter(c => c.type === CardType.Joker);
    const normalCards = cards.filter(c => c.type !== CardType.Joker);
    const types = uniqueByHash(normalCards, c => `${c.type}`)
      .map(c => c.type)

    if (jokers.length === 0) return [[]]
    if (types.length > 4) return [[]]

    const candidateCardsWithSame = []
    const offSet = jokers.length
    types.forEach(t => {
      const cardInType = normalCards.filter(c => c.type === t)

      if (cardInType.length + jokers.length < 3) return

      cardInType.forEach(c => {
        const baseValue = c.value
        for (let o = -offSet; o <= offSet; o++) {
          if (o !== 0 && this.validValue(o + baseValue)) {
            candidateCardsWithSame.push(new Card(t, o + baseValue))
          }
        }
      })
    })

    const candidateCards: Card[] = uniqueByHash(candidateCardsWithSame, c => `${c.type}-${c.value}`)

    if (jokers.length === 1) {
      return candidateCards.map(c => {
        c.fakeBy = jokers[0]
        return c
      })
    }

    const group = []
    if (jokers.length === 2) {
      for (let i = 0; i < candidateCards.length; i++) {
        for (let j = i; j < candidateCards.length; j++) {
          const c1 = candidateCards[i].clone()
          const c2 = candidateCards[j].clone()
          c1.fakeBy = jokers[0]
          c2.fakeBy = jokers[1]

          group.push([c1, c2])
        }
      }
    }

    return group.length === 0 ? [[]] : group
  }

  private getWildCardGroupForName(name: string, cards: Card[]): Card[][] {

    const jokers = cards.filter(c => c.type === CardType.Joker)
    const normalCards = cards.filter(c => c.type !== CardType.Joker)

    if (name === '三同花顺') {
      return this.threeFlushWildCards(cards)
    }

    if (name === '七同') {
      const jokers = cards.filter(c => c.type === CardType.Joker)
      const longestGroup = groupBy(cards, c => c.point)
        .sort((g1, g2) => g2.length - g1.length)[0]

      if (longestGroup.length + jokers.length >= 7) {
        return [
          jokers.map(j => {
            const w = longestGroup[0].clone()
            w.fakeBy = j
            return w
          })
        ]
      }
      return [[]]
    }

    if (name === '六同') {
      const jokers = cards.filter(c => c.type === CardType.Joker)
      const longestGroup = groupBy(cards, c => c.point)
        .sort((g1, g2) => g2.length - g1.length)[0]

      if (longestGroup.length + jokers.length >= 6) {
        return [
          jokers.map(j => {
            const w = longestGroup[0].clone()
            w.fakeBy = j
            return w
          })
        ]
      }
      return [[]]
    }

    if (name === '四套三条' || name === '五对三条' || name == '六对半') {
      return replaceJokersUseSpadeWithAllSameValues(cards)
    }

    if (name === '三顺子' || name === '一条龙') {
      return replaceJokersWithGaps(jokers, normalCards, CardType.Spades)
    }

    if (name === '至尊清龙') {
      const types = uniqueByHash(normalCards, c => `${c.type}`)
      if (types.length > 1) return [[]]

      return replaceJokersWithGaps(jokers, normalCards, types[0].type)
    }

    return generateWildCardGroup(cards)

  }

  getVerifier(name) {
    const verifier = verifiersMap[name] as (cards: Card[]) => VerifyResult

    if (!verifier) return (cards: Card[]): VerifyResult => ({
      verify: false,
      name: '',
      score: 0,
      sorted: cards,
      extra: ''
    })

    return (cards: Card[]): VerifyResult => {
      const normalCards = cards.filter(card => card.type !== CardType.Joker)
      const wildGroups = this.getWildCardGroupForName(name, cards)

      cards.sort(Card.compare)

      // console.log(name, '====>', wildGroups.length)

      for (let i = 0; i < wildGroups.length; i++) {
        const wildCards = wildGroups[i]
        const replacedCards = normalCards.concat(wildCards)

        replacedCards.sort(Card.compare)

        const result = verifier(replacedCards)

        if (result.verify) {

          for (let j = 0; j < wildCards.length; j++) {
            const wildCard = wildCards[j]
            const i = result.sorted.findIndex(c => c.equal(wildCard))
            if (i < 0) {
              result.sorted = cards
              break;
            }

            result.sorted[i] = wildCard.fakeBy
          }

          return result
        }
      }

      return {
        verify: false,
        score: 0,
        sorted: cards,
        extra: ''
      }
    }

  }
}

const verifiersMap = {
  '至尊清龙': zhiZunQingLong,
  '一条龙': yiTiaoLong,
  '三同花顺': threeFlush,
  '四套三条': fourTriple,
  '五对三条': fiveTwinsOneTriple,
  '六对半': sixHalfTwins,
  '三顺子': threeStraight,
  '三同花': threeSameColor,
  '七同': SevenSame,
  '六同': SixSame,
}

function zhiZunQingLong(cards): VerifyResult {
  const r = {verify: false, score: 10, sorted: [], extra: ''}

  const type = cards[0].type
  for (let i = 0; i < 12; i++) {
    const prev = cards[i]
    const next = cards[i + 1]

    if (next.type !== type || next.point - prev.point !== 1) {
      return r
    }
  }

  r.sorted = cards.reverse()
  r.verify = true
  return r
}

function yiTiaoLong(cards): VerifyResult {
  const r = {verify: false, score: 9, sorted: [], extra: ''}

  for (let i = 0; i < 12; i++) {
    const prev = cards[i]
    const next = cards[i + 1]

    if (next.point - prev.point !== 1) {
      return r
    }
  }

  r.sorted = cards.reverse()
  r.verify = true
  return r
}

function removeFrom<T>(c: T, fromArray: T[]) {
  const i = fromArray.indexOf(c)
  if (i >= 0)
    fromArray.splice(i, 1)
}

function _findFlushFromFirst(cards: Card[], len: number = 3) {

  const cs = cards.slice()

  const card = cs[0]
  const flush = [card]
  let point = card.point

  removeFrom(card, cs)
  for (let i = 1; i < len; i++) {
    const nextCards = cards.filter(c => c.type === card.type && c.point === point)
    if (nextCards.length > 0) {
      flush.push(nextCards[0])
      removeFrom(nextCards[0], cs)
      point++
    } else {
      return null
    }
  }

  return flush
}

function isFitLength(cards: any[]) {
  const l = cards.length
  return [3, 5, 8, 10, 13].indexOf(l) >= 0
}

function findFlushFromFirst(cards: Card[]) {

  if (!isFitLength(cards)) {
    return null
  }

  const sortedCards = cards.sort((c1, c2) => {
    if (c1.type === c2.type) return c1.point - c2.point
    return c1.type - c2.type
  })

  const sortedCardsWhenAUsedAsOne = cards.slice().map(c => {
    if (c.value === 1) {

      const clone = c.clone()
      clone.point = 1

      return clone
    }

    return c
  }).sort((c1, c2) => {
    if (c1.type === c2.type) return c1.point - c2.point
    return c1.type - c2.type
  })

  const len = cards.length % 5 === 0 ? 5 : 3

  return _findFlushFromFirst(sortedCards, len) ||
    _findFlushFromFirst(sortedCardsWhenAUsedAsOne, len)
}


function threeFlush(cards: Card[]): VerifyResult {
  const r = {verify: false, score: 8, sorted: [], extra: ''}

  const groups = groupBy(cards, c => c.type)

  if (!groups.every(g => !!findFlushFromFirst(g))) {
    return r
  }

  const {description, sorted} = sortedGroupByFlush(cards)

  if (description === '5,5,3') {
    r.sorted = sorted
    r.verify = true
  }
  return r
}

function couYiSe(cards): VerifyResult {
  const r = {verify: false, score: 7, sorted: [], extra: ''}

  const count = cards.map(card => (card.type === CardType.Heart || card.type === CardType.Spades) ? 1 : -1)
    .reduce((a, b) => a + b)

  if (count === 13 || count === -13) {
    r.verify = true
    const sameColorArray = groupBy(cards, card => card.type)
    r.sorted = sameColorArray.reduce((a, b) => [...a, ...b], [])
  }
  return r
}


function fourTriple(cards): VerifyResult {
  const r = {verify: false, score: 6, sorted: [], extra: ''}

  const {sorted, description} = sortedGroupByCount(cards)
  if (description === '3,3,3,3,1' || description === '4,3,3,3') {
    r.sorted = sorted
    r.verify = true
  }

  return r
}

export function fiveTwinsOneTriple(cards): VerifyResult {
  const r = {verify: false, score: 5, sorted: [], extra: ''}
  const {sorted, description} = sortedGroupByCount(cards)
  const digests = [
    '3,2,2,2,2,2',
    '4,3,2,2,2',
    '5,2,2,2,2',
    '5,4,2,2',
    '5,4,4',
  ]

  if (~digests.indexOf(description)) {
    r.sorted = sorted
    r.verify = true
  }
  return r
}

export function sixHalfTwins(cards): VerifyResult {
  const r = {verify: false, score: 4, sorted: [], extra: ''}
  const containBomb = cards => groupBy(cards, cards => cards.value).some(arr => arr.length === 4)
  const {sorted, description} = sortedGroupByCount(cards)

  const digests = [
    '2,2,2,2,2,2,1',

    '3,2,2,2,2,2',

    '4,2,2,2,2,1',
    '4,3,2,2,2',
    '4,4,3,2',
    '4,4,4,1',

    '5,2,2,2,2',
    '5,4,2,2',
    '5,4,4',
  ]

  if (digests.indexOf(description) !== -1) {
    r.sorted = sorted
    r.verify = true
    if (containBomb(sorted)) {
      r.extra = '带炸弹'
    }
  }
  return r
}

function splitCards553(cards) {
  const first = cards.slice(0, 5)
  const second = cards.slice(5, 10)
  const third = cards.slice(10, 13)

  return {first, second, third}
}

function threeStraight(cards): VerifyResult {
  const r = {verify: false, score: 3, sorted: [], extra: ''}
  const containSameColor = cards => {
    const {first, second, third} = splitCards553(cards)
    return isSameColor(first) || isSameColor(second) || isSameColor(third)
  }

  const {sorted, description} = sortedGroupBySerial(cards)
  if (description === '5,5,3') {
    r.sorted = sorted.reverse()
    r.verify = true
    if (containSameColor(sorted)) {
      r.extra = '带同花顺'
    }
  }
  return r

}

function threeSameColor(cards): VerifyResult {
  const r = {verify: false, score: 1, sorted: [], extra: ''}
  const containStraight = cards => {
    const {first, second, third} = splitCards553(cards)
    return isStraight(first) || isStraight(second) || isStraight(third)
  }

  const {sorted, description} = sortedGroupByColor(cards)
  if (description === '5,5,3' || description === '10,3' || description === '8,5' || description === '13') {
    r.sorted = sorted
    r.verify = true
    if (containStraight(sorted)) {
      r.extra = '带同花顺'
    }
  }
  return r
}


function SixSame(cards: Card[]): VerifyResult {
  const r = {verify: false, score: 6, sorted: [], extra: ''}
  const groups = groupBy(cards, c => c.point)

  if (groups.some(g => g.length === 6)) {
    r.sorted = cards.reverse()
    r.verify = true
  }

  return r
}

function SevenSame(cards: Card[]): VerifyResult {
  const r = {verify: false, score: 6, sorted: [], extra: ''}
  const groups = groupBy(cards, c => c.point)

  if (groups.some(g => g.length === 7)) {
    r.sorted = cards.reverse()
    r.verify = true
  }

  return r
}

function restCards(cards: Card[], combo: Combo) {
  const used: Card[] = combo.cards
  const newCards = cards.slice()

  let i = -1
  while (++i < used.length) {
    const needRemoved = used[i]
    const idx = newCards.findIndex(card => card.equal(needRemoved))
    if (~idx) {
      newCards.splice(idx, 1)
    }
  }

  return newCards
}

export function sortedGroupByCount(cards) {
  const sameValueArray = groupBy(cards, card => card.value).sort((a, b) => b.length - a.length)
  const description = sameValueArray.map(sameValue => sameValue.length).join(',')
  const sorted = sameValueArray.reduce((a, b) => [...a, ...b])
  return {sorted, description}
}

function sortedGroupByColor(cards) {
  const sameValueArray = groupBy(cards, card => card.type).sort((a, b) => b.length - a.length)
  const description = sameValueArray.map(sameValue => sameValue.length).join(',')
  const sorted = sameValueArray.reduce((a, b) => [...a, ...b])
  return {sorted, description}
}

function sortedGroupBySerial(cards) {
  return sortedGroupBy(cards, Straight)
}

function sortedGroupByFlush(cards) {
  return sortedGroupBy(cards, Flush)
}

function sortedGroupBy(cards, Calc) {
  const firstAll = new Calc({cards}).findAll()


  for (let i = 0; i < firstAll.length; i++) {
    const first = firstAll[i]

    if (!first.isFail) {
      const rest = restCards(cards, first)
      const secondAll = new Calc({cards: rest}).findAll()

      for (let j = 0; j < secondAll.length; j++) {
        const second = secondAll[j]

        if (!second.isFail) {
          const final = restCards(rest, second)
          const calc = new Calc({cards: final, capacity: 3})
          const third = calc.findOne()
          if (!third.isFail) {
            return {sorted: [...first.cards, ...second.cards, ...third.cards], description: '5,5,3'}
          }
        }
      }
    }
  }
  return {sorted: [], description: 'not found'}
}


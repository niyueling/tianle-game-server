import Card, {CardType} from "../card"
import Combo from "../combo"
import {groupBy} from "../utils"

// 牌型大小
// fiveSame > flush > boom > gourd > sameColor > straight > triple > doublePair > pair > single
export class ComboTypes {
  static SINGLE = 'single'
  static PAIR = 'pair'
  static DOUBLE_PAIR = 'doublePair'
  static TRIPLE = 'triple'
  static SAME_COLOR = 'sameColor'
  static STRAIGHT = 'straight'
  static FLUSH = 'flush'
  static BOMB = 'bomb'
  static GOURD = 'gourd'
  static FIVE_SAME = 'fiveSame'
}

export class CalcResult extends Combo {

  constructor(readonly name: string,
              readonly type: string,
              readonly cards: Card[],  // MAX MUST: cards[ length -1 ]
              readonly score: number,
              readonly found: boolean = true) {
    super(name, type, cards, score)
  }

  static fail(): CalcResult {
    return new CalcResult('', '', [], 0, false)
  }

  get isFail(): boolean {
    return !this.found
  }

  displayString() {
    return `${this.name}:${this.cards.map(c => c.toString()).join(',')}`
  }
}

export abstract class PatternMatcherBase {
  capacity: number
  cards: Card[]

  // noinspection TypeScriptAbstractClassConstructorCanBeMadeProtected
  constructor(opts) {
    const {cards, capacity} = opts
    this.cards = cards.slice()
    this.capacity = capacity || 5
  }

  abstract whatName(): string

  abstract score(): number

  abstract type(): string

  abstract findAll(): CalcResult[]

  findOne() {
    const rs = this.findAll().sort((a, b) => b.score - a.score)
    return rs.length > 0 ? rs[0] : CalcResult.fail()
  }

  max(): CalcResult {
    return this.findOne()
  }

  all(): CalcResult[] {
    return this.findAll()
  }

  snapshot(cards: Card[]) {
    return new CalcResult(
      this.whatName(),
      this.type(),
      cards.slice(),
      this.generateScore(cards, this.type())
    )
  }

  /**
   *  generate union score by cards
   *
   *
   *     combo score |  5 card concat |   max card color
   *           xxxxx | xx xx xx xx xx |   x
   *
   * @param {Card[]} cards
   * @returns {number}
   */
  generateScore(cards: Card[], type: string) {
    const base = this.score() + extrasBuff(cards, type)
    // Do not compare with type
    const typeScore = 0

    let pointJoinStr = cards
      .slice()
      .reverse()
      .map(c => c.point >= 10 ? c.point : `0${c.point}`)
      .join('')

    if (cards.length === 3) {
      pointJoinStr += '0000'
    }

    return parseInt(base + pointJoinStr + typeScore, 10)
  }

  padding(exists: Card[], need = 1): Card[] {
    const needPush = []
    while (need-- > 0) {
      const minimum = this.getMinExcludeThat([...exists, ...needPush])
      if (minimum) {
        needPush.push(minimum)
      } else {
        return exists
      }
    }
    exists.unshift(...needPush)
    return exists
  }

  getMinExcludeThat(that: Card[]): Card {
    Card.sort(this.cards)

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]
      if (that.findIndex(include => include.value === card.value) === -1) {
        return card
      }
    }
    return null
  }
}

export function replaceAToOne(cards) {
  return cards.map(c => {
    if (c.value === 1) {
      return Card.littleAce(c.type)
    }
    return c
  })
}

function straightBuff(cards: Card[]) {
  // straight 10 J Q K A > A 2 3 4 5 > another
  const map = {'1,2,3,4,5': 1, '10,11,12,13,14': 2}
  const digest = cards.map(c => c.point).join(',')

  return map[digest] ? map[digest] : 0
}

function sameColorBuff(cards: Card[]) {
  // double-spade make up pair
  const doubleSpadeArray = groupBy(cards, card => parseInt(`${card.value}${card.type}`, 10))
    .filter(cs => cs.length > 1)

  if (doubleSpadeArray.length) {
    return doubleSpadeArray[0][0].point + doubleSpadeArray.length * 20
  }
  return 0
}

const comboTypeBuffMap = new Map()
comboTypeBuffMap.set(ComboTypes.STRAIGHT, straightBuff)
comboTypeBuffMap.set(ComboTypes.SAME_COLOR, sameColorBuff)
comboTypeBuffMap.set(ComboTypes.FLUSH, straightBuff)

export const extrasBuff = (cards: Card[], type: string): number => {
  const buffFn = comboTypeBuffMap.has(type) ? comboTypeBuffMap.get(type) : () => 0
  return buffFn(cards)
}
export const sortCardArray = (a: Card[], b: Card[]) => Card.compare(a[0], b[0])

export function generateWildCardGroup(cards: Card[]): Card[][] {
  const jokers = cards.filter(card => card.type === CardType.Joker)

  let wildCardGroup = [[]]
  const normalTypes = [CardType.Spades, CardType.Heart, CardType.Club, CardType.Diamond]

  if (jokers.length === 1) {
    wildCardGroup = []
    for (let i = 0; i < normalTypes.length; i++) {
      const type = normalTypes[i]

      for (let val = 1; val <= 13; val++) {
        const wildCard = new Card(type, val)
        wildCard.fakeBy = jokers[0]

        wildCardGroup.push([wildCard])
      }
    }
  }

  if (jokers.length === 2) {
    wildCardGroup = []
    for (let type1 = CardType.Spades; type1 <= CardType.Diamond; type1++) {
      for (let type2 = type1; type2 <= CardType.Diamond; type2++) {

        for (let value1 = 1; value1 <= 13; value1++) {

          for (let value2 = value1; value2 <= 13; value2++) {
            const wildCard1 = new Card(type1, value1)
            const wildCard2 = new Card(type2, value2)
            wildCard1.fakeBy = jokers[0]
            wildCard2.fakeBy = jokers[1]
            wildCardGroup.push([wildCard1, wildCard2])
          }
        }
      }
    }
  }

  return wildCardGroup
}

export function uniqueByHash<T>(arr: T[], hash: (a: T) => string): T[] {

  const res: T[] = []
  if (arr.length <= 1) {
    return arr
  }

  const hashSet: { [k: string]: number } = {[hash(arr[0])]: 1}
  res.push(arr[0])

  for (let i = 1; i < arr.length; i++) {
    const item = arr[i]

    const hashString = hash(item)

    if (!hashSet[hashString]) {
      hashSet[hashString] = 1
      res.push(item)
    }
  }

  return res
}

export abstract class MatcherWithJoker extends PatternMatcherBase {

  protected matcher: PatternMatcherBase

  type() {
    return this.matcher.type()
  }

  whatName() {
    return this.matcher.whatName()
  }

  score() {
    return this.matcher.score()
  }

  findAll(): CalcResult[] {
    const normalCards = this.cards.filter(card => card.type !== CardType.Joker)

    const wildCardGroup: Card[][] = this.generateWildCardGroup(this.cards)
    const rs = []

    for (let i = 0; i < wildCardGroup.length; i++) {
      const wildCards = wildCardGroup[i]

      const replacedCards = normalCards.concat(wildCards)

      for (let index = 0; index < replacedCards.length; index++) {
        this.matcher.cards[index] = replacedCards[index]
      }

      const matcherRes = this.matcher.findAll()

      matcherRes.forEach(r => {

        r.cards.forEach((c, j) => {
          if (c.fakeBy) {
            r.cards[j] = c.fakeBy.clone()
            r.cards[j].actAs(c)
          }
        })
      })

      if (matcherRes.length > 0)
        rs.push(...matcherRes)
    }

    return rs
  }

  abstract generateWildCardGroup(cards: Card[]): Card[][]
}

export function replaceJokersUseSpadeWithAllSameValues(cards: Card[]) {

  const jokers = cards.filter(card => card.type === CardType.Joker)

  const normalCards = cards.filter(card => card.type !== CardType.Joker)

  const values = uniqueByHash(normalCards, c => `${c.value}`)
    .map(c => c.value)

  const types = [CardType.Spades]

  let wildCardGroup = [[]]

  if (jokers.length === 1) {
    wildCardGroup = []

    types.forEach(t => {
      for (let i = 0; i < values.length; i++) {
        const v = values[i]
        const wildCard = new Card(t, v)
        wildCard.fakeBy = jokers[0]
        wildCardGroup.push([wildCard])
      }
    })
  }

  if (jokers.length === 2) {
    wildCardGroup = []

    types.forEach(t => {

      for (let i = 0; i < values.length; i++) {
        const v = values[i]
        for (let j = i; j < values.length; j++) {
          const v2 = values[j]

          const wildCard = new Card(t, v)
          const wildCard2 = new Card(t, v2)
          wildCard.fakeBy = jokers[0]
          wildCard2.fakeBy = jokers[1]
          wildCardGroup.push([wildCard, wildCard2])
        }
      }
    })
  }

  return wildCardGroup
}

export function createJokerMatcher(Matcher: new(opts) => PatternMatcherBase,
                                   jokerReplaceFunc: (cards: Card[]) => Card[][]) {

  return class extends MatcherWithJoker {

    generateWildCardGroup(cards: Card[]): Card[][] {
      return jokerReplaceFunc(cards);
    }

    constructor(opts) {
      super(opts)
      this.matcher = new Matcher(opts)
    }
  }
}

export function replaceJokersWithGaps(jokers: Card[], normalCards: Card[], type: CardType) {

  const values = uniqueByHash(normalCards, c => `${c.value}`)
    .map(c => c.value)

  if (jokers.length === 0) return [[]]

  if (values.length + jokers.length < 5) return [[]]

  const offset = jokers.length
  const gapValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    .filter(v => values.some(my => Math.abs(my - v) <= offset))

  if (jokers.length === 1) {
    const wildCards = []
    gapValues.forEach(v => {
      const c = new Card(type, v)
      c.fakeBy = jokers[0].clone()

      wildCards.push([c])
    })
    return wildCards
  }

  if (jokers.length === 2) {
    const wildCards = []
    for (let i = 0; i < gapValues.length; i++) {
      const v1 = gapValues[i]
      for (let j = i + 1; j < gapValues.length; j++) {
        const v2 = gapValues[j]
        const c1 = new Card(type, v1)
        c1.fakeBy = jokers[0].clone()

        const c2 = new Card(type, v2)
        c2.fakeBy = jokers[1].clone()

        wildCards.push([c1, c2])
      }
    }

    return wildCards
  }
}

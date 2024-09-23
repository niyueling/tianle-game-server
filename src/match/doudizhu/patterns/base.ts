import Card, {CardType} from "../card"

export const last = function <T>(arr: T[]): T {
  return arr[arr.length - 1]
}

export function groupBy<T>(array: T[], fn: (T) => number): T[][] {
  const hash: { [id: number]: T[] } = {}
  array.forEach(item => {
    const key = fn(item)
    if (hash[key]) {
      hash[key].push(item)
    } else {
      hash[key] = [item]
    }
  })
  return Object.keys(hash).map(key => hash[key])
}

export interface IPattern {
  name: string;
  score: number;
  cards: Card[];
}

export const PatterNames = {
  single: 'single',
  double: 'double',
  doubles: 'doubles_',
  triples: 'triples_',
  bomb: 'bomb',
  triple: 'triple',
  // 三张带对子
  triplePlus2: 'triple++',
  // 3带1
  triplePlusX: 'tripleX',
  // 飞机不带
  straightTriples: 'triples',
  // 飞机带单张
  straightTriplePlus2: 'triples++_',
  // 飞机带对子
  straightTriplePlusX: 'triplesX_',
  // 顺子
  straight: 'straight_',
  // 4带3
  quadPlus3: 'quadruple+++',
  // 4带2
  quadPlus2: 'quadruple++',
  // 4带2对
  quadPlusX: 'quadrupleX',
}

export interface IMatcher {
  verify (cards: Card[], allCards?: Card[]): IPattern | null
  promptWithPattern (target: IPattern, cards: Card[]): Card[][]
}

export const lengthFirstThenPointGroupComparator = function (g1: Card[], g2: Card[]) {
  if (g1.length !== g2.length) {
    return g1.length - g2.length
  }

  return g1[0].point - g2[0].point
}

export class NullCheck implements IMatcher {
  verify(cards: Card[]) {
    return null
  }

  promptWithPattern(target, cards: Card[]): Card[][] {
    return []
  }
}

const sideKick1Joker: Card[][] = Array.from({length: 13}, (_, i) => [new Card(CardType.Wild, i + 1)])

function mergeWithOneSuit(cards: Card[][]): Card[][] {
  const result1 = []
  for (let i = 0; i < sideKick1Joker.length; i++) {
    const [card] = sideKick1Joker[i]

    for (let j = 0; j < cards.length; j++) {
      const group = cards[j]

      if (card.point >= group[0].point) {
        result1.push([card, ...group])
      }
    }
  }

  return result1
}

const sideKick2Joker = mergeWithOneSuit(sideKick1Joker)
const sideKick3Joker = mergeWithOneSuit(sideKick2Joker)
const sideKick4Joker = mergeWithOneSuit(sideKick3Joker)

export const sideKicks: Card[][][] = [
  [],
  sideKick1Joker,
  sideKick2Joker,
  sideKick3Joker,
  sideKick4Joker
]

// noinspection JSUnusedLocalSymbols
export function verifyWithJoker(target, propertyKey: string, propDesc: PropertyDescriptor) {
  const originVerify = propDesc.value as (cards: Card[]) => IPattern | null

  propDesc.value = function (cards: Card[]): IPattern | null {
    const patternWithoutJoker = originVerify.call(this, cards)

    const normalCards = cards.filter(c => c.type !== CardType.Joker)
    const nJokers = cards.filter(c => c.type === CardType.Joker).length

    const allPatterns = sideKicks[nJokers]
      .map(wildCards => {
        return originVerify.call(this, [...wildCards, ...normalCards])
      })

    allPatterns.push(patternWithoutJoker)

    const bestFit = allPatterns.filter(pattern => pattern)
      .sort((p1, p2) => p2.score - p1.score) [0]

    if (bestFit) {
      bestFit.cards = cards
    }

    return bestFit
  }
}

function replaceWild(cardsWithWild: Card [], jokers: Card[]) {
  let jokerIndex = 0
  let wildIndex = 0

  do {
    wildIndex = cardsWithWild.findIndex(c => c.type === CardType.Wild)

    if (wildIndex >= 0) {
      cardsWithWild.splice(wildIndex, 1, jokers[jokerIndex])
      jokerIndex++
    }
  } while (wildIndex >= 0)

  return cardsWithWild
}

// noinspection JSUnusedLocalSymbols
export function promptWithWildJoker(prototype, properKey: string, propDesc: PropertyDescriptor) {
  const originPrompt = propDesc.value  as   (target: IPattern, cards: Card[]) => Card[][]

  propDesc.value = function (target: IPattern, cards: Card[]): Card[][] {

    const promptWithOutJoker = originPrompt.call(this, target, cards)

    if (promptWithOutJoker.length > 0) {
      return promptWithOutJoker
    }

    const normalCards = cards.filter(c => c.type !== CardType.Joker)
    const jokers = cards.filter(c => c.type === CardType.Joker).sort(Card.compare)
    const nJokers = jokers.length

    for (let nUseAsWild = 1; nUseAsWild <= nJokers; nUseAsWild++) {
      const sideKick = sideKicks[nUseAsWild]

      for (let i = 0; i < sideKick.length; i++) {
        const wildCards = sideKick[i]

        const promptWithJoker = originPrompt.call(this, target, [...normalCards, ...wildCards])
        if (promptWithJoker.length > 0) {
          return promptWithJoker.map(prompt => {
            return replaceWild(prompt, jokers)
          })
        }
      }
    }

    return []
  }
}

// 从列表中删除
export function arraySubtract(cards: Card[], toRemoves: Card[]) {
  const copy = cards.slice()

  for (let i = 0; i < toRemoves.length; i++) {
    const toRemove = toRemoves[i]
    const indexToRemove = copy.findIndex(c => Card.compare(c, toRemove) === 0)
    if (indexToRemove >= 0) {
      copy.splice(indexToRemove, 1)
    }
  }
  return copy
}

// 比较后面出的牌是不是大过之前的
export function patternCompare(pattern1: IPattern, pattern2: IPattern): number {
  if (!pattern1) return -1
  if (!pattern2) return 1
  if (pattern1.name === pattern2.name) {
    return pattern1.score - pattern2.score
  }
  if (pattern1.name === PatterNames.bomb) {
    return 1
  }
}

export function orCompose(match1: IMatcher, mather2: IMatcher): IMatcher {

  return {

    verify(cards: Card[]): IPattern | null {

      return match1.verify(cards) || mather2.verify(cards)
    },

    promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
      return [
        ...match1.promptWithPattern(target, cards),
        ...mather2.promptWithPattern(target, cards)]
    }
  }

}

export function flatten<T>(arrInArr: T[][]): T[] {
  const array: T[] = []
  // 合并二维数组为一维数组
  return arrInArr.reduce((acc, value) => {
    acc.push(...value)
    return acc
  }, array)
}

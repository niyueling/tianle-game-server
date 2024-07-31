import Card from "./card";

export function intersectComposite<T>(arrayA: T[], arrayB: T[], equalFn: (a: T, b: T) => boolean): Array<T[]> {
  const composites = []

  if (arrayA && arrayB) {
    arrayA.forEach(a => {
      arrayB.forEach(b => {
        const notEqual = !equalFn(a, b)

        if (notEqual) {
          composites.push([a, b])
        }
      })
    })
  }
  return composites
}

export function groupBy<T>(array: T[], fn: ((T) => number)): T[][] {
  const hash = {}
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

export function isStraight(cards: Card[]): boolean {
  for (let i = 0; i < cards.length - 1; i++) {
    const prev = cards[i]
    const next = cards[i + 1]

    if (next.point - prev.point !== 1) {
      return false
    }
  }

  return true
}


export function isSameColor(cards: Card[]): boolean {
  for (let i = 0; i < cards.length - 1; i++) {
    const prev = cards[i]
    const next = cards[i + 1]

    if (next.type !== prev.type) {
      return false
    }
  }

  return true
}

export function lengthOf(array: any[], expect: number): boolean {
  return array.length === expect
}

export function values(obj: object): any[] {
  return Object.keys(obj).map(k => obj[k])
}

export function combinations(arr, count) {
  const rs = []
  const recur = (snap, idx) => {
    if (snap.length === count) {
      rs.push(snap.slice())
      return
    }

    if (idx >= arr.length) {
      return
    }

    recur([...snap], idx + 1)
    recur([...snap, arr[idx]], idx + 1)
  }

  recur([], 0)
  return rs

}


export function stringifyCards(cards: Card[]): string {
  return cards.map(c => c.toString()).join(' ')
}

import Card from "../card"
import {groupBy} from "../utils"
import {
  ComboTypes, createJokerMatcher,
  MatcherWithJoker,
  PatternMatcherBase,
  replaceAToOne,
  replaceJokersUseSpadeWithAllSameValues
} from "./base"

export class Bomb extends PatternMatcherBase {

  whatName(): string {
    return '炸弹'
  }

  type() {
    return ComboTypes.BOMB
  }

  score(): number {
    return 900
  }

  findAll() {
    const isFully = cards => cards.length === this.capacity
    const boomArray = this.findCountEql()
    boomArray.forEach(boom => this.padding(boom))
    return boomArray.filter(isFully)
      .map(bomb => this.snapshot(bomb))
  }

  findCountEql(count: number = 4): Card[][] {
    const result = []
    const cardsArray = groupBy(this.cards, card => card.value)
      .filter(cards => cards.length >= 4)
    cardsArray.forEach(c => {
      result.push(c.slice(0, 4))
    })
    return result;
  }
}

export const BombWithJoker = createJokerMatcher(Bomb, replaceJokersUseSpadeWithAllSameValues)

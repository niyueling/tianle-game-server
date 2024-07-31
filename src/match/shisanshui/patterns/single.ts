import Card from "../card"
import {ComboTypes, PatternMatcherBase} from "./base"

export class Single extends PatternMatcherBase {

  whatName(): string {
    return '单张'
  }

  type() {
    return ComboTypes.SINGLE
  }

  score(): number {
    return 10
  }

  findAll() {
    const isFive = this.cards.length > 3
    const maxCard = this.cards.sort(Card.compare).reverse()[0]
    // 从最大的牌开始，在 this.cards 中填充
    const final = this.padding([maxCard], isFive ? 4 : 2)
    return [this.snapshot(final)]
  }
}

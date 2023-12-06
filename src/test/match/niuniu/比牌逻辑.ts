import {expect} from "chai"
import Card, {CardType} from "../../../match/niuniu/card"

describe('card 比较逻辑', () => {
  context('点数不同', () => {
    it('点数不同 看点数', () => {
      const s11 = new Card(CardType.Spades, 11)
      const s3 = new Card(CardType.Spades, 3)
      expect(Card.compare(s11, s3)).to.gt(0)
    })


    it('A 最小', () => {
      const sA = new Card(CardType.Spades, 1)
      const s3 = new Card(CardType.Spades, 3)
      expect(Card.compare(sA, s3)).to.lt(0)
    })
  })

  context('点数相同', () => {
    it('黑 > 红 > 草 >方', () => {
      const s3 = new Card(CardType.Spades, 3)
      const h3 = new Card(CardType.Heart, 3)
      const c3 = new Card(CardType.Club, 3)
      const d3 = new Card(CardType.Diamond, 3)
      expect(Card.compare(s3, h3)).to.gt(0)
      expect(Card.compare(h3, c3)).to.gt(0)
      expect(Card.compare(c3, d3)).to.gt(0)
    })

  })

})

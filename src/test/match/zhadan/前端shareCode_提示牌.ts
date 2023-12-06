import * as chai from "chai"
import * as chaiProperties from "chai-properties"
import {findFullMatchedPatternForPlainCard, isGreaterThanPatternForPlainCards} from "../../../match/zhadan/patterns"
import {CardType} from "../../../match/zhadan/card"

chai.use(chaiProperties)

const {expect} = chai

describe('前端提示牌', function () {

  it('查询当前牌的模式 3+2', () => {
    const pattern = findFullMatchedPatternForPlainCard([
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 3},
      {type: CardType.Spades, value: 3},
    ])
    expect(pattern).to.have.properties({name: 'triple++'})
  })

  it('查询当前牌的模式 3+1', () => {
    const pattern = findFullMatchedPatternForPlainCard([
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 3}
    ])
    expect(pattern).to.be.null
  })
})


describe('验证时候合法', () => {


  it('自由牌 最后 3+1', function () {
    expect(isGreaterThanPatternForPlainCards([
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 3},
    ], null, 4)).to.have.properties({
      name: "triple++"
    })
  })

  it('自由牌 留一张手牌 3+1', function () {
    expect(isGreaterThanPatternForPlainCards([
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 1},
      {type: CardType.Spades, value: 3},
    ], null, 5)).to.be.null
  })

  it('自由牌 6+1', function () {
    expect(isGreaterThanPatternForPlainCards([
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 3},
    ], null, 7)).have.properties({
        name: 'triples++_2'
      }
    )
  })

  it('自由牌 留一张手牌 6+1', function () {
    expect(isGreaterThanPatternForPlainCards([
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 3},
    ], null, 8)).be.null
  })

  it('非自由牌 留一张手牌 6+1', function () {
    expect(isGreaterThanPatternForPlainCards([
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 10},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 3},
    ], {
      name: 'triples++_2', cards: [], level: 2, score: 3
    }, 7))
      .have.properties({
      name: 'triples++_2'
    })
  })

  it('非自由牌 3+1', function () {
    expect(isGreaterThanPatternForPlainCards([
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 9},
      {type: CardType.Spades, value: 3},
    ], {
      name: 'triple++', cards: [], score: 3
    }, 4))
      .have.properties({
      name: 'triple++'
    })
  })
})

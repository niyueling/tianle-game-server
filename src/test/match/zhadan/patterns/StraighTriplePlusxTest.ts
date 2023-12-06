import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/zhadan/enums'
import {IMatcher, PatterNames} from "../../../../match/zhadan/patterns/base"
import {isGreaterThanPattern} from '../../../../match/zhadan/patterns'
import StraightTriplePlusXMatcher, {default as StraightTriplesPlusXMatcher} from "../../../../match/zhadan/patterns/StraightTriplePlusXMatcher"

chai.use(chaiProperties)
const {expect} = chai

describe('连3 + X', () => {

  let matcher: IMatcher

  before(() => {
    matcher = new StraightTriplePlusXMatcher(2)
  })

  it('7778889996匹配3连张isGreaterThan（333444555778899）',()=>{
    const result =  isGreaterThanPattern([
      Enums.c7, Enums.s7, Enums.h7,
      Enums.c8, Enums.s8, Enums.h8,
      Enums.c9, Enums.s9, Enums.h9,
      Enums.h6
    ],{cards:[
      Enums.c3, Enums.s3, Enums.h3,
      Enums.c4, Enums.s4, Enums.h4,
      Enums.c5, Enums.s5, Enums.h5,
      Enums.h7, Enums.s7,
      Enums.h8, Enums.s8,
      Enums.h9, Enums.s9
    ],level:3,name:'triples++_3',score:4},10)

    expect(result).to.have.properties({
      name: 'triples++_3',
      score: 7
    })
  })


  it('333444 可以出', () => {
    expect(matcher.verify([
      Enums.c3, Enums.s3, Enums.h3,
      Enums.c4, Enums.s4, Enums.h4
    ])).to.have.properties({
      name: 'triples++_2',
      score: 3
    })

  })

  it('333444 5 可以出', () => {
    expect(matcher.verify([
      Enums.c3, Enums.s3, Enums.h3,
      Enums.c4, Enums.s4, Enums.h4,
      Enums.c5
    ])).to.have.properties({
      name: 'triples++_2',
      score: 3
    })
  })

  it('333444555 可以出', () => {
    matcher = new StraightTriplePlusXMatcher(3)

    expect(matcher.verify([
      Enums.c3, Enums.s3, Enums.h3,
      Enums.c4, Enums.s4, Enums.h4,
      Enums.c5, Enums.s5, Enums.h5,
    ])).to.have.properties({
      name: 'triples++_3',
      score: 3
    })
  })

  it('333444555 67 可以出', () => {
    expect(matcher.verify([
      Enums.c3, Enums.s3, Enums.h3,
      Enums.c4, Enums.s4, Enums.h4,
      Enums.c5, Enums.s5, Enums.h5,
      Enums.h6, Enums.h7
    ])).to.have.properties({
      name: 'triples++_3',
      score: 3
    })
  })


  context('连3+X 牌型提示', () => {

    it('aaabbb 提示', function () {

      matcher = new StraightTriplesPlusXMatcher(2)

      expect(matcher.promptWithPattern({
        name: PatterNames.straightTriplePlus2 + 2,
        cards: [Enums.c3, Enums.c3, Enums.c3, Enums.c4, Enums.c4, Enums.c4, Enums.c6, Enums.c6, Enums.c8, Enums.c8],
        score: 3
      }, [Enums.c9, Enums.c9, Enums.c9, Enums.c10, Enums.c10, Enums.c10, Enums.c5]))
        .to.have.length(1)
    })
  })
})



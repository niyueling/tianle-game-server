import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {IMatcher} from "../../../../match/paodekuai/patterns/base";
import StraightTriplePlusXMatcher from "../../../../match/paodekuai/patterns/StraightTriplePlusXMatcher";

chai.use(chaiProperties)
const {expect} = chai

describe('连3 + X', () => {

  let matcher: IMatcher

  before(() => {
    matcher = new StraightTriplePlusXMatcher()
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

})


describe('连3+X 牌型提示', () => {


})

import DoubleMatcher from "../../../../match/biaofen/patterns/DoubleMatcher"
import Enums from '../../../../match/biaofen/enums'
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'
import StraightDoublesMatcher from "../../../../match/biaofen/patterns/StraightDoublesMatcher"

chai.use(chaiProperties)
const {expect} = chai

describe('拖拉机', () => {


  let doublesPattern: StraightDoublesMatcher

  before(() => {
    doublesPattern = new StraightDoublesMatcher()
  })

  it('同色3344是拖拉机', () => {

    expect(doublesPattern.verify([
      Enums.c3, Enums.c4,
      Enums.c3, Enums.c4
    ])).to.have.properties({name: 'doubles_2', score: 3, level: 2})
  });

  it('不同色3344*不是*拖拉机', () => {
    expect(doublesPattern.verify([
      Enums.c3, Enums.s4,
      Enums.c3, Enums.s4
    ])).to.equal(null)
  })
  
})

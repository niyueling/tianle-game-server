import * as chai from "chai"
import * as chaiProperties from "chai-properties"
import Enums from "../../../../match/shisanshui/enums"
import {StraightWithJoker} from "../../../../match/shisanshui/patterns/straight";

chai.use(chaiProperties)

const {expect} = chai


describe('顺子 带 joker', () => {

  it('5张顺子牌', () => {

    const cards = [
      Enums.c4, Enums.s5, Enums.s6, Enums.h7, Enums.d8
    ]

    const matcher = new StraightWithJoker({cards})
    expect(matcher.findOne()).to.have.properties({found: true, name: '顺子'})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(1)
  });

  it('4顺子牌 + 1 joker', () => {
    const cards = [
      Enums.j1, Enums.s5, Enums.s6, Enums.h7, Enums.d8
    ]

    const matcher = new StraightWithJoker({cards})
    expect(matcher.findOne()).to.have.properties({found: true, name: '顺子'})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(6)
  })

  it('3顺子牌 + 2 joker', () => {
    const cards = [
      Enums.j1, Enums.s5, Enums.j2, Enums.h7, Enums.d8
    ]

    const matcher = new StraightWithJoker({cards})
    expect(matcher.findOne()).to.have.properties({found: true, name: '顺子', score: 5009080706050})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(28)
  })

})



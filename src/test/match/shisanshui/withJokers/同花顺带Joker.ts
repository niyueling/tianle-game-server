import * as chai from "chai"
import * as chaiProperties from "chai-properties"
import Enums from "../../../../match/shisanshui/enums"
import {FlushWithJoker} from "../../../../match/shisanshui/patterns/flush";

chai.use(chaiProperties)

const {expect} = chai


describe('同花顺子 带 joker', () => {

  it('普通5张同花顺子牌', () => {

    const cards = [Enums.c5, Enums.c6, Enums.c7, Enums.c8, Enums.c9]

    const matcher = new FlushWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '同花顺'})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(1)
  })

  it('普通4张同花顺子牌 + joker', () => {

    const cards = [Enums.c5, Enums.c6, Enums.j1, Enums.c8, Enums.c9]

    const matcher = new FlushWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '同花顺'})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(7)
  })

  it('普通4张同花顺子牌 + 2xjoker', () => {

    const cards = [Enums.j2, Enums.c6, Enums.j1, Enums.c8, Enums.c9]

    const matcher = new FlushWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '同花顺'})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(28)
  })

})

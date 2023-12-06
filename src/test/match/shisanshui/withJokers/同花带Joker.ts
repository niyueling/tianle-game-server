import * as chai from "chai"
import * as chaiProperties from "chai-properties"
import Enums from "../../../../match/shisanshui/enums"
import {SameColorWithJoker} from "../../../../match/shisanshui/patterns/sameColor"

chai.use(chaiProperties)

const {expect} = chai


describe('同花 带 joker', () => {

  it('五张花色相同', () => {

    const cards = [
      Enums.c1, Enums.c4, Enums.c5, Enums.c7, Enums.c11
    ]

    const matcher = new SameColorWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '同花'})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(1)
  });

  it('4张花色相同 + joker', () => {

    const cards = [
      Enums.c1, Enums.c4, Enums.c5, Enums.c7, Enums.j1, Enums.s3
    ]

    const matcher = new SameColorWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '同花'})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(1)
  })

  it('3张花色相同 + 2joker', () => {

    const cards = [
      Enums.c1, Enums.c4, Enums.c5, Enums.j2, Enums.j1, Enums.s3
    ]

    const matcher = new SameColorWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '同花'})
    expect(matcher.generateWildCardGroup(cards)).to.have.lengthOf(2)
  })

})

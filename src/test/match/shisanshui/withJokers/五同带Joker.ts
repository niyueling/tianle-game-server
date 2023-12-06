import * as chai from "chai"
import * as chaiProperties from "chai-properties"
import Enums from "../../../../match/shisanshui/enums"
import {FiveSameWithJoker} from "../../../../match/shisanshui/patterns/fiveSame"

chai.use(chaiProperties)

const {expect} = chai


describe('五同 带 joker', () => {


  it('普通五同', () => {

    const cards = [
      Enums.c3, Enums.s3, Enums.h3, Enums.d3, Enums.c3
      , Enums.c5
    ]

    const matcher = new FiveSameWithJoker({cards})


    expect(matcher.findOne()).to.have.properties({found: true, name: '五同'})
  })

  it('普通4同 + 1 joker', () => {
    const cards = [
      Enums.c10, Enums.s10, Enums.h10, Enums.d10, Enums.j1
      , Enums.c5
    ]
    const matcher = new FiveSameWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '五同'})
    expect(matcher.generateWildCardGroup(matcher.cards)).to.have.length(2)
  })

  it('普通3同 + 2 joker', () => {
    const cards = [
      Enums.c10, Enums.s10, Enums.h10, Enums.j2, Enums.j1
      , Enums.c5
    ]
    const matcher = new FiveSameWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '五同'})
    expect(matcher.generateWildCardGroup(matcher.cards)).to.have.length(3)
  })

  it('普通2同 + 2 joker', () => {
    const cards = [
      Enums.c10, Enums.s10, Enums.h11, Enums.j2, Enums.j1
      , Enums.c5
    ]
    const matcher = new FiveSameWithJoker({cards})
    expect(matcher.generateWildCardGroup(matcher.cards)).to.have.length(6)
    expect(matcher.findOne()).to.have.properties({found: false})
  })


})

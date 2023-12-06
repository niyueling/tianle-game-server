import * as chai from "chai"
import * as chaiProperties from "chai-properties"
import Enums from "../../../../match/shisanshui/enums"
import {BombWithJoker} from "../../../../match/shisanshui/patterns/bomb"

chai.use(chaiProperties)

const {expect} = chai


describe('炸弹 带 joker', () => {


  it('4个相同', () => {
    const cards = [Enums.c10, Enums.s10, Enums.c10, Enums.d10, Enums.c5]
    const matcher = new BombWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '炸弹'})
    expect(matcher.generateWildCardGroup(matcher.cards)).to.lengthOf(1)
  });

  it('3个相同 + 1joker', () => {
    const cards = [Enums.c10, Enums.s10, Enums.c10, Enums.j1, Enums.c5]
    const matcher = new BombWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '炸弹'})
    expect(matcher.generateWildCardGroup(matcher.cards)).to.lengthOf(2)
  });

  it('2个相同 + 2joker', () => {
    const cards = [Enums.c10, Enums.s10, Enums.j2, Enums.j1, Enums.c5]
    const matcher = new BombWithJoker({cards})

    expect(matcher.findOne()).to.have.properties({found: true, name: '炸弹'})
    expect(matcher.generateWildCardGroup(matcher.cards)).to.lengthOf(3)
  })

})

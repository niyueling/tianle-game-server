import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {findFullMatchedPattern, findFullMatchedPattern4} from "../../../../match/paodekuai/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {

  context('炸弹', () => {
    it('炸弹匹配 4炸', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.h3, Enums.s3, Enums.h3]))
        .to.have.properties({name: 'bomb', score: 403, cards: [Enums.c3, Enums.h3, Enums.s3, Enums.h3]})
    })

    it('3张 A 也是炸弹', () => {
      expect(findFullMatchedPattern([
        Enums.s1, Enums.h1, Enums.c1])
      ).to.have.properties({
        name: 'bomb', score: 414, cards: [Enums.s1, Enums.h1, Enums.c1]
      })
    })
    it('3张 2 也是炸弹(4人)', () => {
      expect(findFullMatchedPattern4([
        Enums.s2, Enums.h2, Enums.c2])
      ).to.have.properties({
        name: 'bomb', score: 415, cards: [Enums.s2, Enums.h2, Enums.c2]
      })
    })
  })
})

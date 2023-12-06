import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {findFullMatchedPattern} from "../../../../match/paodekuai/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {

  describe('单张', () => {
    it('单张模式匹配', () => {
      expect(findFullMatchedPattern([Enums.c3]))
        .to.have.properties({name: 'single', score: 3, cards: [Enums.c3]})
    })

    it('超过两张不是单张', () => {
      // noinspection TsLint
      expect(findFullMatchedPattern([Enums.c3, Enums.c4]))
        .to.be.null
    })
  })
})

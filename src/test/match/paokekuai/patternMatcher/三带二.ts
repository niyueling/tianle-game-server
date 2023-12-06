import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {findFullMatchedPattern,findFullMatchedPattern4} from "../../../../match/paodekuai/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {
  context('三张+2', () => {
    it('三张匹配 + 两张杂牌', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.c3, Enums.h3, Enums.c9, Enums.h5]))
        .to.have.properties({name: 'triple++', score: 3})
    })
  })
  context('三张(a 4人)', () => {
    it('三张a + 两张杂牌', () => {
      expect(findFullMatchedPattern4([Enums.c2, Enums.h2, Enums.s2, Enums.c9, Enums.h5]))
        .to.have.properties({name: 'triple++', score: 15})
    })
  })
})

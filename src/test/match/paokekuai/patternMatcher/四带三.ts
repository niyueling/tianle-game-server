import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {findFullMatchedPattern} from "../../../../match/paodekuai/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {
  context('4 带 3', () => {
    it('4张相同 + 三张杂牌', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.d3, Enums.h3, Enums.s3, Enums.c9, Enums.h5, Enums.cK]))
        .to.have.properties({name: 'quadruple+++', score: 3})
    })
  })
})

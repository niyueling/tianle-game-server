import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {findFullMatchedPattern} from "../../../../match/paodekuai/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {
  context('顺子', () => {

    it('4个顺子不能出', () => {
      // noinspection TsLint
      expect(findFullMatchedPattern([Enums.c3, Enums.c4, Enums.h5, Enums.c6]))
        .to.be.null
    })

    it('5顺子', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.c4, Enums.h5, Enums.c6, Enums.c7]))
        .to.have.properties({name: 'straight_5', score: 3})
    })

    it('6顺子 到 A', () => {
      expect(findFullMatchedPattern([Enums.c9, Enums.c10, Enums.cJ, Enums.cQ, Enums.cK, Enums.cA]))
        .to.have.properties({name: 'straight_6', score: 9})
    })

    it('顺子 不能到 2', () => {
      // noinspection TsLint
      expect(findFullMatchedPattern([
        Enums.c9, Enums.c10, Enums.cJ, Enums.cQ, Enums.cK, Enums.cA, Enums.c2
      ])).to.be.null
    })
  })
})

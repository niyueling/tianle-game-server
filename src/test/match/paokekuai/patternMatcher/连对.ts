import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {findFullMatchedPattern} from "../../../../match/paodekuai/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {
  context('连对', () => {
    it('3连对', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3,
        Enums.c4, Enums.c4,
      ]))
        .to.have.properties({name: 'doubles_2', score: 3})
    })

    it('3连对 不能到 2', () => {
      // noinspection TsLint
      expect(findFullMatchedPattern([
        Enums.cK, Enums.cK,
        Enums.c1, Enums.c1,
        Enums.c2, Enums.c2
      ]))
        .to.have.be.null
    })

    it('5连对', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3,
        Enums.c4, Enums.c4,
        Enums.c5, Enums.c5,
        Enums.c6, Enums.c6,
        Enums.c7, Enums.c7
      ]))
        .to.have.properties({name: 'doubles_5', score: 3})
    })
  })

})

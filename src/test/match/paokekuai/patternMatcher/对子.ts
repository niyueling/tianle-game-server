import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {findFullMatchedPattern} from "../../../../match/paodekuai/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {

  context('对子', () => {
    it('对子匹配', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.c3]))
        .to.have.properties({name: 'double', score: 3, cards: [Enums.c3, Enums.c3]})
    })
  })
})

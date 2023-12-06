import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../../match/paodekuai/enums'
import {findFullMatchedPattern} from "../../../../match/paodekuai/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {
  context('飞机带翅膀', () => {
    it('三个三张 + 3对', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3, Enums.h3,
        Enums.c4, Enums.c4, Enums.h4,
        Enums.c5, Enums.c5, Enums.h5,
        Enums.c9, Enums.h5,
        Enums.c10, Enums.h7,
        Enums.c10, Enums.h7
      ]))
        .to.have.properties({name: 'triples++_3', score: 3})
    })

    it('2个三张 + 2对', () => {
      // noinspection TsLint
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3, Enums.h3,
        Enums.c4, Enums.c4, Enums.h4,
        Enums.c9, Enums.h5,
        Enums.c10, Enums.h7,
      ]))
        .to.have.properties({name: 'triples++_2', score: 3})
    })
  })
})

import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/zhadan/enums'
import {findFullMatchedPattern} from "../../../match/zhadan/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配 带赖子', () => {

  context('单张', () => {
    it('单张模式匹配', () => {
      expect(findFullMatchedPattern([Enums.c3]))
        .to.have.properties({name: 'single', score: 3, cards: [Enums.c3]})
    })
  })

  context.skip('对子 单张+王', () => {
    it('单张+王', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.j1]))
        .to.have.properties({name: 'double', score: 3, cards: [Enums.c3, Enums.j1]})
    })

    it('对子匹配', () => {
      expect(findFullMatchedPattern([Enums.j1, Enums.j2]))
        .to.have.properties({name: 'double', score: 15, cards: [Enums.j1, Enums.j2]})
    })
  })

  context('炸弹', () => {
    it('炸弹匹配 5炸', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.h3, Enums.s3, Enums.h3, Enums.j1]))
        .to.have.properties({name: 'bomb', score: 503, cards: [Enums.c3, Enums.h3, Enums.s3, Enums.h3, Enums.j1]})
    })

    it('炸弹匹配 3+ 王 不是炸', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.h3, Enums.s3, Enums.j1]))
        .to.null
    })


    it('炸弹匹配 8炸', () => {
      expect(findFullMatchedPattern([
        Enums.s4, Enums.s4,
        Enums.h4, Enums.h4,
        Enums.c4, Enums.c4,
        Enums.d4, Enums.d4])
      ).to.have.properties({
        name: 'bomb', score: 804, cards: [
          Enums.s4, Enums.s4,
          Enums.h4, Enums.h4,
          Enums.c4, Enums.c4,
          Enums.d4, Enums.d4]
      })
    })
    it('炸弹匹配 王炸', () => {
      expect(findFullMatchedPattern([Enums.j1, Enums.j1, Enums.j2, Enums.j2]))
        .to.have.properties({name: 'bomb', score: 1000, cards: [Enums.j1, Enums.j1, Enums.j2, Enums.j2]})
    })
  })

  context.skip('三张+2', () => {
    it('三张杂牌 + 两王', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.j2, Enums.j1, Enums.c9, Enums.h5]))
        .to.have.properties({name: 'triple++', score: 9})
    })
  })

  context.skip('顺子', () => {
    it('5顺子', () => {
      expect(findFullMatchedPattern([Enums.j1, Enums.c4, Enums.h5, Enums.c6, Enums.c7]))
        .to.have.properties({name: 'straight_5', score: 4})
    })

    it('6顺子 到 A', () => {
      expect(findFullMatchedPattern([Enums.j1, Enums.c10, Enums.cJ, Enums.cQ, Enums.cK, Enums.cA]))
        .to.have.properties({name: 'straight_6', score: 9})
    })

    it('顺子 不能到 2', () => {
      expect(findFullMatchedPattern([
        Enums.j1, Enums.c10, Enums.cJ, Enums.cQ, Enums.cK, Enums.cA, Enums.c2
      ])).to.be.null
    })
  })

  context.skip('连对', () => {
    it('3连对', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3,
        Enums.c4, Enums.c4,
        Enums.j1, Enums.c5
      ]))
        .to.have.properties({name: 'doubles_3', score: 3})
    })

    it('5连对', () => {
      expect(findFullMatchedPattern([
        Enums.j1, Enums.j2,
        Enums.c4, Enums.c4,
        Enums.c5, Enums.c5,
        Enums.c6, Enums.c6,
        Enums.c7, Enums.c7
      ]))
        .to.have.properties({name: 'doubles_5', score: 4})
    })
  })

  context.skip('飞机', () => {
    it('3个 三连对', () => {
      expect(findFullMatchedPattern([
        Enums.j1, Enums.c3, Enums.c3, Enums.c10, Enums.cJ,
        Enums.c4, Enums.c4, Enums.j2, Enums.c9, Enums.c7,
        Enums.c5, Enums.c5, Enums.c5, Enums.s2, Enums.c10
      ]))
        .to.have.properties({name: 'triples++_3', score: 3})
    })

    it('5个 三连对 取最大的飞机', () => {
      expect(findFullMatchedPattern([
        Enums.c4, Enums.c4, Enums.c4,
        Enums.c5, Enums.c5, Enums.c5,

        Enums.c6, Enums.c6, Enums.c6,
        Enums.c7, Enums.c7, Enums.c7,
        Enums.j1, Enums.c8, Enums.c8,
      ]))
        .to.have.properties({name: 'triples++_3', score: 6})
    })

    it('5个 不连续三连对 取最大的飞机', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3, Enums.c3,
        Enums.c4, Enums.c4, Enums.c4,

        Enums.c7, Enums.c7, Enums.c7,
        Enums.c8, Enums.c8, Enums.c8,
        Enums.j1, Enums.j2, Enums.c9,
      ]))
        .to.have.properties({name: 'triples++_3', score: 7})
    })

  })

})

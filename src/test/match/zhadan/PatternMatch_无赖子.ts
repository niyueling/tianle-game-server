import * as chai from "chai"
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/zhadan/enums'
import {findFullMatchedPattern} from "../../../match/zhadan/patterns";

chai.use(chaiProperties)
const {expect} = chai

describe('模式匹配', () => {

  context('单张', () => {
    it('单张模式匹配', () => {
      expect(findFullMatchedPattern([Enums.j1]))
        .to.have.properties({name: 'single', score: 16, cards: [Enums.j1]})
    })
  })

  context('对子', () => {
    it('超过两张不是单张', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.c4]))
        .to.be.null
    })
    it('对子匹配', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.c3]))
        .to.have.properties({name: 'double', score: 3, cards: [Enums.c3, Enums.c3]})
    })
  })

  context('炸弹', () => {
    it('炸弹匹配 4炸', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.h3, Enums.s3, Enums.h3]))
        .to.have.properties({name: 'bomb', score: 403, cards: [Enums.c3, Enums.h3, Enums.s3, Enums.h3]})
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
    it('炸弹匹配 5王炸', () => {
      expect(findFullMatchedPattern([Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2]))
        .to.have.properties({name: 'bomb', score: 2000, cards: [Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2]})
    })
    it('炸弹匹配 6王炸', () => {
      expect(findFullMatchedPattern([Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2]))
        .to.have.properties({name: 'bomb', score: 3000, cards: [Enums.j1, Enums.j1, Enums.j1, Enums.j2, Enums.j2, Enums.j2]})
    })
  })

  context('三张+2', () => {
    it('三张匹配 + 两张杂牌', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.c3, Enums.h3, Enums.c9, Enums.h5]))
        .to.have.properties({name: 'triple++', score: 3})
    })
  })

  context('顺子', () => {
    it('5顺子', () => {
      expect(findFullMatchedPattern([Enums.c3, Enums.c4, Enums.h5, Enums.c6, Enums.c7]))
        .to.have.properties({name: 'straight_5', score: 3})
    })

    it('6顺子 到 A', () => {
      expect(findFullMatchedPattern([Enums.c9, Enums.c10, Enums.cJ, Enums.cQ, Enums.cK, Enums.cA]))
        .to.have.properties({name: 'straight_6', score: 9})
    })

    it('顺子 不能到 2', () => {
      expect(findFullMatchedPattern([
        Enums.c9, Enums.c10, Enums.cJ, Enums.cQ, Enums.cK, Enums.cA, Enums.c2
      ])).to.be.null
    })
  })

  context('连对', () => {
    it('3连对', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3,
        Enums.c4, Enums.c4,
        Enums.c5, Enums.c5
      ]))
        .to.have.properties({name: 'doubles_3', score: 3})
    })

    it('3连对 不能到 2', () => {
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

  context('飞机', () => {
    it('3个 三连对', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3, Enums.c3, Enums.c10, Enums.cJ,
        Enums.c4, Enums.c4, Enums.c4, Enums.c9, Enums.c7,
        Enums.c5, Enums.c5, Enums.c5, Enums.s2, Enums.c10
      ]))
        .to.have.properties({name: 'triples++_3', score: 3})
    })

    it('3个 三连对 不能带2 ', () => {
      expect(findFullMatchedPattern([
        Enums.cK, Enums.cK, Enums.cK, Enums.c10, Enums.cJ,
        Enums.c1, Enums.c1, Enums.c1, Enums.c9, Enums.c7,
        Enums.c2, Enums.c2, Enums.c2, Enums.s7, Enums.c10
      ]))
        .to.be.null
    })


    it('5个 三连对 取最大的飞机', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3, Enums.c3,
        Enums.c4, Enums.c4, Enums.c4,
        Enums.c5, Enums.c5, Enums.c5,
        Enums.c6, Enums.c6, Enums.c6,
        Enums.c7, Enums.c7, Enums.c7,
      ]))
        .to.have.properties({name: 'triples++_3', score: 5})
    })

    it('5个 不连续三连对 取最大的飞机', () => {
      expect(findFullMatchedPattern([
        Enums.c3, Enums.c3, Enums.c3,
        Enums.c4, Enums.c4, Enums.c4,

        Enums.c7, Enums.c7, Enums.c7,
        Enums.c8, Enums.c8, Enums.c8,
        Enums.c9, Enums.c9, Enums.c9,
      ]))
        .to.have.properties({name: 'triples++_3', score: 7})
    })


  })


})

import * as chai from 'chai'
import Analyzer from '../../../match/shisanshui/analyzer'
import Enums from '../../../match/shisanshui/enums'

chai.use(require('chai-properties'))
const expect = chai.expect

describe('自动组牌', () => {
  describe('找组合', () => {

    const triple = [Enums.c2, Enums.d2, Enums.s2]
    const gourd = [Enums.c3, Enums.d3, Enums.s3, Enums.d4, Enums.c4]
    const bomb = [Enums.c10, Enums.d10, Enums.s10, Enums.h10, Enums.c5]

    const single = [Enums.c1, Enums.d3, Enums.s5, Enums.h7, Enums.d9]
    const single2 = [Enums.d6, Enums.s10, Enums.d11, Enums.c12, Enums.h13]

    it('能找到多个组合', async function () {
      const cards = [...triple, ...gourd, ...bomb]
      const result = new Analyzer(cards).analyzeSuits()
      expect(result.suits.length).to.gt(1)
    })

    it('单张+三条+顺子', () => {
      const cards = [...triple, ...single, ...single2]
      const result = new Analyzer(cards).analyzeSuits()
      expect(result.suits.length).to.gt(0)

      const findResult = result.suits.find(suit => {
        return suit.head.name === '单张' &&
          suit.middle.name === '三条' &&
          suit.tail.name === '顺子'
      })
      expect(findResult).to.be.not.null
      expect(findResult.tail.score).to.eq(5214131211100)
      expect(findResult.tail.cards.join(',')).to.eq('♠10,♦J,♣Q,♥K,♣A')
    })
  })

  describe('奇牌', () => {
    const duiZi1 = [Enums.s1, Enums.d1]
    const duiZi2 = [Enums.s2, Enums.d2]
    const duiZi3 = [Enums.s3, Enums.d3]
    const duiZi4 = [Enums.s4, Enums.d4]
    const duiZi5 = [Enums.s5, Enums.d5]
    const duiZi6 = [Enums.s6, Enums.d6]

    const sanTiao7 = [Enums.s7, Enums.d7, Enums.h7]
    const sanTiao8 = [Enums.s8, Enums.d8, Enums.h8]
    const sanTiao9 = [Enums.s9, Enums.d9, Enums.h9]
    const sanTiao10 = [Enums.s10, Enums.d10, Enums.h10]

    const danZhang13 = [Enums.s13]

    const zhiZunQingLong = [Enums.s1, Enums.s2, Enums.s3, Enums.s4,
      Enums.s5, Enums.s6, Enums.s7, Enums.s8,
      Enums.s9, Enums.s10, Enums.s11, Enums.s12,
      Enums.s13
    ]

    const sanTongHua = [
      Enums.s1, Enums.s2, Enums.s3,
      Enums.s4, Enums.s5, Enums.s6, Enums.s7, Enums.s8,
      Enums.d7, Enums.d9, Enums.d10, Enums.d11, Enums.d12,
    ]

    const sanShunZi = [
      Enums.s1, Enums.s2, Enums.h3,
      Enums.d2, Enums.d3, Enums.d4, Enums.d5, Enums.d6,
      Enums.s9, Enums.s10, Enums.s11, Enums.s12, Enums.s13
    ]

    const sanTongHuaShun = [
      Enums.s9, Enums.s10, Enums.s11,
      Enums.s2, Enums.s3, Enums.s4, Enums.s5, Enums.s6,
      Enums.d9, Enums.d10, Enums.d11, Enums.d12, Enums.d13
    ]

    it('6对半', () => {
      const cards = [...duiZi1, ...duiZi2, ...duiZi3, ...duiZi4, ...duiZi5, ...duiZi6, ...danZhang13]
      const result = new Analyzer(cards).analyzeSuits()
      expect(result.isQiPai).to.be.true

      expect(result.qiPai).to.has.properties({name: '六对半', verify: true, score: 4, sorted: cards})
    })

    it('5对三条', () => {
      const cards = [...sanTiao7, ...duiZi1, ...duiZi2, ...duiZi3, ...duiZi4, ...duiZi5,]
      const result = new Analyzer(cards).analyzeSuits()
      expect(result.isQiPai).to.be.true
      expect(result.qiPai).to.has.properties({name: '五对三条', verify: true, score: 5})
    })

    it('4套三条', () => {
      const cards = [...sanTiao8, ...sanTiao9, ...sanTiao10, ...sanTiao7, ...danZhang13]
      const result = new Analyzer(cards).analyzeSuits()
      expect(result.isQiPai).to.be.true
      expect(result.qiPai).to.has.properties({name: '四套三条', verify: true, score: 6})
    })

    it('至尊清龙', () => {
      const cards = zhiZunQingLong
      const result = new Analyzer(cards).analyzeSuits()
      expect(result.isQiPai).to.be.true
      expect(result.qiPai).to.has.properties({name: '至尊清龙', verify: true, score: 10})
    })

    it('一条龙', () => {
      const yiTiaoLong = zhiZunQingLong.slice()
      yiTiaoLong.pop()
      yiTiaoLong.push(Enums.d13)

      const cards = yiTiaoLong
      const result = new Analyzer(cards).analyzeSuits()

      expect(result.isQiPai).to.be.true
      expect(result.qiPai).to.has.properties({name: '一条龙', verify: true, score: 9})
    })


    it.skip('凑一色', () => {
      const yiTiaoLong = zhiZunQingLong.slice()
      yiTiaoLong.pop()
      yiTiaoLong.push(Enums.h1)

      const cards = yiTiaoLong
      const result = new Analyzer(cards).analyzeSuits()

      expect(result.isQiPai).to.be.true
      expect(result.qiPai).to.has.properties({name: '凑一色', verify: true, score: 7})
    })


    it('三同花', () => {
      const cards = sanTongHua
      const result = new Analyzer(cards).analyzeSuits()

      expect(result.isQiPai).to.be.true
      expect(result.qiPai).to.has.properties({name: '三同花', verify: true, score: 1})
    })

    it('三顺子带同花顺', () => {
      const cards = sanShunZi
      const result = new Analyzer(cards).analyzeSuits()


      expect(result.isQiPai).to.be.true
      expect(result.qiPai).to.has.properties({name: '三顺子', verify: true, score: 3, extra: '带同花顺'})
    })

    it('三同花顺', () => {
      const cards = sanTongHuaShun
      const result = new Analyzer(cards).analyzeSuits()

      expect(result.isQiPai).to.be.true
      expect(result.qiPai).to.has.properties({name: '三同花顺', verify: true, score: 8})
    })
  })

})

import * as chai from "chai"
import * as chaiProperties from "chai-properties"
import Enums from "../../../../match/shisanshui/enums"
import {FlushWithJoker} from "../../../../match/shisanshui/patterns/flush";
import Analyzer from "../../../../match/shisanshui/analyzer";

chai.use(chaiProperties)

const {expect} = chai

describe('三同花优化', () => {


  const cards = [
    Enums.s2, Enums.s3, Enums.s4,
    Enums.s8, Enums.s7, Enums.s6, Enums.s6, Enums.c6,
    Enums.j1, Enums.j2, Enums.s13, Enums.s12, Enums.s8
  ]

  it('奇牌检测性能 bug', () => {
    console.time('bug1')

    const an = new Analyzer(cards)

    const d = an.detectQiPai()
    console.timeEnd('bug1')
  })

  it('普通牌检测性能 bug', () => {
    console.time('bug1')

    const an = new Analyzer(cards)

    const d = an.analyzeAll()

    // console.log(`${__filename}:36 \n`, d);
    console.timeEnd('bug1')
  })


  it('三同花顺 with Joker', () => {
    const an = new Analyzer([
      Enums.c5, Enums.j1, Enums.c7,
      Enums.s5, Enums.s6, Enums.s7, Enums.s8, Enums.s9,
      Enums.h2, Enums.h3, Enums.h4, Enums.j2, Enums.h6,
    ])

    const r = an.detectQiPai()
    expect(r).to.have.properties({isQiPai: true, qiPai: {verify: true, name: '三同花顺'}})
  })

  it('三同花顺 without Joker', () => {
    const an = new Analyzer([
      Enums.c5, Enums.c6, Enums.c7,
      Enums.s5, Enums.s6, Enums.s7, Enums.s8, Enums.s9,
      Enums.h2, Enums.h3, Enums.h4, Enums.h5, Enums.h6,
    ])

    const r = an.detectQiPai()
    expect(r).to.have.properties({isQiPai: true, qiPai: {verify: true, name: '三同花顺'}})
  })

  it('四套三条 with joker', () => {
    const an = new Analyzer([
      Enums.c5, Enums.s5, Enums.c5,
      Enums.c9, Enums.j1, Enums.c9,
      Enums.c1, Enums.s1, Enums.c1,
      Enums.s2, Enums.j2, Enums.s2,
      Enums.s8
    ])

    const r = an.detectQiPai()
    expect(r).to.have.properties({isQiPai: true, qiPai: {verify: true, name: '四套三条'}})
  })

  it('四套三条 without joker', () => {
    const an = new Analyzer([
      Enums.c5, Enums.s5, Enums.c5,
      Enums.c9, Enums.s9, Enums.c9,
      Enums.c1, Enums.s1, Enums.c1,
      Enums.s2, Enums.s2, Enums.s2,
      Enums.s8
    ])

    const r = an.detectQiPai()
    expect(r).to.have.properties({isQiPai: true, qiPai: {verify: true, name: '四套三条'}})
  })

  it('6同 bug', () => {
    const an = new Analyzer([
      Enums.s2, Enums.c2, Enums.d2, Enums.h2,
      Enums.c4, Enums.h4, Enums.s7, Enums.c7,
      Enums.s9, Enums.h11, Enums.s13,
      Enums.j1, Enums.j2
    ])

    const r = an.detectQiPai()
    expect(r).to.have.properties({isQiPai: true, qiPai: {verify: true, name: '六同'}})
  })

})


import * as chai from "chai"
import * as chaiProperties from "chai-properties"
import {LogCallback} from "winston"

import Analyzer from "../../../../match/shisanshui/analyzer";
import Enums from '../../../../match/shisanshui/enums'
import createCalculators from "../../../../match/shisanshui/patterns"

chai.use(chaiProperties)

const {expect} = chai

describe('带大小王', () => {

  it.skip('2 3 Joker', () => {

    const cards = [
      Enums.c2,
      Enums.s2,
      Enums.j2,
      Enums.j1,
      Enums.s4
    ]

    const calcs = createCalculators({cards})

    const rs = calcs.map((pattern) => {
      return pattern.max()
    })
      .filter(r => r.found)

    expect(rs[0].name).to.equal('一对')
    expect(rs[0].displayString()).equal('♣2,♠3,小🃏')
    expect(rs).to.have.length(1)
  })


  it('bug', () => {

    const cards = [
      Enums.c6, Enums.s6, Enums.c10, Enums.s10, Enums.j1,
    ]
    // const suits = new Analyzer(cards).analyze()
    const matcher = createCalculators({cards})[3]
  })


  it('analyzer 需要去重复', () => {
    const cards = [Enums.c3, Enums.s3, Enums.c10, Enums.s10, Enums.j1]

    const all = new Analyzer(cards).analyzeAll()

    expect(all[0]).to.have.lengthOf(1)
    expect(all[1]).to.have.lengthOf(2)
    expect(all[2]).to.have.lengthOf(1)
  });


  it('joker 组奇牌', () => {
    const cards = [Enums.c1, Enums.c2, Enums.c3,
      Enums.c4, Enums.j1, Enums.c6, Enums.c7, Enums.c8,
      Enums.c9, Enums.c10, Enums.c11, Enums.c12, Enums.c13
    ]
    const all = new Analyzer(cards).analyzeSuits()

    expect(all).to.have.properties({isQiPai: true})
  });

  it('至尊青龙 2joker', () => {
    const cards = [Enums.s1, Enums.s2, Enums.s3, Enums.s4,
      Enums.s5, Enums.s6, Enums.s7, Enums.s8,
      Enums.s9, Enums.s10, Enums.s11, Enums.j2,
      Enums.j1]

    const all = new Analyzer(cards).analyzeSuits()

    expect(all).to.have.properties({isQiPai: true, qiPai: {name: '至尊清龙'}})
  })

  it('三同花 2joker suits', () => {
    const cards = [
      Enums.j1, Enums.j2, Enums.c1,
      Enums.c13, Enums.s10, Enums.c9, Enums.h8, Enums.h8,
      Enums.c6, Enums.s4, Enums.h3, Enums.h3, Enums.h2,
    ]

    const result = new Analyzer(cards).analyzeSuits()

    expect(result.isQiPai).to.be.true
    expect(result.qiPai).to.has.properties({name: '三同花', verify: true, score: 1})
  })

  it('至尊青龙 2joker suits', () => {
    const cards = [Enums.s1, Enums.s2, Enums.s3, Enums.s4,
      Enums.s5, Enums.s6, Enums.s7, Enums.s8,
      Enums.s9, Enums.s10, Enums.s11, Enums.j2,
      Enums.j1]

    const all = new Analyzer(cards).analyzeAll()
    // expect(all).to.have.properties({isQiPai: true, qiPai: {name: '至尊清龙'}})
  })


  it('7同 ', () => {
    const cards = [Enums.j1, Enums.j2, Enums.h13,
      Enums.s11, Enums.s11, Enums.h11, Enums.c11, Enums.d11,
      Enums.s10, Enums.c9, Enums.h9, Enums.c7, Enums.s7]

    const aiPaiRes = new Analyzer(cards).detectQiPai()

    expect(aiPaiRes).to.have.properties({isQiPai: true, qiPai: {name: '七同'}})

    const x = new Analyzer(cards).verifyQiPai('五对三条')

  })

  it('7同 bug 老版本兼容',()=>{

    const cards = [Enums.j1, Enums.j2, Enums.h13,
      Enums.s11, Enums.s11, Enums.h11, Enums.c11, Enums.d11,
      Enums.s10, Enums.c9, Enums.h9, Enums.c7, Enums.s7]

    const verified = new Analyzer(cards).verifyQiPai('五对三条')

    expect(verified,)

  })


})

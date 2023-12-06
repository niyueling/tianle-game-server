import DoubleMatcher from "../../../../match/biaofen/patterns/DoubleMatcher"
import Enums from '../../../../match/biaofen/enums'


import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'

chai.use(chaiProperties)
const {expect} = chai

describe('对子判断逻辑', () => {

  context('检测', () => {
    it('同大小 同色才是对子', () => {
      const matcher = new DoubleMatcher()
      expect(matcher.verify([Enums.c3, Enums.c3])).to.have.properties({
        name: 'double', score: 3
      })
    });

    it('同大小 不同色不是对子', () => {
      const matcher = new DoubleMatcher()
      expect(matcher.verify([Enums.c3, Enums.s3])).to.equal(null)
    })

    it('joker 对子', () => {
      const matcher = new DoubleMatcher()
      expect(matcher.verify([Enums.j1, Enums.j1])).to.have.properties({name: 'double', score: 26})
    })
  })

  context('提示', () => {


  })

})

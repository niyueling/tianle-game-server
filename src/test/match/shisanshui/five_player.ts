import * as chai from 'chai'
import {groupBy} from "../../../match/utils"
import Enums from '../../../match/shisanshui/enums'
import Analyzer from "../../../match/shisanshui/analyzer"
import {getPlayerCards} from "../../../match/shisanshui/table"

chai.use(require('chai-properties'))
const expect = chai.expect

describe('five player game', () => {

  describe('cards', () => {
    const cards = getPlayerCards(5)

    it('have 65 cards', () => {
      expect(cards).to.be.lengthOf(13 * 5)
    })

    it('have double-spade', () => {
      const summary = groupBy(cards, c => c.type).map(cs => cs.length).join(',')
      expect(summary).to.be.eql('26,13,13,13')
    })
  })

  describe('spade pair', () => {
    const spadePair = [Enums.c1, Enums.c2, Enums.c3, Enums.s4, Enums.s4]
    const spadePairResult = new Analyzer(spadePair).analyze()[0]

    it('score have colorType buff', () => {
      expect(spadePairResult.score).to.be.eql(2004041403020)
    })
  })

})

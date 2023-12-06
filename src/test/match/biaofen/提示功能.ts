import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {default as Table} from '../../../match/biaofen/table'
import PlayerState from "../../../match/biaofen/player_state"
import {PatternService} from "../../../match/biaofen/patterns";
import setupMatch from './setupMatch'
import {CardType} from '../../../match/biaofen/card'
import Enums from '../../../match/biaofen/enums'

// chai.use(chaiProperties)
const {expect} = chai

describe('提示算法', () => {
  let allCards1 = [
    Enums.d9, Enums.d11, Enums.d13,
    Enums.c7, Enums.c9, Enums.c9, Enums.c11, Enums.c12,
    Enums.h8, Enums.h9, Enums.h11, Enums.h9, Enums.h13, Enums.h13,
    Enums.s5, Enums.s6, Enums.s8, Enums.s8, Enums.s12]

  let allCards2 = [
    Enums.d9,
    Enums.h8, Enums.h9,
    Enums.s5, Enums.s6, Enums.s8, Enums.s12
  ]

  let singleCards1 = [Enums.c7]
  let singleCards2 = [Enums.s6]
  let singleCards3 = [Enums.j1]
  let doubleCards1 = [Enums.c7, Enums.c7]
  let doubleCards2 = [Enums.s9, Enums.s9]
  let doubleCards3 = [Enums.d7, Enums.d7]
  let tuoLaJiCards1 = [Enums.h7, Enums.h7, Enums.h8, Enums.h8]
  let tuoLaJiCards2 = [Enums.c7, Enums.c7, Enums.c8, Enums.c8]
  let allCard = allCards1
  describe('同花色足够', () => {
    beforeEach(() => {
      allCard = allCards1
    })
    it('单张-♣7->♣7', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, singleCards1)

      expect(resultCard[0].toString()).to.equal("♣7")
    })

    it('单张-♠6->♠5', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, singleCards2)

      expect(resultCard[0].toString()).to.equal("♠5")
    })

    it('单张-小王->♠5', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, singleCards3)

      expect(resultCard[0].toString()).to.equal("♠5")
    })

    it('一对-♣7♣7->♣9♣9', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, doubleCards1)

      expect(resultCard[0].toString()).to.equal("♣9,♣9")
      expect(resultCard[0]).to.length(2)
    })

    it('一对-♠9♠9->♠8♠8', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, doubleCards2)

      expect(resultCard[0].toString()).to.equal("♠8,♠8")
      expect(resultCard[0]).to.length(2)
    })

    it('一对-♦7♦7->♦9♦J', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, doubleCards3)

      expect(resultCard[0].toString()).to.equal("♦9,♦J")
      expect(resultCard[0]).to.length(2)
    })

    it('拖拉机-♥7♥7♥8♥8->♥9♥9♥K♥K', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, tuoLaJiCards1)

      expect(resultCard[0].toString()).to.equal('♥9,♥9,♥K,♥K')
      expect(resultCard[0]).to.length(4)
    })

    it('拖拉机-♣7♣7♣8♣8->♣9♣9♣7♣J', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, tuoLaJiCards2)

      expect(resultCard[0].toString()).to.equal('♣9,♣9,♣7,♣J')
      expect(resultCard[0]).to.length(4)
    })
  })
  describe('同花色不够', () => {
    beforeEach(() => {
      allCard = allCards2
    })
    it('单张-♣7->♦9', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, singleCards1)

      expect(resultCard[0].toString()).to.equal("♦9")
    })

    it('单张-♠6->♠5', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, singleCards2)

      expect(resultCard[0].toString()).to.equal("♠5")
    })

    it('单张-小王->♠5', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, singleCards3)

      expect(resultCard[0].toString()).to.equal("♠5")
    })

    it('一对-♣7♣7->♦9,♥8', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, doubleCards1)

      expect(resultCard[0].toString()).to.equal("♦9,♥8")
      expect(resultCard[0]).to.length(2)
    })

    it('一对-♦7♦7->♦9♥8', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, doubleCards3)

      expect(resultCard[0].toString()).to.equal("♦9,♥8")
      expect(resultCard[0]).to.length(2)
    })

    it('拖拉机-♥7♥7♥8♥8->♥8♥9♦9♠5', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, tuoLaJiCards1)
      expect(resultCard[0].toString()).to.equal('♥8,♥9,♦9,♠5')
      expect(resultCard[0]).to.length(4)
    })

    it('拖拉机-♣7♣7♣8♣8->♦9♥8♥9♠5', () => {
      const patternObj = new PatternService(CardType.Spades, 6)
      const resultCard = patternObj.findMatchedCard(allCard, tuoLaJiCards2)
      expect(resultCard[0].toString()).to.equal('♦9,♥8,♥9,♠5')
      expect(resultCard[0]).to.length(4)
    })
  })
})

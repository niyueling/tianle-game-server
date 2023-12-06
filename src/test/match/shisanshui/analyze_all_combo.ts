import * as chai from 'chai'
import Card, {CardType} from '../../../match/shisanshui/card'
import Analyzer from '../../../match/shisanshui/analyzer'
import Combiner from "../../../match/shisanshui/combiner"
import Enums from '../../../match/shisanshui/enums'
import createCalculators from "../../../match/shisanshui/patterns/index"

chai.use(require('chai-properties'))
const expect = chai.expect

describe('找出牌中的组合', () => {

  const c5 = new Card(CardType.Club, 5)

  const h1 = new Card(CardType.Heart, 1)
  const h2 = new Card(CardType.Heart, 2)
  const h3 = new Card(CardType.Heart, 3)
  const h4 = new Card(CardType.Heart, 4)
  const h5 = new Card(CardType.Heart, 5)
  const h6 = new Card(CardType.Heart, 6)
  const h7 = new Card(CardType.Heart, 7)
  const h8 = new Card(CardType.Heart, 8)
  const h9 = new Card(CardType.Heart, 9)
  const h10 = new Card(CardType.Heart, 10)
  const hJ = new Card(CardType.Heart, 11)
  const hQ = new Card(CardType.Heart, 12)
  const hK = new Card(CardType.Heart, 13)


  const c8 = new Card(CardType.Club, 8)
  const c9 = new Card(CardType.Club, 9)

  const c10 = new Card(CardType.Club, 10)
  const c11 = new Card(CardType.Club, 11)
  const c12 = new Card(CardType.Club, 12)
  const h13 = new Card(CardType.Heart, 13)
  const h14 = new Card(CardType.Heart, 14)

  const s10 = new Card(CardType.Spades, 10)

  const stringify = cards => cards.join(',')

  const ctx = {scopeName: ''}

  const createScopeAnalyzer = cards => ({
    analyze() {
      expect(ctx.scopeName).to.not.empty
      return new Analyzer(cards).analyze().filter(combo => combo.name === ctx.scopeName)
    }
  })

  const analyzeCards = (cards: Card[]) => createScopeAnalyzer(cards).analyze()

  const initialLower = (str: string) => str.slice(0, 1).toLowerCase() + str.slice(1)

  describe('type', () => {
    it.skip('should eql className', () => {
      const ins = createCalculators({cards: []})
      ins.forEach(instance => {
        expect(instance.type()).to.be.eql(initialLower(instance.constructor.name))
      })
    })

    it('should have flush ', () => {
      const zhiZunLong = [Enums.h1, Enums.h13, Enums.h12, Enums.h11,
        Enums.h10, Enums.c9, Enums.h8, Enums.c8,
        Enums.d8, Enums.c7, Enums.d7, Enums.c6,
        Enums.h2]

      const combos = new Analyzer(zhiZunLong).analyze()
      expect(combos[0]).to.have.properties({
        type: 'flush',
        score: 100214131211100
      })
    })


    it('should have flush  A 2 3 4 5', () => {
      const zhiZunLong = [
        Enums.h9, Enums.h8, Enums.c8,
        Enums.h1, Enums.h2, Enums.h3, Enums.h4, Enums.h5,
        Enums.d2, Enums.c3, Enums.d4, Enums.c6, Enums.h7
      ]

      const combos = new Analyzer(zhiZunLong).analyze()
      expect(combos[0]).to.have.properties({
        type: 'flush',
        score: 100105040302010
      })
    })
  })

  describe('顺子', () => {
    before(() => {
      ctx.scopeName = '顺子'
    })

    it('一个顺子', () => {
      const cards = [c5, h6, h7, h8, h9]
      const combos = analyzeCards(cards)
      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.property('name').with.eql('顺子')
      expect(combos[0]).to.have.property('cards').with.eql(cards)
    })

    it('多个顺子 找到最大的', () => {
      const cards = [c5, h6, h7, h8, c8, h9, c9, c10]
      const combos = analyzeCards(cards)
      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.property('name').with.eql('顺子')
      expect(combos[0]).to.have.property('cards').with.eql([h6, h7, c8, c9, c10])
    })

    it('一个顺子 同花的', () => {
      const cards = [h9, h8, h7, h6, h5]
      const combos = analyzeCards(cards)
      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.property('name').with.eql('顺子')
      expect(combos[0]).to.have.property('cards').with.eql(cards.reverse())
    })

    it('两个顺子 给最大的顺子', () => {
      const cards = [c11, c10, h9, h8, h7, h6, c5]
      const combos = analyzeCards(cards)
      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.property('name').with.eql('顺子')
      expect(combos[0]).to.have.property('cards').with.eql([h7, h8, h9, c10, c11])
    })

    it('10 J Q K A 可以组成顺子', () => {
      const cards = [Enums.c10, Enums.h11, Enums.h12, Enums.h13, Enums.h1]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0].cards.join(',')).with.eql(cards.join(','))
    })

    it('A 2 3 4 5 可以组成顺子', () => {
      const cards = [Enums.c1, Enums.h2, Enums.h3, Enums.h4, Enums.h5]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0].cards.join(',')).with.eql(cards.join(','))
    })


    it('没有顺子', () => {
      const cards = [c5, h5, h7, h8, h9]
      const combos = analyzeCards(cards)
      expect(combos).to.be.lengthOf(0)
    })
  })

  describe('同花顺', () => {
    before(() => {
      ctx.scopeName = '同花顺'
    })

    it('2个顺子 一个同花顺', () => {
      const cards = [h5, h6, h7, h8, h9, c10, c11, c12, h13, h14]
      const sameColor = [h5, h6, h7, h8, h9]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0].cards.join(',')).with.eql(sameColor.join(','))
    })


    it('一个同花顺', () => {
      const cards = [h6, h7, h8, c8, h9, c9, h10]
      const sameColor = [h6, h7, h8, h9, h10]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0].cards.join(',')).with.eql(sameColor.join(','))
    })

    it('同花顺 算分 A2345 大于 910JQK', () => {
      const cardsA2345 = [h1, h2, h3, h4, h5]
      const cards910JQK = [h9, h10, hJ, hQ, hK]

      const combos1 = analyzeCards(cardsA2345)
      const combos2 = analyzeCards(cards910JQK)

      expect(combos1[0].score).gt(combos2[0].score)
    })


    it('2个顺子 没有同花', () => {
      const cards = [c5, h6, h7, h8, h9, c10, c11, c12, h13, h14]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(0)
    })

    it('3张9 + 同花5678 有同花顺', () => {
      const cards = [h5, h6, h7, h8, c9, h9, c9]
      const sameColor = [h5, h6, h7, h8, h9]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0].cards.join(',')).with.eql(sameColor.join(','))
    })
  })

  describe('炸弹', () => {
    before(() => {
      ctx.scopeName = '炸弹'
    })

    it('有一个炸弹', () => {
      const cards = [h6, h5, h5, h5, h5]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.property('cards').with.eql(cards)
    })

    it('4张牌 没有炸弹', () => {
      const cards = [h5, h5, h5, h5]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(0)
    })

    it('3张 + 1对 没有炸弹', () => {
      const cards = [h5, h5, h5, h6, h6]
      const combos = analyzeCards(cards)

      const filtered = combos.filter(combo => combo.name === '炸弹')
      expect(filtered).to.be.lengthOf(0)
    })
  })


  describe('葫芦', () => {
    before(() => {
      ctx.scopeName = '葫芦'
    })

    it('3张 + 2张', () => {
      const cards = [h5, h5, h5, h6, h6]
      const expected = [h6, h6, h5, h5, h5]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      const string = stringify(combos[0].cards)
      const expectString = stringify(expected)
      expect(string).to.be.eql(expectString)
    })

    it('3张 + 3张 葫芦', () => {
      const cards = [h5, h5, h5, h6, h6, h6]
      const expected = [h5, h5, h6, h6, h6]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)

      const [combo1] = combos
      const comboString = stringify(combo1.cards)
      expect(comboString).to.be.eql(stringify(expected))
    })


    it('最大 triple + 最小 twins ', () => {
      const expected = [Enums.h6, Enums.c6, Enums.c10, Enums.d10, Enums.s10]
      const cards = [h5, h5, h5, ...expected]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)

      const [combo1] = combos
      const comboString = stringify(combo1.cards)
      expect(comboString).to.be.eql(stringify(expected))
    })

    it('3张 + 单张 没葫芦', () => {
      const cards = [h5, h5, h5, h6, h7, h8]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(0)
    })
  })

  describe('同花', () => {
    before(() => {
      ctx.scopeName = '同花'
    })

    it('5张牌 有同花', () => {
      const cards = [h5, h6, h8, h9, h13]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '同花',
        type: 'sameColor',
        cards,
        found: true
      })
    })

    it('2组同花 选数字最大的', () => {
      const cards = [h5, h6, h8, h9, h13]
      const cards2 = [Enums.s5, Enums.s6, Enums.s8, Enums.s9, Enums.s12]
      const combos = analyzeCards([...cards2, ...cards])

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '同花',
        type: 'sameColor',
        cards,
        found: true
      })
    })

    it('2组同花 有一对黑桃', () => {
      const cards = [h5, h6, h8, h9, h13]
      const cards2 = [Enums.s5, Enums.s5, Enums.s8, Enums.s9, Enums.s12]
      const combos = analyzeCards([...cards2, ...cards])

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '同花',
        type: 'sameColor',
        cards: cards2,
        found: true
      })
    })

    it('2组同花 数字相同 选花色大的', () => {
      const cards = [h5, h6, h8, h9, h13]
      const cards2 = [Enums.s5, Enums.s6, Enums.s8, Enums.s9, Enums.s13]
      const combos = analyzeCards([...cards2, ...cards])

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '同花',
        type: 'sameColor',
        cards: cards2,
        found: true
      })
    })

    it('没有同花', () => {
      const cards = [h5, h6, h8, h9, c5]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(0)
    })
  })

  describe('三张', () => {
    before(() => {
      ctx.scopeName = '三条'
    })

    it('有三张h5', () => {
      const cards = [h5, h5, h5]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '三条',
        type: 'triple',
        cards: [h5, h5, h5],
        found: true
      })
    })

    it('2张h5', () => {
      const cards = [h5, h5, c10, c11, c12]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(0)
    })
  })

  describe('一对', () => {
    before(() => {
      ctx.scopeName = '一对'
    })

    it('一对 组合小牌', () => {
      const cards = [c8, c10, c11, h5, h5, c12]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '一对',
        type: 'pair',
        cards: [c8, c10, c11, h5, h5],
        found: true
      })
    })

    it('有三张h5', () => {
      const cards = [h5, h5, h5]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '一对',
        type: 'pair',
        cards: [h5, h5],
        found: true
      })
    })

    it('2对取最大的', () => {
      const cards = [Enums.c3, Enums.d2, Enums.h1, h5, h5, c10, h10]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.has.properties({
        name: '一对',
        type: 'pair',
        cards: [Enums.d2, Enums.c3, h5, c10, h10],
        found: true
      })
    })
  })

  describe('两对', () => {
    before(() => {
      ctx.scopeName = '两对'
    })

    it('3张h5 3张c10 有两对', () => {
      const cards = [Enums.c3, h5, h5, h5, c10, c10, c10]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '两对', type: 'doublePair',
        cards: [Enums.c3, h5, h5, c10, c10],
        found: true
      })
    })

    it('4对 最大和最小的配', () => {
      const cards = [Enums.h3, Enums.c3, h5, h5, c10, c10, Enums.c11, Enums.d11]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '两对', type: 'doublePair',
        cards: [h5, Enums.h3, Enums.c3, Enums.c11, Enums.d11]
        , found: true
      })
    })
  })

  describe('五同', () => {
    before(() => {
      ctx.scopeName = '五同'
    })

    it('找到', () => {
      const cards = [Enums.s3, Enums.s3, Enums.h3, Enums.c3, Enums.d3]
      const combos = analyzeCards(cards)

      expect(combos).to.be.lengthOf(1)
      expect(combos[0]).to.have.properties({
        name: '五同', type: 'fiveSame',
        cards,
        found: true
      })
    })
  })

  describe('all in', () => {
    it('所有可能的组合', () => {
      const cards = [h5, c5, h6, h7, c8, c9, h10, c10, s10]
      const combos = new Analyzer(cards).analyze()

      const comboNameStr = combos.map(result => result.name).join(',')
      expect(comboNameStr).to.be.eql('葫芦,顺子,三条,两对,一对,单张')
    })
  })

  describe('自动组牌', () => {
    it('自动组牌', () => {
      const cards = [
        new Card(CardType.Spades, 2),
        new Card(CardType.Spades, 3),
        new Card(CardType.Spades, 4),
        new Card(CardType.Spades, 5),

        new Card(CardType.Heart, 7),
        new Card(CardType.Heart, 8),
        new Card(CardType.Heart, 9),
        new Card(CardType.Heart, 10),

        new Card(CardType.Club, 12),
        new Card(CardType.Club, 13),

        new Card(CardType.Diamond, 3),
        new Card(CardType.Diamond, 5)
      ]
      const combiner = new Combiner(cards)

      expect(combiner.findAllSuit()[0])
        .to.have.properties({
        head: {name: '单张'},
        middle: {name: '单张'},
        tail: {name: '两对'},
      })
    })
  })

})

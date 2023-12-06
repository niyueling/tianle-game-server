import {expect} from 'chai'
import {last} from 'lodash'
import {displayMessage, packets} from './mockwebsocket'
import setupMatch from './setupMatch'
import HuCardFactory from './huCardType'
import HuPaiDetect from '../../../match/majiang/HuPaiDetect'
import Enums from '../../../match/majiang/enums'

const genAssistList = (cards, card) => {
  const assistList = new Array(38).fill(0);
  card && (assistList[card] = 1);
  cards.forEach(x => {
    if (x !== Enums.slotNoCard) {
      assistList[x]++;
    }
  });
  return assistList;
}

describe('兰溪', () => {
  let table, room, player1, player2, player3, player4
  let changeCaishen

  beforeEach(() => {
    const match = setupMatch(4)
    table = match.table
    room = match.room;
    changeCaishen = match.changeCaishen;
    [player1, player2, player3, player4] = match.players
  })

  describe('初始化', () => {
    it('136张牌', () => {
      expect(table.remainCards).to.be.eq(112)
      expect(table.cards).to.have.lengthOf(112)
    })

    it('老庄为1', () => {
      expect(room.initBase).to.be.eql(1)
      expect(room.currentBase).to.be.eql(1)
    })

    it('底分为1', () => {
      expect(room.glodPerFan).to.be.eql(1)
    })

    it('默认圈数4', () => {
      expect(room.rule.quan).to.be.eq(4)
      expect(room.lunZhuangCount).to.be.eq(16)
    })

    it('输分限制', () => {
      expect(room.rule.lostLimit).to.be.eq(Number.MIN_SAFE_INTEGER)
    })
  })

  describe('发牌之后', () => {
    beforeEach(() => {
      table.fapai()
    })

    it.skip('49张牌  //  unknown cards' , () => {
      expect(table.remainCards).to.be.eq(49)
    })
  })

  describe.skip('单纯检测胡型', () => {
    const events = []
    const rule = {ro: {kehu: []}}

    it('七对子敲响 2番', () => {
      const cards = HuCardFactory(Enums.shuzi5).qiDuiZiQiaoXiang_14
      const cardMap = genAssistList(cards)
      cardMap.caiShen = Enums.shuzi5
      cardMap.lastTakeCard = Enums.wanzi9
      const result = HuPaiDetect.check(cardMap, events, rule, 1)

      expect(result).to.have.property('hu').with.eql(true)
      expect(result).to.have.property('fan').with.eq(4)
    })

    it('七对子 白板敲响 3番', () => {
      const cards = HuCardFactory(Enums.shuzi5).qiDuiZiQiaoXiang_bai_14
      const cardMap = genAssistList(cards)
      cardMap.caiShen = Enums.shuzi5
      cardMap.lastTakeCard = Enums.bai
      const result = HuPaiDetect.check(cardMap, events, rule, 1)

      expect(result).to.have.property('hu').with.eql(true)
      expect(result).to.have.property('fan').with.eq(8)
    })

    it('双财归位', () => {
      const cards = HuCardFactory(Enums.tongzi4).shuangCaiGuiWei
      const cardMap = genAssistList(cards)
      cardMap.caiShen = Enums.tongzi4
      const result = HuPaiDetect.check(cardMap, events, rule, 1)

      expect(result).to.not.have.property('caiGuiWei')
      expect(result).to.have.property('fan').with.eq(4)
      expect(result).to.have.property('guiWeiCount').with.eq(2)
      expect(result).to.have.property('shuangCaiGuiWei').with.eq(true)
    })

    it('三财归位', () => {
      const cards = HuCardFactory(Enums.tongzi4).sanCaiGuiWei_11
      const cardMap = genAssistList(cards)
      cardMap.caiShen = Enums.tongzi4
      const result = HuPaiDetect.check(cardMap, events, rule, 1)

      expect(result).to.not.have.property('caiGuiWei')
      expect(result).to.have.property('fan').with.eq(8)
      expect(result).to.have.property('guiWeiCount').with.eq(3)
      expect(result).to.have.property('sanCaiGuiWei').with.eq(true)
    })


    it('三个财神', () => {
      const cards = HuCardFactory(Enums.tongzi4).sanCaiGuiWei_11
      const cardMap = genAssistList(cards)
      cardMap.caiShen = Enums.tongzi4
      const result = HuPaiDetect.check(cardMap, events, rule, 1)

      expect(result).to.not.have.property('caiGuiWei')
      expect(result).to.have.property('fan').with.eq(8)
      expect(result).to.have.property('guiWeiCount').with.eq(3)
      expect(result).to.have.property('sanCaiShen').with.true
      expect(result).to.have.property('sanCaiGuiWei').with.true
    })
  })

  describe.skip('七风检测', () => {
    it('七风', () => {
      const cards = HuCardFactory(Enums.wanzi1).youCaiQiFeng_13
      const cardMap = genAssistList(cards)
      cardMap.caiShen = Enums.wanzi1

      table.fapai()
      table.cards[table.remainCards - 1] = Enums.tongzi5

      player1.cards = genAssistList([Enums.dong, Enums.shuzi6])
      player2.cards = cardMap
      player3.cards = genAssistList([Enums.dong, Enums.wanzi1])
      player4.cards = genAssistList([Enums.dong, Enums.wanzi1])

      changeCaishen(Enums.wanzi1)

      let turn = 1
      player1.emitter.emit('da', turn, Enums.shuzi6)
      turn += 1
      player2.emitter.emit('hu', turn, Enums.shuzi6)
      displayMessage()

      const overMessage = last(packets).message
      const result = overMessage.states[0].events.dianPao[0]

      expect(result).to.have.property('hu').with.true
      expect(result).to.have.property('fan').with.eq(2)
      expect(result).to.have.property('qiFeng').with.true
    })
  })

  describe('游戏中胡牌', () => {
    describe('碰碰胡', () => {
      it('已经三碰 ,手上 1刻字 1单张', () => {
        const events = {'peng': [Enums.wanzi2, Enums.wanzi3, Enums.wanzi4]}
        const cards = HuCardFactory(Enums.tongzi4).pengPengHu_4
        const cardMap = genAssistList(cards)

        table.fapai()
        table.cards[table.remainCards - 1] = Enums.tongzi5

        player2.events = events

        player1.cards = genAssistList([Enums.dong])
        player2.cards = cardMap
        player3.cards = genAssistList([Enums.dong, Enums.wanzi1])
        player4.cards = genAssistList([Enums.dong, Enums.wanzi1])

        changeCaishen(Enums.tongzi4)

        let turn = 1
        player1.emitter.emit('da', turn, Enums.dong)
        turn += 1
        player2.emitter.emit('hu', turn, Enums.tongzi5)
        displayMessage()

        const overMessage = last(packets).message
        const result = overMessage.states[0].events.taJiaZiMo[0]

        expect(result).to.have.property('hu').with.true
        expect(result).to.have.property('fan').with.eq(2)
        expect(result).to.have.property('pengPengHu').with.true
      })

      it('2碰 1吃 不算碰碰胡', () => {
        const events = {'peng': [Enums.wanzi2, Enums.wanzi3], 'chi': [Enums.wanzi4]}
        const cards = HuCardFactory(Enums.tongzi4).pengPengHu_4
        const cardMap = genAssistList(cards)

        table.fapai()
        table.cards[table.remainCards - 1] = Enums.tongzi5

        player2.events = events

        player1.cards = genAssistList([Enums.dong])
        player2.cards = cardMap
        player3.cards = genAssistList([Enums.dong, Enums.wanzi1])
        player4.cards = genAssistList([Enums.dong, Enums.wanzi1])

        changeCaishen(Enums.tongzi4)

        let turn = 1
        player1.emitter.emit('da', turn, Enums.dong)
        turn += 1
        player2.emitter.emit('hu', turn, Enums.tongzi5)
        displayMessage()

        const overMessage = last(packets).message
        const result = overMessage.states[0].events.taJiaZiMo[0]

        expect(result).to.have.property('hu').with.true
        expect(result).to.have.property('fan').with.eq(1)
        expect(result).to.not.have.property('pengPengHu')
      })
    })


    it('2碰 2刻字 1单张', () => {
      const events = {'peng': [Enums.wanzi2, Enums.wanzi3]}
      const cards = HuCardFactory(Enums.tongzi4).pengPengHu_7
      const cardMap = genAssistList(cards)

      table.fapai()
      table.cards[table.remainCards - 1] = Enums.tongzi5

      player2.events = events

      player1.cards = genAssistList([Enums.dong])
      player2.cards = cardMap
      player3.cards = genAssistList([Enums.dong, Enums.wanzi1])
      player4.cards = genAssistList([Enums.dong, Enums.wanzi1])

      changeCaishen(Enums.tongzi4)

      let turn = 1
      player1.emitter.emit('da', turn, Enums.dong)
      turn += 1
      player2.emitter.emit('hu', turn, Enums.tongzi5)
      displayMessage()

      const overMessage = last(packets).message
      const result = overMessage.states[0].events.taJiaZiMo[0]

      expect(result).to.have.property('hu').with.true
      expect(result).to.have.property('fan').with.eq(2)
      expect(result).to.have.property('pengPengHu').with.true
    })


    it('2碰 1刻字 2单张 2财神', () => {
      const events = {'peng': [Enums.wanzi2, Enums.wanzi3]}
      const cards = HuCardFactory(Enums.tongzi4).pengPengHu_caiShen_7
      const cardMap = genAssistList(cards)

      table.fapai()
      table.cards[table.remainCards - 1] = Enums.tongzi5

      player2.events = events

      player1.cards = genAssistList([Enums.dong])
      player2.cards = cardMap
      player3.cards = genAssistList([Enums.dong, Enums.wanzi1])
      player4.cards = genAssistList([Enums.dong, Enums.wanzi1])

      changeCaishen(Enums.tongzi4)

      let turn = 1
      player1.emitter.emit('da', turn, Enums.dong)
      turn += 1
      player2.emitter.emit('hu', turn, Enums.tongzi5)
      displayMessage()

      const overMessage = last(packets).message
      const result = overMessage.states[0].events.taJiaZiMo[0]

      expect(result).to.have.property('hu').with.true
      expect(result).to.have.property('fan').with.eq(2)
      expect(result).to.have.property('pengPengHu').with.true
    })


    it.skip('3碰 1对 3财神', () => {
      const events = {'peng': [Enums.wanzi2, Enums.wanzi3, Enums.wanzi4]}
      const cards = HuCardFactory(Enums.tongzi4).pengPengHu_3caiShen_4
      const cardMap = genAssistList(cards)

      table.fapai()
      table.cards[table.remainCards - 1] = Enums.tongzi5


      player1.cards = genAssistList([Enums.dong])
      player2.cards = cardMap
      player2.events = events
      player3.cards = genAssistList([Enums.dong, Enums.wanzi1])
      player4.cards = genAssistList([Enums.dong, Enums.wanzi1])

      changeCaishen(Enums.tongzi4)

      player1.emitter.emit('da', table.turn, Enums.dong)
      player2.emitter.emit('hu', table.turn, Enums.dong)
      displayMessage()

      const overMessage = last(packets).message
      const result = overMessage.states[0].events.taJiaZiMo[0]

      expect(result).to.have.property('hu').with.true
      expect(result).to.have.property('fan').with.eq(8)
      expect(result).to.have.property('pengPengHu').with.true
      // expect(result).to.have.property('sanCaiYiKe').with.true
    })
  })

  describe.skip('扣房卡  // 公测免房卡', () => {
    it('一局游戏结束', () => {
      table.fapai()
      table.gameOver()

      displayMessage()

      expect(packets.filter(p => p.name === 'resource/createRoomUsedGem')).to.have.lengthOf(4)

      const chargeMessage = last(packets.filter(p => p.name === 'resource/createRoomUsedGem')).message
      expect(chargeMessage).to.have.property('createRoomNeed').with.eq(2)
      for (const p of table.players) {
        expect(p.model.gem).eq(198)
      }

    })
  })

  describe.skip('游戏结束判断', () => {
    it('4圈打完', () => {
      room.lunZhuangCount = -1
      table.fapai()
      table.players[1].takeLastCard = true
      table.gameOver()

      displayMessage()

      const allOver = last(packets.filter(p => p.name === 'room/allOver')).message
      expect(allOver).is.not.null
    })


    it('有人输钱超过限制', () => {
      room.rule.ro.jieSuan = 100
      table.fapai()
      const id = player1.model._id.toString()
      room.scoreMap[id] = -200
      table.players[1].takeLastCard = true
      table.gameOver()

      const allOver = last(packets.filter(p => p.name === 'room/allOver')).message
      expect(allOver).is.not.null
    })
  })

})

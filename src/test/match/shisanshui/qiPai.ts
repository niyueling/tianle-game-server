import * as chai from 'chai'
import {last} from 'lodash'
import Enums from '../../../match/shisanshui/enums'
import {genFullyCards} from "../../../match/shisanshui/table"
import {displayMessage, packets} from '../mockwebsocket'
import setupMatch from './setupMatch'

const expect = chai.expect

chai.use(require('chai-properties'))

describe('奇牌 13张 2人', () => {
  const playerCount = 2
  let room, table, players, allRule

  const headCards = [Enums.c1, Enums.c2, Enums.h3,]
  const middleCards = [Enums.c4, Enums.c5, Enums.h6, Enums.c7, Enums.c8]
  const tailCards = [Enums.c9, Enums.h9, Enums.d9, Enums.s9, Enums.c10]

  const p1Head = [Enums.c2, Enums.d2, Enums.s2]
  const p1Midd = [Enums.c3, Enums.d3, Enums.s3, Enums.d4, Enums.c4]
  const p1MiddBomb = [Enums.c3, Enums.d3, Enums.s3, Enums.h3, Enums.c4]
  const p1Tail = [Enums.c10, Enums.d10, Enums.s10, Enums.h10, Enums.c5]

  const messageFilter = name => packets.filter(p => p.name === name).map(p => p.message)

  const initPlayer0 = () => {
    players[0].cards = [
      ...tailCards,
      ...headCards,
      ...middleCards
    ]
  }

  const makeZhiZunLong = (player) => player.cards =
    [Enums.s1, Enums.s2, Enums.s3, Enums.s4,
      Enums.s5, Enums.s6, Enums.s7, Enums.s8,
      Enums.s9, Enums.s10, Enums.s11, Enums.s12,
      Enums.s13
    ]

  const initPlayer = (player) => {
    player.cards = [
      ...tailCards,
      ...headCards,
      ...middleCards
    ]
  }

  const initPlayer1 = () => {
    players[1].cards = [...p1Head, ...p1Midd, ...p1Tail]
  }

  const initPlayer1AllWin = () => {
    players[1].cards = [...p1Head, ...p1MiddBomb, ...p1Tail]
  }


  const sanShunZi = [
    Enums.s1, Enums.s2, Enums.s3,
    Enums.d2, Enums.d3, Enums.h4, Enums.s5, Enums.s6,
    Enums.s9, Enums.s10, Enums.s11, Enums.s12, Enums.s13
  ]

  beforeEach(async () => {
    const match = setupMatch(playerCount, {wanFa: 'qiPai'})
    room = match.room
    table = match.table
    players = table.players
    allRule = match.allRule
  })

  const mockPlayersCardAndCommit = () => {
    players.forEach(p => initPlayer(p))
    players.forEach(player => table.playerOnCommit(player, {
      head: headCards,
      middle: middleCards,
      tail: tailCards
    }))
  }

  it('开局 52张牌', () => {
    const cards = genFullyCards()
    expect(cards).has.lengthOf(52)
  })

  it('发牌', () => {
    const all = messageFilter('game/Shuffle').map(p => p.cards).reduce((a, b) => a.concat(b), [])
    expect(all.filter(card => !!card)).to.be.lengthOf(13 * 2)
  })

  describe('提交牌型', () => {

    it('能通过', () => {
      table.start()
      initPlayer0()

      table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
      const commit = last(messageFilter('game/commitReply'))
      displayMessage()
      expect(commit).to.have.property('ok').with.true
    })

    it('提交奇牌 能通过', () => {
      table.start()
      makeZhiZunLong(players[0])

      table.playerOnCommit(players[0], {isQiPai: true, name: '至尊清龙', score: 10})
      const commit = last(messageFilter('game/commitReply'))
      expect(commit).to.have.property('ok').with.true
    })


    it('所有人都提交 showTime', () => {
      table.start()
      mockPlayersCardAndCommit()
      const commit = last(messageFilter('game/commitReply'))
      const showTime = last(messageFilter('game/showTime'))
      displayMessage()
      expect(commit).to.have.property('ok').with.true
      expect(showTime).to.be.ok
    })

    it('提交错误的组合', () => {
      table.start()
      players.forEach(player => table.playerOnCommit(player, {head: [Enums.c1]}))
      const commit = last(messageFilter('game/commitReply'))
      expect(commit).to.have.property('ok').with.false
    })

    describe('showTime', () => {
      it('下发2份牌 还有remains数组', () => {
        table.start()
        mockPlayersCardAndCommit()

        const showTime = last(messageFilter('game/showTime'))
        expect(showTime).to.have.property('remains').is.a('array')
        const {remains: [arr1, arr2]} = showTime
        expect(arr1).to.have.lengthOf(13)
        expect(arr2).to.have.lengthOf(13)
      })

      describe('消息内容', () => {
        it('牌型', () => {
          table.fapai()
          mockPlayersCardAndCommit()

          const showTime = last(messageFilter('game/showTime'))
          const {head, middle, tail} = showTime.onTable[0]

          expect(head.combo).to.have.property('name').with.eq('单张')
          expect(head.combo.score).to.eql(1014030200000)

          expect(middle.combo).to.have.property('name').with.eq('顺子')
          expect(middle.combo.score).to.be.eql(5008070605040)

          expect(tail.combo).to.have.property('name').with.eq('炸弹')
          expect(tail.combo.score).to.be.eql(90009090909100)

          const broadcastCount = messageFilter('game/anotherCommit').length
          const playerCount = players.length
          expect(broadcastCount).to.be.eq(playerCount * playerCount)
        })

        it('额外的奖励 也加在water 里面', () => {
          table.start()
          initPlayer0()
          initPlayer1()
          table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
          table.playerOnCommit(players[1], {head: p1Head, middle: p1Midd, tail: p1Tail})

          const {onTable: [p0, p1],} = last(messageFilter('game/showTime'))
          const p0Extras = [p0.head, p0.middle, p0.tail].map(singleCombat => singleCombat.extra).join(',')
          const p1Extras = [p1.head, p1.middle, p1.tail].map(singleCombat => singleCombat.extra).join(',')
          expect(p0Extras).to.be.eql('0,0,0')
          expect(p1Extras).to.be.eql('0,0,0')

          const p0Waters = [p0.head, p0.middle, p0.tail].map(singleCombat => singleCombat.water).join(',')
          const p1Waters = [p1.head, p1.middle, p1.tail].map(singleCombat => singleCombat.water).join(',')

          expect(p0Waters).to.be.eql('-6,-4,-8')
          expect(p1Waters).to.be.eql('6,4,8')
        })

        it('打枪', () => {
          table.fapai()
          initPlayer0()
          initPlayer1AllWin()
          table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
          table.playerOnCommit(players[1], {head: p1Head, middle: p1MiddBomb, tail: p1Tail})

          displayMessage()
          const {onTable: [p0, p1],} = last(messageFilter('game/showTime'))
          expect(p1.daQiang).to.be.eql([0])

          const {states: [s0, s1],} = last(messageFilter('game/game-over'))
          expect(s0.won).to.be.eql(-30)
          expect(s1.won).to.be.eql(30)
        })


        it('马牌', () => {
          table.start()
          table.rule.ro.maPaiArray = [10]
          initPlayer0()
          initPlayer1AllWin()

          table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
          table.playerOnCommit(players[1], {head: p1Head, middle: p1MiddBomb, tail: p1Tail})

          const {states: [s0, s1],} = last(messageFilter('game/game-over'))
          expect(s0.won).to.be.eql(-60)
          expect(s1.won).to.be.eql(60)
        })

        it('2奇牌比较 平局', () => {
          table.start()
          players[0].cards = sanShunZi
          players[1].cards = sanShunZi
          table.playerOnCommit(players[0], {isQiPai: true, score: 3, name: '三顺子'})
          table.playerOnCommit(players[1], {isQiPai: true, score: 3, name: '三顺子'})

          displayMessage()

          const {onTable: [p0, p1],} = last(messageFilter('game/showTime'))

          const extras = [p0, p1].map(ps => ps.won).join(',')
          expect(extras).to.be.eql('0,0')
        })

        it('奇牌比较', () => {
          table.start()
          players[0].cards = sanShunZi
          initPlayer1()
          table.playerOnCommit(players[0], {isQiPai: true, score: 3, name: '三顺子'})
          table.playerOnCommit(players[1], {head: p1Head, middle: p1Midd, tail: p1Tail})

          displayMessage()

          const {onTable: [p0, p1],} = last(messageFilter('game/showTime'))

          const extras = [p0, p1].map(ps => ps.won).join(',')
          expect(extras).to.be.eql('6,-6')
        })
      })
    })
  })


  describe('gameOver', () => {

    it('allOver', () => {
      table.fapai()
      room.game.juShu = 0
      mockPlayersCardAndCommit()
      room.playerOnLastConfirm(players[0])
      displayMessage()
      const allOver = last(messageFilter('room/allOver'))
      const {players: {testid1: player}} = allOver
      expect(allOver).is.not.null
      expect(player).to.have.property('score').is.a('number')
    })
  })

  describe('离线', () => {
    it('发牌后断线重连', () => {
      table.fapai()
      const [p0, p1] = room.players
      room.playerDisconnect(p0)

      const disconnect = last(messageFilter('room/playerDisconnect'))
      expect(disconnect).to.have.property('index').with.eql(0)

      room.reconnect(p0)
      const reconnect = last(messageFilter('game/reconnect'))
      expect(reconnect).to.have.property('state').with.eql('stateWaitCommit')
      const {status} = reconnect
      expect(status).to.lengthOf(2)

      const rejoin = last(messageFilter('room/rejoin'))
      expect(rejoin).to.has.properties({
        index: 0,
        model: {_id: "testid1"}
      })
    })

    it('小结算断线重连', () => {
      table.fapai()
      mockPlayersCardAndCommit()

      const [p0, p1] = room.players
      room.playerDisconnect(p0)

      const disconnect = last(messageFilter('room/playerDisconnect'))
      expect(disconnect).to.have.property('index').with.eql(0)

      room.reconnect(p0)
      const reconnect = last(messageFilter('game/reconnect'))
      expect(reconnect).to.have.property('state').with.eql('stateGameOver')
      const {stateData: {showTime, gameOver}} = reconnect
      expect(showTime).to.not.null
      expect(gameOver).to.not.null
    })
  })

  describe.skip('after allOver', () => {
    it('再来一局', () => {
      table.fapai()
      const [creatorSocket] = room.players
      room.game.juShu = 0
      mockPlayersCardAndCommit()
      players.forEach(p => room.playerOnLastConfirm(p))

      room.applyAgain(creatorSocket)
      const invites = messageFilter('room/inviteAgain')
      expect(invites).to.lengthOf(2)
    })

    it('退出', () => {
      table.fapai()
      const [creatorSocket, other] = room.players
      room.game.juShu = 0
      mockPlayersCardAndCommit()
      players.forEach(p => room.playerOnLastConfirm(p))

      room.playerOnExit(other)
      room.applyAgain(creatorSocket)

      const invites = messageFilter('room/inviteAgain')
      expect(invites).to.lengthOf(1)
      expect(room.inRoomPlayers).to.lengthOf(1)
    })
  })
})

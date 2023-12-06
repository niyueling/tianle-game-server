import * as chai from 'chai'
import {last} from 'lodash'
import Enums from '../../../match/shisanshui/enums'
import {genFullyCards} from '../../../match/shisanshui/table'
import {displayMessage, packets} from '../mockwebsocket'
import setupMatch from './setupMatch'

const expect = chai.expect

chai.use(require('chai-properties'))


describe('罗宋 13张 2人', () => {
  const playerCount = 2
  let room, table, players, allRule

  const headCards = [Enums.c1, Enums.c2, Enums.h3,]
  const middleCards = [Enums.c4, Enums.c5, Enums.h6, Enums.c7, Enums.c8]
  const bomb = [Enums.c9, Enums.h9, Enums.d9, Enums.s9,]
  const tailCards = [...bomb, Enums.c10]

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

  const initPlayer = (player) => {
    player.cards = [
      ...tailCards,
      ...headCards,
      ...middleCards
    ]
  }

  const player1BecomeZhuang = function () {
    const [player1, player2] = players
    table.playerOnQiangZhuang(player1, true)
    table.playerOnQiangZhuang(player2, false)
  }

  const initPlayer1 = () => {
    players[1].cards = [...p1Head, ...p1Midd, ...p1Tail]
  }

  const initPlayer1AllWin = () => {
    players[1].cards = [...p1Head, ...p1MiddBomb, ...p1Tail]
  }

  beforeEach(async () => {
    const match = setupMatch(playerCount, {wanFa: 'luoSong'})
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


  describe('抢庄', () => {
    it('一人抢', () => {
      const [player1, player2] = players
      table.playerOnQiangZhuang(player1, true)
      table.playerOnQiangZhuang(player2, false)

      const broadcast = messageFilter('game/anotherQiangZhuang')
      expect(broadcast).to.lengthOf(4)
      const born = messageFilter('game/zhuangBorn')[0]
      displayMessage()
      expect(born).to.has.properties({
        zhuang: 0,
      })
      expect(born).to.have.property('dice').with.a('array')
    })

    it('多人抢', () => {
      const [player1, player2] = players
      table.playerOnQiangZhuang(player1, true)
      table.playerOnQiangZhuang(player2, true)

      const broadcast = messageFilter('game/anotherQiangZhuang')
      expect(broadcast).to.lengthOf(4)

      const born = messageFilter('game/zhuangBorn')[0]
      expect(born).to.have.property('dice').with.a('array')
    })


    it('抢庄结束 自动发牌', () => {
      player1BecomeZhuang()
      const all = messageFilter('game/Shuffle').map(p => p.cards).reduce((a, b) => a.concat(b), [])
      expect(all.filter(card => !!card)).to.be.lengthOf(13 * 2)
    })

    it('直接提交 不能通过', () => {
      initPlayer0()

      table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
      const commit = last(messageFilter('game/commitReply'))
      expect(commit).to.has.properties({
        ok: false,
        info: '还没到提交阶段'
      })
    })
  })


  describe('提交牌型', () => {

    beforeEach(() => {
      table.fapai()
      player1BecomeZhuang()
    })

    it('能通过', () => {
      initPlayer0()

      table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
      const commit = last(messageFilter('game/commitReply'))
      displayMessage()
      expect(commit).to.have.property('ok').with.true
    })

    it('所有人都提交 showTime', () => {
      mockPlayersCardAndCommit()
      const commit = last(messageFilter('game/commitReply'))
      const showTime = last(messageFilter('game/showTime'))
      displayMessage()
      expect(commit).to.have.property('ok').with.true
      expect(showTime).to.be.ok
    })

    it('提交错误的组合', () => {
      players.forEach(player => table.playerOnCommit(player, {head: [Enums.c1]}))
      const commit = last(messageFilter('game/commitReply'))
      expect(commit).to.have.property('ok').with.false
    })

    describe('showTime', () => {
      it('下发2份牌 还有remains数组', () => {
        mockPlayersCardAndCommit()

        const showTime = last(messageFilter('game/showTime'))
        expect(showTime).to.have.property('remains').is.a('array')
        const {remains: [arr1, arr2]} = showTime
        expect(arr1).to.have.lengthOf(13)
        expect(arr2).to.have.lengthOf(13)
      })

      describe('消息内容', () => {
        it('牌型 是奇牌', () => {
          mockPlayersCardAndCommit()

          const showTime = last(messageFilter('game/showTime'))
          const {head, middle, tail, isQiPai} = showTime.onTable[0]
          displayMessage()
          expect(head.combo).to.have.property('name').with.eq('单张')
          expect(head.combo.score).to.eql(1014030200000)

          expect(middle.combo).to.have.property('name').with.eq('顺子')
          expect(middle.combo.score).to.be.eql(5008070605040)

          expect(tail.combo).to.have.property('name').with.eq('炸弹')
          expect(tail.combo.score).to.be.eql(90009090909100)
          expect(isQiPai).to.be.true

          const broadcastCount = messageFilter('game/anotherCommit').length
          const playerCount = players.length
          expect(broadcastCount).to.be.eq(playerCount * playerCount)
        })

        it.skip('打枪', () => {
          initPlayer0()
          initPlayer1AllWin()
          table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
          table.playerOnCommit(players[1], {head: p1Head, middle: p1MiddBomb, tail: p1Tail})

          displayMessage()
          const {onTable: [p0, p1],} = last(messageFilter('game/showTime'))
          expect(p1.daQiang).to.be.eql([0])

          const {states: [s0, s1],} = last(messageFilter('game/game-over'))
          expect(s0.score).to.be.eql(-21)
          expect(s1.score).to.be.eql(21)
        })

        it('马牌', () => {
          table.rule.ro.maPaiArray = [10]
          initPlayer0()
          initPlayer1AllWin()

          table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
          table.playerOnCommit(players[1], {head: p1Head, middle: p1MiddBomb, tail: p1Tail})

          displayMessage()
          const {states: [s0, s1],} = last(messageFilter('game/game-over'))
          expect(s0.won).to.be.eql(-12)
          expect(s1.won).to.be.eql(12)
        })
      })
    })
  })

  describe('record', () => {

    before(async () => {

    })

    beforeEach(() => {
      table.fapai()
      player1BecomeZhuang()
    })
  })

  describe('gameOver', () => {

    it('allOver', () => {
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

    it('抢庄前断线重连', () => {
      const [p0, p1] = room.players
      room.playerDisconnect(p0)
      const disconnect = last(messageFilter('room/playerDisconnect'))
      expect(disconnect).to.have.property('index').with.eql(0)

      room.reconnect(p0)
      const reconnect = last(messageFilter('game/reconnect'))
      expect(reconnect).to.have.property('state').with.eql('stateQiangZhuang')

      const {status} = reconnect
      const [{isQiangZhuang},] = status
      expect(status).to.lengthOf(2)
      expect(isQiangZhuang).to.be.undefined

    })

    it('庄诞生 断线重连', () => {
      player1BecomeZhuang()

      const [p0, p1] = room.players
      room.playerDisconnect(p1)
      const disconnect = last(messageFilter('room/playerDisconnect'))
      expect(disconnect).to.have.property('index').with.eql(1)

      room.reconnect(p1)
      const reconnect = last(messageFilter('game/reconnect'))
      displayMessage()
      expect(reconnect).to.have.property('state').with.eql('stateWaitCommit')
      const {status} = reconnect
      const [{isZhuang: p0IsZhuang}, {isQiangZhuang, isZhuang: p1IsZhuang}] = status
      expect(status).to.lengthOf(2)
      expect(isQiangZhuang).to.be.false
      expect(p0IsZhuang).to.be.true
      expect(p1IsZhuang).to.be.undefined

    })

    it('发牌后断线重连', () => {
      player1BecomeZhuang()
      const [p0, p1] = room.players
      room.playerDisconnect(p0)

      const disconnect = last(messageFilter('room/playerDisconnect'))
      expect(disconnect).to.have.property('index').with.eql(0)
      room.reconnect(p0)

      const reconnect = last(messageFilter('game/reconnect'))
      const {status} = reconnect
      const [{cards, isQiangZhuang}] = status

      expect(reconnect).to.have.property('state').with.eql('stateWaitCommit')
      expect(status).to.lengthOf(2)
      expect(isQiangZhuang).to.be.true
      expect(cards).to.be.a('array')

      const rejoin = last(messageFilter('room/rejoin'))
      expect(rejoin).to.has.properties({
        index: 0,
        model: {_id: "testid1"}
      })
    })

    it('小结算断线重连', () => {
      player1BecomeZhuang()
      mockPlayersCardAndCommit()

      const [p0, p1] = room.players
      room.playerDisconnect(p0)

      const disconnect = last(messageFilter('room/playerDisconnect'))
      expect(disconnect).to.have.property('index').with.eql(0)

      room.reconnect(p0)
      const reconnect = last(messageFilter('game/reconnect'))
      displayMessage()
      expect(reconnect).to.have.property('state').with.eql('stateGameOver')
      const {stateData: {showTime, gameOver}} = reconnect
      expect(showTime).to.not.null
      expect(gameOver).to.not.null
    })
  })

  describe('after allOver', () => {
    it('再来一局', () => {
      const [creatorSocket] = room.players
      room.game.juShu = 0
      mockPlayersCardAndCommit()
      players.forEach(p => room.playerOnLastConfirm(p))

      room.applyAgain(creatorSocket)
      const invites = messageFilter('room/inviteAgain')
      expect(invites).to.lengthOf(2)
    })

    it('退出', () => {
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

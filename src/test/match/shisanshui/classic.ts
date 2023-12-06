import * as chai from 'chai'
import {last} from 'lodash'
import setupMatch from './setupMatch'
import {packets, displayMessage} from '../mockwebsocket'
import Enums from '../../../match/shisanshui/enums'
import RoomRecord from '../../../database/models/roomRecord'
import {genFullyCards} from "../../../match/shisanshui/table"
// import handlers from '../../../player/message-handlers/match'
import {
  fiveTwinsOneTriple,
  sixHalfTwins,
} from "../../../match/shisanshui/combiner"
import PlayerModel from '../../../database/models/player'
import PlayerManager from '../../../player/player-manager'

const expect = chai.expect

chai.use(require('chai-properties'))

describe('经典 13张 2人', () => {
  const playerCount = 2
  let room, table, players, allRule

  const headCards = [Enums.c1, Enums.c2, Enums.h3,]
  const middleCards = [Enums.c4, Enums.c5, Enums.h6, Enums.c7, Enums.c8]
  const bomb = [Enums.c9, Enums.h9, Enums.d9, Enums.s9,]
  const tailCards = [...bomb, Enums.c10]

  const p1Head = [Enums.c2, Enums.d2, Enums.s2]
  const p1Midd = [Enums.c3, Enums.d3, Enums.s3, Enums.d4, Enums.c4]
  const p1MiddBomb = [Enums.c3, Enums.d3, Enums.s3, Enums.h3, Enums.c4]
  const p1Tail = [Enums.c10, Enums.d10, Enums.s10, Enums.h10, Enums.d5]

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

  const initPlayer1 = () => {
    players[1].cards = [...p1Head, ...p1Midd, ...p1Tail]
  }

  const initPlayer1AllWin = () => {
    players[1].cards = [...p1Head, ...p1MiddBomb, ...p1Tail]
  }


  beforeEach(async () => {
    const match = setupMatch(playerCount, {wanFa: 'jingDian'})
    room = match.room
    table = match.table
    players = table.players
    allRule = match.allRule
  })


  const mockPlayersCardAndCommit = (_table = table) => {
    _table.players.forEach(p => initPlayer(p))
    _table.players.forEach(player => _table.playerOnCommit(player, {
      head: headCards,
      middle: middleCards,
      tail: tailCards
    }))
  }

  it('马牌是方块', () => {
    table.rule.ro.maPaiArray = [10]
    expect(table.rule.maPaiArray).to.be.eql([Enums.d10])
  })

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
          displayMessage()
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

        it('完全相同的牌 平局', () => {
          table.start()
          initPlayer0()
          initPlayer(players[1])
          table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
          table.playerOnCommit(players[1], {head: headCards, middle: middleCards, tail: tailCards})

          const {onTable: [p0, p1],} = last(messageFilter('game/showTime'))
          const p0WaterStr = [p0.head.water, p0.middle.water, p0.tail.water].join(',')
          const p1WaterStr = [p1.head.water, p1.middle.water, p1.tail.water].join(',')
          expect(p0WaterStr).to.be.eql('0,0,0')
          expect(p1WaterStr).to.be.eql('0,0,0')
        })


        it('额外的加分算在water里面', () => {
          table.start()
          initPlayer0()
          initPlayer1AllWin()
          table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
          table.playerOnCommit(players[1], {head: p1Head, middle: p1MiddBomb, tail: p1Tail})

          const {onTable: [p0, p1],} = last(messageFilter('game/showTime'))

          const p0WaterStr = [p0.head.water, p0.middle.water, p0.tail.water].join(',')
          const p1WaterStr = [p1.head.water, p1.middle.water, p1.tail.water].join(',')
          expect(p0WaterStr).to.be.eql('-3,-8,-4')
          expect(p1WaterStr).to.be.eql('3,8,4')
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

        it('1人双马牌 3倍', () => {
          table.start()
          table.rule.ro.maPaiArray = [5, 10]
          initPlayer0()
          initPlayer1AllWin()

          table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
          table.playerOnCommit(players[1], {head: p1Head, middle: p1MiddBomb, tail: p1Tail})

          const {onTable: [p0, p1]} = last(messageFilter('game/showTime'))
          expect(p0).to.have.properties({
            won: -90,
            trace: {
              1: {maTimes: 3}
            }
          })
          expect(p1).to.have.properties({
            won: 90,
            trace: {
              0: {maTimes: 3}
            }
          })

          const {states: [s0, s1],} = last(messageFilter('game/game-over'))
          expect(s0.won).to.be.eql(-90)
          expect(s1.won).to.be.eql(90)
        })
      })
    })

    describe('某一道平分', () => {
      it('全平分 没有输赢', () => {
        table.start()
        table.rule.ro.maPaiArray = [10]
        initPlayer0()
        initPlayer(players[1])

        table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
        table.playerOnCommit(players[1], {head: headCards, middle: middleCards, tail: tailCards})

        const {states: [s0, s1],} = last(messageFilter('game/game-over'))
        expect(s0.won).to.be.eql(0)
        expect(s1.won).to.be.eql(0)
      })

      it('平2道 , 输1道,  算输三道  有打枪', () => {
        table.start()
        table.rule.ro.maPaiArray = [10]
        initPlayer0()
        players[1].cards = [
          ...p1Tail,
          ...headCards,
          ...middleCards
        ]

        table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
        table.playerOnCommit(players[1], {head: headCards, middle: middleCards, tail: p1Tail})

        displayMessage()
        const {states: [s0, s1],} = last(messageFilter('game/game-over'))
        expect(s0.won).to.be.eql(-24)
        expect(s1.won).to.be.eql(24)
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
    // it('全部断线重连', () => {
    //   table.fapai()
    //   const [p0, p1] = room.players
    //   console.log(`${__filename}:304 `, room.players.length)
    //   room.playerDisconnect(p0)
    //   room.playerOnExit(p1)

    //   handlers['room/join-friend'](p1, {_id: room._id})

    //   const ps = messageFilter('room/join-success')
    //   expect(ps).to.be.lengthOf(1)
    // })

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


  describe('组合问题', () => {
    it('6对半', () => {
      const cards = [
        Enums.d3, Enums.d3, Enums.d3, Enums.d3,
        Enums.d4, Enums.d4, Enums.d4, Enums.d4,
        Enums.d5, Enums.d5, Enums.d5, Enums.d5, Enums.c4,
      ]
      const result = sixHalfTwins(cards)

      expect(result.verify).to.be.true
    })


    it('五对三条', () => {
      const cards = [
        Enums.d3, Enums.d3, Enums.d3, Enums.d3,
        Enums.d4, Enums.d4, Enums.d4, Enums.d4,
        Enums.d5, Enums.d5, Enums.d5, Enums.d5, Enums.d5,
      ]
      const result = fiveTwinsOneTriple(cards)

      expect(result.verify).to.be.true
    })
  })

  describe.skip('收费', () => {
    it('游戏结束 扣房费 -1', async () => {
      table.start()
      initPlayer0()
      initPlayer1AllWin()
      const [player0, player1] = room.players
      const playerInContainer = PlayerManager.getInstance().getPlayer(player0.model._id)

      table.playerOnCommit(players[0], {head: headCards, middle: middleCards, tail: tailCards})
      table.playerOnCommit(players[1], {head: p1Head, middle: p1MiddBomb, tail: p1Tail})

      await new Promise((resolve, reject) =>
        setTimeout(() => resolve(1), 200)
      )

      expect(playerInContainer.model.gem).to.be.eql(199)
    })


    it('谁续费游戏 谁扣房卡', async () => {
      table.fapai()
      const [creatorSocket, otherPlayerSocket] = room.players

      room.game.juShu = 0
      mockPlayersCardAndCommit()
      players.forEach(p => room.playerOnLastConfirm(p))

      await new Promise((resolve, reject) =>
        setTimeout(() => resolve(1), 200)
      )

      const oldCreatorInContainer = PlayerManager.getInstance().getPlayer(creatorSocket.model._id)
      expect(oldCreatorInContainer.model.gem).to.be.eql(199)

      room.applyAgain(otherPlayerSocket)
      room.ready(creatorSocket)
      room.ready(otherPlayerSocket)

      //who apply again become new creator
      expect(room.creator).to.be.eql(otherPlayerSocket)

      const newCreatorInContainer = PlayerManager.getInstance().getPlayer(otherPlayerSocket.model._id)
      expect(newCreatorInContainer.model.gem).to.be.eql(200)

      mockPlayersCardAndCommit(room.gameState)

      await new Promise((resolve, reject) =>
        setTimeout(() => resolve(1), 200)
      )

      expect(oldCreatorInContainer.model.gem).to.be.eql(199)
      expect(newCreatorInContainer.model.gem).to.be.eql(199)
    })
  })
})

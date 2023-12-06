import * as chai from 'chai'
import {last} from 'lodash'
import Enums from '../../../match/shisanshui/enums'
import {displayMessage, packets} from '../mockwebsocket'
import setupMatch, {ruleData} from './setupMatch'

const expect = chai.expect

chai.use(require('chai-properties'))
describe('奇牌规则-全垒打,奇牌没有全垒打', () => {
  let room, table, players, allRule

  const headCards = [Enums.c1, Enums.c2, Enums.h3,]
  const middleCards = [Enums.c4, Enums.c5, Enums.h6, Enums.c7, Enums.c8]
  const bomb = [Enums.c9, Enums.h9, Enums.d9, Enums.s9,]
  const bomb2 = [Enums.c10, Enums.h10, Enums.d10, Enums.s10,]
  const tailCards = [...bomb, Enums.c10]
  const anotherTailCards = [...bomb2, Enums.c11]

  const p1Head = [Enums.c2, Enums.d2, Enums.s2]
  const p1Midd = [Enums.c3, Enums.d3, Enums.s3, Enums.d4, Enums.c4]
  const p1MiddBomb = [Enums.c3, Enums.d3, Enums.s3, Enums.h3, Enums.c4]
  const p1Tail = [Enums.c10, Enums.d10, Enums.s10, Enums.h10, Enums.c5]

  const messageFilter = name => packets.filter(p => p.name === name).map(p => p.message)

  const initPlayer = (player) => {
    player.cards = [
      ...headCards,
      ...middleCards,
      ...tailCards
    ]
  }

  const initPlayer2 = (player) => {
    player.cards = [
      ...headCards,
      ...middleCards,
      ...anotherTailCards
    ]
  }

  const initPlayerAllWin = player => {
    player.cards = [...p1Head, ...p1MiddBomb, ...p1Tail]
  }

  const allWinCommit = (player, tableState = table) => {
    tableState.playerOnCommit(player, {head: p1Head, middle: p1MiddBomb, tail: p1Tail})
  }


  const splitCommit = (player, tableState = table) => {
    const cards = player.cards
    const head = cards.slice(0, 3)
    const middle = cards.slice(3, 8)
    const tail = cards.slice(8, 13)
    return tableState.playerOnCommit(player, {head, middle, tail})
  }

  describe('三人', () => {

    beforeEach(() => {
      const playerCount = 3
      const match = setupMatch(playerCount, {wanFa: 'qiPai'})
      room = match.room
      table = match.table
      players = table.players
      allRule = match.allRule

      table.fapai()
    })


    it('10 * 2', () => {
      table.rule.ro.maPaiArray = []

      const [player0, player1, player2] = table.players
      table.players.forEach(p => initPlayer(p))
      initPlayerAllWin(player0)

      allWinCommit(player0)
      splitCommit(player1)
      splitCommit(player2)

      displayMessage()
      const {states: [s0, s1, s2],} = last(messageFilter('game/game-over'))
      const scoreStr = [s0, s1, s2].map(s => s.won).join(',')
      expect(scoreStr).to.eql('120,-60,-60')
    })
  })

  describe('四人', () => {

    beforeEach(() => {
      const playerCount = 4
      const match = setupMatch(playerCount, {wanFa: 'qiPai'})
      room = match.room
      table = match.table
      players = table.players
      allRule = match.allRule

      table.fapai()
    })

    function quan_lei_da() {
      const [player0, player1, player2, player3] = table.players
      table.players.forEach(p => initPlayer(p))
      initPlayerAllWin(player0)

      allWinCommit(player0)
      splitCommit(player1)
      splitCommit(player2)
      splitCommit(player3)

      displayMessage()
      const {states: [s0, s1, s2, s3],} = last(messageFilter('game/game-over'))
      const scoreStr = [s0, s1, s2, s3].map(s => s.won).join(',')
      expect(scoreStr).to.be.eql('180,-60,-60,-60')
    }

    it('13 * 4', () => {
      quan_lei_da()
    })
  })
})

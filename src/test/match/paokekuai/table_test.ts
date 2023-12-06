import * as chai from 'chai'
import Enums from "../../../match/paodekuai/enums"
import {default as Card, CardType} from "../../../match/paodekuai/card"
import {genFullyCards} from "../../../match/paodekuai/table"
import {displayMessage, packetsWithMessageName} from '../mockwebsocket'
import setupMatch from '../setupMatch'

const expect = chai.expect

describe('跑得快', () => {

  let room, table, players, allRule
  const playerCount = 3

  const last = arr => arr[arr.length - 1]

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table
    players = table.players
    allRule = match.allRule
  })

  describe('初始化', () => {

    it('发牌 48张', () => {
      expect(genFullyCards()).to.lengthOf(48)
    })


    it('加入房间能看到其他人准备', () => {
      const messages = packetsWithMessageName('room/join').map(p => p.message)
      expect(last(messages)).to.have.property('readyPlayers').with.eql([0, 1])
    })

    it('seatIndex not null', () => {
      table.players.forEach(p => expect(p.seatIndex).is.a('number'))
    })

    it('房间内3个人', () => {
      expect(table.players).to.lengthOf(3)
    })

    it('4人准备', () => {
      expect(room.readyPlayers).to.lengthOf(3)
    })
  })

  describe('发牌', () => {
    it('每人16张', () => {
      table.start()
      const messages = packetsWithMessageName('game/Shuffle').map(p => p.message)
      messages.forEach(message => expect(message.cards).to.lengthOf(16))
    })
  })

})

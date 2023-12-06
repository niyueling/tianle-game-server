'use strict'

import {Channel} from "amqplib"
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last, nth} from 'lodash'
import Room from '../../../match/paodekuai/room'
import Enums from '../../../match/paodekuai/enums'
import PlayerState from "../../../match/paodekuai/player_state"
import {displayMessage} from '../mockwebsocket'
import setupMatch, {cardsFromArray} from '../setupMatch'

const {expect} = chai
chai.use(chaiProperties)

describe('房间持久化', () => {

  let room: Room, table
  let player1: PlayerState, player2, player3, player4
  let allRule
  let changeCaishen

  const respository = {
    channel: {} as Channel,
    userCenter: {
      async getPlayerModel(playerId: string): Promise<any> {
        return {_id: playerId, name: playerId}
      }
    }
  }

  beforeEach(function () {
    const match = setupMatch(3)
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]

    allRule = match.allRule
  })

  it('房间 rule 相关', async () => {

    room.currentBase = 42
    const jsonString = JSON.stringify(room.toJSON())

    const recoveredRoom = await Room.recover(JSON.parse(jsonString), respository)

    expect(recoveredRoom.gameRule).to.have.properties(room.gameRule)
  })

  it('房间 基本信息 相关', async () => {

    room._id = '42'
    room.uid = 'the uid'

    room.playerDisconnect(room.players[0])

    const jsonString = JSON.stringify(room.toJSON())

    const recoveredRoom = await Room.recover(JSON.parse(jsonString), respository)

    expect(recoveredRoom).to.have.properties({
      _id: '42', uid: 'the uid', disconnected: [["testid1", 0]]
    })

  })

  it('房间 players 相关', async () => {

    room._id = '42'
    room.uid = 'the uid'

    room.playerDisconnect(room.players[0])

    const jsonString = JSON.stringify(room.toJSON())

    const recoveredRoom = await Room.recover(JSON.parse(jsonString), respository)

    expect(recoveredRoom.players[0]).have.property('model')
  })

  it('房间 牌局 状态恢复', async () => {
    table.start()
    table.status.current.seatIndex = 0
    room._id = '42'
    room.uid = 'the uid'

    player1.cards = [Enums.c5, Enums.c4, Enums.s5]
    player2.cards = [Enums.c7, Enums.c8]
    player3.cards = [Enums.c5]

    table.onPlayerDa(player1, {cards: [Enums.c5, Enums.s5]})

    displayMessage()

    const jsonString = JSON.stringify(room.toJSON())

    const recoveredRoom = await Room.recover(JSON.parse(jsonString), respository)

    expect(recoveredRoom.gameState.status).to.have.properties({
      current: {seatIndex: 1, step: 2},
      lastPattern: {
        name: "double",
        score: 5
      },
      lastIndex: 0,
      winOrder: 0,
      fen: 10,
      from: 0
    })

    // noinspection TsLint
    expect(recoveredRoom.gameState.status.lastCards[0].equal(Enums.c5)).to.be.true
    // noinspection TsLint
    expect(recoveredRoom.gameState.status.lastPattern.cards[0].equal(Enums.c5)).to.be.true
  })

  it('time for room serialize', () => {
    // console.time('serialize')
    JSON.stringify(room.toJSON())
    // console.timeEnd('serialize')
  })
})

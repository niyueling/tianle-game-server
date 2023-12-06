import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/zhadan/enums'
import PlayerState from "../../../match/zhadan/player_state"
import Table from "../../../match/zhadan/table"
import {displayMessage, packetsTo} from '../mockwebsocket'
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai


describe('打牌最后 X 张', () => {

  let room, table: Table, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

  const last = arr => arr[arr.length - 1]

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
    player4 = table.players[3]

    allRule = match.allRule

    table.start();
    table.setFirstDa(0);
  })

  it('打最后4张 333 6', () => {

    player1.cards = [Enums.c3, Enums.c3, Enums.c3, Enums.c6]
    table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3, Enums.c3, Enums.c6]})
    displayMessage()

    expect(last(packetsTo('testid1', 'game/daReply'))).to.have.properties({
      name: 'game/daReply', message: {ok: true}
    })
  })

  it('打最后7张 333444 6', () => {

    player1.cards = [Enums.c3, Enums.c3, Enums.c3,
      Enums.c4, Enums.c4, Enums.h4,
      Enums.c6]
    table.onPlayerDa(player1, {
      cards: [Enums.c3, Enums.c3, Enums.c3,
        Enums.c4, Enums.c4, Enums.h4,
        Enums.c6]
    })
    displayMessage()

    expect(last(packetsTo('testid1', 'game/daReply'))).to.have.properties({
      name: 'game/daReply', message: {ok: true}
    })
  })

  it('打最后7张 333444 6', () => {

    player1.cards = [Enums.c3, Enums.c3, Enums.c3,
      Enums.c4, Enums.c4, Enums.h4,
      Enums.c6]
    table.onPlayerDa(player1, {
      cards: [Enums.c3, Enums.c3, Enums.c3,
        Enums.c4, Enums.c4, Enums.h4,
        Enums.c6]
    })
    displayMessage()

    expect(last(packetsTo('testid1', 'game/daReply'))).to.have.properties({
      name: 'game/daReply', message: {ok: true}
    })
  })


  it('前一个打 333444 6678 后面能用 999 101010 JJJ 大过', () => {

    player1.cards = [
      Enums.c3, Enums.c3, Enums.c3, Enums.c6, Enums.c6,
      Enums.c4, Enums.c4, Enums.h4, Enums.c7, Enums.c8, Enums.c11]

    player2.cards = [
      Enums.c9, Enums.c9, Enums.c9,
      Enums.c10, Enums.c10, Enums.h10,
      Enums.cJ, Enums.cJ, Enums.cJ,
    ]

    table.onPlayerDa(player1, {
      cards: [
        Enums.c3, Enums.c3, Enums.c3, Enums.c6, Enums.c6,
        Enums.c4, Enums.c4, Enums.h4, Enums.c7, Enums.c8]
    })

    table.onPlayerDa(player2, {
      cards: [
        Enums.c9, Enums.c9, Enums.c9,
        Enums.c10, Enums.c10, Enums.h10,
        Enums.cJ, Enums.cJ, Enums.cJ,
      ]
    })

    // displayMessage()

    expect(last(packetsTo('testid1', 'game/daReply'))).to.have.properties({
      name: 'game/daReply', message: {ok: true}
    })
  })


  it('不能打最后7张 aaa222 6', () => {

    player1.cards = [
      Enums.c1, Enums.c1, Enums.c1,
      Enums.c2, Enums.c2, Enums.h2,
      Enums.c6]
    table.onPlayerDa(player1, {
      cards: [Enums.c3, Enums.c3, Enums.c3,
        Enums.c4, Enums.c4, Enums.h4,
        Enums.c6]
    })
    displayMessage()

    expect(last(packetsTo('testid1', 'game/daReply'))).to.have.properties({
      name: 'game/daReply', message: {ok: false}
    })
  })

})

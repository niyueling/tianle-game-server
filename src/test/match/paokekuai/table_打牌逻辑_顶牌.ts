import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {genFullyCards, default as Table} from "../../../match/paodekuai/table"
import setupMatch from '../setupMatch'
import {displayMessage, packetsWithMessageName, packetsTo} from '../mockwebsocket'
import {default as Card, CardType} from "../../../match/paodekuai/card"
import PlayerState from "../../../match/paodekuai/player_state";
import Enums from '../../../match/paodekuai/enums'

chai.use(chaiProperties)
const {expect} = chai

describe('打牌/过牌 - 顶牌', () => {

  let room;
  let table: Table;
  let allRule;
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState

  const playerCount = 3

  const last = arr => arr[arr.length - 1]

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]

    allRule = match.allRule
  })

  it('自由模式(打牌)', () => {
    table.start()

    player1.cards = [Enums.c3, Enums.c4]
    player2.cards = [Enums.c5]

    table.onPlayerDa(player1, {cards: [Enums.c3]})

    const daReply = last(packetsWithMessageName('game/daReply')).message

    displayMessage()

    expect(daReply).to.have.properties({ok: false})
  })

  it('非自由模式(打牌)', () => {
    table.start()

    player1.cards = [Enums.c3, Enums.c4]
    player2.cards = [Enums.c5, Enums.c6]
    player3.cards = [Enums.c10]

    table.onPlayerDa(player1, {cards: [Enums.c3]})
    table.onPlayerDa(player2, {cards: [Enums.c5]})

    const daReply = last(packetsWithMessageName('game/daReply')).message

    displayMessage()

    expect(daReply).to.have.properties({ok: false})
  })

  it('自由模式(过牌)', () => {
    table.start()
    table.status.current.seatIndex = 0

    player1.cards = [Enums.c3, Enums.c4]
    player2.cards = [Enums.c7, Enums.c8]
    player3.cards = [Enums.c5]

    table.onPlayerDa(player1, {cards: [Enums.c3]})
    table.onPlayerGuo(player2)

    const guoReply = last(packetsWithMessageName('game/guoReply')).message

    displayMessage()

    expect(guoReply).to.have.properties({ok: false, info: "下家保本,不能过牌"})
  })
})

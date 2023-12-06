import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {genFullyCards, default as Table} from "../../../match/paodekuai/table"
import setupMatch from '../setupMatch'
import {displayMessage, packetsWithMessageName, packetsTo, clearMessage} from '../mockwebsocket'
import {default as Card, CardType} from "../../../match/paodekuai/card"
import PlayerState from "../../../match/paodekuai/player_state";
import Enums from '../../../match/paodekuai/enums'
import NormalTable from "../../../match/paodekuai/normalTable";

chai.use(chaiProperties)
const {expect} = chai


describe('打牌最后 X 张', () => {

  let room, table: NormalTable, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

  const last = arr => arr[arr.length - 1]

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table as  NormalTable
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
    player4 = table.players[3]

    allRule = match.allRule
    clearMessage()

    table.start()
    table.setFirstDa(0)
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


  it('不能打最后7张 aaa222 6', () => {
    table.start()
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

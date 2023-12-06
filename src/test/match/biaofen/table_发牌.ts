import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {default as Table} from '../../../match/biaofen/table'
import PlayerState from "../../../match/biaofen/player_state"
import setupMatch from './setupMatch'

// chai.use(chaiProperties)
const {expect} = chai

describe('发牌', () => {
  let room, table: Table, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState

  // beforeEach(() => {
  //   const match = setupMatch(playerCount, {})
  //   room = match.room
  //   table = match.table
  //   player1 = table.players[0]
  //   player2 = table.players[1]
  //   player3 = table.players[2]
  //   player4 = table.players[3]
  //
  //   allRule = match.allRule
  // })

  it('四人', () => {
    const match = setupMatch(4, {})
    room = match.room
    table = match.table
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
    player4 = table.players[3]

    allRule = match.allRule
    table.start()
    // table.setFirstDa(0);

    expect(player1.cards.length).to.equal(25)
  })
})

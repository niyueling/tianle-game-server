import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Table from "../../../match/paodekuai/table"
import setupMatch from '../setupMatch'

import PlayerState from "../../../match/paodekuai/player_state"

chai.use(chaiProperties)
const {expect} = chai

describe('牌局结束逻辑', () => {

  let room
  let table: Table
  let allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  const playerCount = 4

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]

    allRule = match.allRule
  })

  it('只要一人打完牌局结束', () => {

    table.start()
    player1.cards = []

    // noinspection TsLint
    expect(table.isGameOver(player1)).to.true
  })
})

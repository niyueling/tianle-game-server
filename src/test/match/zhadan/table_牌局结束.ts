import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import PlayerState from "../../../match/zhadan/player_state";
import {default as Table} from "../../../match/zhadan/table"
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai


describe('牌局结束逻辑', () => {

  let room, table: Table, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
    player4 = table.players[3]

    allRule = match.allRule
  })


  it('双扣结束', () => {

    table.start()

    player1.cards = []
    player3.winOrder = 0
    player3.cards = []
    player3.winOrder = 1

    expect(table.isGameOver()).to.true

  })

  it('平扣结束', () => {
    table.start()

    player1.cards = []
    player2.cards = []
    player3.cards = []

    expect(table.isGameOver()).to.true
  })


})

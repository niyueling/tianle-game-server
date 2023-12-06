import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/paodekuai/enums'
import NormalTable from "../../../match/paodekuai/normalTable";
import PlayerState from "../../../match/paodekuai/player_state";
import {clearMessage, displayMessage, scoreString} from '../mockwebsocket'
import setupMatch from '../setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('牌局 关牌结算逻辑', () => {

  let room;
  let table: NormalTable;
  let allRule;
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState

  const playerCount = 3

  beforeEach(async () => {
    const match = setupMatch(playerCount, {guanPai: true})
    room = match.room
    table = match.table as  NormalTable
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]

    allRule = match.allRule
    clearMessage()
    table.start()
    table.setFirstDa(0)
  })

  it('输家牌数不一样', () => {

    player1.cards = [Enums.c3]
    player2.cards = [Enums.c4, Enums.c5, Enums.h5]
    player3.cards = [Enums.c10]

    table.onPlayerDa(player1, {cards: [Enums.c3]})

    displayMessage()

    expect(scoreString()).to.eq('4,-3,-1')
    expect(room.scoreMap).to.have.properties({testid1: 4, testid2: -3, testid3: -1})
  })

  it('一家输家被春天', () => {

    player1.cards = [Enums.c3]
    player2.cards = new Array(16).fill(Enums.h5)
    player3.cards = [Enums.c10, Enums.c10]

    table.onPlayerDa(player1, {cards: [Enums.c3]})

    displayMessage()

    expect(scoreString()).to.eq('34,-32,-2')
    expect(room.scoreMap).to.have.properties({testid1: 34, testid2: -32, testid3: -2})
  })

  it('两家输家被春天', () => {

    player1.cards = [Enums.c3]
    player2.cards = new Array(16).fill(Enums.h5)
    player3.cards = new Array(16).fill(Enums.h5)

    table.onPlayerDa(player1, {cards: [Enums.c3]})

    displayMessage()

    expect(scoreString()).to.eq('64,-32,-32')
    expect(room.scoreMap).to.have.properties({testid1: 64, testid2: -32, testid3: -32})
  })

})

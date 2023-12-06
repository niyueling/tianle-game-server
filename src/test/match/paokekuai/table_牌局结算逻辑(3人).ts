import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/paodekuai/enums'
import NormalTable from "../../../match/paodekuai/normalTable";
import PlayerState from "../../../match/paodekuai/player_state";
import {displayMessage, scoreString} from '../mockwebsocket'
import setupMatch from '../setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('牌局结算逻辑(3人)', () => {

  let room;
  let table: NormalTable;
  let allRule;
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 3

  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table as  NormalTable
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
    player4 = table.players[3]

    allRule = match.allRule

    table.start()
    table.setFirstDa(0)
  })

  context('无春天', () => {
    it('输家牌数不一样', () => {

      player1.cards = [Enums.c3]
      player2.cards = [Enums.c4, Enums.c5]
      player3.cards = [Enums.c10]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('3,-2,-1')
      expect(room.scoreMap).to.have.properties({testid1: 3, testid2: -2, testid3: -1})
    })

    it('输家牌数一样', () => {

      player1.cards = [Enums.c3]
      player2.cards = [Enums.c4, Enums.c5]
      player3.cards = [Enums.c10, Enums.c10]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('4,-2,-2')
      expect(room.scoreMap).to.have.properties({testid1: 4, testid2: -2, testid3: -2})
    })
  })

  context('春天', () => {
    it('输家牌数一样', () => {

      player1.cards = [Enums.c3]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('8,-4,-4')
      expect(room.scoreMap).to.have.properties({testid1: 8, testid2: -4, testid3: -4})
    })

    it('输家牌数不一样', () => {

      player1.cards = [Enums.c3]
      player3.cards = [Enums.c10, Enums.c10]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('6,-4,-2')
      expect(room.scoreMap).to.have.properties({testid1: 6, testid2: -4, testid3: -2})
    })
  })

})

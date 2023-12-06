import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/paodekuai/enums'
import NormalTable from "../../../match/paodekuai/normalTable";
import PlayerState from "../../../match/paodekuai/player_state";
import {displayMessage, scoreString} from '../mockwebsocket'
import setupMatch from '../setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('牌局结算逻辑(4人)', () => {

  let room;
  let table: NormalTable;
  let allRule;
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

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
    it('输家牌数(loser1>loser2>loser3)', () => {

      player1.cards = [Enums.c3]
      player2.cards = [Enums.c4, Enums.c5, Enums.d8]
      player3.cards = [Enums.c10, Enums.s7]
      player4.cards = [Enums.c12]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      // displayMessage()

      expect(scoreString()).to.eq('6,-3,-2,-1')
      expect(room.scoreMap).to.have.properties({testid1: 6, testid2: -3, testid3: -2, testid4: -1})
    })

    it('输家牌数(loser1>loser2=loser3)', () => {

      player1.cards = [Enums.c3]
      player2.cards = [Enums.c4, Enums.c5]
      player3.cards = [Enums.c10]
      player4.cards = [Enums.c12]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      // displayMessage()

      expect(scoreString()).to.eq('7,-3,-2,-2')
      expect(room.scoreMap).to.have.properties({testid1: 7, testid2: -3, testid3: -2, testid4: -2})
    })

    it('输家牌数(loser1=loser2>loser3)', () => {

      player1.cards = [Enums.c3]
      player2.cards = [Enums.c4, Enums.c5]
      player3.cards = [Enums.c10, Enums.s7]
      player4.cards = [Enums.c12]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      // displayMessage()

      expect(scoreString()).to.eq('7,-3,-3,-1')
      expect(room.scoreMap).to.have.properties({testid1: 7, testid2: -3, testid3: -3, testid4: -1})
    })

    it('输家牌数(loser1=loser2=loser3)', () => {

      player1.cards = [Enums.c3]
      player2.cards = [Enums.c4, Enums.c5]
      player3.cards = [Enums.c10, Enums.s7]
      player4.cards = [Enums.c12, Enums.h4]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      // displayMessage()

      expect(scoreString()).to.eq('6,-2,-2,-2')
      expect(room.scoreMap).to.have.properties({testid1: 6, testid2: -2, testid3: -2, testid4: -2})
    })
  })

  context('春天', () => {
    it('输家牌数一样(loser1=loser2=loser3)', () => {

      player1.cards = [Enums.c3]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('12,-4,-4,-4')
      expect(room.scoreMap).to.have.properties({testid1: 12, testid2: -4, testid3: -4, testid4: -4})
    })

    it('输家牌数(loser1>loser2=loser3)', () => {

      player1.cards = [Enums.c3]
      player3.cards = [Enums.c10, Enums.c11]
      player4.cards = [Enums.d8, Enums.s9]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('10,-6,-2,-2')
      expect(room.scoreMap).to.have.properties({testid1: 10, testid2: -6, testid3: -2, testid4: -2})
    })

    it('输家牌数(loser1=loser2>loser3)', () => {

      player1.cards = [Enums.c3]
      player4.cards = [Enums.d8, Enums.s9]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('13,-6,-6,-1')
      expect(room.scoreMap).to.have.properties({testid1: 13, testid2: -6, testid3: -6, testid4: -1})
    })

    it('输家牌数(loser1>loser2>loser3)', () => {

      player1.cards = [Enums.c3]
      player3.cards = [Enums.h8, Enums.s9]
      player4.cards = [Enums.d8,]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('9,-6,-2,-1')
      expect(room.scoreMap).to.have.properties({testid1: 9, testid2: -6, testid3: -2, testid4: -1})
    })
  })

})

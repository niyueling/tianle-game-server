import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'
import {CardType} from "../../../match/biaofen/card"
import Enums from '../../../match/biaofen/enums'
import PlayerState from "../../../match/biaofen/player_state"
import {packets, packetsTo, packetsWithMessageName} from "../mockwebsocket"
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('5577拖拉机', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch(3, {biGen: true})
    players = match.players
    table = match.table
    table.setFirstDa(0)
    table.primaryType = CardType.Spades
    table.diCards = []
  })


  it('bug', () => {
    table.primaryType = CardType.Heart
    players[0].cards = [Enums.cQ, Enums.cQ, Enums.cJ, Enums.cJ, Enums.h10]
    players[1].cards = [Enums.c6, Enums.c6, Enums.c10, Enums.c10, Enums.s8, Enums.s8]


    table.onPlayerDa(players[0], {cards: [Enums.cQ, Enums.cQ, Enums.cJ, Enums.cJ]})
    table.onPlayerDa(players[1], {cards: [Enums.c10, Enums.c10, Enums.s8, Enums.s8]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: true})
  })


})


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
    table.firstPlayerIndex = 0
    table.primaryType = CardType.Spades
    table.diCards = []
  })


  it('5577算拖拉机', () => {

    players[0].cards = [Enums.c5, Enums.c5, Enums.c7, Enums.c7]
    table.onPlayerDa(players[0], {cards: [Enums.c5, Enums.c5, Enums.c7, Enums.c7]})

    expect(last(packetsTo('testid1', 'game/daReply')).message).to.have.properties({
      ok: true
    })

  });

  it('6677 不算拖拉机', () => {
    players[0].cards = [Enums.h13, Enums.h13, Enums.h12, Enums.h12, Enums.c7]
    players[1].cards = [Enums.s12, Enums.s5, Enums.s5, Enums.c5, Enums.c7]
    players[2].cards = [Enums.s7, Enums.s7, Enums.s6, Enums.s6, Enums.c7]
    table.onPlayerDa(players[0], {cards: [Enums.h13, Enums.h13, Enums.h12, Enums.h12]})
    table.onPlayerDa(players[1], {cards: [Enums.s12, Enums.s5, Enums.s5, Enums.c5]})
    table.onPlayerDa(players[2], {cards: [Enums.s7, Enums.s7, Enums.s6, Enums.s6]})

    expect(last(packetsTo('testid1', 'game/otherDa')).message).to.have.properties(
      {
        "next": 0, "maxIndex": 0
      })

  })

  it('5566 不算拖拉机', () => {
    players[0].cards = [Enums.h13, Enums.h13, Enums.h12, Enums.h12, Enums.c7]
    players[1].cards = [Enums.s12, Enums.s5, Enums.s5, Enums.c5, Enums.c7]
    players[2].cards = [Enums.s5, Enums.s5, Enums.s6, Enums.s6, Enums.c7]
    table.onPlayerDa(players[0], {cards: [Enums.h13, Enums.h13, Enums.h12, Enums.h12]})
    table.onPlayerDa(players[1], {cards: [Enums.s12, Enums.s5, Enums.s5, Enums.c5]})
    table.onPlayerDa(players[2], {cards: [Enums.s5, Enums.s5, Enums.s6, Enums.s6]})

    expect(last(packetsTo('testid1', 'game/otherDa')).message).to.have.properties(
      {
        "next": 0, "maxIndex": 0
      })

  })


  it('提示5577算拖拉机', () => {

    players[0].cards = [Enums.c8, Enums.c8, Enums.c7, Enums.c7, Enums.h1]
    players[1].cards = [Enums.c5, Enums.c5, Enums.c7, Enums.c7, Enums.c9, Enums.c9]
    table.onPlayerDa(players[0], {cards: [Enums.c8, Enums.c8, Enums.c7, Enums.c7]})
    table.onPlayerDa(players[1], {cards: [Enums.c5, Enums.c5, Enums.c9, Enums.c9]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({
      ok: false
    })

  })

})

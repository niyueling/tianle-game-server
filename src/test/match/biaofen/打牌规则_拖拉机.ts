import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/biaofen/enums'
import PlayerState from "../../../match/biaofen/player_state"
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('出拖拉机', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table
    table.setFirstDa(0)
  })


  it('出拖拉机', () => {

    players[0].cards = [Enums.h3, Enums.h3, Enums.h4, Enums.h4, Enums.s1, Enums.s1]
    players[1].cards = [Enums.h5, Enums.h5, Enums.s6, Enums.s6, Enums.s1, Enums.s1]
    players[2].cards = [Enums.h6, Enums.h6, Enums.h2, Enums.c2, Enums.s1, Enums.s1]
    players[3].cards = [Enums.h5, Enums.h5, Enums.h6, Enums.h6, Enums.s1, Enums.s1]

    table.onPlayerDa(players[0], {cards: [Enums.h3, Enums.h3, Enums.h4, Enums.h4]})
    table.onPlayerDa(players[1], {cards: [Enums.h5, Enums.h5, Enums.s6, Enums.s6]})
    table.onPlayerDa(players[2], {cards: [Enums.h6, Enums.h6, Enums.h2, Enums.c2]})
    table.onPlayerDa(players[3], {cards: [Enums.h5, Enums.h5, Enums.h6, Enums.h6]})

  })
})

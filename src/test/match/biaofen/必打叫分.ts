import {CardType} from "../../../match/biaofen/card"
import PlayerState from "../../../match/biaofen/player_state"
import {packets, packetsTo, packetsWithMessageName} from "../mockwebsocket"
import setupMatch from './setupMatch'
import Enums from '../../../match/biaofen/enums'
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'

chai.use(chaiProperties)
const {expect} = chai

describe('叫分', () => {

  let players: PlayerState[]
  let table

  context('4人', () => {
    beforeEach(() => {

      const match = setupMatch(4, {biDa: true})
      players = match.players
      table = match.table
    })


    it('所有人都不叫 有四张以上常主叫主', () => {

      players[0].cards = []
      players[1].cards = []
      players[2].cards = [Enums.j1, Enums.j1, Enums.j2, Enums.j2]

      table.onPlayerBuJiao(players[0])
      table.onPlayerBuJiao(players[1])
      table.onPlayerBuJiao(players[2])
      table.onPlayerBuJiao(players[3])

      expect(last(packetsWithMessageName("game/waitSelectPrimary")).message)
        .to.have.properties({index: 2})
    })

    it('所有人都不叫 没有人有四张以上常主 重发', () => {

      players[0].cards = [Enums.c3]
      players[1].cards = [Enums.c3]
      players[2].cards = [Enums.c3]
      players[3].cards = [Enums.c3]

      table.onPlayerBuJiao(players[0])
      table.onPlayerBuJiao(players[1])
      table.onPlayerBuJiao(players[2])
      table.onPlayerBuJiao(players[3])

      expect(packetsWithMessageName("game/reShuffle"))
        .to.have.lengthOf(4)
    })

  })


  context('3人', () => {
    beforeEach(() => {

      const match = setupMatch(3, {biDa: true})
      players = match.players
      table = match.table
    })


    it('所有人都不叫 有五张以上常主叫主', () => {
      players[0].cards = []
      players[1].cards = [Enums.j1, Enums.j1, Enums.j2, Enums.j2]
      players[2].cards = [Enums.c6, Enums.c6, Enums.c6, Enums.c6, Enums.c6]

      table.onPlayerBuJiao(players[0])
      table.onPlayerBuJiao(players[1])
      table.onPlayerBuJiao(players[2])

      expect(last(packetsWithMessageName("game/waitSelectPrimary")).message)
        .to.have.properties({index: 2})
    })

    it('所有人都不叫 有五张以上常主叫主', () => {
      players[0].cards = [Enums.c3]
      players[1].cards = [Enums.c3]
      players[2].cards = [Enums.c3]

      table.onPlayerBuJiao(players[0])
      table.onPlayerBuJiao(players[1])
      table.onPlayerBuJiao(players[2])

      expect(packetsWithMessageName("game/reShuffle"))
        .to.have.lengthOf(3)
    })
  })

})

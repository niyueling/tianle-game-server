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

describe('主动结束', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table
    table.setFirstDa(0)
    table.firstPlayerIndex = 0
  })


  it('第一个玩家打完最后一张, 其他玩家直接跟打', () => {

    players[0].cards = [Enums.c6]
    players[1].cards = [Enums.c6]
    players[2].cards = [Enums.c6]
    players[3].cards = [Enums.c6]
    table.onPlayerDa(players[0], {cards: [Enums.c6]})

    expect(packetsWithMessageName('game/game-over')).not.empty
  })


})

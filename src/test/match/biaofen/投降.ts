import {CardType} from "../../../match/biaofen/card"
import PlayerState from "../../../match/biaofen/player_state"
import {packets, packetsTo, packetsWithMessageName} from "../mockwebsocket"
import setupMatch, {toString} from './setupMatch'
import Enums from '../../../match/biaofen/enums'
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'

chai.use(chaiProperties)
const {expect} = chai

describe('投降', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table

    table.jiaoFenStatus.jiaoFens[0] = {fen: 80}
    table.firstPlayerIndex = 0
    table.setFirstDa(0)
    table.broadcastFirstDa()
  })


  it('发起投降', () => {

    const now = Date.now()
    table.onPlayerStartSurrender(players[0], {now})


    expect(table.lastSurrenderAt).to.equal(now)
    expect(table.surrenderState).to.have.properties([
      {index: 0, zhuang: true, state: 'originator'},
      {index: 1, zhuang: false, state: 'waiting'},
      {index: 2, zhuang: false, state: 'waiting'},
      {index: 3, zhuang: false, state: 'waiting'}
    ])
  })

  it('庄发起投降 投降成功', () => {

    const now = Date.now()

    table.onPlayerStartSurrender(players[0], {now})
    table.onPlayerVoteSurrender(players[1], {agree: true})
    table.onPlayerVoteSurrender(players[2], {agree: true})
    table.onPlayerVoteSurrender(players[3], {agree: true})

    const states = last(packetsWithMessageName('game/game-over')).message.states
    expect(toString(states)).to.equal('-3,1,1,1')
  })

  it('闲发起投降 投降成功', () => {

    const now = Date.now()

    table.onPlayerStartSurrender(players[1], {now})
    table.onPlayerVoteSurrender(players[0], {agree: true})
    table.onPlayerVoteSurrender(players[2], {agree: true})
    table.onPlayerVoteSurrender(players[3], {agree: true})

    const states = last(packetsWithMessageName('game/game-over')).message.states
    expect(toString(states)).to.equal('3,-1,-1,-1')
  })


})


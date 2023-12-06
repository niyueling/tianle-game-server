import * as chai from 'chai'
import Enums from '../../../match/biaofen/enums'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'
import PlayerState from "../../../match/biaofen/player_state"
import {packetsWithMessageName} from "../mockwebsocket"
import setupMatch, {toString} from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('叫分', () => {

  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table

    table.firstPlayerIndex = 0
    table.jiaoFen = 80

  })

  it('庄打满80分', () => {

    players[table.firstPlayerIndex].zhua(80)
    table.gameOver()

    const states = last(packetsWithMessageName('game/game-over')).message.states

    expect(toString(states)).to.equal('3,-1,-1,-1')
  })

  it('庄未打满80分', () => {

    players[table.firstPlayerIndex].zhua(60)
    table.gameOver()

    const states = last(packetsWithMessageName('game/game-over')).message.states

    expect(toString(states)).to.equal('-3,1,1,1')
  })

  it('庄打满90分', () => {

    table.jiaoFen = 90
    players[table.firstPlayerIndex].zhua(90)
    table.gameOver()

    const states = last(packetsWithMessageName('game/game-over')).message.states

    expect(toString(states)).to.equal('6,-2,-2,-2')
  })

  it('庄打满100分', () => {

    table.jiaoFen = 100
    players[table.firstPlayerIndex].zhua(100)
    table.gameOver()

    const states = last(packetsWithMessageName('game/game-over')).message.states

    expect(toString(states)).to.equal('12,-4,-4,-4')
  })

  it('叫80 庄打满200分', () => {

    table.jiaoFen = 80
    players[table.firstPlayerIndex].zhua(200)
    table.gameOver()

    const states = last(packetsWithMessageName('game/game-over')).message.states

    expect(toString(states)).to.equal('6,-2,-2,-2')
  })

  it('叫80 庄打0分', () => {

    table.jiaoFen = 80
    players[table.firstPlayerIndex].zhua(0)
    table.gameOver()

    const states = last(packetsWithMessageName('game/game-over')).message.states

    expect(toString(states)).to.equal('-6,2,2,2')
  })

  it('最后一圈抓分', () => {

    table.jiaoFen = 80
    table.diCards = [Enums.h10]

    table.setFirstDa(0)

    players[0].cards = [Enums.h4]
    players[1].cards = [Enums.h3]
    players[2].cards = [Enums.h3]
    players[3].cards = [Enums.h3]

    table.onPlayerDa(players[0], {cards: [Enums.h4]})
    table.onPlayerDa(players[1], {cards: [Enums.h3]})
    table.onPlayerDa(players[2], {cards: [Enums.h3]})
    table.onPlayerDa(players[3], {cards: [Enums.h3]})

    expect(players[0].zhuaFen).to.equal(10)

  })

})

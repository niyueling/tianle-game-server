import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'
import {CardType} from "../../../match/biaofen/card"
import Enums from '../../../match/biaofen/enums'
import PlayerState from "../../../match/biaofen/player_state"
import {packetsTo, packetsWithMessageName} from "../mockwebsocket"
import setupMatch, {toString} from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai


describe('甩牌', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table

    table.firstPlayerIndex = 0
    table.jiaoFen = 80

    table.setFirstDa(0)
  })


  it('提示可以甩牌', () => {

    players[0].cards = [Enums.s1, Enums.s2, Enums.h1]
    players[1].cards = [Enums.h1, Enums.h1, Enums.h1]
    players[2].cards = [Enums.h1, Enums.h1, Enums.h1]
    players[3].cards = [Enums.h1, Enums.h1, Enums.h1]

    table.onPlayerDa(players[0], {cards: [Enums.h1]})
    table.onPlayerDa(players[1], {cards: [Enums.h1]})
    table.onPlayerDa(players[2], {cards: [Enums.h1]})
    table.onPlayerDa(players[3], {cards: [Enums.h1]})

    expect(packetsTo('testid1', 'game/canShuaiPai')).to.have.lengthOf(1)
  })


  it('甩牌', () => {

    players[0].cards = [Enums.s1, Enums.s2]
    players[1].cards = [Enums.h1, Enums.h1]
    players[2].cards = [Enums.h1, Enums.h1]
    players[3].cards = [Enums.h1, Enums.h1]

    players[0].zhuaFen = 80

    table.onPlayerShuai(players[0])

    const states = last(packetsWithMessageName('game/game-over')).message.states

    expect(toString(states)).to.equal('3,-1,-1,-1')

  })

})


describe('甩牌 bug', () => {

  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch(3)
    players = match.players
    table = match.table

    table.firstPlayerIndex = 0
    table.jiaoFen = 130
    table.primaryType = CardType.Club

    table.setFirstDa(0)
  })

  // fixme
  it.skip('可以正常甩', () => {

    players[0].cards = [Enums.s6, Enums.c6, Enums.h6, Enums.d6, Enums.h6, Enums.c10, Enums.c10, Enums.cJ]
    players[1].cards = [Enums.s1, Enums.s1, Enums.h1, Enums.h12, Enums.d1, Enums.d13, Enums.d12, Enums.d10]
    players[2].cards = [Enums.h3]

    table.onPlayerShuai(players[0])

    table.onPlayerDa(players[1], {cards: [Enums.s1, Enums.s1, Enums.h1, Enums.h12, Enums.d1, Enums.d13, Enums.d12, Enums.d10]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: true})
  })

  it('主6比主A大', () => {

    players[0].cards = [Enums.c6, Enums.h1, Enums.h1]
    players[1].cards = [Enums.c10, Enums.h1]
    players[2].cards = [Enums.c1, Enums.h1]

    table.onPlayerDa(players[0], {cards: [Enums.c6]})
    table.onPlayerDa(players[1], {cards: [Enums.c10]})
    table.onPlayerDa(players[2], {cards: [Enums.c1]})

    expect(last(packetsWithMessageName('game/otherDa')).message).to.have.properties({next: 0})
  })

})

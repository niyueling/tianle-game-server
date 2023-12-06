import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'
import {CardType} from "../../../match/biaofen/card"
import Enums from '../../../match/biaofen/enums'
import PlayerState from "../../../match/biaofen/player_state"
import {packetsTo, packetsWithMessageName} from "../mockwebsocket"
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('必跟', () => {

  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch(4, {biGen: true})
    players = match.players
    table = match.table
    table.primaryType = CardType.Spades
    table.setFirstDa(0)
  })


  it('有对必须跟对', () => {

    players[0].cards = [Enums.h7, Enums.h7, Enums.d10]
    players[1].cards = [Enums.h5, Enums.h5, Enums.h3]
    players[2].cards = [Enums.h7, Enums.h7, Enums.d10]
    players[3].cards = [Enums.h7, Enums.h7, Enums.d10]


    table.onPlayerDa(players[0], {cards: [Enums.h7, Enums.h7]})
    table.onPlayerDa(players[1], {cards: [Enums.h5, Enums.h3]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: false})

  })


  it('拖拉机必须跟对', () => {

    players[0].cards = [Enums.h7, Enums.h7, Enums.h8, Enums.h8, Enums.d5]
    players[1].cards = [Enums.h5, Enums.h5, Enums.h6, Enums.h6, Enums.h3]
    players[2].cards = [Enums.h7, Enums.h7, Enums.d10]
    players[3].cards = [Enums.h7, Enums.h7, Enums.d10]


    table.onPlayerDa(players[0], {cards: [Enums.h7, Enums.h7, Enums.h8, Enums.h8]})
    table.onPlayerDa(players[1], {cards: [Enums.h5, Enums.h5, Enums.h6, Enums.h3]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: false})

  })


  it('无拖拉机 必须出完所有对', () => {

    players[0].cards = [Enums.h7, Enums.h7, Enums.h8, Enums.h8, Enums.d5]
    players[1].cards = [Enums.h5, Enums.h5, Enums.h9, Enums.h9, Enums.h3]
    players[2].cards = [Enums.h7, Enums.h7, Enums.d10]
    players[3].cards = [Enums.h7, Enums.h7, Enums.d10]


    table.onPlayerDa(players[0], {cards: [Enums.h7, Enums.h7, Enums.h8, Enums.h8]})
    table.onPlayerDa(players[1], {cards: [Enums.h5, Enums.h5, Enums.h9, Enums.h3]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: false})

  })

  it('主一对 下家有不同花色常主', () => {

    players[0].cards = [Enums.s6, Enums.s6, Enums.s7, Enums.s7, Enums.d5]
    players[1].cards = [Enums.h2, Enums.c2, Enums.h9, Enums.h9, Enums.h3]


    table.onPlayerDa(players[0], {cards: [Enums.s6, Enums.s6]})
    table.onPlayerDa(players[1], {cards: [Enums.h2, Enums.c2]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: true})
  })


  it('不能出现混色拖拉机', () => {

    players[0].cards = [Enums.s5, Enums.s5, Enums.s6, Enums.s6, Enums.d5]
    players[1].cards = [Enums.h2, Enums.h2, Enums.s3, Enums.s3, Enums.d2]


    table.onPlayerDa(players[0], {cards: [Enums.s5, Enums.s5, Enums.s6, Enums.s6]})
    table.onPlayerDa(players[1], {cards: [Enums.h2, Enums.h2, Enums.s3, Enums.s3]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: true})
    expect(last(packetsWithMessageName('game/otherDa')).message).to.have.properties({pattern: {name: 'doubles_2'}})
  })

})


describe('3人', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch(3, {biGen: true})
    players = match.players
    table = match.table
    table.primaryType = CardType.Spades
    table.setFirstDa(0)
  })


  it('不能出现混色拖拉机', () => {

    players[0].cards = [Enums.s9, Enums.s9, Enums.s10, Enums.s10, Enums.d5]
    players[1].cards = [Enums.s5, Enums.s5, Enums.h6, Enums.h6, Enums.d2]


    table.onPlayerDa(players[0], {cards: [Enums.s9, Enums.s9, Enums.s10, Enums.s10]})
    table.onPlayerDa(players[1], {cards: [Enums.s5, Enums.s5, Enums.h6, Enums.h6]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: true})
    expect(last(packetsWithMessageName('game/otherDa')).message).to.have.properties({pattern: {name: 'doubles_2'}})
  })
})

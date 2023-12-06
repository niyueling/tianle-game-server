import Card, {CardType} from "../../../match/biaofen/card"
import PlayerState from "../../../match/biaofen/player_state"
import {packets, packetsTo, packetsWithMessageName} from "../mockwebsocket"
import setupMatch from './setupMatch'
import Enums from '../../../match/biaofen/enums'
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'

chai.use(chaiProperties)
const {expect} = chai

describe('托管', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch(4, {autoCommit: true})
    players = match.players
    table = match.table

    table.jiaoFenStatus.jiaoFens[0] = {fen: 80}
    table.firstPlayerIndex = 0
    table.setFirstDa(0)
    table.broadcastFirstDa()
  })

  it('第一轮 出牌', () => {
    table.autoCommitForPlayers()

    expect(last(packetsTo('testid1', 'game/daReply')).message)
      .to.have.properties({ok: true})
  })

  it('跟牌 可以相同花色直接跟', () => {

    players[0].cards = [Enums.c7, Enums.c7]
    players[1].cards = [Enums.c3, Enums.c4, Enums.d1, Enums.d5]

    table.onPlayerDa(players[0], {cards: [Enums.c7, Enums.c7]})
    table.autoCommitForPlayers()

    const {cards} = last(packetsWithMessageName('game/otherDa')).message

    const sorted = cards.map(c => Card.from(c)).sort((c1, c2) => {
      return c1.point - c2.point
    })
    expect(sorted.map(c => c.toString()).join(',')).to.eq('♣3,♣4')
  })

  it('跟牌 需要其他花色配牌', () => {

    players[0].cards = [Enums.c7, Enums.c7, Enums.c10]
    players[1].cards = [Enums.c3, Enums.d5, Enums.d1]

    table.onPlayerDa(players[0], {cards: [Enums.c7, Enums.c7]})
    table.autoCommitForPlayers()

    const {cards} = last(packetsWithMessageName('game/otherDa')).message

    const sorted = cards.map(c => Card.from(c)).sort((c1, c2) => {
      return c1.point - c2.point
    })
    expect(sorted.map(c => c.toString()).join(',')).to.eq('♣3,♦5')
  })

  it('跟牌 完全用其他类型牌', () => {

    players[0].cards = [Enums.c7, Enums.c7, Enums.d1]
    players[1].cards = [Enums.d3, Enums.d5, Enums.d10]

    table.onPlayerDa(players[0], {cards: [Enums.c7, Enums.c7]})
    table.autoCommitForPlayers()

    const {cards} = last(packetsWithMessageName('game/otherDa')).message

    const sorted = cards.map(c => Card.from(c)).sort((c1, c2) => {
      return c1.point - c2.point
    })
    expect(sorted.map(c => c.toString()).join(',')).to.eq('♦3,♦5')
  })


})

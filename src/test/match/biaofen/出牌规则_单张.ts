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

describe('出单张', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table
    table.setFirstDa(0)
    table.primaryType = CardType.Spades
    table.firstPlayerIndex = 0
    table.diCards = []
  })

  it('最后一张打完游戏结束', () => {

    table.firstPlayerIndex = 0
    players[0].cards = [Enums.h3]
    players[1].cards = [Enums.h5]
    players[2].cards = [Enums.h6]
    players[3].cards = [Enums.h5]

    table.onPlayerDa(players[0], {cards: [Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.h5]})
    table.onPlayerDa(players[2], {cards: [Enums.h6]})
    table.onPlayerDa(players[3], {cards: [Enums.h5]})

    expect(last(packetsWithMessageName('game/otherDa')).message).to.have.properties({next: -1, fen: 0})
    expect(last(packetsWithMessageName('game/zhuaFen')).message).to.have.properties({index: 2, win: 10, zhuaFen: 10})
    expect(players[2].zhuaFen).to.equal(10)
  })

  it('单张 无主 最大的获胜', () => {

    players[0].cards = [Enums.h3, Enums.h3, Enums.d10]
    players[1].cards = [Enums.h5, Enums.h5, Enums.d10]
    players[2].cards = [Enums.h6, Enums.h6, Enums.d10]
    players[3].cards = [Enums.h5, Enums.h5, Enums.d10]

    table.onPlayerDa(players[0], {cards: [Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.h5]})
    table.onPlayerDa(players[2], {cards: [Enums.h6]})
    table.onPlayerDa(players[3], {cards: [Enums.h5]})

    expect(last(packets).message).to.have.properties({next: 2, fen: 0})
    expect(last(packetsWithMessageName('game/zhuaFen')).message).to.have.properties({index: 2, win: 10, zhuaFen: 10})
    expect(players[2].zhuaFen).to.equal(10)
  })


  it('单张 主色牌 最大的获胜', () => {

    players[0].cards = [Enums.h3, Enums.h3, Enums.c10]
    players[1].cards = [Enums.s5, Enums.s5]
    players[2].cards = [Enums.h6, Enums.h6]
    players[3].cards = [Enums.h5, Enums.h5]

    table.onPlayerDa(players[0], {cards: [Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.s5]})
    table.onPlayerDa(players[2], {cards: [Enums.h6]})
    table.onPlayerDa(players[3], {cards: [Enums.h5]})

    expect(last(packets).message).to.have.properties({next: 1, fen: 0})
    expect(last(packetsWithMessageName('game/zhuaFen')).message).to.have.properties({index: 1, win: 10, zhuaFen: 10})
    expect(players[1].zhuaFen).to.equal(10)
  })

  it('单张 王最大 最大的获胜', () => {
    table.primaryType = CardType.Spades

    players[0].cards = [Enums.h3, Enums.h3, Enums.c10]
    players[1].cards = [Enums.s5, Enums.s5]
    players[2].cards = [Enums.s5, Enums.h5]
    players[3].cards = [Enums.s6, Enums.j1]

    table.onPlayerDa(players[0], {cards: [Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.s5]})
    table.onPlayerDa(players[2], {cards: [Enums.h5]})
    table.onPlayerDa(players[3], {cards: [Enums.j1]})

    expect(last(packets).message).to.have.properties({next: 3, fen: 0})
    expect(last(packetsWithMessageName('game/zhuaFen')).message).to.have.properties({index: 3, win: 10, zhuaFen: 10})
    expect(players[3].zhuaFen).to.equal(10)
  })

  it('单张 下家绝了可以出任意牌', () => {
    table.primaryType = CardType.Spades

    players[0].cards = [Enums.d3, Enums.d2]
    players[1].cards = [Enums.s5, Enums.d2]

    table.onPlayerDa(players[0], {cards: [Enums.d3]})
    table.onPlayerDa(players[1], {cards: [Enums.s5]})

    expect(last(packetsTo('testid2', 'game/daReply')).message)
      .to.have.properties({ok: true})

  })

  it('主2 大过 其他2', () => {
    table.primaryType = CardType.Spades

    players[0].cards = [Enums.h2, Enums.d2, Enums.c10]
    players[1].cards = [Enums.s2, Enums.d2]
    players[2].cards = [Enums.s1, Enums.d2]
    players[3].cards = [Enums.s3, Enums.d2]

    table.onPlayerDa(players[0], {cards: [Enums.h2]})
    table.onPlayerDa(players[1], {cards: [Enums.s2]})
    table.onPlayerDa(players[2], {cards: [Enums.s1]})
    table.onPlayerDa(players[3], {cards: [Enums.s3]})


    expect(last(packetsWithMessageName('game/otherDa')).message).to.have.properties({next: 1})

  })


})

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

describe('出对子', () => {


  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table
    table.setFirstDa(0)
  })


  it('第一个人不能打非对子', () => {
    players[0].cards = [Enums.h3, Enums.h4, Enums.s1]
    table.onPlayerDa(players[0], {cards: [Enums.h3, Enums.h4]})

    expect(last(packetsTo('testid1', 'game/daReply')).message)
      .to.have.properties({ok: false, info: "牌型错误"})
  })

  it('跟牌者 可以不出对子', () => {
    players[0].cards = [Enums.h3, Enums.h3, Enums.s1]
    players[1].cards = [Enums.h3, Enums.h3, Enums.h4]


    table.onPlayerDa(players[0], {cards: [Enums.h3, Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.h3, Enums.h4]})

    expect(last(packetsTo('testid2', 'game/daReply')).message)
      .to.have.properties({ok: true})
  })

  it('跟牌者 有对必须出同类型对子', () => {
    players[0].cards = [Enums.h3, Enums.h3, Enums.s1]
    players[1].cards = [Enums.h3, Enums.h3, Enums.s4, Enums.s4]


    table.onPlayerDa(players[0], {cards: [Enums.h3, Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.s4, Enums.s4]})

    expect(last(packetsTo('testid2', 'game/daReply')).message)
      .to.have.properties({ok: false, info: '出牌花色错误'})
  })


  it('所有人打同类型 对子', () => {
    players[0].cards = [Enums.h3, Enums.h3, Enums.s1, Enums.c10]
    players[1].cards = [Enums.h5, Enums.h5, Enums.s1]
    players[2].cards = [Enums.h6, Enums.h6, Enums.s1]
    players[3].cards = [Enums.h5, Enums.h5, Enums.s1]

    table.onPlayerDa(players[0], {cards: [Enums.h3, Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.h5, Enums.h5]})
    table.onPlayerDa(players[2], {cards: [Enums.h6, Enums.h6]})
    table.onPlayerDa(players[3], {cards: [Enums.h5, Enums.h5]})

    expect(last(packetsWithMessageName('game/otherDa')).message).to.have.properties({next: 2})
    expect(last(packetsWithMessageName('game/zhuaFen')).message).to.have.properties({index: 2, win: 20, zhuaFen: 20})
    expect(players[2].zhuaFen).to.equal(20)
  })

  it('不能出同类型的牌型 必须出完同类的牌', () => {
    players[0].cards = [Enums.h3, Enums.h3, Enums.s1]
    players[1].cards = [Enums.h5, Enums.s1, Enums.s1]

    table.onPlayerDa(players[0], {cards: [Enums.h3, Enums.h3]})

    table.onPlayerDa(players[1], {cards: [Enums.s1, Enums.s1]})
    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: false})


    table.onPlayerDa(players[1], {cards: [Enums.s1, Enums.h5]})
    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: true})
  })


  it('主牌类型判断', () => {
    players[0].cards = [Enums.h3, Enums.s1, Enums.s1, Enums.c10]
    players[1].cards = [Enums.h2, Enums.h2, Enums.s1]
    players[2].cards = [Enums.s3, Enums.s3, Enums.s1]
    players[3].cards = [Enums.s4, Enums.s4, Enums.s1]


    table.onPlayerDa(players[0], {cards: [Enums.s1, Enums.s1]})
    table.onPlayerDa(players[1], {cards: [Enums.h2, Enums.h2]})
    table.onPlayerDa(players[2], {cards: [Enums.s3, Enums.s3]})
    table.onPlayerDa(players[3], {cards: [Enums.s4, Enums.s4]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: true})

    expect(last(packetsWithMessageName('game/otherDa')).message).to.have.properties({next: 1})
    expect(players[1].zhuaFen).to.equal(0)

  })

  it('有对可以不打对', () => {
    players[0].cards = [Enums.h3, Enums.h3, Enums.s1]
    players[1].cards = [Enums.h2, Enums.h2, Enums.h4, Enums.s1]
    players[2].cards = [Enums.s3, Enums.s3, Enums.s1]
    players[3].cards = [Enums.s4, Enums.s4, Enums.s1]


    table.onPlayerDa(players[0], {cards: [Enums.h3, Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.h2, Enums.h4]})

    expect(last(packetsTo('testid2', 'game/daReply')).message).to.have.properties({ok: true})
  })

  it('其他非主对 大不过开始的类型对子', () => {
    players[0].cards = [Enums.h3, Enums.h3, Enums.s1, Enums.s1]
    players[1].cards = [Enums.c5, Enums.c5, Enums.s1]
    players[2].cards = [Enums.s3, Enums.s3, Enums.s1]
    players[3].cards = [Enums.s4, Enums.s4, Enums.s1]

    table.onPlayerDa(players[0], {cards: [Enums.h3, Enums.h3]})
    table.onPlayerDa(players[1], {cards: [Enums.c5, Enums.c5]})
    table.onPlayerDa(players[2], {cards: [Enums.s1, Enums.s3]})
    table.onPlayerDa(players[3], {cards: [Enums.s1, Enums.s4]})


    expect(last(packetsTo('testid4', 'game/otherDa')).message)
      .to.have.properties({next: 0})

  })

})

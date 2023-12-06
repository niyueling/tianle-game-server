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

  beforeEach(() => {

    const match = setupMatch()
    players = match.players
    table = match.table
  })


  it('第一家先叫分 最低叫80', () => {

    expect(packetsTo('testid1', 'game/selectFen')).not.empty


    table.onPlayerJiaoFen(players[0], {fen: 80})

    expect(last(packetsTo('testid1', 'game/jiaoFenReply')).message)
      .to.have.properties({ok: true})
  })

  it('第一家先叫分 不能叫70', () => {
    table.onPlayerJiaoFen(players[0], {fen: 70})

    expect(last(packetsTo('testid1', 'game/jiaoFenReply')).message)
      .to.have.properties({ok: false})
  })

  it('第一家先叫分 叫200分 结束叫分', () => {
    table.onPlayerJiaoFen(players[0], {fen: 200})

    expect(last(packetsTo('testid1', 'game/jiaoFenReply')).message)
      .to.have.properties({ok: true})

    expect(table.firstPlayerIndex).to.equal(0)
    expect(last(packetsTo('testid1', 'game/startSelectPrimary'))).to.not.empty
    expect(last(packetsTo('testid1', 'game/waitSelectPrimary')))
      .to.have.properties({name: 'game/waitSelectPrimary', message: {index: 0}})
  })


  context('不叫', () => {

    it('第一个可以不叫', () => {

      table.onPlayerBuJiao(players[0])

      expect(last(packetsTo('testid1', 'game/buJiaoReply')).message)
        .to.have.properties({ok: true})
    });

    it('四个人不叫 重新发牌', () => {

      table.onPlayerBuJiao(players[0])
      table.onPlayerBuJiao(players[1])
      table.onPlayerBuJiao(players[2])
      table.onPlayerBuJiao(players[3])

      expect(last(packetsTo('testid1', 'game/reShuffle')).message)
        .to.have.property('cards')
    });


    it('第一个叫分 第二个可以过', () => {
      table.onPlayerJiaoFen(players[0], {fen: 90})
      table.onPlayerBuJiao(players[1])

      expect(packetsTo('testid3', 'game/selectFen')).not.empty
    })

    it('第一个叫分 其他三个不叫', () => {
      table.onPlayerJiaoFen(players[0], {fen: 90})
      table.onPlayerBuJiao(players[1])
      table.onPlayerBuJiao(players[2])
      table.onPlayerBuJiao(players[3])

      expect(last(packetsTo('testid1', 'game/startSelectPrimary'))).to.not.empty
    })

    it('第1/2都叫分 2.3.4.1不叫', () => {
      table.onPlayerJiaoFen(players[0], {fen: 90})
      table.onPlayerJiaoFen(players[1], {fen: 100})
      table.onPlayerBuJiao(players[2])
      table.onPlayerBuJiao(players[3])
      table.onPlayerBuJiao(players[0])

      expect(last(packetsTo('testid2', 'game/startSelectPrimary'))).to.not.empty
    })

    it('第1.2.3不叫,4叫;叫分完成', () => {
      table.onPlayerBuJiao(players[0])
      table.onPlayerBuJiao(players[1])
      table.onPlayerBuJiao(players[2])
      table.onPlayerJiaoFen(players[3], {fen: 100})

      expect(last(packetsTo('testid4', 'game/startSelectPrimary'))).to.not.empty
    })

  })
})


describe('三人', function () {

  let players: PlayerState[]
  let table

  beforeEach(() => {

    const match = setupMatch(3)
    players = match.players
    table = match.table
  })

  it('三人都不叫 重发牌', () => {
    table.onPlayerBuJiao(players[0])
    table.onPlayerBuJiao(players[1])
    table.onPlayerBuJiao(players[2])

    table.onPlayerJiaoFen(players[0], {fen: 130})
    table.onPlayerBuJiao(players[1])
    table.onPlayerBuJiao(players[2])

    expect(packetsTo('testid1', 'game/startSelectPrimary'))
      .to.not.empty
  })

});

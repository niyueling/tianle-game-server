import * as chai from 'chai'
import {default as Table} from "../../../match/paodekuai/normalTable"
import PlayerState from "../../../match/paodekuai/player_state"
import setupMatch from "../setupMatch"
import {last, nth} from 'lodash'
import * as chaiProperties from 'chai-properties'
import {displayMessage, packetsTo, scoreString} from '../mockwebsocket'
import Enums from '../../../match/paodekuai/enums'

const {expect} = chai
chai.use(chaiProperties)

describe('抢龙头', () => {
  let room, table: Table, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  const playerCount = 3

  beforeEach(() => {
    const match = setupMatch(playerCount, {longTou: true, wanFa: 'guanPai'})
    room = match.room
    table = match.table as Table
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
  })

  it('最先开始抢的玩家判断', () => {
    table.start();
    player1.cards = [Enums.c5, Enums.c4, Enums.s5]
    player2.cards = [Enums.s3, Enums.c8]
    player3.cards = [Enums.c7, Enums.s9]

    table.broadcastLongTouReply({qiang: true}, player2)

    expect(last(packetsTo('testid2'))).to.have.properties({name: 'game/startDa', message: {"index": 1}})
  })

  it('都不抢，最初的玩家开始', () => {
    table.start();
    player1.cards = [Enums.c5, Enums.c4, Enums.s5]
    player2.cards = [Enums.s3, Enums.c8]
    player3.cards = [Enums.c7, Enums.s9]

    table.broadcastLongTouReply({qiang: false}, player2)
    table.broadcastLongTouReply({qiang: false}, player3)
    table.broadcastLongTouReply({qiang: false}, player1)

    expect(last(packetsTo('testid2'))).to.have.properties({name: 'game/startDa', message: {"index": 1}})
  })

  it('龙头玩家输了(其余玩家压住牌)', () => {
    table.start();
    player1.cards = [Enums.c5, Enums.c4, Enums.s5]
    player2.cards = [Enums.s3, Enums.c8]
    player3.cards = [Enums.c7, Enums.s9]

    table.broadcastLongTouReply({qiang: true}, player2)
    table.daPai(player2, [Enums.s3], {name: 'single', score: 1, cards: []})
    table.daPai(player3, [Enums.c7], {name: 'single', score: 1, cards: [Enums.s3]})

    expect(scoreString()).to.equal('32,-64,32')
  })

  it('龙头玩家赢', () => {
    table.start();
    player1.cards = [Enums.c5, Enums.c4, Enums.s5]
    player2.cards = [Enums.s3, Enums.c3]
    player3.cards = [Enums.c7, Enums.s9]

    table.broadcastLongTouReply({qiang: true}, player2)
    table.daPai(player2, [Enums.s3, Enums.c3], {name: 'single', score: 1, cards: []})

    expect(scoreString()).to.equal('-32,64,-32')
  })
})

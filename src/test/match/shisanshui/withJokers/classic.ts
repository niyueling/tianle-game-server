import Card from "../../../../match/shisanshui/card"
import setupMatch from "../setupMatch";
import {displayMessage, packetsTo} from "../../mockwebsocket";
import Enums from "../../../../match/shisanshui/enums"
import {splitCommit} from "../utils";
import {last} from 'lodash'
import * as chai from "chai"
import * as chaiProperties from "chai-properties"

chai.use(chaiProperties)

const {expect} = chai


describe('带王', () => {

  const playerCount = 2
  let room, table, players, allRule

  beforeEach(async () => {
    const match = setupMatch(playerCount, {wanFa: 'jingDian'})
    room = match.room
    table = match.table
    players = table.players
    allRule = match.allRule
  })

  it('提交带王的牌能够 按照最大牌型计算', () => {

    players[0].cards = [
      Enums.c3, Enums.c5, Enums.s8,
      Enums.c9, Enums.c10, Enums.s11, Enums.c12, Enums.s13,
      Enums.c6, Enums.s6, Enums.c10, Enums.s10, Enums.j1
    ]

    players[1].cards = [
      Enums.c3, Enums.c5, Enums.s8,
      Enums.c9, Enums.c10, Enums.s11, Enums.c12, Enums.s13,
      Enums.c6, Enums.s6, Enums.c10, Enums.s10, Enums.j1
    ]


    splitCommit(players[0], table)
    splitCommit(players[1], table)

    displayMessage()

    const {onTable: [playerCommit]} = last(packetsTo('testid1', 'game/showTime')).message

    expect(playerCommit).have.properties({
      head: {combo: {name: '单张'}},
      middle: {combo: {name: '顺子'}},
      tail: {combo: {name: '葫芦'}},
    })
  })


  it('提交王没有被替换 ', () => {

    players[0].cards = [
      Enums.h10, Enums.c11, Enums.s2, Enums.s3, Enums.c4,
      Enums.h7, Enums.h8, Enums.c9,
      Enums.h5, Enums.c6, Enums.s1, Enums.s2, Enums.j1
    ]

    players[1].cards = [
      Enums.c3, Enums.c5, Enums.s8,
      Enums.c9, Enums.c10, Enums.s11, Enums.c12, Enums.s13,
      Enums.c6, Enums.s6, Enums.c10, Enums.s10, Enums.j1
    ]

    const cards = players[0].cards
    const head = cards.slice(0, 3)
    const middle = cards.slice(3, 8)
    const tail = cards.slice(8, 13)

    table.playerOnCommit(players[0], {
      isQiPai: true, name: '三顺子', head, middle, tail, score: 3
    })
    splitCommit(players[1], table)
    const {onTable: [playerCommit]} = last(packetsTo('testid1', 'game/showTime')).message

    const headStr = playerCommit.head.combo.cards.map(c => Card.from(c).toString()).join()
    const middleStr = playerCommit.middle.combo.cards.map(c => Card.from(c).toString()).join()
    const tailStr = playerCommit.tail.combo.cards.map(c => Card.from(c).toString()).join()

    expect([headStr, middleStr, tailStr].join()).to.equal('小🃏,♠2,♠A,♣6,♥5,♣4,♠3,♠2,♣J,♥10,♣9,♥8,♥7')
  })

})

'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/pcmajiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, scoreString, packetsWithMessageName} from './mockwebsocket'
import setupMatch, {cardsFromArray} from './setupMatch'
import TableState from "../../../match/pcmajiang/table_state";

const {expect} = chai

chai.use(chaiProperties);
let sleepDur = 100
let sleep = function (time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}

describe('一炮多响胡', () => {

  let room, table: TableState;
  let player1, player2, player3, player4;
  let changeCaishen

  beforeEach(async function () {
    let match = setupMatch(4, {feiNiao: 0})
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]
    changeCaishen = match.changeCaishen
  });

  it.skip('第一个人胡了 后面能胡的一起胡掉', () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.wanzi1])
    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.shuzi3, Enums.shuzi3, Enums.shuzi3,
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1,
      Enums.wanzi9, Enums.wanzi9
    ])
    player3.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.shuzi3, Enums.shuzi3, Enums.shuzi3,
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1,
      Enums.wanzi9, Enums.wanzi9
    ])
    player4.cards = cardsFromArray([])


    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)


    displayMessage()

    expect(scoreString()).to.equal('-2,1,1,0')

  })

  it('第一个过了 后面的单独胡', async () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.wanzi1])
    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.shuzi3, Enums.shuzi3, Enums.shuzi3,
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1,
      Enums.wanzi9, Enums.wanzi9
    ])
    player3.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.shuzi3, Enums.shuzi3, Enums.shuzi3,
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1,
      Enums.wanzi9, Enums.wanzi9
    ])
    player4.cards = cardsFromArray([])


    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.guo, table.turn, Enums.wanzi1)
    player3.requestAction(Enums.hu, table.turn, Enums.wanzi1)


    await sleep(sleepDur);

    displayMessage()
    expect(scoreString()).to.equal('-1,0,1,0')

  })


  it('都过了 继续打牌', () => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([Enums.wanzi1])
    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.shuzi3, Enums.shuzi3, Enums.shuzi3,
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1,
      Enums.wanzi9, Enums.wanzi9
    ])
    player3.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.shuzi3, Enums.shuzi3, Enums.shuzi3,
      Enums.tongzi1, Enums.tongzi1, Enums.tongzi1,
      Enums.wanzi9, Enums.wanzi9
    ])
    player4.cards = cardsFromArray([])


    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.guo, table.turn, Enums.wanzi1)
    player3.requestAction(Enums.guo, table.turn, Enums.wanzi1)

    displayMessage()

    expect(last(packets)).to.have.properties({name: 'game/oppoTakeCard'})
  })

  context('不可接炮胡', () => {

    beforeEach(() => {
      let match = setupMatch(4, {feiNiao: 0, keJiePao: false})
      table = match.table
      room = match.room
      player1 = match.players[0]
      player2 = match.players[1]
      player3 = match.players[2]
      player4 = match.players[3]
      changeCaishen = match.changeCaishen
    });

    it('平胡不能跟胡', () => {
      table.fapai({})
      table.turn = 10


      player1.cards = cardsFromArray([Enums.wanzi1])
      player2.cards = cardsFromArray([
        Enums.wanzi2, Enums.wanzi2,
        Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi3, Enums.shuzi3,
        Enums.tongzi1, Enums.tongzi1,
        Enums.wanzi1,
        Enums.wanzi9, Enums.wanzi9
      ])
      player3.cards = cardsFromArray([
        Enums.wanzi2, Enums.wanzi3,
        Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi3, Enums.shuzi3, Enums.shuzi3,
        Enums.tongzi1, Enums.tongzi1, Enums.tongzi1,
        Enums.wanzi9, Enums.wanzi9
      ])
      player4.cards = cardsFromArray([])


      player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
      player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

      displayMessage()

      expect(packetsWithMessageName('game/genHu')).to.have.length(0)
    });

    it.skip('大胡能跟胡', () => {
      table.fapai({})
      table.turn = 10

      player1.cards = cardsFromArray([Enums.wanzi1])
      player2.cards = cardsFromArray([
        Enums.wanzi2, Enums.wanzi2,
        Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi3, Enums.shuzi3,
        Enums.tongzi1, Enums.tongzi1,
        Enums.wanzi1,
        Enums.wanzi9, Enums.wanzi9
      ])
      player3.cards = cardsFromArray([
        Enums.wanzi2, Enums.wanzi2,
        Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi3, Enums.shuzi3,
        Enums.tongzi1, Enums.tongzi1,
        Enums.wanzi1,
        Enums.wanzi9, Enums.wanzi9
      ])
      player4.cards = cardsFromArray([])

      player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
      player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

      displayMessage()

      expect(packetsWithMessageName('game/genHu')).to.have.length(1)
    })
  })
})

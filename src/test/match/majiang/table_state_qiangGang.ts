'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/pcmajiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, clearMessage, scoreString, packetsWithMessageName} from './mockwebsocket'
import setupMatch, {cardsFromArray} from './setupMatch'
import TableState from "../../../match/pcmajiang/table_state";
import PlayerState from "../../../match/pcmajiang/player_state";

const {expect} = chai

chai.use(chaiProperties);

let sleepDur = 10
let sleep = function (time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}

describe('抢杠胡', () => {

  let room, table: TableState;
  let player1: PlayerState, player2: PlayerState, player3: PlayerState, player4: PlayerState;
  let changeCaishen

  beforeEach(function () {
    let match = setupMatch()
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]
    changeCaishen = match.changeCaishen
  });


  it('抢杠', async() => {
    table.fapai({})
    table.turn = 10

    player1.events.peng = [Enums.wanzi1]
    player1.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1])
    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.dong, Enums.dong
    ])

    player3.cards = cardsFromArray([Enums.wanzi1, Enums.dong])
    player4.cards = cardsFromArray([Enums.wanzi1, Enums.xi])


    player1.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

    await sleep(sleepDur);

    displayMessage()

    expect(scoreString()).to.equal('-6,6,0,0')
  })

  it('多人能抢杠', async () => {
    table.fapai({})
    table.turn = 10

    player1.events.peng = [Enums.wanzi1]
    player1.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1])

    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.dong, Enums.dong
    ])

    player3.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.dong, Enums.dong
    ])

    player4.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.dong, Enums.dong
    ])


    player1.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

    await sleep(sleepDur);
    displayMessage()

    expect(scoreString()).to.equal('-18,6,6,6')
  })

  it('多人能抢杠bug 放杠者在中间', async() => {
    table.fapai({})

    player1.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.dong, Enums.dong, Enums.xi, Enums.xi
    ])


    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.dong, Enums.dong
    ])

    player3.cards = cardsFromArray([
      Enums.wanzi1, Enums.xi
    ])
    player3.events.peng = [Enums.wanzi1]

    player4.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.dong, Enums.dong
    ])

    table.cards = new Array(10).fill(Enums.xi)
    table.remainCards = 10

    player1.requestAction(Enums.da, table.turn, Enums.xi)
    player2.requestAction(Enums.da, table.turn, player2.lastCardToken)
    player3.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)
    player4.requestAction(Enums.hu, table.turn, Enums.wanzi1)

    await sleep(sleepDur);
    displayMessage()

    expect(scoreString()).to.equal('0,6,-12,6')
  })


  it('无人抢杠', () => {
    table.fapai({})

    player1.events.peng = [Enums.wanzi1]
    player1.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi2])

    player2.cards = cardsFromArray([
      Enums.wanzi3, Enums.wanzi9,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,

    ])

    player3.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi3])
    player4.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi3])


    player1.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)


    displayMessage()

    expect(last(packets)).to.have.properties({'name': 'game/oppoTakeCard'})


  })

  it('抢杠 玩家放弃抢杠', () => {
    table.fapai({})

    player1.events.peng = [Enums.wanzi1]
    player1.cards = cardsFromArray([Enums.wanzi1])
    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.dong, Enums.dong
    ])

    player3.cards = cardsFromArray([Enums.wanzi3])
    player4.cards = cardsFromArray([Enums.wanzi3])

    player1.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.guo, table.turn, Enums.wanzi1)

    displayMessage()
    expect(last(packetsWithMessageName('GangReply')).message).to.have.properties({errorCode: 0})
  })

  context('自摸胡', () => {
    beforeEach(() => {
      let match = setupMatch(4, {keJiePao: false, feiNiao: 0})
      table = match.table
      room = match.room
      player1 = match.players[0]
      player2 = match.players[1]
      player3 = match.players[2]
      player4 = match.players[3]
      changeCaishen = match.changeCaishen
    })

    it('平胡能抢杠', () => {
      table.fapai({})
      table.turn = 10

      player1.cards = cardsFromArray([Enums.wanzi1])
      player1.events.peng = [Enums.wanzi1]


      player2.cards = cardsFromArray([
        Enums.wanzi1,
        Enums.shuzi1, Enums.shuzi2, Enums.shuzi3,
        Enums.shuzi4, Enums.shuzi4, Enums.shuzi4,
        Enums.wanzi2, Enums.wanzi2, Enums.wanzi2,
        Enums.wanzi4, Enums.wanzi4, Enums.wanzi4,
      ])

      player1.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)
      displayMessage()

      expect(last(packets)).to.have.properties({name: "game/canDoSomething", to: "testid2"})

    })
  })

})


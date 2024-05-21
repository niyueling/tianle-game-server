'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/pcmajiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, clearMessage, packetsWithMessageName,scoreString}  from './mockwebsocket'
import setupMatch, {cardsFromArray}  from './setupMatch'
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

describe('结算', () => {

  let room, table: TableState;
  let player1: PlayerState, player2: PlayerState, player3: PlayerState, player4: PlayerState;
  let changeCaishen

  beforeEach(function () {
    let match = setupMatch(4, {useCaiShen: true, kehu: []})
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]
    changeCaishen = match.changeCaishen
  });

  it('七对子 0番', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([
      Enums.wanzi1
    ])

    player2.cards = cardsFromArray([
      Enums.wanzi1,
      Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi9, Enums.wanzi9,
      Enums.tongzi1, Enums.tongzi1,
      Enums.tongzi2, Enums.tongzi2
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()


    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

    await sleep(sleepDur);

    displayMessage()

    expect(scoreString()).to.equal('-1,1,0,0')
  })


  it('豪七对子 0番', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([
      Enums.wanzi1
    ])

    player2.cards = cardsFromArray([
      Enums.wanzi1,
      Enums.wanzi3, Enums.wanzi3,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi9, Enums.wanzi9,
      Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi2, Enums.tongzi2
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()


    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

    await sleep(sleepDur);
    displayMessage()

    expect(scoreString()).to.equal('-1,1,0,0')
  })

  it('碰碰胡 0番', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([
      Enums.wanzi1
    ])

    player2.cards = cardsFromArray([
      Enums.wanzi1,
      Enums.wanzi3, Enums.wanzi3,Enums.wanzi3,
      Enums.wanzi5, Enums.wanzi5,Enums.wanzi5,
      Enums.wanzi9, Enums.wanzi9,Enums.wanzi9,
      Enums.tongzi2, Enums.tongzi2,Enums.tongzi2
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

    await sleep(sleepDur);
    displayMessage()
    expect(scoreString()).to.equal('-1,1,0,0')
  })

  it('清一色 0番', async() => {
    table.fapai({})
    table.turn = 10

    player1.cards = cardsFromArray([
      Enums.wanzi1
    ])

    player2.cards = cardsFromArray([
      Enums.wanzi1,
      Enums.wanzi3, Enums.wanzi4,Enums.wanzi5,
      Enums.wanzi6, Enums.wanzi7,Enums.wanzi8,
      Enums.wanzi9, Enums.wanzi9,Enums.wanzi9,
      Enums.wanzi8, Enums.wanzi8,Enums.wanzi8
    ])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

    await sleep(sleepDur);
    displayMessage()
    expect(scoreString()).to.equal('-1,1,0,0')
  })


})

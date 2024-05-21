'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/pcmajiang/enums'
import {packets, displayMessage, scoreString}  from './mockwebsocket'
import setupMatch, {cardsFromArray}  from './setupMatch'
import TableState from "../../../match/pcmajiang/table_state";
const {expect} = chai

chai.use(chaiProperties);
let sleepDur = 10
let sleep = function (time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}

describe('天胡', () => {

  let room, table: TableState;
  let player1, player2, player3, player4;
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

  it('天胡 平胡', async() => {
    table.fapai({})

    table.stateData.card = Enums.wanzi9

    player1.cards = cardsFromArray([
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
      Enums.tongzi5, Enums.tongzi5, Enums.tongzi5,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.wanzi9, Enums.wanzi9
    ])

    player1.lastCardToken = Enums.wanzi9

    player1.emitter.emit(Enums.hu, table.turn, Enums.wanzi9)

    await sleep(sleepDur)
    displayMessage()

    expect(scoreString()).to.equal('24,-8,-8,-8')

  });

  it('天胡 七对', async() => {
    table.fapai({})

    table.stateData.card = Enums.wanzi9

    player1.cards = cardsFromArray([
      Enums.wanzi1,Enums.wanzi1,
      Enums.wanzi2, Enums.wanzi2,
      Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi3,Enums.tongzi3,
      Enums.tongzi5, Enums.tongzi5,
      Enums.shuzi1, Enums.shuzi1,
      Enums.wanzi9, Enums.wanzi9
    ])

    player1.lastCardToken = Enums.wanzi9

    player1.emitter.emit(Enums.hu, table.turn, Enums.wanzi9)

    await sleep(sleepDur);
    displayMessage()

    expect(scoreString()).to.equal('48,-16,-16,-16')
  });
})

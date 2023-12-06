'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {packets, displayMessage, clearMessage}  from './mockwebsocket'
import setupMatch, {cardsFromArray}  from './setupMatch'
import TableState from "../../../match/majiang/table_state";


const {expect} = chai
chai.use(chaiProperties);

describe('提前财神出现', () => {

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


  it.skip('发牌', () => {
    table.fapai()

    let caiShen = table.caishen

    let caiCount = table.players.reduce((caiCount,player) => {
      return player.cards[caiShen] + caiCount
    },0)


    expect(caiCount).to.equal(1)

  });
});

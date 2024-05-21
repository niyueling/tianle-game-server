'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/majiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, clearMessage}  from './mockwebsocket'
import setupMatch, {cardsFromArray}  from './setupMatch'
import {toUnicode} from "punycode";


const {expect} = chai
chai.use(chaiProperties);

describe('兰溪bug-4', () => {

  let room, table;
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

  it('吃牌', () => {

    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi7])
    player2.cards = cardsFromArray([Enums.wanzi5, Enums.wanzi6, Enums.wanzi7, Enums.wanzi8])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    changeCaishen(Enums.dong)

    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi7)
    player2.emitter.emit(Enums.chi,table.turn,Enums.wanzi7, Enums.wanzi6,Enums.wanzi8)
    player2.emitter.emit(Enums.da, table.turn, Enums.wanzi5)
    displayMessage()


  });


});

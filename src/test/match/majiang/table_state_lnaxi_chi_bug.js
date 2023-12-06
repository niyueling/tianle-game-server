'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/majiang/enums'
import {last} from 'lodash'
import {displayMessage, packets} from './mockwebsocket'
import setupMatch, {cardsFromArray} from './setupMatch'

const {expect} = chai
chai.use(chaiProperties);

describe('兰溪bug-3', () => {

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


  it.skip('过胡 过胡 吃', () => {

    table.fapai()

    player1.cards = cardsFromArray([
      Enums.shuzi3, Enums.shuzi9, Enums.shuzi6
    ])

    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3, Enums.wanzi4,
      Enums.wanzi8, Enums.wanzi8, Enums.wanzi8,
      Enums.bai, Enums.shuzi2,
      Enums.shuzi4, Enums.shuzi4,
      Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
    ])

    player3.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3, Enums.wanzi4,
      Enums.wanzi8, Enums.wanzi8, Enums.wanzi8,
      Enums.bai, Enums.shuzi2,
      Enums.shuzi4, Enums.shuzi4,
      Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
    ])
    player4.cards = cardsFromArray([
      Enums.xi, Enums.wanzi2
    ])
    changeCaishen(Enums.shuzi1)


    player1.emitter.emit(Enums.da, table.turn, Enums.shuzi3)
    expect(last(packets)).to.have.properties({message: {hu: true}, to: 'testid2'})

    player2.emitter.emit(Enums.guo, table.turn, Enums.shuzi3)
    expect(last(packets)).to.have.properties({message: {hu: true}, to: 'testid3'})

    player3.emitter.emit(Enums.guo, table.turn, Enums.shuzi3)

    displayMessage()

    expect(last(packets)).to.have.properties({to: 'testid2', message: {chi: true}})

    // player2.emitter.emit(Enums.guo, table.turn, Enums.shuzi6)
    //
    // player2.emitter.emit(Enums.da, table.turn, player2.lastCardToken)
    // player3.emitter.emit(Enums.da, table.turn, player3.lastCardToken)
    // player4.emitter.emit(Enums.da, table.turn, player4.lastCardToken)
    //
    // player1.emitter.emit(Enums.da, table.turn, Enums.shuzi3)


  });

  it.skip('吃对家 bug', () => {

    table.fapai()

    player1.cards = cardsFromArray([
      Enums.shuzi3, Enums.shuzi9, Enums.shuzi6
    ])

    player2.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3, Enums.wanzi4,
      Enums.shuzi3, Enums.shuzi3, Enums.wanzi8,
      Enums.bai, Enums.shuzi2,
      Enums.shuzi5, Enums.shuzi4,
      Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
    ])

    player3.cards = cardsFromArray([
      Enums.wanzi2, Enums.wanzi3, Enums.wanzi4,
      Enums.wanzi8, Enums.wanzi8, Enums.wanzi8,
      Enums.bai, Enums.shuzi2,
      Enums.shuzi4, Enums.shuzi4,
      Enums.tongzi7, Enums.tongzi8, Enums.tongzi9,
    ])
    player4.cards = cardsFromArray([
      Enums.xi, Enums.wanzi2
    ])
    changeCaishen(Enums.shuzi1)

    player1.emitter.emit(Enums.da, table.turn, Enums.shuzi3)
    expect(last(packets)).to.have.properties({message: {hu: true, chi: false}, to: 'testid3'})

    player3.emitter.emit(Enums.guo, table.turn, Enums.shuzi3)

    expect(last(packets)).to.have.properties({message: {chi: true, peng: true}, to: 'testid2'})
  });


});

'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/majiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, clearMessage, scoreString, packetsWithMessageName} from './mockwebsocket'
import setupMatch, {cardsFromArray} from './setupMatch'
import TableState from "../../../match/majiang/table_state";

const {expect} = chai

chai.use(chaiProperties);

describe('凡盟地胡', () => {

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

  it('地胡 平胡', () => {
    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi9])

    player2.cards = cardsFromArray([
      Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
      Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
      Enums.tongzi5, Enums.tongzi5, Enums.tongzi5,
      Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
      Enums.wanzi9
    ])


    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi9)
    player2.emitter.emit(Enums.hu, table.turn, Enums.wanzi9)

    displayMessage()

    expect(scoreString()).to.equal('-12,12,0,0')

  });

  it('地胡 七对', () => {
    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi9])

    player2.cards = cardsFromArray([
      Enums.wanzi1, Enums.wanzi1,
      Enums.wanzi3, Enums.wanzi3,
      Enums.tongzi2, Enums.tongzi2,
      Enums.tongzi3, Enums.tongzi3,
      Enums.tongzi5, Enums.tongzi5,
      Enums.shuzi1, Enums.shuzi1,
      Enums.wanzi9
    ])

    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi9)
    player2.emitter.emit(Enums.hu, table.turn, Enums.wanzi9)

    displayMessage();

    expect(scoreString()).to.equal('-24,24,0,0')
  });

  context('不可接炮', () => {
    beforeEach(function () {
      let match = setupMatch(4, {keJiePao: false})
      table = match.table
      room = match.room
      player1 = match.players[0]
      player2 = match.players[1]
      player3 = match.players[2]
      player4 = match.players[3]
      changeCaishen = match.changeCaishen
    });


    it('地胡 平胡', () => {
      table.fapai()

      player1.cards = cardsFromArray([Enums.wanzi9])

      player2.cards = cardsFromArray([
        Enums.wanzi1, Enums.wanzi2, Enums.wanzi3,
        Enums.tongzi1, Enums.tongzi2, Enums.tongzi3,
        Enums.tongzi5, Enums.tongzi5, Enums.tongzi5,
        Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
        Enums.wanzi9
      ])


      clearMessage()
      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi9)
      player2.emitter.emit(Enums.hu, table.turn, Enums.wanzi9)

      displayMessage()

      expect(scoreString()).to.equal('-12,12,0,0')
    });

  })
})

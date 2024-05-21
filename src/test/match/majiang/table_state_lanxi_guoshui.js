'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/majiang/enums'
import setupMatch, {cardsFromArray} from './setupMatch'

const {expect} = chai
chai.use(chaiProperties);

describe('兰溪bug-4 买底', () => {

  let room, table;
  let player1, player2, player3, player4;
  let changeCaishen

  context('不买底 自摸', () => {

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


    it('逆时针碰能够清除过水', () => {
      table.fapai()

      player1.cards = cardsFromArray([
        Enums.wanzi1,
        Enums.wanzi9,
        Enums.wanzi9,
      ])
      player2.cards = cardsFromArray([
        Enums.wanzi1,
        Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi4, Enums.shuzi4, Enums.shuzi4,
        Enums.shuzi7, Enums.shuzi7, Enums.shuzi7,
      ])
      player3.cards = cardsFromArray([
        Enums.wanzi9, Enums.dong
      ])
      player4.cards = cardsFromArray([
        Enums.wanzi9, Enums.dong
      ])
      changeCaishen(Enums.dong)

      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
      player2.emitter.emit(Enums.guo, table.turn, Enums.wanzi1)

      expect(player2.huForbiddenFan).to.gt(0)

      player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
      player3.emitter.emit(Enums.da, table.turn, Enums.wanzi9)
      player1.emitter.emit(Enums.peng, table.turn, Enums.wanzi9)

      expect(player2.huForbiddenFan).to.eq(0)
    });


    it('逆时针杠能够清除过水', () => {
      table.fapai()

      player1.cards = cardsFromArray([
        Enums.wanzi1,
        Enums.wanzi9,
        Enums.wanzi9,
        Enums.wanzi9,
      ])
      player2.cards = cardsFromArray([
        Enums.wanzi1,
        Enums.shuzi1, Enums.shuzi1, Enums.shuzi1,
        Enums.shuzi4, Enums.shuzi4, Enums.shuzi4,
        Enums.shuzi7, Enums.shuzi7, Enums.shuzi7,
      ])
      player3.cards = cardsFromArray([
        Enums.wanzi9, Enums.dong
      ])
      player4.cards = cardsFromArray([
        Enums.wanzi9, Enums.dong
      ])
      changeCaishen(Enums.dong)

      player1.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
      player2.emitter.emit(Enums.guo, table.turn, Enums.wanzi1)

      expect(player2.huForbiddenFan).to.gt(0)

      player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
      player3.emitter.emit(Enums.da, table.turn, Enums.wanzi9)
      player1.emitter.emit(Enums.gang, table.turn, Enums.wanzi9)

      expect(player2.huForbiddenFan).to.eq(0)
    })

  });
});

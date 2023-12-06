'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/majiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, clearMessage, packetsWithMessageName, scoreString}  from './mockwebsocket'
import setupMatch, {cardsFromArray}  from './setupMatch'
import TableState from "../../../match/majiang/table_state";
import PlayerState from "../../../match/majiang/player_state";


const {expect} = chai
chai.use(chaiProperties);

describe('凡盟bug总结', () => {

  let room, table: TableState;
  let player1: PlayerState, player2: PlayerState, player3: PlayerState, player4: PlayerState;
  let changeCaishen

  beforeEach(function () {
    let match = setupMatch(4, {
      useCaiShen: false, kehu: ["qingYiSe",
        "haoQi",
        "pengPenghu",
        "tianHu",
        "diHu"]
    })
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]
    changeCaishen = match.changeCaishen
  });

  it('清一色 大碰胡 杠上开花', () => {
    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi5])

    player2.cards = cardsFromArray([
      Enums.wanzi4, Enums.wanzi4, Enums.wanzi4,
      Enums.wanzi5, Enums.wanzi5, Enums.wanzi5,
      Enums.wanzi1, Enums.wanzi2,
      Enums.wanzi1, Enums.wanzi2,
      Enums.wanzi1, Enums.wanzi2,
      Enums.wanzi9,
    ])
    player3.cards = cardsFromArray([Enums.tongzi6])
    player4.cards = cardsFromArray([Enums.tongzi8])

    table.cards = new Array(10).fill(Enums.wanzi9)
    table.remainCards = 10

    player1.requestAction(Enums.da, table.turn, Enums.wanzi5);
    player2.requestAction(Enums.gangByOtherDa, table.turn, Enums.wanzi5)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi9)
    displayMessage()
    expect(scoreString()).to.equal('-19,51,-16,-16')
  })
})

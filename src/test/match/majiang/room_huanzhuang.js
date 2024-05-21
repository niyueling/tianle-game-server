'use strict'


import setupMatch, {emptyCards} from './setupMatch'
import Enums from '../../../match/pcmajiang/enums'
import * as chai from 'chai'

const {expect} = chai
chai.use(require('chai-properties'))


describe('房间换庄', function () {

  let table, player1, player2, player3, changeCaishen, room

  beforeEach(function () {

    let match = setupMatch(3)

    room = match.room
    table = match.table;
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]

    changeCaishen = match.changeCaishen

    table.fapai()

    player1.cards = emptyCards()
    player2.cards = emptyCards()
    player3.cards = emptyCards()
    changeCaishen(Enums.dong)
  })


  it('连庄', function () {
    room.gameOver('testid1', [{model: {_id: 'testid1'}, events: {hu: [{fan: 1}]}}])
    expect(room.zhuangCounter).to.equal(2)
  })


  it('换庄清除庄技术', function () {
    room.zhuangCounter = 3
    room.gameOver('testid2', [])
    expect(room.zhuangCounter).to.equal(1)
  })

  it('流局轮庄', () => {
    table.fapai()
    table.gameOver()

    expect(room.players[0]._id).to.equal('testid1')
  })

})

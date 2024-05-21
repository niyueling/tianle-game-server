'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/pcmajiang/enums'
import setupMatch  from './setupMatch'
import TableState from "../../../match/pcmajiang/table_state";
const {expect} = chai

chai.use(chaiProperties);

describe('生成飞鸟牌', () => {

  let room, table: TableState;
  let player1, player2, player3, player4;
  let changeCaishen

  beforeEach(function () {
    let match = setupMatch(4, {feiNiao: 2})
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]
    changeCaishen = match.changeCaishen
  });

  it('牌足够的情况生成对应鸟牌', () => {
    let niaos = table.generateNiao()
    expect(niaos[0][player1._id]).to.have.lengthOf(2)
  })


  it('牌不足够的情况生成对应鸟牌', () => {
    table.cards = [Enums.wanzi1]
    table.remainCards = 1

    let niaos = table.generateNiao()
    expect(niaos[0][player1._id]).to.have.lengthOf(1)
  })

  it('牌不足够的情况生成对应鸟牌', () => {
    table.cards = [Enums.wanzi1]
    table.remainCards = 1

    let niaos = table.generateNiao()
    expect(niaos[0][player1._id]).to.have.lengthOf(1)
  })

  it('没有牌不生成鸟牌', () => {
    table.cards = []
    table.remainCards = 0

    let niaos = table.generateNiao()
    expect(niaos).to.have.lengthOf(0)
  })
})

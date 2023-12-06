'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/majiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, clearMessage, scoreString, packetsWithMessageName, packetsTo} from './mockwebsocket'
import setupMatch, {cardsFromArray} from './setupMatch'
import TableState from "../../../match/majiang/table_state";

const {expect} = chai

chai.use(chaiProperties);
let sleepDur = 10
let sleep = function (time) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}
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


  it('记录接杠的来源', () => {
    table.fapai()
    player1.cards = cardsFromArray([Enums.wanzi1])
    player2.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.wanzi9])
    player3.cards = cardsFromArray()
    player4.cards = cardsFromArray()

    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.gangByOtherDa, table.turn, Enums.wanzi1)
    expect(player2.gangFrom).to.deep.equal([player1])

    displayMessage()
  })

  it('自己杠没有记录', () => {
    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi2])
    player2.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.wanzi9])
    player3.cards = cardsFromArray([])
    player4.cards = cardsFromArray([])

    table.cards = [Enums.wanzi1, Enums.wanzi1]
    table.remainCards = table.cards.length

    player1.requestAction(Enums.da, table.turn, Enums.wanzi2)
    player2.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)

    displayMessage()

    expect(player2.gangFrom).to.deep.equal([])
  })

  it('流局不结算杠', () => {
    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi2])
    player2.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.wanzi9])
    player3.cards = cardsFromArray([])
    player4.cards = cardsFromArray([])

    table.cards = [Enums.wanzi1]
    table.remainCards = table.cards.length

    player1.requestAction(Enums.da, table.turn, Enums.wanzi2)
    player2.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)

    displayMessage()

    expect(player2.gangFrom).to.deep.equal([])
    expect(scoreString()).to.equal('0,0,0,0')
  })


  it('摸牌后 不杠 自后不会再提示杠', () => {
    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi2])
    player2.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.wanzi9])
    player3.cards = cardsFromArray([])
    player4.cards = cardsFromArray([])

    player2.gangForbid = [Enums.wanzi1]

    table.cards = [Enums.wanzi9, Enums.wanzi9, Enums.wanzi9, Enums.wanzi9, Enums.wanzi1]
    table.remainCards = table.cards.length

    player1.requestAction(Enums.da, table.turn, Enums.wanzi2)

    expect(last(packetsTo('testid2')).message.gang).to.not.ok
  });


  it('手上3张一万 别人打一万,碰完不能在杠', () => {
    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi1])
    player2.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1, Enums.wanzi1, Enums.wanzi9])
    player3.cards = cardsFromArray([])
    player4.cards = cardsFromArray([])

    table.cards = [Enums.wanzi9, Enums.wanzi9, Enums.wanzi9, Enums.wanzi9, Enums.wanzi1]
    table.remainCards = table.cards.length

    player1.requestAction(Enums.da, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.peng, table.turn, Enums.wanzi1)

    expect(last(packetsTo('testid2')).message).property('gang').not.ok;
  });

  it('多人抢杠', () => {
    table.fapai()

    player1.cards = cardsFromArray([Enums.wanzi1])
    player1.events.mingGang = [Enums.wanzi1]

    player2.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1, Enums.wanzi9, Enums.wanzi9])
    player3.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1, Enums.wanzi9, Enums.wanzi9])
    player4.cards = cardsFromArray([Enums.wanzi1, Enums.wanzi1, Enums.wanzi9, Enums.wanzi9])

    table.cards = [Enums.wanzi9, Enums.wanzi9, Enums.wanzi9, Enums.wanzi9, Enums.wanzi1]
    table.remainCards = table.cards.length

    player1.requestAction(Enums.gangBySelf, table.turn, Enums.wanzi1)
    player2.requestAction(Enums.hu, table.turn, Enums.wanzi1)

    displayMessage()
    expect(scoreString()).to.eq('-144,48,48,48')
  })


})


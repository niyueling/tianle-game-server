'use strict'

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/majiang/enums'
import {last, nth} from 'lodash'
import {packets, displayMessage, clearMessage, scoreString, packetsWithMessageName}  from './mockwebsocket'
import setupMatch, {cardsFromArray}  from './setupMatch'
import TableState from "../../../match/majiang/table_state";
import PlayerState from "../../../match/majiang/player_state";
const {expect} = chai

chai.use(chaiProperties);

describe('凡盟飞鸟计费', () => {

  let room, table: TableState;
  let player1: PlayerState, player2: PlayerState, player3: PlayerState, player4: PlayerState;
  let changeCaishen

  const scoreString = ()=> table.players.map(p=>p.balance).join()


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


  it('无飞鸟 玩家2 赢 玩家3', () => {
    player2.winFrom(player3, 10)

    expect(scoreString()).to.equal('0,10,-10,0')
  })

  it('玩家2 是1鸟, 玩家3无鸟', () => {
    player2.buyer = [player1]
    player2.winFrom(player3, 10)
    expect(scoreString()).to.equal('10,10,-20,0')
  })


  it('玩家2 无鸟, 玩家3 1鸟',()=>{
    player3.buyer = [player1]

    player2.winFrom(player3, 10)
    expect(scoreString()).to.equal('-10,20,-10,0')

  })

  it('玩家2 1鸟, 玩家3 1鸟',()=>{
    player2.buyer = [player1]
    player3.buyer = [player1]

    player2.winFrom(player3, 10)
    expect(scoreString()).to.equal('0,20,-20,0')
  })

  it('玩家2 2鸟, 玩家3 1鸟',()=>{
    player2.buyer = [player1,player1]
    player3.buyer = [player1]

    player2.winFrom(player3, 10)
    expect(scoreString()).to.equal('10,20,-30,0')
  })


  it('庄家 1鸟, 玩家3 0鸟',()=>{
    player1.buyer = [player1]

    player1.winFrom(player3, 10)
    expect(scoreString()).to.equal('20,0,-20,0')
  })

  it('庄家 1鸟, 玩家3 1鸟',()=>{
    player1.buyer = [player1]
    player3.buyer = [player1]

    player1.winFrom(player3, 10)
    expect(scoreString()).to.equal('20,0,-20,0')
  })

  it('庄家 2鸟, 玩家3 1鸟',()=>{
    player1.buyer = [player1,player1]
    player3.buyer = [player1]

    player1.winFrom(player3, 10)
    expect(scoreString()).to.equal('30,0,-30,0')
  })

  it('玩家3 1鸟, 庄家 1鸟',()=>{
    player1.buyer = [player1]
    player3.buyer = [player1]

    player3.winFrom(player1, 10)
    expect(scoreString()).to.equal('-20,0,20,0')
  })

  it('玩家3 1鸟, 庄家 2鸟',()=>{
    player1.buyer = [player1,player1]
    player3.buyer = [player1]

    player3.winFrom(player1, 10)
    expect(scoreString()).to.equal('-30,0,30,0')
  })
})

describe('凡盟全飞计算', () =>{
  let room, table: TableState;
  let player1: PlayerState, player2: PlayerState, player3: PlayerState, player4: PlayerState;
  let changeCaishen

  const scoreString = ()=> table.players.map(p=>p.balance).join()


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

  it('全飞一  玩家2获胜 计算niaoCount、buyer、得分', () => {
    table.rule.ro.quanFei = 1
    table.cards.push(...[Enums.wanzi2,Enums.wanzi6,Enums.wanzi9,Enums.wanzi7])
    table.remainCards = table.cards.length

    table.generateNiao()
    table.assignNiaos()
    expect(table.players.map(p => p.niaoCount).toString()).to.equal('1,2,1,0')
    expect(table.players.map(p =>  p.buyer.map(x => x._id))).to.have.properties([ [ 'testid2' ], [ 'testid3', 'testid4' ], [ 'testid1' ], [] ])
    expect(player2.buyer.map(x => x._id)).to.have.properties([ 'testid3', 'testid4' ])

    player2.winFrom(player3, 10)
    
    expect(scoreString()).to.equal('-10,20,-20,10')
  })
})


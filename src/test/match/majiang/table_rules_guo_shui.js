'use strict'


import setupMatch, {emptyCards} from './setupMatch'
import Enums from '../../../match/majiang/enums'
import {packets, displayMessage}  from './mockwebsocket'
import {last} from 'lodash'
import * as chai from 'chai'

const {expect} = chai
chai.use(require('chai-properties'))


describe('过水', function () {

  let table, player1, player2, player3, changeCaishen

  beforeEach(function () {

    let match = setupMatch(3)

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


  it('取消的碰,一圈内不能再碰, 打过牌就能碰', function () {

    player1.cards[Enums.wanzi1] = 2
    player1.cards[Enums.bai] = 1
    player1.cards[Enums.shuzi1] = 1

    player2.cards[Enums.wanzi1] = 1
    player2.cards[Enums.bai] = 1

    player3.cards[Enums.wanzi1] = 1
    player3.cards[Enums.xi] = 2


    player1.emitter.emit(Enums.da, table.turn, Enums.bai)
    player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

    expect(last(packets)).to.have.properties({name: 'game/canDoSomething', to: 'testid1'})
    expect(player1.lastOptions).to.have.properties(last(packets).message)
    player1.emitter.emit(Enums.guo, table.turn, Enums.wanzi1)


    // 一圈内 不能再碰
    player3.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
    expect(last(packets).name).not.equal('game/canDoSomething')

    // player1 打过牌 就能继续碰
    player1.emitter.emit(Enums.da, table.turn, Enums.shuzi1)
    expect(player1.pengForbidden).to.eql([])

    player2.cards[Enums.wanzi1] = 1
    player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

    expect(last(packets)).to.have.properties({name: 'game/canDoSomething', to: 'testid1'})

  })

  it('取消的胡  一圈内不能再胡 除非打过牌(keJiePao=true)', function () {

    table.rule.ro.keJiePao = true
    player1.cards[Enums.wanzi1] = 1
    player1.cards[Enums.bai] = 3
    player1.cards[Enums.shuzi1] = 3
    player1.cards[Enums.tongzi1] = 3
    player1.cards[Enums.wanzi8] = 1


    player2.cards[Enums.wanzi1] = 1
    player2.cards[Enums.bai] = 2

    player3.cards[Enums.wanzi1] = 1
    player3.cards[Enums.xi] = 2

    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi8)
    player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

    expect(last(packets)).to.have.properties({name: 'game/canDoSomething', to: 'testid1'})
    expect(player1.lastOptions).to.have.properties(last(packets).message)

    // 取消不胡
    player1.emitter.emit(Enums.guo, table.turn, Enums.wanzi1)
    expect(player1.huForbiddenFan).to.equal(2);


    // 一圈内 不能再胡
    player3.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
    expect(last(packets).name).not.equal('game/canDoSomething')


    // player1 打过牌 就能继续碰
    player1.cards[Enums.wanzi9] = 1
    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi9)
    expect(player1.huForbiddenFan).to.eql(0)


    player1.cards = emptyCards()
    player1.cards[Enums.wanzi1] = 1
    player1.cards[Enums.bai] = 3
    player1.cards[Enums.shuzi1] = 3
    player1.cards[Enums.tongzi1] = 3


    // player1 胡
    player2.cards[Enums.wanzi1] = 1
    player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
    expect(last(packets)).to.have.properties({name: 'game/canDoSomething', to: 'testid1'})
  });

  it('取消的胡  一圈内不能再胡 除非打过牌(keJiePao=false)', function () {

    table.rule.ro.keJiePao = false
    player1.cards[Enums.wanzi1] = 1
    player1.cards[Enums.bai] = 3
    player1.cards[Enums.shuzi1] = 3
    player1.cards[Enums.tongzi1] = 3
    player1.cards[Enums.wanzi8] = 1


    player2.cards[Enums.wanzi1] = 1
    player2.cards[Enums.bai] = 2

    player3.cards[Enums.wanzi1] = 1
    player3.cards[Enums.xi] = 2

    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi8)
    player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)

    expect(last(packets)).to.have.properties({name: 'game/canDoSomething', to: 'testid1'})
    expect(player1.lastOptions).to.have.properties(last(packets).message)

    // 取消不胡
    player1.emitter.emit(Enums.guo, table.turn, Enums.wanzi1)
    expect(player1.huForbiddenFan).to.equal(2);


    // 一圈内 不能再胡
    player3.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
    expect(last(packets).name).not.equal('game/canDoSomething')


    // player1 打过牌 就能继续碰
    player1.cards[Enums.wanzi9] = 1
    player1.emitter.emit(Enums.da, table.turn, Enums.wanzi9)
    expect(player1.huForbiddenFan).to.eql(0)


    player1.cards = emptyCards()
    player1.cards[Enums.wanzi1] = 1
    player1.cards[Enums.bai] = 3
    player1.cards[Enums.shuzi1] = 3
    player1.cards[Enums.tongzi1] = 3


    // player1 胡
    player2.cards[Enums.wanzi1] = 1
    player2.emitter.emit(Enums.da, table.turn, Enums.wanzi1)
    expect(last(packets)).to.have.properties({name: 'game/canDoSomething', to: 'testid1'})
  });
})

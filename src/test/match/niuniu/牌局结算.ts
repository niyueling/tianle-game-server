import {last} from 'lodash'
import {matchOverMessageToScoreString, startNiuNiuGame} from "./roomUtils"
import Enums from "../../../match/niuniu/enums"
import {clearMessage, packetsTo} from "../mockwebsocket"
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'

chai.use(chaiProperties)
const {expect} = chai

describe('房间结算', () => {
  let tableState = null

  let player1
  let player2
  let player3

  beforeEach(() => {
    tableState = startNiuNiuGame(3).tableState
    player1 = tableState.players[0]
    player2 = tableState.players[1]
    player3 = tableState.players[2]
    tableState.room.creator = player1;
    tableState.zhuang = player1;
    tableState.maCards = [Enums.c9]

    clearMessage()
  })

  describe('普通场', () => {
    describe('房主牛牛', () => {
      it('结算(winner牛4)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c3
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('2,-1,-1')
      })

      it('结算(winner牛8)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c5, Enums.c3
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('4,-2,-2')
      })

      it('结算(winner - 五花牛)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.cQ,
          Enums.cJ, Enums.cQ
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('10,-5,-5')
      })

      it('结算(winner - 炸弹)', function () {
        player1.cards = [
          Enums.c8, Enums.s8, Enums.d8,
          Enums.h8, Enums.c1
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('12,-6,-6')
      })

      it('结算(winner - 五小牛)', function () {
        player1.cards = [
          Enums.c1, Enums.c2, Enums.c1,
          Enums.c2, Enums.c1
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('16,-8,-8')
      })
    })

    describe('通比牛牛', () => {
      it('结算(winner牛4)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c3
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('2,-2,0')
      })

      it('结算(无牛比较)', function () {
        player1.cards = [
          Enums.s7, Enums.c8, Enums.c9,
          Enums.c1, Enums.s6
        ]

        player2.cards = [
          Enums.s9, Enums.c7, Enums.s6,
          Enums.c12, Enums.c8
        ]

        tableState.players = tableState.players.slice(0,2)

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('-1,1')
      })

      it('结算(winner牛8)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c5, Enums.c3
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('4,-3,-1')
      })

      it('结算(winner - 五花牛)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.cQ,
          Enums.cJ, Enums.cQ
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('10,-6,-4')
      })

      it('结算(winner - 炸弹)', function () {
        player1.cards = [
          Enums.c8, Enums.s8, Enums.d8,
          Enums.h8, Enums.c1
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('12,-7,-5')
      })

      it('结算(winner - 五小牛)', function () {
        player1.cards = [
          Enums.c1, Enums.c2, Enums.c1,
          Enums.c2, Enums.c1
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'normal'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('16,-9,-7')
      })
    })
  })


  describe('疯狂场', () => {

    describe('房主牛牛', () => {
      it('结算(winner牛4)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c3
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('8,-4,-4')
      })

      it('结算(winner牛8)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c5, Enums.c3
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('16,-8,-8')
      })

      it('结算(winner - 五花牛)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.cQ,
          Enums.cJ, Enums.cQ
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('22,-11,-11')
      })

      it('结算(winner - 炸弹)', function () {
        player1.cards = [
          Enums.c8, Enums.s8, Enums.d8,
          Enums.h8, Enums.c1
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('26,-13,-13')
      })

      it('结算(winner - 五小牛)', function () {
        player1.cards = [
          Enums.c1, Enums.c2, Enums.c1,
          Enums.c2, Enums.c1
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'fangZhu'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('30,-15,-15')
      })
    })

    describe('通比牛牛', () => {
      it('结算(winner牛4)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c3
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('8,-7,-1')
      })

      it('结算(winner牛8)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c5, Enums.c3
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('16,-11,-5')
      })

      it('结算(winner - 五花牛)', function () {
        player1.cards = [
          Enums.cK, Enums.cK, Enums.cQ,
          Enums.cJ, Enums.cQ
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('22,-14,-8')
      })

      it('结算(winner - 炸弹)', function () {
        player1.cards = [
          Enums.c8, Enums.s8, Enums.d8,
          Enums.h8, Enums.c1
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('26,-16,-10')
      })

      it('结算(winner - 五小牛)', function () {
        player1.cards = [
          Enums.c1, Enums.c2, Enums.c1,
          Enums.c2, Enums.c1
        ]

        player2.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c1
        ]

        player3.cards = [
          Enums.cK, Enums.cK, Enums.c10,
          Enums.c1, Enums.c2
        ]

        tableState.rule.ro.zhuangType = 'tongBi'
        tableState.rule.ro.roomType = 'crazy'

        player1.onCombineHint()
        player2.onCombineHint()
        player3.onCombineHint()

        tableState.showTime()
        tableState.gameOver()

        const matchOverMessage = last(packetsTo('testid1', 'game/matchOver')).message
        expect(matchOverMessageToScoreString(matchOverMessage)).to.equal('30,-18,-12')
      })
    })
  })
})



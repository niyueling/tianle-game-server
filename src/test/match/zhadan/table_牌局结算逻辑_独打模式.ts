import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/zhadan/enums'
import NormalTable from "../../../match/zhadan/normalTable"
import {IMatcher} from "../../../match/zhadan/patterns/base"
import BombMatcher from "../../../match/zhadan/patterns/BombMatcher"
import PlayerState from "../../../match/zhadan/player_state"
import {Team} from "../../../match/zhadan/table"
import {displayMessage, scoreString} from '../mockwebsocket'
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('牌局结算逻辑', () => {

  let room
  let table: NormalTable
  let allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

  context('独打模式', () => {

    beforeEach(async () => {
      const match = setupMatch(playerCount, {})
      room = match.room
      table = match.table as NormalTable
      player1 = table.players[0]
      player2 = table.players[1]
      player3 = table.players[2]
      player4 = table.players[3]

      allRule = match.allRule

      table.start();
      table.setFirstDa(0);
      table.mode = 'solo'
      player2.team = Team.HomeTeam
      player1.team = player3.team = player4.team = Team.AwayTeam

      table.players.forEach(p => p.unusedJokers = 0)
    })

    it('单打者 胜利 结算', () => {
      player1.cards = [Enums.c3, Enums.c3]
      player2.cards = [Enums.c4]

      table.onPlayerDa(player1, {cards: [Enums.c3]})
      table.onPlayerDa(player2, {cards: [Enums.c4]})

      displayMessage()

      expect(scoreString()).to.eq('-3,9,-3,-3')
      expect(room.scoreMap).to.have.properties({testid1: -3, testid2: 9, testid3: -3, testid4: -3})
    })

    it('单打者 失败 结算', () => {
      player1.cards = [Enums.c3]
      player2.cards = [Enums.c4]
      player3.cards = [Enums.c5]

      table.onPlayerDa(player1, {cards: [Enums.c3]})

      displayMessage()

      expect(scoreString()).to.eq('3,-9,3,3')
    })

    it('单打者 胜利 + 5炸 闲家 也一个 5炸 只算独打的炸弹分', () => {
      player1.cards = [Enums.c3, Enums.c3, Enums.c3, Enums.s3, Enums.d3, Enums.c5]
      player2.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]

      table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3, Enums.c3, Enums.s3, Enums.d3]})
      table.onPlayerDa(player2, {cards: [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]})

      displayMessage()

      expect(scoreString()).to.eq('-4,12,-4,-4')
    })

    it('单打者 失败  闲家 5炸 独打承包炸弹分', () => {
      player1.cards = [Enums.c3, Enums.c3, Enums.c3, Enums.s3, Enums.d3]
      player2.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]

      table.onPlayerDa(player1, {cards: [Enums.c3, Enums.c3, Enums.c3, Enums.s3, Enums.d3]})
      table.onPlayerDa(player2, {cards: [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]})

      displayMessage()

      expect(scoreString()).to.eq('6,-12,3,3')
    })


    it('单打者 胜利 + 5炸', () => {
      player1.cards = [Enums.c3, Enums.c3]
      player2.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]

      table.onPlayerDa(player1, {cards: [Enums.c3]})
      table.onPlayerDa(player2, {cards: [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]})

      displayMessage()

      expect(scoreString()).to.eq('-4,12,-4,-4')
    })

    it('单打者 胜利 打出所有王', () => {
      player1.cards = [Enums.c3, Enums.c3]
      player1.unusedJokers = 1
      player2.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]

      table.onPlayerDa(player1, {cards: [Enums.c3]})
      table.onPlayerDa(player2, {cards: [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4]})

      displayMessage()

      expect(scoreString()).to.eq('-7,13,-3,-3')
    })

    it('单打者 胜利 打出所有Joker', () => {
      player1.cards = [Enums.c3, Enums.c3]

      player2.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.j1]
      player2.unusedJokers = 1

      table.onPlayerDa(player1, {cards: [Enums.c3]})
      table.onPlayerDa(player2, {cards: [Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.j1]})

      displayMessage()

      expect(scoreString()).to.eq('-4,12,-4,-4')
    })

    context('计算手中未使用的炸弹', () => {

      it('手中1个普通炸弹', function () {
        player1.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4]

        expect(player1.unusedBombs()).to.have.properties([
          {name: 'bomb', score: 404}
        ])

        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(0)

      })

      it('手中2个普通炸弹', function () {
        player1.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4,
          Enums.c3, Enums.c3, Enums.c3, Enums.c3, Enums.c3]
        expect(player1.unusedBombs()).to.have.properties([
          {name: 'bomb', score: 404, level: 4},
          {name: 'bomb', score: 503, level: 5},
        ])

        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(1)
      })

      it('手中2个普通炸弹 + 1个王', function () {
        player1.cards = [Enums.c4, Enums.c4, Enums.c4, Enums.c4,
          Enums.c3, Enums.c3, Enums.c3, Enums.c3, Enums.c3, Enums.j1]

        expect(player1.unusedBombs()).to.have.lengthOf(2)
        expect(player1.unusedBombs()).to.have.properties([
          {name: 'bomb', score: 404, level: 4},
          {name: 'bomb', score: 603, level: 6},
        ])
        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(2)
      })

      it('手中没有炸弹', function () {
        player1.cards = [
          Enums.c4, Enums.c4, Enums.c4]
        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(0)
      })

      it('手中 5线普通炸弹 + 4个王', function () {
        player1.cards = [
          Enums.c4, Enums.c4, Enums.c4, Enums.c4, Enums.c4,
          Enums.j1, Enums.j1, Enums.j2, Enums.j2]
        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(17)
      })

      it('手中 6线普通炸弹 + 4个王', function () {
        player1.cards = [
          Enums.c4, Enums.c4, Enums.c4, Enums.c4,
          Enums.c4, Enums.c4,
          Enums.j1, Enums.j1, Enums.j2, Enums.j2]
        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(32)
      })

      it('手中 5线2炸 + 6线普通炸 + 4个王', function () {
        player1.cards = [
          Enums.c2, Enums.c2, Enums.c2, Enums.c2,
          Enums.c2,
          Enums.c3, Enums.c3, Enums.c3, Enums.c3,
          Enums.c3, Enums.c3,
          Enums.j1, Enums.j1, Enums.j2, Enums.j2]
        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(34)
      })

      it('手中 5线2炸 + 6线普通炸 + 4个王', function () {
        player1.cards = [
          Enums.c2, Enums.c2, Enums.c2, Enums.c2,
          Enums.c2,
          Enums.c3, Enums.c3, Enums.c3, Enums.c3,
          Enums.c3, Enums.c3,
          Enums.j1, Enums.j1, Enums.j2, Enums.j2]
        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(34)
      })

      it('手中 5线2炸 + 7线普通炸 + 4个王', function () {
        player1.cards = [
          Enums.c2, Enums.c2, Enums.c2, Enums.c2,
          Enums.c2,
          Enums.c3, Enums.c3, Enums.c3, Enums.c3,
          Enums.c3, Enums.c3, Enums.c3,
          Enums.j1, Enums.j1, Enums.j2, Enums.j2]
        expect(player1.unusedBombsScore(table.bombScorer)).to.equal(64 + 2)
      })

    })
    describe('炸弹计分', () => {
      let matcher: IMatcher

      before(() => {
        matcher = new BombMatcher()
      })

      context('普通炸弹', () => {
        const normalScoreMap = {4: 0, 5: 1, 6: 2, 7: 4, 8: 8}

        for (let bombSize = 4; bombSize <= 8; bombSize++) {
          it(`普通 ${4}个3 炸弹`, () => {
            expect(table.bombScorer(matcher.verify(new Array(bombSize).fill(Enums.c3))))
              .to.equal(normalScoreMap[bombSize] || 0)
          })
        }
      })

      context('2 炸弹', () => {
        const normalScoreMap = {4: 1, 5: 2, 6: 4, 7: 8, 8: 16}

        for (let bombSize = 4; bombSize <= 8; bombSize++) {
          it(`普通 ${4}个2 炸弹`, () => {
            expect(table.bombScorer(matcher.verify(new Array(bombSize).fill(Enums.c2))))
              .to.equal(normalScoreMap[bombSize] || 0)
          })
        }
      })
    })
  })

})

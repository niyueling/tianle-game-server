import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import Enums from '../../../match/zhadan/enums'
import NormalTable from "../../../match/zhadan/normalTable";
import PlayerState from "../../../match/zhadan/player_state";
import {default as Table, Team} from "../../../match/zhadan/table"
import {displayMessage, packetsTo, packetsWithMessageName, scoreString} from '../mockwebsocket'
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('牌局结算逻辑', () => {

  let room, table: NormalTable, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

  context('找朋友模式', () => {

    beforeEach(async () => {
      const match = setupMatch(playerCount, {})
      room = match.room
      table = match.table as  NormalTable
      player1 = table.players[0]
      player2 = table.players[1]
      player3 = table.players[2]
      player4 = table.players[3]

      allRule = match.allRule

      table.start()
      table.setFirstDa(0);
      table.mode = 'teamwork'
      player1.team = player2.team = Team.HomeTeam
      player3.team = player4.team = Team.AwayTeam

      table.players.forEach(p => {
        p.unusedJokers = 0
      })
    })

    it('双扣结算 对方无抓分超过100', () => {

      player1.cards = [Enums.c3]
      player2.cards = [Enums.c4]

      table.onPlayerDa(player1, {cards: [Enums.c3]})
      table.onPlayerDa(player2, {cards: [Enums.c4]})

      displayMessage()

      expect(scoreString()).to.eq('2,2,-2,-2')
      expect(room.scoreMap).to.have.properties({testid1: 2, testid2: 2, testid3: -2, testid4: -2})
    })

    context('非双扣', () => {

      beforeEach(() => {
        player1.team = player3.team = Team.HomeTeam
        player2.team = player4.team = Team.AwayTeam
      })

      it('单扣', () => {

        player1.cards = [Enums.c3]
        player1.zhuaFen = 60

        player2.cards = [Enums.c4]

        player3.cards = [Enums.c5]
        player3.zhuaFen = 60

        table.onPlayerDa(player1, {cards: [Enums.c3]})
        table.onPlayerDa(player2, {cards: [Enums.c4]})
        table.onPlayerDa(player3, {cards: [Enums.c5]})

        displayMessage()

        expect(scoreString()).to.eq('1,-1,1,-1')
      })

      it('平扣 先走队伍抓分超过 100', () => {
        player1.cards = [Enums.c3]
        player2.cards = [Enums.c4]
        player4.cards = [Enums.c6]

        player1.zhuaFen = 105
        table.onPlayerDa(player1, {cards: [Enums.c3]})
        table.onPlayerDa(player2, {cards: [Enums.c4]})
        table.onPlayerGuo(player3)
        table.onPlayerDa(player4, {cards: [Enums.c6]})

        displayMessage()

        expect(scoreString()).to.eq('1,-1,1,-1')
      })

      it('平扣 后走队伍抓分超过 100', () => {
        player1.cards = [Enums.c3]
        player2.cards = [Enums.c4]
        player4.cards = [Enums.c6]

        player2.zhuaFen = 105
        table.onPlayerDa(player1, {cards: [Enums.c3]})
        table.onPlayerDa(player2, {cards: [Enums.c4]})
        table.onPlayerGuo(player3)
        table.onPlayerDa(player4, {cards: [Enums.c6]})

        displayMessage()

        expect(scoreString()).to.eq('-1,1,-1,1')
      })

    })

  })
})

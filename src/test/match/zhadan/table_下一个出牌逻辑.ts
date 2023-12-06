import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {last} from 'lodash'
import Enums from '../../../match/zhadan/enums'
import NormalTable from "../../../match/zhadan/normalTable";
import PlayerState from "../../../match/zhadan/player_state";
import {Team} from "../../../match/zhadan/table"
import {clearMessage, displayMessage, packetsTo} from '../mockwebsocket'
import setupMatch from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai


describe('牌局下一个出牌', () => {

  let room, table: NormalTable, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

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
  })

  it('没找到朋友 不接风', () => {


    player1.cards = [Enums.c3]

    table.onPlayerDa(player1, {cards: [Enums.c3]})
    player1.teamMate = 2
    player1.foundFriend = true

    table.onPlayerGuo(player2)
    table.onPlayerGuo(player3)
    table.onPlayerGuo(player4)

    displayMessage()
    expect(last(packetsTo('testid2'))).to.have.properties({message: {next: 2}})
  })

  it('找到朋友 接风', () => {


    player1.cards = [Enums.c3]

    player1.teamMate = 2
    player1.foundFriend = true

    table.onPlayerDa(player1, {cards: [Enums.c3]})

    table.onPlayerGuo(player2)
    table.onPlayerGuo(player3)
    table.onPlayerGuo(player4)

    displayMessage()
    expect(last(packetsTo('testid2'))).to.have.properties({message: {next: 2}})
  })


  it('两次 接风逻辑', () => {


    player1.team = player3.team = Team.HomeTeam
    player2.team = player4.team = Team.AwayTeam
    player1.foundFriend = player2.foundFriend = player3.foundFriend = player4.foundFriend = true
    table.setTeamMate()

    player1.cards = [Enums.c3]
    player2.cards = [Enums.c4]
    player3.cards = [Enums.c4, Enums.c5]
    player4.cards = [Enums.c5]

    table.onPlayerDa(player1, {cards: [Enums.c3]})
    table.onPlayerGuo(player2)
    table.onPlayerGuo(player3)
    table.onPlayerGuo(player4)

    expect(last(packetsTo('testid3'))).to.have.properties({message: {next: 2}})

    clearMessage()

    table.onPlayerDa(player3, {cards: [Enums.c4]})
    table.onPlayerDa(player4, {cards: [Enums.c5]})

    table.onPlayerGuo(player2)
    table.onPlayerGuo(player3)

    table.onPlayerDa(player2, {cards: [Enums.c4]})

    displayMessage()
  })

  it.skip('两次 接风逻辑', () => {


    player1.team = player3.team = Team.HomeTeam
    player2.team = player4.team = Team.AwayTeam
    table.setTeamMate()

    player1.cards = [Enums.c3]
    player2.cards = [Enums.c4]
    player3.cards = [Enums.c4, Enums.c5]
    player4.cards = [Enums.c5]

    table.onPlayerDa(player1, {cards: [Enums.c3]})
    table.onPlayerGuo(player2)
    table.onPlayerGuo(player3)
    table.onPlayerGuo(player4)

    expect(last(packetsTo('testid3'))).to.have.properties({message: {next: 2}})

    clearMessage()

    table.onPlayerDa(player3, {cards: [Enums.c4]})
    table.onPlayerDa(player4, {cards: [Enums.c5]})

    table.onPlayerGuo(player2)
    table.onPlayerGuo(player3)

    table.onPlayerDa(player2, {cards: [Enums.c4]})

    displayMessage()
  })

  it('跳过出完牌的玩家', () => {


    player1.cards = [Enums.c3, Enums.s3]
    player2.cards = []

    table.onPlayerDa(player1, {cards: [Enums.c3]})

    displayMessage()
    expect(last(packetsTo('testid2'))).to.have.properties({message: {next: 2}})


  })


  it('bug 过逻辑', () => {


    player1.cards = [Enums.c3]
    player2.cards = [Enums.cK, Enums.c3, Enums.c3, Enums.c4]
    player3.cards = [Enums.cK]
    player4.cards = [Enums.cK]

    table.onPlayerDa(player1, {cards: [Enums.c3]})
    table.onPlayerDa(player2, {cards: [Enums.cK]})
    table.onPlayerGuo(player3)
    table.onPlayerGuo(player4)
    table.onPlayerDa(player2, {cards: [Enums.c3, Enums.c3]})

    expect(last(packetsTo('testid2', 'game/daReply'))).to.have.properties({
      message: {"ok": true, "remains": 1}
    })
  })


})

import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import PlayerModel from "../../../database/models/player";
import PlayerHelpModel from "../../../database/models/playerHelpModel";
import RateLevelModel from "../../../database/models/rateLevel";
import Enums from '../../../match/zhadan/enums'
import NormalTable from "../../../match/zhadan/normalTable";
import PlayerState from "../../../match/zhadan/player_state";
import {displayMessage} from '../mockwebsocket'
import setupMatch from './setupMatch'
chai.use(chaiProperties)
const {expect} = chai

describe('炸弹救助逻辑', () => {

  let room, table: NormalTable, allRule
  let player1: PlayerState
  let player2: PlayerState
  let player3: PlayerState
  let player4: PlayerState
  const playerCount = 4

  //初始化数据，创建房间、一张普通牌桌（NormalTable）、四个玩家。
  beforeEach(async () => {
    const match = setupMatch(playerCount, {})
    room = match.room
    table = match.table as any
    player1 = table.players[0]
    player2 = table.players[1]
    player3 = table.players[2]
    player4 = table.players[3]
    allRule = match.allRule
  })

  it('单人救助', async () => {
    //设置第一个用户为需要救助
    player1.isHelp = true;

    await table.start()

    console.log(player1.model.name + (player1.isHelp ? "需要救助" : "无需救助"));
    if(player1.isHelp) console.log(player1.model.name + "牌型： " + player1.cards);

    console.log(player2.model.name + (player2.isHelp ? "需要救助" : "无需救助"));
    if(player2.isHelp) console.log(player2.model.name + "牌型： " + player2.cards);

    console.log(player3.model.name + (player3.isHelp ? "需要救助" : "无需救助"));
    if(player3.isHelp) console.log(player3.model.name + "牌型： " + player3.cards);

    console.log(player4.model.name + (player4.isHelp ? "需要救助" : "无需救助"));
    if(player4.isHelp) console.log(player4.model.name + "牌型： " + player4.cards);

    // displayMessage()
    // expect(table.homeTeamPlayers().map(p => p._id).join()).to.include('testid1')
    // expect(table.awayTeamPlayers().map(p => p._id).join()).not.include('testid1')
  })

})

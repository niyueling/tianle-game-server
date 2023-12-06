import {expect} from "chai"
import * as chai from "chai"
import {last} from 'lodash'
import {createHandler} from "../../../player/message-handlers-rmq/tornament"
import {AsyncRedisClient, createClient,} from "../../../utils/redis"
import {displayMessage, packetsTo} from "../../match/mockwebsocket"
import {createPlayerSocket, displayRabbitMessage} from "../../match/setupMatch"
import * as chaiProperties from "chai-properties"

chai.use(chaiProperties)


describe.skip('前端参加联赛', () => {

  let redis: AsyncRedisClient
  let handler

  before(() => {
    redis = createClient()
    //todo inject sth like repository?
    handler = createHandler(redis)
  })

  beforeEach(async () => {
    await redis.delAsync(`${handler.queueName}:testType`)
  })


  after(async () => {
    await redis.quitAsync()
  })


  it('第一个玩家加入联赛排队', async () => {

    const player0 = createPlayerSocket(42)

    await handler['tournament/join'](player0, {gameType: 'testType'})

    displayMessage()

    expect(last(packetsTo(player0._id)).message).to.have.properties({"ok": true, "info": "加入比赛成功"})
  });

  it('人满就开赛', async () => {


    for (let i = 0; i < 4; i++) {
      const player = createPlayerSocket(i)
      await handler['tournament/join'](player, {gameType: 'testType'})
    }

    displayMessage()
    displayRabbitMessage()

    // expect(last(packetsTo(player0._id)).message).to.have.properties({"currentPlayers": 1, "tournamentSize": 4})
  });

  it('加入比赛队列/退出比赛', async () => {
    const player = createPlayerSocket(10)
    await handler['tournament/join'](player, {gameType: 'testType'})
    await handler['tournament/quit'](player, {gameType: 'testType'})

    displayMessage()
    displayRabbitMessage()

    expect(last(packetsTo(player._id))).to.have.properties({name: 'tournament/quitReply', message: {ok: true}})
  })

  it('直接退出比赛', async () => {
    const player = createPlayerSocket(10)
    await handler['tournament/quit'](player, {gameType: 'testType'})

    displayMessage()
    displayRabbitMessage()

    expect(last(packetsTo(player._id))).to.have.properties({name: 'tournament/quitReply', message: {ok: false}})
  })


})

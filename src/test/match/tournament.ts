import {IMessageEmitter, IMessageSource, Message} from "../../match/messageBus/index"
import {Tournament, ContestConfig, playerRankInfo} from "../../match/Tournament"
import {expect} from "chai";
import * as chaiProperties from 'chai-properties'
import * as chai from 'chai'
import {last} from "lodash"

chai.use(chaiProperties)


class MockMessageSource implements IMessageSource {

  consumer = (message: Message) => {
  }

  async consume(consumer) {
    this.consumer = consumer
  }

  async notifyConsumer(message: Message) {
    await this.consumer(message)
  }

  close(): void {
  }
}


class MessageEmitter implements IMessageEmitter {

  emittedMessages: Message[] = []

  clear() {
    this.emittedMessages = []
  }

  emit(message: Message) {
    this.emittedMessages.push(message)
  }

  close(): void {
  }
}

describe('tournament', () => {

  const config: ContestConfig = {
    _id: '',
    contestType: 'test_tournament',
    gameType: 'zhadan',
    queueLimit: 4,
    playerCounter: 4,
    juShu: 1, rule: {
      playerCounter: 4,
      playerCount: 4
    },
    nPlayersToEnd: 4,
    nPlayersToKnockOut: 4,

    entryFee: 1
  }

  const source = new MockMessageSource()
  const emitter = new MessageEmitter()

  const messageBus = {source, emitter, roomReport: emitter}

  let playersGroup = []
  let roomId = 1
  const lobby = {
    async startTournamentRoom(players): Promise<string> {
      playersGroup.push(players)
      return `${roomId++}`
    }
  }

  beforeEach(() => {
    playersGroup = []
    roomId = 1
    emitter.clear()
  })

  const nPLayers = (n):playerRankInfo[] => Array.from({
    length: n
  }, (_, i) => {
    return {_id: `p${i + 1}`, score: 100, currentRoomId:''}
  })

  it('4人 只会开启一场比赛', async () => {
    const t = new Tournament(config).withPlayers(nPLayers(4)).withMessageBus(messageBus).useLobby(lobby.startTournamentRoom)

    await t.start()
    expect(playersGroup).to.have.lengthOf(1)
  });

  it('4人比赛结束 锦标赛结束', async () => {
    const t = new Tournament(config).withPlayers(nPLayers(4)).withMessageBus(messageBus).useLobby(lobby.startTournamentRoom)

    await t.start()
    expect(playersGroup).to.have.lengthOf(1)

    await source.notifyConsumer({
      name: 'roomOver', payload: {
        roomId: '1',
        scoreMap: {p1: 101, p2: 102, p3: 103, p4: 104}
      }
    })

    expect(t.rank().map(p => p._id).join()).to.equal('p4,p3,p2,p1')
    
    expect(last(emitter.emittedMessages)).to.have.properties({
      name: 'tournament/allOver'
    })
  });


  it('8人 前2场比赛结束开启第三场', async () => {
    config.nPlayersToKnockOut = 2
    config.queueLimit = 8
    config.playerCounter = 8
    const t = new Tournament(config).withPlayers(nPLayers(8)).withMessageBus(messageBus).useLobby(lobby.startTournamentRoom)

    await t.start()
    expect(playersGroup).to.have.lengthOf(2)
    await source.notifyConsumer({
      name: 'roomOver',
      payload: {roomId: '2', scoreMap: {p5: 99, p6: 98, p7: 107, p8: 108}}
    })
    t.currentRound = 0
    await source.notifyConsumer({
      name: 'roomOver',
      payload: {roomId: '1', scoreMap: {p1: 99, p2: 98, p3: 106, p4: 105}}
    })

    expect(last(playersGroup)).to.have.properties([
      {_id: 'p8'}, {_id: 'p7'}, {_id: 'p3'}, {_id: 'p4'}
    ])
  })

  it('8人 三场比赛结束 锦标赛结束', async () => {
    config.playerCounter = 8
    const t = new Tournament(config).withPlayers(nPLayers(8)).withMessageBus(messageBus).useLobby(lobby.startTournamentRoom)

    await t.start()


    await source.notifyConsumer({
      name: 'roomOver', payload: {roomId: '2', scoreMap: {p5: 99, p6: 98, p7: 107, p8: 108}}
    })

    await source.notifyConsumer({
      name: 'roomOver', payload: {roomId: '1', scoreMap: {p1: 99, p2: 98, p3: 106, p4: 105}}
    })

    await source.notifyConsumer({
      name: 'roomOver', payload: {roomId: '3', scoreMap: {p8: 99, p7: 98, p3: 106, p4: 105}}
    })


    expect(last(emitter.emittedMessages)).to.have.properties({name: 'tournament/allOver'})
  })
})

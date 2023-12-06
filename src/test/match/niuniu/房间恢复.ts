import {Channel, Message, Options, Replies} from "amqplib"
import {expect} from 'chai'
import Room from '../../../match/niuniu/room_old'
import {startNiuNiuGame} from "./roomUtils"


const repository = {
  // @ts-ignore
  channel: {
    publish() {
    }
  } as Channel,
  userCenter: {
    async getPlayerModel(id) {
      return {_id: id, name: id, gem: 10}
    }
  }
}

function expectPlayersEquals(actualPlayers, expectPlayers) {
  expect(actualPlayers).have.lengthOf(expectPlayers.length)
  for (const [i, ap] of  actualPlayers.entries()) {
    expectPlayerEquals(ap, expectPlayers[i])
  }
}

function expectPlayerEquals(actualPlayer, expectPlayer) {
  expect(actualPlayer._id).to.equal(expectPlayer._id)
}


describe('房间恢复逻辑', () => {

  let room
  beforeEach(() => {
    const game = startNiuNiuGame()
    room = game.room
  })

  it('toJSON have no exception', () => {
    room.toJSON()
  });

  it('基本信息恢复', async () => {
    const jsonString = JSON.stringify(room.toJSON(), null, ' ')
    const json = JSON.parse(jsonString)

    const recoveredRoom = await Room.recover(json, repository)

    expect(recoveredRoom._id).to.equal(room._id)
    expect(recoveredRoom.scoreMap).to.deep.equal(room.scoreMap)
  });


  it('players,playersOrder,snapshot', async () => {
    const jsonString = JSON.stringify(room.toJSON(), null, ' ')
    const json = JSON.parse(jsonString)

    const recoveredRoom = await Room.recover(json, repository)

    expectPlayersEquals(room.players, recoveredRoom.players)
    expectPlayersEquals(room.playersOrder, recoveredRoom.playersOrder)
    expectPlayersEquals(room.snapshot, recoveredRoom.snapshot)
    expectPlayerEquals(room.creator, recoveredRoom.creator)
  });


  it('解散状态恢复', async function () {
    room.onRequestDissolve(room.players[0])
    const jsonString = JSON.stringify(room.toJSON(), null, ' ')

    const json = JSON.parse(jsonString)
    room.onDisagreeDissolve(room.players[1])

    const recoveredRoom = await Room.recover(json, repository)
    expect(recoveredRoom.dissolveTimeout).not.to.be.empty


    recoveredRoom.onDisagreeDissolve(recoveredRoom.players[1])
    expect(recoveredRoom.dissolveTimeout).to.be.null
  });

})

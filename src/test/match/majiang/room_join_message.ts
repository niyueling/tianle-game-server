import * as chai from 'chai'
import {first, last} from 'lodash'
import * as uuid from "node-uuid"
import * as chaiProperties from 'chai-properties'
import Room from "../../../match/pcmajiang/room";
import {clearMessage, packets, displayMessage, packetsWithMessageName, packetsTo} from './mockwebsocket'
import {createPlayerSocket} from './setupMatch'

chai.use(chaiProperties)
const {expect} = chai

describe('房间加入离开', () => {

  let room: Room

  beforeEach(() => {
    room = new Room({playerCount: 4})
    clearMessage()
  })


  it('四个玩家加入 游戏开始', () => {
    for (let i = 0; i < 4; i++) {
      let player = createPlayerSocket(i)
      room.join(player)
      room.ready(player)
    }

    displayMessage()
    expect(packetsWithMessageName('room/startGame')).to.have.length(4)
  })

  it('玩家加入房间后断线, 其他能看见该玩家', () => {
    const player0 = createPlayerSocket(0)

    room.join(player0)
    room.playerDisconnect(player0)

    clearMessage()

    room.join(createPlayerSocket(1))

    displayMessage()

    let roomJoinPackets = packetsWithMessageName('room/join')

    expect(roomJoinPackets).to.have.length(2)
    expect(roomJoinPackets.map(p => p.message.index)).to.deep.equal([1, 0])
    expect(last(roomJoinPackets).message.disconnectedPlayers).to.deep.equal([0])
  })


  it('玩家0加入房间断线, 玩家1加入后玩家0重连, 玩家1收到玩家0重连信息', () => {
    const player0 = createPlayerSocket(0)

    room.join(player0)
    room.playerDisconnect(player0)


    room.join(createPlayerSocket(1))

    clearMessage()

    room.reconnect(player0)

    let reJoinPackets = packetsWithMessageName('room/rejoin')

    expect(reJoinPackets).to.have.length(2)
    expect(last(reJoinPackets).message.disconnectedPlayers).to.deep.equal([])
  })

  it('玩家0加入房间断线, 路人玩家加入又离开, 玩家1加入后在1号位', () => {
    const player0 = createPlayerSocket(0)

    room.join(player0)

    for (let i = 0; i < 2; i++) {
      let flashMobPlayer = createPlayerSocket(uuid())
      room.join(flashMobPlayer)
      room.leave(flashMobPlayer)
    }
    clearMessage()

    room.join(createPlayerSocket(1))

    displayMessage()

    let joinPacketsToPlayer1 = packetsTo('testid1','room/join')

    expect(joinPacketsToPlayer1).to.have.length(2)
    expect(first(joinPacketsToPlayer1).message).to.have.properties({index: 1})

    expect(packetsTo('testid0')).to.have.length(1)
  })

})

describe('房间加入', () => {

  let room: Room

  beforeEach(() => {
    room = new Room({playerCount: 4})
    clearMessage()
  })


  it('player重复加入', () => {
    let player = createPlayerSocket(0)

    expect(room.join(player)).to.equal(true)
    expect(room.join(player)).to.equal(true)
  })
})

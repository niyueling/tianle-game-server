import {last} from 'lodash'
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {startNiuNiuGame} from "./roomUtils"
import {clearMessage, displayMessage, packetsWithMessageName} from "../mockwebsocket"

chai.use(chaiProperties)
const {expect} = chai

describe('抢庄', () => {
  let room
  let table

  beforeEach(() => {
    const game = startNiuNiuGame()
    table = game.tableState
    room = game.room
    clearMessage()
  })

  it('抢庄', function () {
    const playerSocket = room.players[0]
    const playerState = table.players[0]

    playerSocket.emit('game/qiangZhuang')
    expect(playerState.isQiangZhuangOperated).to.be.true
    expect(playerState.hasQiangZhuang).to.be.true
  })


  it('不抢庄', function () {
    const playerSocket = room.players[0]
    const playerState = table.players[0]

    playerSocket.emit('game/notQiangZhuang')
    expect(playerState.isQiangZhuangOperated).to.be.true
    expect(playerState.hasQiangZhuang).to.be.false
  })


  it('一人抢庄 其他人都不抢', () => {
    const playerSocket1 = room.players[0]
    const playerSocket2 = room.players[1]
    const playerSocket3 = room.players[2]

    clearMessage()

    playerSocket1.emit('game/notQiangZhuang')
    playerSocket2.emit('game/qiangZhuang')
    playerSocket3.emit('game/notQiangZhuang')

    displayMessage()

    const bornZhuangMessage = last(packetsWithMessageName('game/bornZhuang')).message
    expect(bornZhuangMessage).to.have.properties({
      zhuang: 1, candidates: [1]
    })

  })

  it('2个人抢庄 其他人都不抢', () => {
    const playerSocket1 = room.players[0]
    const playerSocket2 = room.players[1]
    const playerSocket3 = room.players[2]

    clearMessage()

    playerSocket1.emit('game/notQiangZhuang')
    playerSocket2.emit('game/qiangZhuang')
    playerSocket3.emit('game/qiangZhuang')

    displayMessage()

    const bornZhuangMessage = last(packetsWithMessageName('game/bornZhuang')).message
    expect(bornZhuangMessage.candidates).to.have.have.lengthOf(2)
    expect(bornZhuangMessage.candidates.sort()).to.deep.equal([1, 2])
  })

  it('全部不抢', () => {
    const playerSocket1 = room.players[0]
    const playerSocket2 = room.players[1]
    const playerSocket3 = room.players[2]

    playerSocket1.emit('game/notQiangZhuang')
    playerSocket2.emit('game/notQiangZhuang')
    playerSocket3.emit('game/notQiangZhuang')

    displayMessage()

    const bornZhuangMessage = last(packetsWithMessageName('game/bornZhuang')).message

    expect(bornZhuangMessage.candidates).to.have.lengthOf(3)
    expect(bornZhuangMessage.candidates.sort()).to.deep.equal([0, 1, 2])
  })
})

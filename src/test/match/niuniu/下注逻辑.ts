import {last} from 'lodash'
import {startNiuNiuGame} from "./roomUtils"
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {clearMessage, displayMessage, packetsTo, packetsWithMessageName} from "../mockwebsocket"

chai.use(chaiProperties)
const {expect} = chai

describe('下注', () => {
  let room
  let table

  beforeEach(() => {
    const game = startNiuNiuGame()
    room = game.room
    table = game.tableState

    clearMessage()
  })

  it('简单下注', () => {
    table.players[0].hasQiangZhuang = true
    table.kaiZhuang()

    room.players[1].emit('game/makeBet', {times: 2})

    displayMessage()

    const betReplyMessage = last(packetsTo('testid2', 'game/makeBetReply')).message
    expect(betReplyMessage).to.have.properties({ok: true})
  })

  it('庄不能下注', () => {

    const game = startNiuNiuGame()
    const room = game.room
    const table = game.tableState

    table.players[0].hasQiangZhuang = true
    table.kaiZhuang()

    room.players[0].emit('game/makeBet', {times: 2})

    displayMessage()

    const betReplyMessage = last(packetsTo('testid1', 'game/makeBetReply')).message
    expect(betReplyMessage).to.have.properties({
      ok: false
    })
  })

  it('不能下选项之外的注', () => {

    table.players[0].hasQiangZhuang = true
    table.kaiZhuang()

    room.players[1].emit('game/makeBet', {times: 99})

    displayMessage()

    const betReplyMessage = last(packetsTo('testid2', 'game/makeBetReply')).message
    expect(betReplyMessage).to.have.properties({
      ok: false, info: '只能下1,2,3,5倍'
    })
  })

  it('所有人下完注 发牌', () => {
    table.players[0].hasQiangZhuang = true
    table.kaiZhuang()

    room.players[1].emit('game/makeBet', {times: 2})
    room.players[2].emit('game/makeBet', {times: 2})

    displayMessage()
    expect(packetsWithMessageName('game/allocateLast')).to.have.lengthOf(3)
  })
})

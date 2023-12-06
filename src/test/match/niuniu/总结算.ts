import {last} from 'lodash'
import {startNiuNiuGame} from "./roomUtils"
import * as chai from 'chai'
import * as chaiProperties from 'chai-properties'
import {clearMessage, displayMessage, packetsTo, packetsWithMessageName} from "../mockwebsocket"

chai.use(chaiProperties)
const {expect} = chai


describe('总结算', () => {
  let room
  let table

  beforeEach(() => {
    const game = startNiuNiuGame()
    room = game.room
    table = game.tableState

    clearMessage()
  })


  it('总结算消息', () => {
    room.creator = room.players[0]
    room.gameOver()
    displayMessage()
  })
})

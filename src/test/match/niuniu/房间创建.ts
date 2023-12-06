import {expect} from 'chai'
import {createPlayerSocket} from "../setupMatch"

import Room from '../../../match/niuniu/room_old'
import {clearMessage, displayMessage, packets, packetsTo} from "../mockwebsocket"
import cleanRecord from "../../../bin/cleanRecord"
import {startNiuNiuGame} from "./roomUtils"

describe('创建房间', () => {
  it('加入三人准备 开始发牌', () => {
    const players = new Array(3)
      .fill(0)
      .map((_, index) => {
        return createPlayerSocket(index + 1)
      })
    const room = new Room({
      "juShu": 10,
      "playableCapacity": 9,
      "timesTable": 7,
      "lowestScore": 1200,
      "maxTimes": 12,
      "baseZhuang": 800,
      "baseBetPercent": 0.005,
      "qiangZhuangPercent": 0.2,
      "consume": 1,
      "maxScore": 0
    }, 16)

    players.forEach((p) => {
      room.join(p)
      room.ready(p)
    })

    displayMessage()
  })

  it('第二个加人 应该能看到第一个加入的人', function () {
    const players = new Array(3)
      .fill(0)
      .map((_, index) => {
        return createPlayerSocket(index + 1)
      })

    const player1 = createPlayerSocket(1)
    const player2 = createPlayerSocket(2)
    const room = new Room({
      "juShu": 10,
      "playableCapacity": 9,
      "timesTable": 7,
      "lowestScore": 1200,
      "maxTimes": 12,
      "baseZhuang": 800,
      "baseBetPercent": 0.005,
      "qiangZhuangPercent": 0.2,
      "consume": 1,
      "maxScore": 0
    }, 42)
    room.join(player1)
    room.ready(player1)
    clearMessage()

    room.join(player2)
    displayMessage()

    const nameOfJoinMessage = packetsTo('testid2').map(p => p.message.model.name).join()
    expect(nameOfJoinMessage).to.equal('testid2,testid1')
  })


  it('很正常游戏流程结束', () => {

    const {room} = startNiuNiuGame()

    room.gameState.kaiZhuang()
    room.gameState.allocateLast()
    room.gameState.showTime()

    clearMessage()
    room.gameState.gameOver()
    displayMessage()
  })

  it('用户离线', function () {

    const {room} = startNiuNiuGame()

    const player = room.players[0]

    room.playerDisconnect(player)

    displayMessage()
  })
})

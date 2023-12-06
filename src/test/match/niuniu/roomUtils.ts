import {createPlayerSocket} from "../setupMatch"
import Room from "../../../match/niuniu/room_old"
import {clearMessage} from "../mockwebsocket"


export function startNiuNiuGame(playersCounter: number = 3, extraRules: any = {}) {

  const players = new Array(playersCounter)
    .fill(0)
    .map((_, index) => {
      return createPlayerSocket(index + 1)
    })

  const room = new Room(Object.assign({
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
  }, extraRules), 42)


  players.forEach((p) => {
    room.join(p)
    room.ready(p)
  })
  room.creator = players[0]
  const playerState = room.gameState.players
  const tableState = room.gameState
  clearMessage()

  return {players, room, playerState, tableState}
}


export function matchOverMessageToScoreString(matchOver) {
  return matchOver.data.states.map(s => s.score)
    .join(',')
}

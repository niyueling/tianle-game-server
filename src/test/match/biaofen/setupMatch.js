'use strict'

import MockWebSocket from '../mockwebsocket'
import Player from '../../../player/player'
import Room from '../../../match/biaofen/room'
import PlayerManager from '../../../player/player-manager'


export const createPlayerSocket = function (id) {
  const wwebSocket = new MockWebSocket()
  let p = new Player(wwebSocket);
  p.model = {
    _id: `testid${id}`,
    name: `testid${id}`,
    gold: 50000,
    gem: 200
  }
  p.onJsonMessage = function (msg) {
    this.onMessage(JSON.stringify(msg));
  }
  PlayerManager.getInstance().addPlayer(p)
  wwebSocket.open()
  return p
}

export default function setupMatch(playerCount = 4, extra = {}) {
  let mockSockets, playerSocket, room
  let player1

  MockWebSocket.clear()

  const playerSockets = []
  for (let i = 0; i < playerCount; i++) {
    playerSockets.push(createPlayerSocket(i + 1))
  }


  const allRule = Object.assign({
    isPublic: false,
    playerCount: playerCount,
    canChi: true,
    juShu: 8,
    quanShu: 4,
    share: true,
    shaoJi: true
  }, extra)

  room = new Room(allRule)
  room.creator = playerSockets[0]
  room._id = '123456'

  playerSockets.forEach((p) => {
    room.join(p)
    room.ready(p)
  });

  const table = room.gameState;
  [player1] = table.players
  room.creator = player1.msgDispatcher
  playerSockets.forEach(ps => ps.socket.open())

  return {
    players: table.players,
    table,
    room,
    allRule
  }
}

export function toString(states) {
  return states.map(s => s.score).join(',')
}

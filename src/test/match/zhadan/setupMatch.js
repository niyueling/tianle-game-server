'use strict'

import MockWebSocket from '../mockwebsocket'
import Player from '../../../player/player'
import Room from '../../../match/zhadan/room'
import PlayerManager from '../../../player/player-manager'


export const createPlayerSocket = function (id) {
  const wwebSocket = new MockWebSocket()
  let p = new Player(wwebSocket);
  p.model = {
    _id: createPlayer(id)._id,
    name: createPlayer(id).name,
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

function createPlayer(id) {
  if(id === 1) return {_id: "63e30c0ae378ad809b8408e4", name: "1000174"}
  if(id === 2) return {_id: "63e9ca9316c1a30841a72388", name: "1000195"}
  if(id === 3) return {_id: "63ef1c7b43e317159d03e53d", name: "1000216"}
  if(id === 4) return {_id: "64193f568d63ea34c1a0450c", name: "1000280"}
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
    shaoJi: true,
    useJoker: true
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


'use strict'

import MockWebSocket from '../mockwebsocket'
import Player from '../../../player/player'
import Room from '../../../match/shisanshui/room'

export const createPlayerSocket = function (id) {
  const webSocket = new MockWebSocket()
  let p = new Player(webSocket);
  p.model = {
    _id: `testid${id}`,
    name: `testid${id}`,
    gold: 50000,
    gem: 200
  }
  p.onJsonMessage = function (msg) {
    this.onMessage(JSON.stringify(msg));
  }

  webSocket.open()

  return p
}

export default function setupMatch(playerCount = 4, extra = {}) {
  let room
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
    juShu: 6,
    quanShu: 4,
  }, extra)


  room = new Room(allRule)
  room.creator = playerSockets[0]

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


export const emptyCards = function () {
  return new Array(38).fill(0)
}


export const cardsFromArray = function (cards = []) {
  const cardMap = new Array(38).fill(0)
  for (let card of cards) {
    cardMap[card] += 1
  }

  return cardMap
}


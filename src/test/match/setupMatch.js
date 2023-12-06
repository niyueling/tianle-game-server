//@ts-check
'use strict'

import * as EventEmitter from 'events'
import Room from '../../match/paodekuai/room'
import Player from '../../player/player'
import PlayerManager from '../../player/player-manager'
import MockWebSocket from './mockwebsocket'


export let rabbitMessages = []

export function clearRabbitMessages() {
  rabbitMessages = []
}

export function displayRabbitMessage() {
  if (process.env.NODE_ENV === 'test')
    return

  console.log()
  for (const {queue, name, message}of rabbitMessages) {
    console.log(`to: ${queue} messageName:${name} message:${JSON.stringify(message)}`)
  }
  console.log()
}

class MockPlayer extends Player {

  constructor(ws) {
    super(ws, null)
    this.ev = new EventEmitter()
  }


  requestTo(queue, name, message) {
    rabbitMessages.push({queue, name, message})
  }

  requestToCurrentRoom(name, message = {}) {
    rabbitMessages.push({queue: 'toCurrentRoom', name, message})
  }

  emit(name, message) {
    return this.ev.emit(name, message)
  }

  on(name, fn) {
    this.ev.on(name, fn)
    return this
  }

  removeAllListeners(name) {
    this.ev.removeAllListeners(name)
    return this
  }

  removeListener(name, fn) {
    this.ev.removeListener(name, fn)
    return this
  }

  setOpen() {

  }
}


export const createPlayerSocket = function (id) {
  const webSocket = new MockWebSocket()
  let p = new MockPlayer(webSocket);
  p.model = {
    _id: `testid${id}`,
    name: `testid${id}`,
    gold: 50000,
    gem: 200,
    ruby: 100
  }

  PlayerManager.getInstance().addPlayer(p)
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
    juShu: 8,
    quanShu: 4,
    share: true,
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
  room.game.juIndex = 2

  return {
    players: table.players,
    table,
    room,
    allRule
  }
}


export const cardsFromArray = function (cards = []) {
  const cardMap = new Array(38).fill(0)
  for (let card of cards) {
    cardMap[card] += 1
  }

  return cardMap
}


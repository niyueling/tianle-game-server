'use strict'

import MockWebSocket from './mockwebsocket'
import Player from '../../../player/player'
import Room from '../../../match/majiang/room'
import TableState from '../../../match/majiang/table_state'
import PlayerManager from '../../../player/player-manager'
import {SourceCardMap} from '../../../match/majiang/player_state'
import * as EventEmitter from 'events'

class MockPlayer extends Player {

  constructor(ws) {
    super(ws)
    this.ev = new EventEmitter()
  }

  get _id() {
    return this.model && this.model._id
  }

  requestToCurrentRoom(name, message = {}) {

  }

  emit(name, message) {
    this.ev.emit(name, message)
  }

  on(name, fn) {
    this.ev.on(name, fn)
  }

  removeAllListeners(name) {
    return this.ev.removeAllListeners(name)
  }

  removeListener(name, fn) {
    return this.ev.removeListener(name, fn)
  }
}


export const createPlayerSocket = function (id) {
  const webSocket = new MockWebSocket()
  let p = new MockPlayer(webSocket);
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
  webSocket.open()
  return p
}

export default function setupMatch(playerCounter = 4, extra = {}) {
  let mockSockets, playerSocket, room, table;
  let player1

  MockWebSocket.clear()

  const playerSockets = []
  for (let i = 0; i < 4; i++) {
    playerSockets.push(createPlayerSocket(i + 1))
  }


  const allRule = Object.assign({
    isPublic: false,
    playerCount: playerCounter,
    canChi: true,
    juShu: 8,
    quanShu: 4,
    share: true,
    feiNiao: 0,
    kehu: ['qifeng', 'haoQi'],
    keJiePao: true
  }, extra)

  room = new Room(allRule)

  room._id = '123456'

  playerSockets.forEach((p) => {
    room.join(p)
    room.ready(p)
  });

  table = new TableState(room, room.rule, 3);
  room.gameState = table;

  [player1] = table.players
  room.creator = player1;
  playerSockets.forEach(ps => ps.socket.open());

  return {
    players: table.players,
    table, room,
    changeCaishen: function (newCaiShen) {
      table.caishen = newCaiShen
      table.players.forEach((p) => {
        p.caiShen = newCaiShen
        p.cards.caiShen = newCaiShen
      })
    }
  }
}


export const emptyCards = function () {
  return new Array(38).fill(0)
}


export const cardsFromArray = function (cards = []) {
  const cardMap = new SourceCardMap(38).fill(0)
  for (let card of cards) {
    cardMap[card] += 1
  }

  return cardMap
}


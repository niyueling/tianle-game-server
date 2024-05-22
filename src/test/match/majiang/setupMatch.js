'use strict'

import MockWebSocket from './mockwebsocket'
import Player from '../../../player/player'
import Room from '../../../match/pcmajiang/room'
import TableState from '../../../match/pcmajiang/table_state'
import PlayerManager from '../../../player/player-manager'
import {SourceCardMap} from '../../../match/pcmajiang/player_state'
import * as EventEmitter from 'events'
import { ObjectId } from 'mongodb';


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
  const objectId = new ObjectId();
  p.model = {
    _id: objectId.toString(),
    nickname: objectId.toString(),
    gold: 50000,
    diamond: 200
  }

  p.onJsonMessage = function (msg) {
    this.onMessage(JSON.stringify(msg));
  }
  PlayerManager.getInstance().addPlayer(p)
  webSocket.open()
  return p
}

export default async function setupMatch(playerCounter = 4, extra = {}) {
  let mockSockets, playerSocket, room, table;
  let player1

  MockWebSocket.clear()

  const playerSockets = []
  for (let i = 0; i < 4; i++) {
    playerSockets.push(createPlayerSocket(i + 1))
  }


  const allRule = Object.assign({
    autoCommit: 30,
    feiNiao: 0,
    gameType: "pcmj",
    isPublic: false,
    juShu: 12,
    keJiePao: false,
    playerCount: 4,
    test: true,
    type: "pcmj",
    useCaiShen: false
  }, extra)

  room = new Room(allRule)
  room._id = '123456'

  for (const p of playerSockets) {
    await room.join(p)
    await room.ready(p)
  }

  table = new TableState(room, room.rule, 1);
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


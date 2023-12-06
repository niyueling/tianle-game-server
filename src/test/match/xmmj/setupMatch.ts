import * as EventEmitter from 'events'
import * as mongoose from "mongoose";
import * as config from "../../../config";
import MaJiangAudit from "../../../database/models/roomMaJiangAudit";
import Enums from "../../../match/xmmajiang/enums";
import Room from '../../../match/xmmajiang/room'
import Player from '../../../player/player'
import PlayerManager from '../../../player/player-manager'
import MockWebSocket from '../base/mockwebsocket'

class MockPlayer extends Player {
  ev;
  onJsonMessage;

  constructor(ws) {
    super(ws, null)
    this.ev = new EventEmitter()
  }

  get _id() {
    return this.model && this.model._id
  }

  requestToCurrentRoom(name, message = {}) {
    return;
  }

  emit(name, message) {
    this.ev.emit(name, message)
    return true;
  }

  on(name, fn) {
    this.ev.on(name, fn)
    return this;
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
  const p = new MockPlayer(webSocket);
  p.model = {
    _id: `testid${id}`,
    name: `testid${id}`,
    gold: 50000,
    gem: 200,
    ruby: 0,
    shortId: 100000 + id,
  }
  p.onJsonMessage = function (msg) {
    this.onMessage(JSON.stringify(msg));
  }
  PlayerManager.getInstance().addPlayer(p)
  webSocket.open();
  return p
}

export default async function setupMatch(playerCounter = 4, extra = {}) {
  let room: Room;
  let player1
  const playerSockets = []
  for (let i = 0; i < playerCounter; i++) {
    playerSockets.push(createPlayerSocket(i + 1))
  }

  const allRule = Object.assign({
    isPublic: false,
    playerCount: playerCounter,
    canChi: true,
    juShu: 8,
    share: true,
    keJiePao: true
  }, extra)

  room = new Room(allRule, 123456)
  room._id = 123456;
  await room.init();
  playerSockets.forEach( p => {
    room.join(p)
    room.ready(p)
  });
  const table = room.game.startGame(room);
  room.gameState = table;

  [player1] = table.players
  room.creator = player1;
  playerSockets.forEach(ps => ps.socket.open());

  return {
    players: table.players,
    table,
    room,
    playerSockets,
    // 更换金牌
    updateGoldCard: async newCaiShen => {
      table.caishen = newCaiShen
      table.players.forEach(p => {
        p.caiShen = newCaiShen
        p.cards.caiShen = newCaiShen
      })
      room.auditManager.model.goldCard = newCaiShen;
      await room.auditManager.save();
    }
  }
}

export const emptyCards = function () {
  return new Array(Enums.finalCard).fill(0)
}

// 打印
export const printOnePlayerPacketMessage = player => {
  return player.socket.displayMessage();
}

// 打印所有玩家消息
export const printAllPacketMessage = players => {
  players.forEach(p => {
    p.socket.displayMessage();
  })
}

export const filterMessage = (player, messageName) => {
  return player.socket.packetsWithMessageName(messageName);
}

export async function initBeforeMocha() {
  // 初始化 mongo
  await mongoose.connect(config.database.url)
}

export async function resetAudit() {
  // 删除麻将表
  await MaJiangAudit.remove({
    roomNum: 123456
  })
}

/**
 * Created by user on 2016-07-02.
 */
import * as winston from 'winston';
import PlayerModel from '../database/models/player';
import Player from './player';

let instance = null;

let connection = null
const transports = process.env.NODE_ENV === 'test' ? [] : [new winston.transports.Console()]
const logger = new winston.Logger({transports})

class PlayerManager {
  onlinePlayers: number
  players = {}
  loggingInPlayers = {}
  // 同一进程内才能获取同一 instance
  static getInstance() {
    if (!instance) {
      instance = new PlayerManager();
    }

    return instance;
  }

  static injectRmqConnection(rmqConnection) {
    connection = rmqConnection
  }

  // for test
  static destroyInstance() {
    instance = null;
  }

  constructor() {
    // 在线人数
    this.onlinePlayers = 0;
    this.players = {};
    this.loggingInPlayers = {};
  }

  onConnect(socket) {
    if (socket.player) {
      logger.info(`重复的连接事件: ${socket.player._id}, ${socket.player.name}`);
      return null;
    }
    // 在线人数 + 1
    this.onlinePlayers++;
    return new Player(socket, connection)
  }

  addLoggingInPlayer(id) {
    this.loggingInPlayers[id] = true;
  }

  removeLoggingInPlayer(id) {
    delete this.loggingInPlayers[id];
  }

  isLoggingIn(id) {
    return !!(this.loggingInPlayers[id]);
  }

  addPlayer(player) {
    if (!player) {
      return false;
    }

    if (!player._id) {
      logger.warn(`玩家未登录: ${player}`);
      return false;
    }

    if (this.players[player._id]) {
      logger.warn(`重复的玩家ID: ${player._id}, ${player.name}`);
      return false;
    }

    this.players[player._id] = player;
    player.once('disconnect', () => {
      if (this.players[player._id] === player) {
        this.removePlayer(player._id);
      }
    });

    return true;
  }

  removePlayer(id) {
    delete this.players[id];
  }

  getPlayer(id) {
    return this.players[id];
  }

  onDisconnect(socket) {
    const player = socket.player;
    if (!player) {
      logger.error(`Player not found when disconnecting: ${socket && socket.id}`);
      return;
    }
    // 在线人数--
    this.onlinePlayers--;
    player.onDisconnect();
  }

  onMessage(socket, data) {
    const player = socket.player;
    if (!player) {
      logger.error(`Player not found when receiving message: ${socket && socket.id}`);
      return;
    }

    player.onMessage(data);
  }

  notice(message) {
    for (const key of Object.keys(this.players)) {
      this.players[key].sendMessage('global/notice', message);
    }
  }

  get onLinePlayers() {
    return this.onlinePlayers
  }

  addRuby(playerId, ruby) {
    const player = this.getPlayer(playerId)
    let delta = ruby
    if (player) {
      let newRuby = player.model.ruby + ruby;
      if (newRuby < 0) {
        newRuby = 0
        delta = -player.model.ruby
      }
      player.model.ruby = newRuby
      player.updateResource2Client()
    }
    PlayerModel.update({_id: playerId}, {$inc: {ruby: delta}}, err => {
        if (err) {
          logger.error(err);
        }
      });
  }
}

export default PlayerManager;

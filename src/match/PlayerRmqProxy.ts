import {Channel} from "amqplib";
import {EventEmitter} from "events";
import PlayerModel from "../database/models/player";
import gameHandlers from "../player/message-handlers-rmq/game";
import {service} from "../service/importService";
import {GameTypes} from "./gameTypes"
import {SimplePlayer} from "./interfaces"

function toBuffer(json: { name: string, payload: any }): Buffer {
  return new Buffer(JSON.stringify(json))
}

// 创建新 playerProxy
export async function getPlayerRmqProxy(playerId, channel, gameName: GameTypes | string, ip?) {
  const model = await service.playerService.getPlayerPlainModel(playerId);
  if (ip) {
    model.ip = ip;
  }
  return new PlayerRmqProxy(model, channel, gameName);
}

export class PlayerRmqProxy extends EventEmitter implements SimplePlayer {
  model: any;
  channel: Channel;
  ip: any;
  room: any
  seatIndex: number

  readonly myQueue: string
  readonly myRouteKey: string

  constructor(model, channel, readonly gameName: GameTypes | string) {
    super()
    this.model = model
    this.ip = model && model.ip ? model.ip : "127.0.0.1";
    this.channel = channel
    this.myQueue = `user:${this._id}`
    this.myRouteKey = `user.${this._id}.${this.gameName}`
  }

  getIpAddress() {
    return this.ip || '8.8.8.8'
  }

  get location() {
    return 'rabbit hole'
  }

  get _id(): string {
    return this.model && this.model._id.toString();
  }

  sendMessage(name: 'room/join-success', message: { _id: string, rule: any });
  sendMessage(name: 'room/joinReply', message: { ok: boolean, info: string });
  sendMessage(name: 'room/leaveReply', message: { playerId: string });
  sendMessage(name: 'room/reconnectReply', message: {ok: boolean, data: {_id: string, rule: any}});
  sendMessage(name: never | string, message: any);

  // 通知 websocket server.js
  sendMessage(name: string, message: any) {
    try {
      this.channel.publish('userCenter', this.myRouteKey, toBuffer({payload: message, name}))
    } catch (e) {
      console.error('playerRmqProxy sendMessage ', name, 'with error', e)
    }
  }

  // 添加分数
  addGold(v) {
    if (this.model) {
      let g = this.model.gold;
      g += v;
      this.model.gold = g;
      this.sendMessage('resource/update', {ok: true, data: {gold: g, diamond: this.model.diamond, tlGold: this.model.tlGold}})
      PlayerModel.update({_id: this.model._id}, {$set: {gold: g}}, err => {
          if (err) {
            console.error(err);
          }
        });
    }
  }

  isRobot(): boolean {
    return false
  }

  getGameMsgHandler() {
    return gameHandlers;
  }

  toJSON() {
    return this.model._id
  }
}

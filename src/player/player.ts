import {Errors, GameError, getErrorInfo} from "@fm/common/errors";
import {Channel, Connection} from 'amqplib'
import * as EventEmitter from 'events'
import * as Parameter from 'parameter';
import * as uuid from 'uuid'
import * as winston from 'winston'
import * as ws from 'ws'
import * as config from '../config'
import PlayerModel from '../database/models/player'
import {GameTypes} from "../match/gameTypes"
import {deserializeMessage, serializeMessage} from '../network/utils'
import {service} from "../service/importService"
import createClient from "../utils/redis"
import {IPlayerModel, ISocketPlayer} from "./ISocketPlayer"
import accountHandlers from './message-handlers-rmq/account'
import chatHandlers from './message-handlers-rmq/chat'
import clubHandlers from './message-handlers-rmq/club';
import errorHandlers from './message-handlers-rmq/error'
import gameHandlers from './message-handlers-rmq/game'
import {GameApi} from "./message-handlers-rmq/gameApi";
import {GoodsApi} from "./message-handlers-rmq/goodsApi";
import mailHandlers from './message-handlers-rmq/mail';
import {createHandler} from './message-handlers-rmq/match'
import resourceHandlers from './message-handlers-rmq/resource'
import {ResourceApi} from "./message-handlers-rmq/resourceApi";
import socialHandlers from './message-handlers-rmq/social'

const transports = process.env.NODE_ENV === 'test' ? [] : [new winston.transports.Console()]
const logger = new winston.Logger({transports})
logger.level = 'debug'

if (process.env.NODE_ENV === 'production') {
  logger.level = 'warn'
}
const messageHandlers: object = {
  'test/echo': (player, message) => {
    player.sendMessage('test/echo', message)
  },
}

const ipReg = /(\d+\.\d+\.\d+.\d+)/

const NullSocket = {
  close() {
    return;
  },
  terminate() {
    return;
  }
}
const rediClient = createClient()
const matchHandlers = createHandler(rediClient)
Object.assign(
  messageHandlers,
  accountHandlers,
  matchHandlers,
  resourceHandlers,
  gameHandlers,
  clubHandlers,
  socialHandlers,
  chatHandlers,
  errorHandlers,
  mailHandlers
)

// 参数校验
const parameter = new Parameter({
  validateRoot: true, // restrict the being validate value must be a object
});

// 所有接口类
const apiClass = {
  resource: ResourceApi,
  game: GameApi,
  goods: GoodsApi,
}
// 调用api
function invokeApi(apiRoute, apiName, packet, player) {
  const methodName = apiClass[apiRoute].prototype.__apiMap.get(apiName);
  const rule = apiClass[apiRoute].prototype.__apiRule.get(apiName);
  // 实例化接口
  const cls = new apiClass[apiRoute](packet.name, player, service);
  // 调用函数
  if (cls[methodName]) {
    if (rule) {
      // 校验参数
      const errors = parameter.validate(rule, packet.message);
      if (errors) {
        return player.sendMessage(packet.name + 'Reply', errors);
      }
    }
    return cls[methodName](packet.message).catch(e => {
      if (e instanceof GameError) {
        // 游戏内的消息
        return player.sendMessage(packet.name + 'Reply', {ok: false, info: e.msg});
      } else {
        // 上报其它错误
        throw e;
      }
    });
  }
  // 发送通知到房间
  player.requestToCurrentRoom(packet.name, packet.message)
  console.error(packet.name + '房内消息');
  // return player.sendMessage('error', packet.name + '接口未实现')
}

export default class SocketPlayer extends EventEmitter implements ISocketPlayer {
  connection: Connection
  private isDone: boolean
  private readonly sendCallback: (err) => any
  protected socket: any
  private channel: Channel
  private readonly debugMessage: boolean

  socketId: string
  location: string
  currentRoom: string
  clubId: number
  model: IPlayerModel
  gameName: GameTypes

  constructor(socket, connection) {
    super()
    this.isDone = false
    socket.player = this
    this.socket = socket
    this.connection = connection
    this.channel = null
    this.sendCallback = err => {
      if (err) {
        logger.warn(err)
      }
    }
    this.debugMessage = config.debug.message || false
    this.location = null
    this.socketId = uuid()
    logger.info('socket start ===>', this.socketId)

    this.getLocation(data => {
      try {
        const obj = JSON.parse(data)
        if (obj instanceof Object) {
          this.location = `${obj.province || ''}${obj.city || ''}`
        } else {
          this.location = '本地'
        }
      } catch (error) {
        this.location = '本地'
      }
    })
  }

  getDebugMessage(data) {
    let content = data
    if (content.length > 1024) {
      content = `${content.slice(0, 1024)}...`
    }

    return content
  }

  getLocation(onGetData?) {
    // const options = {
    //   hostname: 'int.dpool.sina.com.cn',
    //   port: 80,
    //   path: `/iplookup/iplookup.php?format=json&ip=${this.getIpAddress()}`,
    //   method: 'GET',
    //   headers: {
    //     'Content-Type': 'application/x-www-form-urlencoded',
    //   },
    // }
    // http.get(options, (res: IncomingMessage) => {
    //   logger.log('STATUS:', `${res.statusCode}`)
    //   logger.log('HEADERS:', JSON.stringify(res.headers))
    //   res.setEncoding('utf8')
    //   res.on('data', onGetData)
    //   res.on('error', (err) => {
    //     logger.error('RESPONSE ERROR:', err)
    //   })
    // }).on('error', (err) => {
    //   logger.error('socket error', err)
    // })
  }

  getIpAddress() {

    if (!this.socket || !this.socket.remoteAddress) {
      return 'ip获取中'
    }
    const fullAddress = this.socket.remoteAddress || '0.0.0.0'
    const matches = fullAddress.match(ipReg)
    if (matches) {
      return matches[1]
    } else {
      logger.error('the wrong ip is ', fullAddress)
      return 'ip获取中'
    }
  }

  onMessage(data) {
    try {
      console.log(`Player: [${this._id}, ${this.name}] receive ${data}`)
      const packet = deserializeMessage(data)
      const handler = messageHandlers[packet.name]
      if (handler) {
        return handler(this, packet.message)
      }
      // 调用新接口函数
      const req = packet.name.split('/');
      if (req.length === 2 && apiClass[req[0]]) {
        return invokeApi(req[0], req[1], packet, this);
      }
      this.requestToCurrentRoom(packet.name, packet.message)
      console.log(`未知的消息：${JSON.stringify(packet)}`)
    } catch (e) {
      logger.error(e)
    }

    return false
  }

  get _id() {
    return this.model && this.model._id.toString()
  }

  get name() {
    return this.model && this.model.nickname
  }

  get gold() {
    return (this.model && this.model.gold) || 0
  }

  addGold(v) {
    if (this.model) {
      let g = this.model.gold
      g += v
      this.model.gold = g
      this.sendMessage('resource/update', {ok: true, data: {gold: g, diamond: this.model.diamond, tlGold: this.model.tlGold}})
      PlayerModel.update({_id: this.model._id}, {$set: {gold: g}}, err => {
          if (err) {
            logger.error(err)
          }
        })
    }
  }

  onDisconnect() {
    this.emit('disconnect', {from: this._id})

    this.socket.player = null
    this.socket = NullSocket
    if (this.channel) {
      this.channel.publish('userCenter', `user.${this._id}`, new Buffer(
        JSON.stringify({type: 'cmd', cmd: 'leave', sid: "close"})))
    }
    this.disconnect()
      .catch(error => {
        logger.error('onDisconnect', `Player [${this._id} with error`, error.stack)
      })
      .then(() => {
        logger.info(`Player [${this._id}, ${this.name}] disconnected`)
      })
  }

  async disconnect() {
    try {
      this.isDone = true
      logger.info(`Disconnect player: ${this._id}`, this.socketId)

      if (this.socket) {
        const promise = new Promise(resolve => {
          this.once('disconnect', () => resolve())
        })

        rediClient.decrAsync(`gameCounter.${this.gameName}`)
          .then()
        this.socket.close()
        this.socket.terminate()
        await promise
      }
    } catch(e) {
      logger.info(e);
    }

  }

  sendMessage(name, message) {
    try {
      const packet = {name, message}
      const data = serializeMessage(packet)
      console.log(`Player: [${this._id}, ${this.name}] send ${data}`)
      if (this.socket && this.socket.readyState === ws.OPEN) {
        this.socket.send(data, this.sendCallback)
      }
    } catch (e) {
      logger.error(e)
    }
  }

  // 返回成功
  replySuccess(name, data?: any) {
    return this.sendMessage(name + 'Reply', { ok: true, data: data || {} })
  }

  // 返回失败
  replyFail(name, info: Errors | string, noReply?: boolean) {
    if (!noReply) {
      return this.sendMessage(name + 'Reply', { ok: false, info: getErrorInfo(info) })
    }
    // 不加 reply
    return this.sendMessage(name, { ok: false, info: getErrorInfo(info) })
  }

  getGameMsgHandler() {
    return gameHandlers
  }

  isRobot() {
    return false
  }

  get myQueue() {
    return this.socketId
  }

  async connectToBackend(gameName: GameTypes) {
    rediClient.incrAsync(`gameCounter.${this.gameName}`).then()

    this.channel = await this.connection.createChannel()
    this.channel.on('error', error => {
      logger.error('connectToBackend channel error ', this.socketId, error)
      try {
        this.socket.close()
        this.socket.terminate()
      } catch (closingSocketError) {
        logger.error('terminating socket error', this.socketId, closingSocketError)
      }
    })

    await this.channel.assertExchange('userCenter', 'topic', {durable: false})
    await this.channel.assertQueue(this.myQueue, {exclusive: true, durable: false, autoDelete: true})

    try {
      await this.channel.bindQueue(this.myQueue, 'userCenter', `user.${this._id}`)
      await this.channel.bindQueue(this.myQueue, 'userCenter', `user.${this._id}.${gameName}`)
      const {consumerTag} = await this.channel.consume(this.myQueue, async message => {
        if (!message) {
          logger.error('message error')
          return;
        }
        try {
          const messageBody = JSON.parse(message.content.toString())
          logger.info(`from ${gameName} [${this.currentRoom}] to ${this._id} message name ${messageBody.name} cmd ${messageBody.cmd}`)

          if (messageBody.type === 'cmd' && messageBody.cmd === 'leave' && this.socket && this.socketId !== messageBody.sid) {
            this.socket.close()
            this.socket.terminate()

            if (this.channel) {
              await this.channel.cancel(consumerTag)
              return this.channel.close()
            }
          }

          if (messageBody.name === 'room/joinReply') {
            if(!messageBody.payload.ok) {
              return this.sendMessage(messageBody.name, messageBody.payload)
            }

            this.currentRoom = messageBody.payload.data._id
          }

          if (messageBody.name === 'resource/update') {
            this.updateGoldGemRuby({gold: messageBody.payload.gold})
          }
          if (messageBody.name === 'resource/createRoomUsedGem') {
            this.updateGoldGemRuby({gem: -messageBody.payload.createRoomNeed})
          }

          this.sendMessage(messageBody.name, messageBody.payload)
        } catch (err) {
          logger.error('backMessageFromBackend', err, message.content.toString())
        }
      }, {noAck: true})

    } catch (e) {
      logger.error('connectToBackend error', this.socketId, e)
    }
  }

  updateGoldGemRuby(data) {
    if (this.model) {
      this.model.gold += data.gold || 0
      this.model.diamond += data.diamond || 0
    }
  }

  requestTo(queue, name, message) {
    const playerIp = this.getIpAddress()
    this.channel.sendToQueue(
      queue,
      this.toBuffer({name, from: this._id, payload: message, ip: playerIp}),
      {replyTo: this.myQueue})
  }

  requestToCurrentRoom(name, message = {}) {
    const playerIp = this.getIpAddress()
    if (!this.currentRoom) {
      logger.error('player is not in room', name, message)
      // this.sendMessage("room/leaveReply", {ok: true, data: {_id: this._id}})
      return
    }

    logger.verbose(name, message, this.currentRoom)
    try {
      this.channel.publish(
        'exGameCenter',
        `${this.gameName}.${this.currentRoom}`,
        this.toBuffer({name, from: this._id, payload: message, ip: playerIp}),
        {replyTo: this.myQueue})
    } catch (e) {
      logger.error('error to request to current room', e);
    }
  }

  setGameName(gameType) {
    this.gameName = gameType || 'shisanshui';
  }

  requestToRoom(roomId, name, message) {
    const playerIp = this.getIpAddress()
    this.channel.publish(
      'exGameCenter',
      `${this.gameName}.${roomId}`,
      this.toBuffer({name, from: this._id, payload: message, ip: playerIp}),
      {replyTo: this.myQueue})
  }

  emit(event: string, message): boolean {
    super.emit(event, message)
    this.requestToCurrentRoom(event, message)
    return true
  }

  toBuffer(messageJson) {
    return new Buffer(JSON.stringify(messageJson))
  }

  toJSON() {
    return this.model._id
  }

  async updateResource2Client() {
    if (!this.model) {
      return;
    }
    const model = await service.playerService.getPlayerModel(this.model._id);
    this.sendMessage('resource/update', {ok: true, data: {gold: model.gold, diamond: model.diamond, tlGold: model.tlGold }});
  }
}

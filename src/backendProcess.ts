import * as rabbitMq from 'amqplib'
import {Channel, Connection} from 'amqplib'
import * as winston from 'winston'
import * as config from "./config";
import Database from './database/database'
import {saveRoomDetail} from "./database/models/roomDetail";
import {saveRoomInfo} from "./database/models/roomInfo";
import {GameTypes} from "./match/gameTypes"
import {toBuffer} from "./match/messageBus";
import {PlayerRmqProxy} from "./match/PlayerRmqProxy"
import RoomProxy, {recoverFunc} from "./match/roomRmqProxy"
import {service} from "./service/importService";
import createClient from "./utils/redis";
import {GameType, TianleErrorCode} from "@fm/common/constants";
import GameCategory from "./database/models/gameCategory";
import PlayerCardTable from "./database/models/PlayerCardTable";

const alwaysOk = () => true

export class BackendProcess {

  dataBaseUrl: string
  rabbitMqServer: string
  gameName: GameTypes
  cluster: string
  private readonly redisClient: any
  private lobbyChannel: Channel
  private connection: Connection
  private lobby: any
  roomRecover: recoverFunc

  constructor({dataBaseUrl, rabbitMqServer, gameName, cluster, Lobby}) {
    this.dataBaseUrl = dataBaseUrl
    this.rabbitMqServer = rabbitMqServer
    this.gameName = gameName
    this.cluster = cluster
    this.redisClient = createClient();
    this.lobby = Lobby
  }

  recoverPolicy: (json: any) => boolean = (roomJson: any) => roomJson
  // 保存所有房间信息

  async getRoomIdsToRecover(): Promise<string[]> {
    return this.redisClient.smembersAsync(`cluster-${this.cluster}`);
  }

  sendMessage(name: string, message: any, playerRouteKey: string) {
    this.lobbyChannel.publish('userCenter', playerRouteKey, toBuffer({payload: message, name}));
  }

  async execute() {
    // @ts-ignore
    await Database.connect(this.dataBaseUrl, config.database.opt);
    this.connection = await rabbitMq.connect(this.rabbitMqServer);
    this.lobbyChannel = await this.connection.createChannel();
    // 子游戏大厅
    const lobbyQueueName = `${this.gameName}Lobby`
    const dealQuestionQueueName = `${this.gameName}DealQuestion`
    await this.lobbyChannel.assertQueue(lobbyQueueName, {durable: false})
    await this.lobbyChannel.assertQueue(dealQuestionQueueName, {durable: false})
    await this.lobbyChannel.assertExchange('exGameCenter', 'topic', {durable: false})
    await this.lobbyChannel.assertExchange('exClubCenter', 'topic', {durable: false})
    await this.lobbyChannel.assertExchange('userCenter', 'topic', {durable: false})

    const roomIds: string[] = await this.getRoomIdsToRecover();

    // 还原掉线房间
    await this.recoverRooms(roomIds);

    await this.lobbyChannel.consume(lobbyQueueName, async message => {
      const messageBody = JSON.parse(message.content.toString())
      const playerRouteKey = `user.${messageBody.from}.${this.gameName}`

      const unfinishedRoomId = await service.roomRegister.getDisconnectedRoom(messageBody.from, this.gameName);
      if (unfinishedRoomId) {
        return this.sendMessage('room/createReply', {ok: false, info: TianleErrorCode.roomIsNotFinish, data: {roomId: unfinishedRoomId, gameName: this.gameName}}, playerRouteKey);
      }

      const playerModel = await service.playerService.getPlayerPlainModel(messageBody.from)
      if (playerModel) {
        const alreadyInRoom = await service.roomRegister.roomNumber(playerModel._id, this.gameName)
        if (alreadyInRoom) {
          return this.sendMessage('room/createReply', {ok: false, info: TianleErrorCode.roomIsNotFinish, data: {roomId: alreadyInRoom, gameName: this.gameName}}, playerRouteKey);
        }

        if (messageBody.payload.rule.isPublic) {
          await this.joinPublicRoom(playerModel, messageBody);
        } else {
          await this.createPrivateRoom(playerModel, messageBody)
        }
      } else {
        this.sendMessage('room/createReply', {ok: false, info: TianleErrorCode.userNotFound}, playerRouteKey);
      }
    }, {noAck: true})

    await this.lobbyChannel.consume(dealQuestionQueueName, async message => {

      const messageBody = JSON.parse(message.content.toString())
      const playerRouteKey = `user.${messageBody.from}.${messageBody.payload.myGameType}`

      if (messageBody.name === 'clearRoomInfoFromRedis') {
        const roomId = messageBody.payload.roomId

        try {
          await this.redisClient.sremAsync(`cluster-${this.cluster}`, roomId)
          await this.redisClient.delAsync('room:info:' + roomId)
          await this.redisClient.delAsync(`room:${roomId}`)
          await this.redisClient.sremAsync(`room`, roomId)
          this.sendMessage('sc/showInfo', {reason: `${roomId} 信息已清除`}, playerRouteKey);

        } catch (e) {
          this.sendMessage('sc/showInfo', {reason: `${roomId} 信息清除失败`}, playerRouteKey);
          logger.error(`del room ${roomId} failed with `, e)
        }
      }
    }, {noAck: true})

    return
  }

  private async recoverRooms(roomIds: string[]) {
    for (const id of roomIds) {
      try {
        const jsonString = await this.redisClient.getAsync(`room:info:${id}`)
        const roomJson = JSON.parse(jsonString)

        if (this.recoverPolicy(roomJson)) {
          const gameChannel = await this.connection.createChannel()
          const roomQueueReply = await gameChannel.assertQueue(`${this.gameName}.${roomJson._id}`, {
            durable: false,
            autoDelete: true
          })
          await gameChannel.bindQueue(roomQueueReply.queue,
            'exGameCenter',
            `${this.gameName}.${roomJson._id}`)

          const roomProxy = await RoomProxy.recover(JSON.parse(jsonString), {
            gameChannel,
            gameQueue: roomQueueReply,
            cluster: this.cluster,
            redisClient: this.redisClient,
          }, this.gameName, this.roomRecover)

          this.lobby.listenRoom(roomProxy.room)
        }
      } catch (e) {
        logger.error('room recover failed', id, e)
      }
    }
  }

  async joinPublicRoom(playerModel, messageBody) {
    const playerRouteKey = `user.${messageBody.from}.${this.gameName}`;

    const roomId = await this.redisClient.lpopAsync('roomIds')
    if (!roomId) {
      this.sendMessage('room/createReply', {ok: false, info: TianleErrorCode.roomInvalid}, playerRouteKey);
      return
    }
    // 创建规则(红包规则等)
    const rule = await this.lobby.normalizeRule(messageBody.payload.rule)
    // 局数设为 99
    rule.juShu = -1;
    const room = await this.lobby.getAvailablePublicRoom(messageBody.from, Number(roomId), rule, playerModel);

    // 检查金豆
    const resp = await this.lobby.isRoomLevelCorrect(playerModel, rule);
    if (resp.isMoreRuby) {
      return this.sendMessage('room/createReply', {ok: false, info: TianleErrorCode.goldInsufficient}, playerRouteKey);
    }
    if (resp.isUpper) {
      return this.sendMessage('room/createReply', {ok: false, info: TianleErrorCode.goldIsHigh}, playerRouteKey);
    }

    try {
      const gameChannel = await this.connection.createChannel()
      const roomQueueReply = await gameChannel.assertQueue(`${this.gameName}.${room._id}`, {
        durable: false,
        autoDelete: true
      })
      await gameChannel.bindQueue(roomQueueReply.queue, 'exGameCenter', `${this.gameName}.${room._id}`)
      const roomProxy = new RoomProxy(room,
        {
          redisClient: this.redisClient,
          gameChannel,
          gameQueue: roomQueueReply,
          cluster: this.cluster,
        }, this.gameName)
      const playerRmqProxy = new PlayerRmqProxy(
        {...playerModel, _id: messageBody.from, ip: messageBody.ip},
        gameChannel,
        this.gameName
      )
      const category = await GameCategory.findOne({_id: room.rule.ro.categoryId}).lean();
      let cardTableId = -1;

      // 获取用户称号
      const playerCardTable = await PlayerCardTable.findOne({playerId: playerModel._id, isUse: true});
      if (playerCardTable && (playerCardTable.times === -1 || playerCardTable.times > new Date().getTime())) {
        cardTableId = playerCardTable.propId;
      }

      await playerRmqProxy.sendMessage('room/createReply', {ok: true, data: {_id: room._id, rule: room.rule, category, cardTableId}})

      if (room.rule.ro.gameType === GameType.xmmj) {
        room.fanShuMap[playerRmqProxy._id] = 16;
      }

      if (room.ownerId.toString() === playerRmqProxy._id.toString()) {
        await roomProxy.joinAsCreator(playerRmqProxy);
      } else {
        await room.join(playerRmqProxy);
      }

      // 第一次进房间,保存信息
      await saveRoomInfo(room._id, messageBody.payload.gameType, room.clubId);
      await saveRoomDetail(room._id, JSON.stringify(room.toJSON()));
      await service.roomRegister.saveNewRoomRecord(room, messageBody.payload.gameType, playerModel, rule);
      await this.redisClient.saddAsync('room', room._id);
      await service.roomRegister.putPlayerInGameRoom(messageBody.from, this.gameName, room._id, room.rule.ro.playerCount);
      await this.redisClient.saddAsync(`cluster-${this.cluster}`, room._id);
      await this.redisClient.setAsync('room:info:' + room._id, JSON.stringify(room.toJSON()));
    } catch (e) {
      logger.error('create room error', e)
    }
  }

  async createPrivateRoom(playerModel, messageBody) {
    const playerRouteKey = `user.${messageBody.from}.${this.gameName}`

    // 创建规则(红包规则等)
    const rule = await this.lobby.normalizeRule(messageBody.payload.rule)

    const roomId = await this.redisClient.lpopAsync('roomIds')
    if (!roomId) {
      this.sendMessage('room/createReply', {ok: false, info: TianleErrorCode.roomInvalid}, playerRouteKey);
      return
    }

    // 创建规则(红包规则等)
    const room = await this.lobby.createRoom(false, Number(roomId), rule)
    room.ownerId = messageBody.from
    try {
      const gameChannel = await this.connection.createChannel()
      const roomQueueReply = await gameChannel.assertQueue(`${this.gameName}.${room._id}`, {
        durable: false,
        autoDelete: true,
      })
      await gameChannel.bindQueue(roomQueueReply.queue, 'exGameCenter', `${this.gameName}.${room._id}`)

      const roomProxy = new RoomProxy(room,
        {
          redisClient: this.redisClient,
          gameChannel,
          gameQueue: roomQueueReply,
          cluster: this.cluster,
        }, this.gameName)

      const theCreator = new PlayerRmqProxy(
        {...playerModel, _id: messageBody.from, ip: messageBody.ip},
        gameChannel,
        this.gameName
      )

      // const category = await GameCategory.findOne({_id: room.rule.ro.categoryId}).lean();
      let cardTableId = -1;

      // 获取用户称号
      const playerCardTable = await PlayerCardTable.findOne({playerId: playerModel._id, isUse: true});
      if (playerCardTable && (playerCardTable.times === -1 || playerCardTable.times > new Date().getTime())) {
        cardTableId = playerCardTable.propId;
      }

      await theCreator.sendMessage('room/createReply', {ok: true, data: {_id: room._id, rule: room.rule, cardTableId}})

      // 创建者即庄家，设置底分16分
      if (room.rule.ro.gameType === GameType.xmmj) {
        room.fanShuMap[theCreator._id] = 16;
      }

      await roomProxy.joinAsCreator(theCreator)
      // 第一次进房间,保存信息
      await saveRoomInfo(room._id, messageBody.payload.gameType, room.clubId)
      await saveRoomDetail(room._id, JSON.stringify(room.toJSON()))
      await service.roomRegister.saveNewRoomRecord(room, messageBody.payload.gameType, playerModel, rule);
      await this.redisClient.saddAsync('room', room._id)
      await service.roomRegister.putPlayerInGameRoom(messageBody.from, this.gameName, room._id, room.rule.ro.playerCount)
      await this.redisClient.saddAsync(`cluster-${this.cluster}`, room._id)
      await this.redisClient.setAsync('room:info:' + room._id, JSON.stringify(room.toJSON()))
    } catch (e) {
      logger.error('create room error', e)
    }
  }
}

export class BackendProcessBuilder {
  private dataBaseUrl: string = config.database.url;
  private rabbitMqServer: string = config.rabbitmq.url;
  private gameName: string
  private cluster: string
  private recoverPolicier: (anyObj) => boolean = alwaysOk
  private Lobby: any
  private roomRecover: recoverFunc

  connectToMongodb(mongodbUrl: string) {
    this.dataBaseUrl = mongodbUrl
    return this
  }

  connectRabbitMq(rmqServer: string) {
    this.rabbitMqServer = rmqServer
    return this
  }

  withGameName(gameName: any) {
    this.gameName = gameName
    return this
  }

  withClusterName(cluster: string) {
    this.cluster = cluster
    return this
  }

  useRoomRecoverPolicy(policier: (anyObj) => boolean) {
    this.recoverPolicier = policier
    return this
  }

  useLobby(Lobby) {
    this.Lobby = Lobby
    return this
  }

  useRecover(recover: recoverFunc) {
    this.roomRecover = recover
    return this
  }

  build(): BackendProcess {

    const process = new BackendProcess({
      dataBaseUrl: this.dataBaseUrl,
      rabbitMqServer: this.rabbitMqServer,
      gameName: this.gameName,
      Lobby: this.Lobby,
      cluster: this.cluster,
    })
    process.recoverPolicy = this.recoverPolicier
    process.roomRecover = this.roomRecover

    return process
  }
}

const logger = new winston.Logger({
  transports: [new winston.transports.Console()]
})

const instanceId = process.env.INSTANCE_ID

if (!instanceId) {
  console.error('process.env.INSTANCE_ID must not be empty')
  process.exit(-1)
} else {
  console.log('run with instance_id id', instanceId)
}

process.on('unhandledRejection', error => {
  console.error('unhandledRejection', error)
})

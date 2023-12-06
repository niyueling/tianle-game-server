import * as rabbitMq from 'amqplib'
import {Channel, Connection} from 'amqplib'
import * as winston from 'winston'
import * as config from "./config";
import Database from './database/database'
import ClubMember from "./database/models/clubMember"
import {saveRoomDetail} from "./database/models/roomDetail";
import {saveRoomInfo} from "./database/models/roomInfo";
import {GameTypes} from "./match/gameTypes"
import {IMessageEmitter, IMessageGroupEmitter, Message, toBuffer} from "./match/messageBus";
import {RabbitQueueMessageSource} from "./match/messageBus/RabbitQueueSource";
import {PlayerRmqProxy} from "./match/PlayerRmqProxy"
import RoomProxy, {recoverFunc} from "./match/roomRmqProxy"
import {ContestConfig, Tournament} from "./match/Tournament"
import {getClubInfo, requestToAllClubMember} from "./player/message-handlers-rmq/club"
import {service} from "./service/importService";
import createClient from "./utils/redis";

const alwaysOk = () => true

export class BackendProcess {

  dataBaseUrl: string
  rabbitMqServer: string
  gameName: GameTypes
  cluster: string
  private redisClient: any
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
    return this.redisClient.smembersAsync(`cluster-${this.cluster}`)
  }

  async getContestIdsToRecover(): Promise<string[]> {
    return this.redisClient.smembersAsync(`cluster-contest-${this.cluster}`)
  }

  sendMessage(name: string, message: any, playerRouteKey: string) {
    this.lobbyChannel.publish('userCenter', playerRouteKey, toBuffer({payload: message, name}))
  }

  async execute() {
    // @ts-ignore
    await Database.connect(this.dataBaseUrl, config.database.opt)
    this.connection = await rabbitMq.connect(this.rabbitMqServer)
    this.lobbyChannel = await this.connection.createChannel()
    // 子游戏大厅
    const lobbyQueueName = `${this.gameName}Lobby`
    const tournamentQueueName = `${this.gameName}Tournament`
    const dealQuestionQueueName = `${this.gameName}DealQuestion`
    await this.lobbyChannel.assertQueue(lobbyQueueName, {durable: false})
    await this.lobbyChannel.assertQueue(tournamentQueueName, {durable: false})
    await this.lobbyChannel.assertQueue(dealQuestionQueueName, {durable: false})
    await this.lobbyChannel.assertExchange('exGameCenter', 'topic', {durable: false})
    await this.lobbyChannel.assertExchange('exTournament', 'topic', {durable: false})
    await this.lobbyChannel.assertExchange('exClubCenter', 'topic', {durable: false})
    await this.lobbyChannel.assertExchange('userCenter', 'topic', {durable: false})

    this.lobby.clubBroadcaster = {
      broadcast: async (clubId: string) => {
        const rooms = this.lobby.getClubRooms(clubId)
        const clubInfo = await getClubInfo(clubId)

        await requestToAllClubMember(this.lobbyChannel, 'newClubRoomCreated', clubId, this.gameName, {
          ok: true,
          roomInfo: rooms,
          ...clubInfo
        });
      },

      updateClubRoomInfo: async (clubId: string, roomInfo: { roomNum: string, capacity: number, current: number }) => {
        await requestToAllClubMember(this.lobbyChannel, 'club/updateClubRoom', clubId, this.gameName, roomInfo);
      }

    }
    const contestIds: string[] = await this.getContestIdsToRecover()

    await this.recoverContest(contestIds)

    const roomIds: string[] = await this.getRoomIdsToRecover()

    // 还原掉线房间
    await this.recoverRooms(roomIds)
    await this.lobbyChannel.consume(lobbyQueueName, async message => {
      const messageBody = JSON.parse(message.content.toString())
      const playerRouteKey = `user.${messageBody.from}.${this.gameName}`

      const unfinishedRoomId = await service.roomRegister.getDisconnectedRoom(messageBody.from, this.gameName);
      if (unfinishedRoomId) {
        this.sendMessage('room/join-fail', {reason: `无法创建房间,还有未结束的房间${unfinishedRoomId}`}, playerRouteKey);
        return
      }

      const playerModel = await service.playerService.getPlayerPlainModel(messageBody.from)
      if (playerModel) {
        const alreadyInRoom = await service.roomRegister.roomNumber(playerModel._id, this.gameName)
        if (alreadyInRoom) {
          this.sendMessage('room/join-fail', {reason: `您还有一个房间未打完 ${alreadyInRoom}`}, playerRouteKey);
          return
        }

        if (messageBody.payload.clubId) {
          // let clubMember = await ClubMember.findOne({club: messageBody.payload.clubId , member: playerModel._id});
          // if (!clubMember) {
          //   // 检查联盟战队
          //   clubMember = await ClubMember.findOne({
          //     unionClubShortId: club.shortId,
          //     member: playerModel._id,
          //   })
          // }
          // playerModel.clubGold = clubMember.clubGold;
          await this.createPrivateClubRoom(playerModel, messageBody, messageBody.payload.clubId)
        } else {
          if (messageBody.payload.rule.isPublic) {
            await this.joinPublicRoom(playerModel, messageBody);
          } else {
            await this.createPrivateRoom(playerModel, messageBody)
          }
        }
      } else {
        this.sendMessage('room/join-fail', {reason: `无法创建房间,非法用户信息`}, playerRouteKey);
      }
    }, {noAck: true})

    await this.lobbyChannel.consume(tournamentQueueName, async message => {

      const messageBody = JSON.parse(message.content.toString())

      console.log(`${__filename}:142 \n`, messageBody);

      if (messageBody.name === 'startTournament') {

        const {players, config: contestConfig} = messageBody.payload
        try {
          await this.startTournament(contestConfig, players.map(pId => ({_id: pId, score: 0})))
        } catch (e) {
          console.log(`${__filename}:169 \n`, e);
        }
      }

      if (messageBody.name === 'startBattle') {
        const {players, config: contestConfig} = messageBody.payload
        try {
          await this.startBattle(contestConfig, players.map(pId => ({_id: pId, score: 0})))
        } catch (e) {
          console.log(`${__filename}:169 \n`, e);
        }
      }
    }, {noAck: true})

    await this.lobbyChannel.consume(dealQuestionQueueName, async message => {

      const messageBody = JSON.parse(message.content.toString())
      const playerRouteKey = `user.${messageBody.from}.${messageBody.payload.myGameType}`

      console.log(`${__filename}:172 \n`, messageBody);

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

  async startBattle(tc: ContestConfig, players) {
    const roomId = await this.redisClient.lpopAsync('roomIds')
    const room = this.lobby.createBattleRoom(roomId, tc.rule, players)

    try {

      room.on('empty', async () => {
        await this.redisClient.decrAsync(`tc:${tc._id}`)
      })
      await this.attachRoomToBackendTopic(room)
      await this.pullPlayerIntoRoom(players, roomId)
    } catch (e) {
      logger.error('startBattleRoom error', e)
    }
  }

  async pullPlayerIntoRoom(players, roomId) {
    for (const p of players) {
      this.lobbyChannel.publish('exGameCenter', `${this.gameName}.${roomId}`, toBuffer({
        name: 'joinRoom',
        payload: {},
        from: p._id,
        ip: 'local'
      }))
    }
  }

  private async attachRoomToBackendTopic(room) {

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

    await this.redisClient.saddAsync('room', room._id)
    await this.redisClient.saddAsync(`cluster-${this.cluster}`, room._id)
    await this.redisClient.setAsync('room:info:' + room._id, JSON.stringify(room.toJSON()))
  }

  async startTournament(tc: ContestConfig, players) {
    const contestId = await this.redisClient.lpopAsync('contestIds')

    class RabbitPlayerGroupBroadcaster implements IMessageGroupEmitter {
      private channel: Channel;

      constructor(ch: Channel) {
        this.channel = ch
      }

      close(): void {
        return;
      }

      emit(message: Message, playerIds) {
        try {
          playerIds.forEach(id => {
            this.channel.publish('userCenter', `user.${id}`, toBuffer(message))
          })
          console.log('=====>', JSON.stringify(message));
          // this.channel.publish('exTournament', this.routeKey, toBuffer(message))
        } catch (e) {
          console.error('emit failed', e.stack);
        }
      }
    }

    class RabbitQueueEmitter implements IMessageEmitter {
      channel: Channel
      constructor(ch: Channel, readonly queueName: string) {
        this.channel = ch;
      }

      close(): void {
        return;
      }

      emit(message: Message) {
        try {
          this.channel.sendToQueue(this.queueName, toBuffer(message))
        } catch (e) {
          console.error(e.stack);
        }
      }
    }

    const channel: Channel = await this.connection.createChannel();

    const source = new RabbitQueueMessageSource(`tournament.${contestId}`, channel)
    const roomReporter = new RabbitQueueEmitter(channel, `tournament.${contestId}`)
    const emitter = new RabbitPlayerGroupBroadcaster(channel)

    await this.redisClient.saddAsync('contest', contestId)
    await this.redisClient.saddAsync(`cluster-contest-${this.cluster}`, contestId)
    await this.redisClient.saddAsync(`contest:${this.gameName}`, contestId)

    for (const p of players) {
      await this.redisClient.saddAsync(`contest:${contestId}`, p._id)
    }

    const tournament = new Tournament(tc)
      .withPlayers(players)
      .withMessageBus({
      source,
      emitter, roomReport: roomReporter
    })
      .withContestId(contestId)
      .withRedisClient(this.redisClient)
      .withClusterName(this.cluster)
      .withGameType(this.gameName)
      .useLobby(this.startTournamentRoom.bind(this))

    await tournament.start()
  }

  async startTournamentRoom(players, contestConfig: ContestConfig, roomReporter: IMessageEmitter, contesntId: string) {
    const roomId = await this.redisClient.lpopAsync('roomIds')

    const room = this.lobby.createTournamentRoom(roomId, contestConfig.rule, players, roomReporter)
    room.contestId = contesntId
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
      await this.redisClient.setAsync('room:info:' + room._id, JSON.stringify(room.toJSON()))

      for (const p of players) {
        this.lobbyChannel.publish('exGameCenter', `${this.gameName}.${roomId}`, toBuffer({
          name: 'joinRoom',
          payload: {},
          from: p._id,
          ip: 'local'
        }))
      }

    } catch (e) {
      logger.error('create room error', e)
    }

    return roomId
  }

  async createPrivateRoom(playerModel, messageBody) {
    const playerRouteKey = `user.${messageBody.from}.${this.gameName}`

    const fee = this.lobby.roomFee(messageBody.payload.rule)

    if (config.game.useGem && playerModel.gem < fee) {
      this.sendMessage('room/join-fail', {reason: `钻石不足请充值(需要钻石${fee})`}, playerRouteKey);
      return
    }

    const roomId = await this.redisClient.lpopAsync('roomIds')
    if (!roomId) {
      this.sendMessage('room/join-fail', {reason: `服务器错误,无法创建房间 [-9]`}, playerRouteKey);
      return
    }

    // 创建规则(红包规则等)
    const rule = await this.lobby.normalizeRule(messageBody.payload.rule)
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

      theCreator.sendMessage('room/join-success', {_id: room._id, rule: room.rule})
      await roomProxy.joinAsCreator(theCreator)
      // 第一次进房间,保存信息
      await saveRoomInfo(room._id, room.gameRule.type, room.clubId)
      await saveRoomDetail(room._id, JSON.stringify(room.toJSON()))
      await this.redisClient.saddAsync('room', room._id)
      await service.roomRegister.putPlayerInGameRoom(messageBody.from, this.gameName, room._id)
      await this.redisClient.saddAsync(`cluster-${this.cluster}`, room._id)
      await this.redisClient.setAsync('room:info:' + room._id, JSON.stringify(room.toJSON()))
    } catch (e) {
      logger.error('create room error', e)
    }
  }

  async createPrivateClubRoom(playerModel, messageBody, clubId) {
    const playerRouteKey = `user.${messageBody.from}.${this.gameName}`

    const clubOwner = await this.lobby.getClubOwner(clubId)
    if (!clubOwner) {
      this.sendMessage('room/join-fail', {reason: '战队参数错误'}, playerRouteKey);
      return
    }
    const clubOwnerSocket = new PlayerRmqProxy(clubOwner, this.lobbyChannel, this.gameName)
    if (messageBody.payload.rule.clubOwnerPay && config.game.useGem) {
      if (clubOwner.gem < this.lobby.roomFee(messageBody.payload.rule)) {
        this.sendMessage('room/join-fail', {reason: '战队钻石不足 无法创建房间。'}, playerRouteKey);
        return
      }
    } else if (messageBody.payload.rule.creatorPay && config.game.useGem) {
      const fee = this.lobby.roomFee(messageBody.payload.rule)
      if (playerModel.gem < fee) {
        this.sendMessage('room/join-fail', {reason: `钻石不足请充值(个人房需要钻石${fee})`}, playerRouteKey);
        return
      }
    }

    const roomId = await this.redisClient.lpopAsync('roomIds')
    if (!roomId) {
      this.sendMessage('room/join-fail', {reason: '服务器错误,无法创建房间 [-9]'}, playerRouteKey);
      return
    }

    const rule = await this.lobby.normalizeRule(messageBody.payload.rule)

    const room = await this.lobby
      .createClubRoom(false, Number(roomId), rule, clubId, clubOwnerSocket);
    room.ownerId = messageBody.from

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
      const theCreator = new PlayerRmqProxy(
        {...playerModel, _id: messageBody.from, ip: messageBody.ip},
        gameChannel,
        this.gameName
      )
      theCreator.sendMessage('room/join-success', {_id: room._id, rule: room.rule})
      await roomProxy.joinAsCreator(theCreator)
      // 第一次进房间,保存信息
      await saveRoomInfo(room._id, room.gameRule.type, room.clubId)
      await saveRoomDetail(room._id, JSON.stringify(room.toJSON()))
      await this.redisClient.saddAsync('room', room._id)
      await service.roomRegister.putPlayerInGameRoom(messageBody.from, this.gameName, room._id)

      await this.redisClient.saddAsync(`cluster-${this.cluster}`, room._id)
      await this.redisClient.setAsync('room:info:' + room._id, JSON.stringify(room.toJSON()))

      const clubInfo = await getClubInfo(clubId)

      await requestToAllClubMember(gameChannel, 'newClubRoomCreated', clubId, this.gameName, clubInfo)
    } catch (e) {
      logger.error('create room error', e)
    }
  }

  private async recoverContest(contestIds: string[]) {
    for (const id of contestIds) {
      try {
        const jsonString = await this.redisClient.getAsync(`contest:info:${id}`)
        if (jsonString) {
          const contestJson = JSON.parse(jsonString)
          class RabbitPlayerGroupBroadcaster implements IMessageGroupEmitter {
            private channel: Channel;

            constructor(ch: Channel) {
              this.channel = ch
            }

            close(): void {
              return;
            }

            emit(message: Message, playerIds) {
              try {
                playerIds.forEach(playerId => {
                  this.channel.publish('userCenter', `user.${playerId}`, toBuffer(message))
                })

                console.log('=====>', JSON.stringify(message));
                // this.channel.publish('exTournament', this.routeKey, toBuffer(message))
              } catch (e) {
                console.error('recover emit failed', e.stack);
              }
            }
          }

          class RabbitQueueEmitter implements IMessageEmitter {
            channel: Channel;
            constructor(ch: Channel, readonly queueName: string) {
              this.channel = ch;
            }

            close(): void {
              return;
            }

            emit(message: Message) {
              try {

                this.channel.sendToQueue(this.queueName, toBuffer(message))
              } catch (e) {
                console.error('RabbitQueueEmitter emit failed', e.stack);
              }
            }
          }
          const channel: Channel = await this.connection.createChannel();
          const tournament = Tournament.recover(contestJson)

          const source = new RabbitQueueMessageSource(`tournament.${tournament.contestId}`, channel)
          const roomReporter = new RabbitQueueEmitter(channel, `tournament.${tournament.contestId}`)
          const emitter = new RabbitPlayerGroupBroadcaster(channel)
          tournament.withMessageBus({
            source,
            emitter, roomReport: roomReporter
          }).withRedisClient(this.redisClient)
            .withGameType(this.gameName)
            .useLobby(this.startTournamentRoom.bind(this))
          const needRecoverRoomIds = tournament.getCurrentRoomIds()
          await this.recoverContestRooms(needRecoverRoomIds, roomReporter)
          await tournament.listenRoom()
        }
      } catch (e) {
        logger.error('contest recover failed', id, e)
      }
    }
  }

  private async recoverContestRooms(roomIds: string[], roomReporter: IMessageEmitter) {
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

          roomProxy.room.emitter = roomReporter

          this.lobby.listenRoom(roomProxy.room)
        }
      } catch (e) {
        logger.error('room recover failed', id, e)
      }
    }
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
          if (roomProxy.room.clubMode) {
            this.lobby.listenClubRoom(roomProxy.room)
          }
        }
      } catch (e) {
        logger.error('room recover failed', id, e)
      }
    }
  }

  async joinPublicRoom(playerModel, messageBody) {
    const playerRouteKey = `user.${messageBody.from}.${this.gameName}`
    const roomId = await this.redisClient.lpopAsync('roomIds')
    if (!roomId) {
      this.sendMessage('room/join-fail', {reason: `服务器错误,无法创建房间 [-9]`}, playerRouteKey);
      return
    }
    // 创建规则(红包规则等)
    const rule = await this.lobby.normalizeRule(messageBody.payload.rule)
    // 检查金豆
    const resp = await this.lobby.isRoomLevelCorrect(playerModel, rule.categoryId);
    if (resp.isMoreRuby) {
      return this.sendMessage('room/join-fail', {reason: '您的豆豆不足，无法进入游戏'}, playerRouteKey);
    }
    if (resp.isUpper) {
      return this.sendMessage('room/join-fail', {reason: '您的豆豆足够到高级的房间游戏啦!'}, playerRouteKey);
    }
    // 局数设为 99
    rule.juShu = 99;
    const room = await this.lobby.getAvailablePublicRoom(messageBody.from, Number(roomId), rule);
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
      playerRmqProxy.sendMessage('room/join-success', {_id: room._id, rule: room.rule})
      if (room.ownerId === playerRmqProxy._id) {
        await roomProxy.joinAsCreator(playerRmqProxy)
      } else {
        await room.join(playerRmqProxy);
      }
      // 第一次进房间,保存信息
      await saveRoomInfo(room._id, room.gameRule.type, room.clubId)
      await saveRoomDetail(room._id, JSON.stringify(room.toJSON()))
      await this.redisClient.saddAsync('room', room._id)
      await service.roomRegister.putPlayerInGameRoom(messageBody.from, this.gameName, room._id)
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

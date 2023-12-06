import {GameType} from "@fm/common/constants";
import {Channel, Message, Replies} from "amqplib"
import * as winston from 'winston'
import Club from "../database/models/club";
import ClubMember from "../database/models/clubMember";
import {saveRoomDetail} from "../database/models/roomDetail";
import {delRoomInfo} from "../database/models/roomInfo";
import {service} from "../service/importService";
import {BaseGameAction} from "./base/baseGameAction";
import {GameTypes} from "./gameTypes"
import {IRoom} from "./interfaces"
import {PlayerRmqProxy} from "./PlayerRmqProxy"
import {GameAction} from "./xmmajiang/gameAction";
import Timer = NodeJS.Timer

const logger = new winston.Logger({
  level: 'debug',
  transports: [new winston.transports.Console()]
})

if (process.env.NODE_ENV === 'production') {
  logger.level = 'warn'
}

interface InBase {
  from: string,
  ip: any,
  payload: any
}

interface InJoinRoomMessage extends InBase {
  name: 'joinRoom'
}

interface InRoomReadyMessage extends InBase {
  name: 'room/ready'
}

interface InRoomNextGameMessage extends InBase {
  name: 'room/next-game'
}

interface INRoomLeaveMessage extends InBase {
  name: 'room/leave'
}

interface INRoomReconnectMessage extends InBase {
  name: 'room/reconnect'
}

interface INPipeMessage extends InBase {
  name: string,
  payload: any
}

type In_Message = InJoinRoomMessage
  | InRoomNextGameMessage
  | InRoomReadyMessage
  | INRoomLeaveMessage
  | INRoomReconnectMessage
  | INPipeMessage

function toMessageBody(buffer: Buffer): In_Message {
  return JSON.parse(buffer.toString())
}
interface RmqRoomRep {
  redisClient: any,
  gameChannel: Channel,
  gameQueue: Replies.AssertQueue,
  cluster: string,
}

export type recoverFunc = (json: any, RmqRoomRep) => Promise<IRoom>

export default class RoomProxy {

  room: IRoom
  private channel: Channel
  private gameQueue: Replies.AssertQueue
  private spinner: Timer
  private cluster: string

  static async recover(json: any, req: RmqRoomRep, gameType: GameTypes = 'paodekuai',
                       recover: recoverFunc): Promise<RoomProxy> {

    const room = await recover(json, {
      channel: req.gameChannel,
    })

    room.players.forEach(p => {
      if (p) {
        p.on('disconnect', room.disconnectCallback)
      }
    })

    const table = room.gameState
    for (const p of room.players) {
      if (table && p) {
        p.sendMessage('room/refresh', table.restoreMessageForPlayer(p))
      }
      if (p) {
        await room.broadcastRejoin(p)
      }
    }

    return new RoomProxy(room, req, gameType)
  }

  constructor(room, rabbit: RmqRoomRep, gameType: GameTypes = 'paodekuai') {
    this.room = room
    const gameName = gameType;
    this.channel = rabbit.gameChannel
    this.gameQueue = rabbit.gameQueue
    this.cluster = rabbit.cluster

    // 处理 exGameCenter topic
    this.channel.consume(this.gameQueue.queue, async (message: Message) => {
      try {
        const messageBody = toMessageBody(message.content)
        const cls = getActionClass(gameType);
        const methodName = cls.getMethodName(messageBody.name);
        if (methodName) {
          console.log(`${room._id}: call ${messageBody.name}, payload ${JSON.stringify(messageBody.payload)}`)
          const instance = new cls(this.room);
          const playerState = instance.getPlayerState(messageBody.from);
          return instance[methodName](playerState, messageBody.payload);
        }
        console.log(`============== roomId: ${room._id} - ${messageBody.name} ==============`)
        if (messageBody.name === 'joinRoom') {
          const playerModel = await service.playerService.getPlayerPlainModel(messageBody.from)

          if (!playerModel) {
            logger.error('the player not exists', messageBody)
          }

          const newPlayer = new PlayerRmqProxy({
            ...playerModel,
            _id: messageBody.from,
            ip: messageBody.ip
          }, this.channel, gameName)

          if (!playerModel) {
            newPlayer.sendMessage('room/join-fail', {reason: '未知的用户信息'})
            return
          }
          if (room.gameRule.share || room.gameRule.winnerPay) {
            // aa 或者，赢家支付
            const fee = room.constructor.roomFee(room.game.rule)
            if (playerModel.gem < fee) {
              newPlayer.sendMessage('room/join-fail', {reason: '钻石不足 无法加入房间。'})
              return
            }
          }
          if (room.gameRule.useClubGold) {
            let clubMember = await ClubMember.findOne({club: room.clubId, member: messageBody.from});
            if (!clubMember) {
              // 检查联盟的战队
              const club = await Club.findById(room.clubId);
              if (!club) {
                return newPlayer.sendMessage('room/join-fail', { reason: '房间不存在' });
              }
              clubMember = await service.club.getUnionMember(club.shortId, messageBody.from);
            }
            if (!clubMember) {
              return newPlayer.sendMessage('room/join-fail', { reason: '房间不存在' });
            }
            newPlayer.model.clubGold = clubMember.clubGold;
          }

          const alreadyInRoom = await service.roomRegister.roomNumber(messageBody.from, gameName)

          if (alreadyInRoom && alreadyInRoom !== room._id) {
            newPlayer.sendMessage('room/join-fail', {reason: `您还有一个房间未打完 ${alreadyInRoom}`})
            return
          }

          if (room.canJoin(newPlayer)) {
            newPlayer.sendMessage('room/join-success', {_id: room._id, rule: room.rule, clubShortId: room.clubShortId})
            await room.join(newPlayer)
            await service.roomRegister.putPlayerInGameRoom(messageBody.from, gameName, room._id)
          } else {
            newPlayer.sendMessage('room/join-fail', {reason: '房间已满!'})
            return
          }
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }
        if (messageBody.name === 'dissolveClubRoom') {
          const r = await room.clubOwnerdissolve()
          if (r.ok) {
            this.channel.publish('userCenter', `user.${messageBody.from}.${gameName}`,
              new Buffer(JSON.stringify({payload: {info: `房间【${r.roomNum}】已解散`}, name: 'sc/showInfo'})))
            // 解散成功
            this.channel.publish('userCenter', `user.${messageBody.from}.${gameName}`,
              new Buffer(JSON.stringify({payload: {info: `房间【${r.roomNum}】已解散`}, name: 'sc/dissolveSuccess'})))
          } else {
            this.channel.publish('userCenter', `user.${messageBody.from}.${gameName}`,
              new Buffer(JSON.stringify({payload: {info: `房间【${r.roomNum}】游戏已经开始，无法解散`}, name: 'sc/showInfo'})))
          }
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }
        if (messageBody.name === 'specialDissolve') {
          const r = await room.specialDissolve()
          if (r.ok) {
            this.channel.publish('userCenter', `user.${messageBody.from}.${gameName}`,
              new Buffer(JSON.stringify({payload: {info: `房间【${r.roomNum}】已解散`}, name: 'sc/showInfo'})))
            // 解散成功
            this.channel.publish('userCenter', `user.${messageBody.from}.${gameName}`,
              new Buffer(JSON.stringify({payload: {info: `房间【${r.roomNum}】已解散`}, name: 'sc/dissolveSuccess'})))
          } else {
            this.channel.publish('userCenter', `user.${messageBody.from}.${gameName}`,
              new Buffer(JSON.stringify({payload: {info: `房间【${r.roomNum}】解散失败`}, name: 'sc/showInfo'})))
          }
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        const thePlayer: PlayerRmqProxy = room.getPlayerById(messageBody.from)
        if (messageBody.name === 'forceDissolve') {
          room.forceDissolve();
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/ready') {
          room.ready(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/creatorStartGame') {
          room.creatorStartGame(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/next-game') {
          await room.nextGame(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/updatePosition') {
          room.updatePosition(thePlayer, messageBody.payload.position)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/leave') {
          if (room.leave(thePlayer)) {

            await service.roomRegister.removePlayerFromGameRoom(messageBody.from, gameName)

            thePlayer.sendMessage('room/leave-success', {_id: room._id})
            await this.tryBestStore(rabbit.redisClient, room)
            return
          }
          thePlayer.sendMessage('room/leave-fail', {_id: room._id})
          return
        }

        if (messageBody.name === 'room/reconnect') {
          const playerModel = await service.playerService.getPlayerPlainModel(messageBody.from);
          if (!playerModel) {
            logger.error('the player not exists', messageBody)
            return
          }

          // if (room.rule.ro.useClubGold) {
            // const clubMember = await ClubMember.findOne({club: room.clubId, member: messageBody.from});
            // playerModel.clubGold = clubMember.clubGold;
          // }

          const newPlayer = new PlayerRmqProxy({
            ...playerModel,
            _id: messageBody.from,
            ip: messageBody.ip
          }, this.channel, gameName)
          newPlayer.sendMessage('room/reconnectReply', {errorCode: 0, _id: room._id, rule: room.rule})
          await room.reconnect(newPlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/dissolveReq') {
          room.onRequestDissolve(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }
        if (messageBody.name === 'room/addShuffle') {
          room.addShuffle(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/AgreeDissolveReq') {
          room.onAgreeDissolve(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/DisagreeDissolveReq') {
          room.onDisagreeDissolve(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/dissolve') {
          room.dissolve(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'room/buildInChat') {
          messageBody.payload.index = this.room.indexOf(thePlayer) || 0
          this.room.broadcast(messageBody.name, messageBody.payload)
          return
        }

        if (messageBody.name === 'room/sound-chat') {
          messageBody.payload.index = this.room.indexOf(thePlayer) || 0
          this.room.broadcast(messageBody.name, messageBody.payload)
          return
        }

        if (messageBody.name === 'room/openRedPocket') {
          this.room.openRedPocket(thePlayer)
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'game/exchangeLiveGift') {
          // 兑换复活礼包
          await this.room.exchangeLiveGift(thePlayer, messageBody.payload);
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }

        if (messageBody.name === 'game/blessByGem') {
          await room.blessByGem(thePlayer, messageBody.payload);
          await this.tryBestStore(rabbit.redisClient, room)
          return
        }
        console.log('get other message', messageBody.name, messageBody.payload, thePlayer ? '' : 'no the player');
        if (thePlayer) {
          // playerRmqProxy 通知 playerSocket
          thePlayer.emit(messageBody.name, messageBody.payload)
        } else {
          console.error('no the player for message body', messageBody)
        }

        await this.tryBestStore(rabbit.redisClient, room)
      } catch (e) {
        logger.error('handel message error', e, message.content.toString())
      }
    }, {
      noAck: true,
    })
      .then(({consumerTag}) => {
        // 定时设置房间号
        rabbit.redisClient.setexAsync(`room:${room._id}`, 10, new Date().toTimeString())
        this.spinner = setInterval(() => {
          rabbit.redisClient.setexAsync(`room:${room._id}`, 3, new Date().toTimeString())
        }, 2000)

        this.room.on('leave', async ({_id}) => {
          try {
            await service.roomRegister.removePlayerFromGameRoom(_id, gameType)
          } catch (e) {
            logger.error('removePlayerFromGameRoom', _id, e)
          }
        })

        this.room.once('empty', async () => {
          logger.info('room ', room._id, 'spinner clean')
          if (room.robotManager) {
            // 通知机器人解散
            room.robotManager.gameOver();
            room.robotManager = null;
          }
          logger.info('room', room.playersOrder.filter(p => p).forEach(({_id}) => {
            service.roomRegister.removePlayerFromGameRoom(_id, gameType)
          }))

          clearInterval(this.spinner)
          await this.deleteRoomInfo(rabbit.redisClient, room)

          try {
            await this.channel.cancel(consumerTag)
            await this.channel.close()
          } catch (e) {
            logger.error('channel close failed', e)
          }

          await rabbit.redisClient.rpushAsync('roomIds', room._id)
        })

        this.room.on('qiangLongTou', async () => {
          await this.tryBestStore(rabbit.redisClient, room)
        })
      }, () => {
        return rabbit.redisClient.rpushAsync('roomIds', room._id)
      })
  }

  private async deleteRoomInfo(redis, room) {
    try {
      await redis.sremAsync(`cluster-${this.cluster}`, room._id)
      await redis.delAsync('room:info:' + room._id)
      await redis.delAsync(`room:${room._id}`)
      await redis.sremAsync(`room`, room._id)
      // 房间解散了
      await delRoomInfo(room._id);
    } catch (e) {
      logger.error(`del room ${room._id} failed with `, e)
    }
  }

  private async tryBestStore(redis, room) {
    try {
      await redis.setAsync('room:info:' + room._id, JSON.stringify(room.toJSON()))
      await saveRoomDetail(room._id, JSON.stringify(room.toJSON()))
    } catch (e) {
      logger.error(`store room ${room._id} failed with `, e)
    }

  }

  canJoin(player: PlayerRmqProxy) {

    if (this.room.isFull(player)) {
      player.sendMessage('room/join-fail', {reason: '房间人数已满, 请重新输入房间号'})
      return false
    }

    return true
  }

  async joinAsCreator(theCreator: PlayerRmqProxy) {
    await this.room.join(theCreator)
    this.room.creator = theCreator
    this.room.creatorName = theCreator.model.name;
  }
}

function getActionClass(gameType) {
  if (gameType === GameType.xmmj) {
    return GameAction;
  }
  return BaseGameAction;
}

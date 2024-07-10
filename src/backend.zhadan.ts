import {GameType} from "@fm/common/constants";
import {hostname} from "os"
import * as winston from "winston"
import {BackendProcessBuilder} from "./backendProcess"
import * as config from "./config"
import ZhadanLobby from "./match/zhadan/centerlobby"
import {PublicRoom} from "./match/zhadan/publicRoom";
import Room from "./match/zhadan/room"
import {BattleRoom, TournamentRoom} from "./match/zhadan/TournamentRoom"

process.on('unhandledRejection', error => {
  // @ts-ignore
  console.error('unhandledRejection', error.stack)
})

const logger = new winston.Logger({
  transports: [new winston.transports.Console()]
})

const instanceId = process.env.INSTANCE_ID

if (!instanceId) {
  console.error('process.env.INSTANCE_ID can NOT be empty')
  process.exit(-1)
} else {
  logger.info('run with instance_id id', instanceId)
}

async function boot() {
  const cluster = `${hostname()}-zhadan-${instanceId}`

  const process = new BackendProcessBuilder()
    .withGameName(GameType.zd)
    .withClusterName(cluster)
    .connectToMongodb(config.database.url)
    .connectRabbitMq(config.rabbitmq.url)
    .useRoomRecoverPolicy(anyJson => anyJson)
    .useRecover(async (anyJson, repository) => {
      if (anyJson.roomType === BattleRoom.RoomType) {
        return BattleRoom.recover(anyJson, repository)
      }
      if (anyJson.roomType === TournamentRoom.RoomType) {
        return TournamentRoom.recover(anyJson, repository)
      }
      if (anyJson.gameRule.isPublic) {
        return PublicRoom.recover(anyJson, repository)
      }
      return Room.recover(anyJson, repository)
    })
    .useLobby(new ZhadanLobby())
    .build()

  await process.execute()
}

boot()
  .then(() => {
    logger.info('backend start with pid', process.pid)
  })
  .catch(error => {
    console.error(`boot backend zhadan error`, error.stack)
  })

import {GameType} from "@fm/common/constants";
import {hostname} from "os"
import * as winston from "winston"
import {BackendProcessBuilder} from "./backendProcess"
import * as config from "./config"
import MaJiangLobby from "./match/xueliu/centerlobby"
import {PublicRoom} from "./match/xueliu/publicRoom";
import Room from './match/xueliu/room'

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

const gameName = GameType.xueliu

async function boot() {
  const cluster = `${hostname()}-${gameName}-${instanceId}`

  const process = new BackendProcessBuilder()
    .withGameName(gameName)
    .withClusterName(cluster)
    .connectToMongodb(config.database.url)
    .connectRabbitMq(config.rabbitmq.url)
    .useRoomRecoverPolicy(() => true)
    .useRecover(async (anyJson, repository) => {
      if (anyJson.gameRule.isPublic) {
        return PublicRoom.recover(anyJson, repository)
      }
      return Room.recover(anyJson, repository)
    })
    .useLobby(new MaJiangLobby())
    .build()

  await process.execute()
}

boot()
  .then(() => {
    logger.info('backend start with pid', process.pid)
  })
  .catch(error => {
    console.error(`boot backend ${gameName} error`, error.stack)
  })

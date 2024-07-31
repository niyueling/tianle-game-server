import {hostname} from "os"
import * as winston from "winston"
import {BackendProcessBuilder} from "./backendProcess"
import DouDiZhuLobby from "./match/doudizhu/centerlobby"
import Room from "./match/doudizhu/room"
import * as config from "./config"
import {GameType} from "@fm/common/constants";
import {PublicRoom} from "./match/doudizhu/publicRoom";


process.on('unhandledRejection', error => {
  // @ts-ignore
  console.error('unhandledRejection', error.stack)
})

const logger = new winston.Logger({
  transports: [new winston.transports.Console()]
})

const instance_id = process.env.INSTANCE_ID

if (!instance_id) {
  console.error('process.env.INSTANCE_ID can NOT be empty')
  process.exit(-1)
} else {
  logger.info('run with instance_id id', instance_id)
}

const gameName = GameType.ddz

async function boot() {
  const cluster = `${hostname()}-${gameName}-${instance_id}`

  const process = new BackendProcessBuilder()
    .withGameName(GameType.ddz)
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
    .useLobby(new DouDiZhuLobby)
    .build()

  await process.execute()
}


boot()
  .then(() => {
    logger.info('backend start with pid', process.pid)
  })
  .catch(error => {
    console.error(`boot backend paodekuai error`, error.stack)
  })

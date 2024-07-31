import {hostname} from "os"
import * as winston from "winston"
import {BackendProcessBuilder} from "./backendProcess"
import ShiSanShuiLobby from "./match/shisanshui/centerLobby"
import Room from "./match/shisanshui/room"
import * as config from "./config"
import {GameType} from "@fm/common/constants";

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

async function boot() {
  const cluster = `${hostname()}-shisanshui-${instance_id}`

  const process = new BackendProcessBuilder()
    .withGameName(GameType.sss)
    .withClusterName(cluster)
    .connectToMongodb(config.database.url)
    .connectRabbitMq(config.rabbitmq.url)
    .useRoomRecoverPolicy((json) => json)
    .useRecover(Room.recover)
    .useLobby(new ShiSanShuiLobby())
    .build()

  await process.execute()
}


boot()
  .then(() => {
    logger.info('backend start with pid', process.pid)
  })
  .catch(error => {
    console.error(`boot backend shisanshui error`, error.stack)
  })

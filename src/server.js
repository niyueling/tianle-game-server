/**
 *
 * Created by user on 2016-07-02.
 */
import * as express from 'express';
import * as http from 'http';
import * as ws from 'ws';
import * as logger from 'winston';
import * as Promise from 'promise';
import * as cors from 'cors';
import * as bodyParser from 'body-parser';
import listeners from './network/listeners';
import Database from './database/database';
import * as config from './config';
import api from './api'
import * as rabbitMq from 'amqplib'
import PlayerManager from "./player/player-manager";
import createClient from "./utils/redis";
import {initPlayerShortId} from "./database/init";
import {service} from "./service/importService";
import {GameTypeList} from "@fm/common/constants";

logger.level = config.logger.level || 'info';
if (config.logger.filename) {
  logger.add(logger.transports.File, {filename: config.logger.filename});
}

const app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))

// start http.
function startHttpServer(callback) {
  const server = new http.Server(app);

  app.get('/', (req, res) => (
    res.send('<h1>Hello world!</h1>')
  ));

  app.use(cors({
    origin: '*',
  }));
  app.use('/public', express.static(`${__dirname}/../public`));

  const port = config.http.port;
  server.listen(port, '::', () => {
    logger.info(`listening on *:${port}`);
    callback();
  });
}

// start websocket.
function startWebSocketServer(callback) {
  const WebSocketServer = ws.Server;
  const port = config.websocket.port;
  const wss = new WebSocketServer({host: '::', port}, callback);
  wss.on('connection', listeners.onConnect);
}

const httpPromise = Promise.denodeify(startHttpServer)();

const websocketPromise = Promise.denodeify(startWebSocketServer)();

const databasePromise = Database.connect(config.database.url, config.database.opt);

const injectRabbitMq = async () => {
  const connection = await rabbitMq.connect(config.rabbitmq.url)
  PlayerManager.injectRmqConnection(connection)
}


async function resetWebSocketStatistic() {

  const redis = createClient()

  const batch = redis.BATCH()
  for (const name in GameTypeList) {
    batch.set(`gameCounter.${name}`, '0');
  }

  await batch.execAsync()
  // 只有一个 redis 连接,不允许断开
  // await redis.quitAsync()
}

databasePromise.then(() => {
  initPlayerShortId();
});
app.startPromise = Promise.all([databasePromise, resetWebSocketStatistic(), httpPromise, websocketPromise,
  injectRabbitMq(), service.roomRegister.initPublicRoomCount(), service.utils.listenFromAdminByGame(),
])
  .catch((e) => {
      logger.error('======>!  '+e)
      process.exit(1)
    }
  );


app.use(api)

export default app;

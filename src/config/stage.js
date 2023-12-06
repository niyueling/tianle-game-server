module.exports = {
  gameName: "niuniu",
  database: {
    url: "mongodb://localhost:27017/mahjongStage",
    // mongo 选项
    opt: {
      reconnectTries: Number.MAX_VALUE,
      // 重连间隔5s
      reconnectInterval: 5000,
      // 60s
      connectTimeoutMS: 60000,
    }
  },
  rabbitmq: {
    url: "amqp://user:password@localhost:5672"
  },
  openWechat: {
    weChatId: "wx886eac3f2b8b0207",
    weChatSecret: "63b4af0b27ac3706e2c7bac600f85f62",
    name: "PC"
  },
  // 本地开发使用不同的 db
  redis: {
    port: 6379,
    host: "localhost",
  },
  extKKey: "0a06ae02-5594-40ec-9979-a278c0f7ae66",
  http: {
    port: 3001
  },
  websocket: {
    port: 9527
  },
  gmTool: {
    "port": 9528,
    "jwt": {
      "secret": "secret"
    },
    "superAccounts": [
      {
        "username": "super",
        "password": "super"
      }
    ],
    recharge: {
      kickback: 0.25,
      kickback2: 0.2
    },
    server: {
      api: "http://localhost:3001"
    },
    allowOrigin: [
      "http://localhost:3003"
    ]
  },
  logger: {
    "level": "debug"
  },
  debug: {
    "message": true
  },
  game: {
    isBoomCard: false,
    // 掉线以后推迟出牌的时间(秒)
    offlineDelayTime: 1,
    // 出牌等待时间(秒)
    waitDelayTime: 1,
  }
}

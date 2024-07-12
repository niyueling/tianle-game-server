module.exports = {
  database: {
    url: "mongodb://172.19.148.251:27017/tianleServer",
    opt: {
      reconnectTries: 100,
      reconnectInterval: 5000,
      connectTimeoutMS: 60000,
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },
  websocket: {
    "port": 9597
  },
  logger: {
    "filename": "mahjong.log"
  },
  rabbitmq: {
    url: "amqp://user:password@localhost:5692"
  },
  redis: {
    port: 8389,
    host: "localhost",
    password: "8fkaetmR@@@@"
  },
  debug: {
    "message": false
  }
}

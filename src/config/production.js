module.exports = {
  database: {
    url: "mongodb://localhost:27017/mahjong"
  },
  websocket: {
    "port": 9527
  },
  logger: {
    "filename": "mahjong.log"
  },
  rabbitmq: {
    url: "amqp://user:password@localhost:5672"
  },
  redis: {
    port: 6379,
    host: "localhost",
  },
  debug: {
    "message": false
  },
  "gmTool": {
    "port": 9528,
    "superAccounts": [
      {
        "username": "super",
        "password": "qq42833131"
      }
    ],
    "allowOrigin": [
      "http://admin.xiexiangwangluo.com"
    ]
  }
}

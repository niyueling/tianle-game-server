module.exports = {
  database: {
    "url": "mongodb://localhost:27017/tianleServer",
  },
  "websocket": {
    "port": 9597
  },
  rabbitmq: {
    url: "amqp://user:password@localhost:5692"
  },
  redis: {
    "port": 8389,
    "host": "localhost",
    "password": "8fkaetmR@@@@"
  },
  "logger": {
    "filename": "mahjong.log"
  },
  "debug": {
    "message": false
  },
  "gmTool": {
    "port": 9528,
    "superAccounts": [
      {
        "username": "super",
        "password": "super"
      }
    ],
    "allowOrigin": [
      "http://106.14.169.25"
    ]
  },
  // 厦门麻将
  xmmj: {
    // 特殊发牌
    specialCard: false,
  }
}

module.exports = {
  gameName: "niuniu",
  database: {
    url: "mongodb://192.168.124.20:27017/mahjongStage",
    opt: {
      reconnectTries: 100,
      reconnectInterval: 5000,
      connectTimeoutMS: 60000
    }
  },
  rabbitmq: {
    url: "amqp://guest:guest@localhost:5672"
  },
  openWechat: {
    weChatId: "wx886eac3f2b8b0207",
    weChatSecret: "63b4af0b27ac3706e2c7bac600f85f62",
    name: "PC"
  },
  redis: {
    "port": 6379,
    "host": "localhost",
  },
  extKey: "0a06ae02-5594-40ec-9979-a278c0f7ae66",
  http: {
    "port": 3001
  },
  websocket: {
    "port": 9527
  },
  wx: {
    "app_id": "wxe1a7858e201773c9",
    "app_secret": "40ef04587f65bc7a074bba051ef3971d",
    "mchId": "1632720964",
    "serial_no": "5D9A17286800617024A05A88C9DCACD12298D8F2",
    "token": "ulong_wechat",
    "notify_url": "http://ext1.fanmengonline.com/wechat/notify",
    "notify_url_gm": "http://ext1.fanmengonline.com/wechat/gm/notify",
    "sign_key": "YdrTlPqPXYqhOwWGaXKsqum6ZrKzKRG1",
    "plans": [
      {
        "gem": 22,
        "price": 20
      },
      {
        "gem": 56,
        "price": 50
      },
      {
        "gem": 114,
        "price": 100
      },
      {
        "gem": 236,
        "price": 200
      },
      {
        "gem": 620,
        "price": 500
      }
    ],
    "gmPlans": [
      {
        "price": 0.01,
        "gem": 1
      }
    ]
  },
  gmTool: {
    port: 9528,
    jwt: {
      "secret": "secret"
    },
    superAccounts: [
      {
        "username": "super",
        "password": "super"
      }
    ],
    recharge: {
      "kickback": 0.25,
      "kickback2": 0.2
    },
    server: {
      "api": "http://localhost:3001"
    },
    allowOrigin: [
      "http://localhost:3003"
    ]
  },
  logger: {
    level: "debug"
  },
  debug: {
    message: true
  },
  game: {
    initModelGoldCount: 0,
    luckyDrawNeedGold: 500,
    lobbyFee: 1000,
    createRoomNeedGem: 1,
    createRoomNeedGold: 0,
    initModelGemCount: 6,
    // 初始金豆数量
    initModelRuby: 50000,
    gem2GoldExchangeRate: 5000,
    prizeNeedRoomNum: 5,
    fourJokerReward: 880,
    prizeCount: 11,
    // 洗牌需要支付的房卡
    payForShuffle: 1,
    // 动画播放时间 ms
    playShuffleTime: 6000,
    // 一个炸弹计分
    boomScore: 10,
    // 是否生成炸蛋卡
    isBoomCard: false,
    // 掉线以后推迟出牌的时间(秒)
    offlineDelayTime: 5,
    // 出牌等待时间(秒)
    waitDelayTime: 5,
    // 房卡兑换金豆
    gem2RubyExchangeRate: 10000,
    // 是否扣房卡
    useGem: false,
    // 赢家保留的金豆比例
    winnerReservePrizeRuby: 0.3,
    prizeIndex2Prize: [
      {
        "type": "again",
        "count": 1
      },
      {
        "type": "gold",
        "count": 3000
      },
      {
        "type": "gold",
        "count": 5000
      },
      {
        "type": "none",
        "count": 0
      },
      {
        "type": "gold",
        "count": 500000
      },
      {
        "type": "again",
        "count": 1
      },
      {
        "type": "gold",
        "count": 1000
      },
      {
        "type": "gold",
        "count": 2000
      },
      {
        "type": "gold",
        "count": 10000
      },
      {
        "type": "none",
        "count": 0
      },
      {
        "type": "gold",
        "count": 100000
      }
    ],
    DrawProbability: [
      0.1,
      0.1,
      0.03,
      0.05,
      0,
      //0.001
      0.1,
      0.4,
      0.15,
      0,
      0.05,
      0
      //0.004
    ]
  },
}

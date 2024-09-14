module.exports = {
  gameName: "tianleGame",
  database: {
    url: "mongodb://localhost:27017/tianleServer",
    opt: {
      reconnectTries: 100,
      reconnectInterval: 5000,
      connectTimeoutMS: 60000,
    }
  },
  rabbitmq: {
    url: "amqp://user:password@localhost:5692"
  },
  openWechat: {
    weChatId: "wx886eac3f2b8b0207",
    weChatSecret: "63b4af0b27ac3706e2c7bac600f85f62",
    name: "PC"
  },
  redis: {
    "port": 8389,
    "host": "localhost",
    "password": "8fkaetmR@@@@"
  },
  extKey: "0a06ae02-5594-40ec-9979-a278c0f7ae66",
  http: {
    "port": 5001
  },
  websocket: {
    "port": 9597
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
  logger: {
    level: "debug"
  },
  debug: {
    message: true
  },
  game: {
    helpCount: 5,
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
    noviceProtection: 1,
    // 动画播放时间 ms
    playShuffleTime: 6000,
    // 一个炸弹计分
    boomScore: 10,
    // 是否生成炸蛋卡
    isBoomCard: false,
    // 掉线以后推迟出牌的时间(秒)
    offlineDelayTime: 180,
    // 出牌等待时间(秒)
    waitDelayTime: 5,
    // 等待用户加入金豆房的时间
    waitRubyPlayer: 3,
    // 结算不准备踢出时间
    waitKickOutTime: 30,
    // 房卡兑换金豆
    gem2RubyExchangeRate: 10000,
    // 是否扣房卡
    useGem: false,
    // 赢家保留的金豆比例
    winnerReservePrizeRuby: 0.3,
    // 洗牌需要支付的房卡
    payForReshuffle: 10,
    // 金豆房等待充值
    waitForRuby: 30,
    // 金豆救助次数
    rubyHelpTimes: 5,
    // 定缺牌选择等待时间
    selectModeTimes: 15,
    // 10w金豆
    rubyHelpAmount: 100000,
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
  // 厦门麻将
  xmmj: {
    // 特殊发牌
    specialCard: false,
    // 最大番数
    maxFan: 16,
    // 金牌水数
    goldShui: 1,
    // 花牌水数
    huaShui: 1,
    // 花牌一套水数
    huaSetShui: 8,
    // 八花齐水数
    allHuaShui: 16,
    // 暗刻水数
    anKeShui: 1,
    // 字牌暗刻水数
    ziAnKeShui: 2,
    // 明杠水数
    mingGangShui:2,
    // 字牌明杠水数
    ziMingGangShui: 3,
    // 暗杠水数
    anGangShui: 3,
    //字牌暗杠水数
    ziAnGangShui: 4,
    // 字牌碰水数
    ziPengShui: 1
  }
}

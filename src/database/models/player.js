'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema({
  openid: {type: String, required: false},
  unionid: {type: String, required: false},
  shortId: {type: Number, required: true},
  avatar: {type: String, required: true},
  nickname: {type: String, required: true},
  sex: {type: Number, default: 1}, // 性别
  diamond: {type: Number, default: 0}, // 钻石
  gold: {type: Number, default: 0}, // 金豆
  tlGold: {type: Number, default: 0}, // 天乐豆
  voucher: {type: Number, default: 0}, // 代金券
  juCount: {type: Number, default: 0}, // 累计局数
  juWinCount: {type: Number, default: 0}, // 胜利局数
  juContinueWinCount: {type: Number, default: 0}, // 连续胜利局数(1)
  looseMoneyBoyAmount: {type: Number, default: 0}, // 当局最高输豆数量(1)
  reapingMachineAmount: {type: Number, default: 0}, // 当局最高赢豆数量(1)
  atTheTopCount: {type: Number, default: 0}, // 封顶次数（21万倍以上）
  quackStrikeCount: {type: Number, default: 0}, // 首次胡牌就清空三个对手
  chosenOneCount: {type: Number, default: 0}, // 累计天胡次数
  pandanCount: {type: Number, default: 0}, // 累计胡四节高次数
  payVipCount: {type: Number, default: 0}, // 累计购买周卡/月卡次数
  loftyHeroicCount: {type: Number, default: 0}, // 累计对局中购买/兑换礼包次数(1)
  shopFreeGiftCount: {type: Number, default: 0}, // 领取商城免费金豆次数（1）
  boxToBoxCount: {type: Number, default: 0}, // 累计被天胡破产次数
  triumphantCount: {type: Number, default: 0}, // 单局摸到6星座牌次数(1)
  lifeIsDreamCount: {type: Number, default: 0}, // 对局中因海底捞月或者妙手回春由输转赢次数
  luckyStarCount: {type: Number, default: 0}, // 累计杠上开花次数
  noStrokeCount: {type: Number, default: 0}, // 流局次数(1)
  theMarksmanCount: {type: Number, default: 0}, // 累计对局中最先胡牌
  madButcherCount: {type: Number, default: 0}, // 累计使认输人数
  goVillageCount: {type: Number, default: 0}, // 累计对局结束破产次数（1）
  juRank: {type: Number, default: 1}, // 胜率
  redPocket: {type: Number, default: 0}, // 红包
  gangCount: {type: Number, default: 0}, // 杠牌次数
  activityTimes: {type: Number, default: 0}, // 在线时长
  turntableTimes: {type: Number, default: 10}, // 转盘次数
  consecutiveLoginDays: {type: Number, default: 1}, // 连续登陆天数
  signLoginDays: {type: Number, default: 0}, // 签到天数
  totalSignLoginDays: {type: Number, default: 0}, // 累计签到天数
  gameJuShu: {type: Object, default: {}}, // 游戏对局数
  gameUpgrade: {type: Object, default: {}}, // 游戏是否升级过场次
  sessionKey: {type: String},
  guideSteps: {type: Number, default: 1001},
  vip: {type: Number, default: 0},
  giftExpireTime: {type: Number, default: 0},//月卡有效期
  source: {type: Number, required: true, default: 1},
  helpCount: {type: Number, required: true, default: 5},
  dominateCount: {type: Number, required: true, default: 5},// 充值后给予1-5次好牌补助
  ip: {type: String},
  province: {type: String},
  city: {type: String},
  robot: {type: Boolean, default: false},
  tourist: {type: Boolean, default: false},
  isGame: {type: Boolean, default: false},// 是否正在游戏中
  gameTime: {type: Date, default: Date.now},// 游戏时间
  isBindWechat: {type: Boolean, default: false, required: true},
  createAt: {type: Date, default: Date.now},
});

schema.index({openid: 1});
schema.index({shortId: 1});
schema.index({unionid: 1});

const Player = mongoose.model('Player', schema);

export default Player

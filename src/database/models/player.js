'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema({
  openid: {type: String, required: true},
  unionid: {type: String, required: true},
  shortId: {type: Number, required: true},
  avatar: {type: String, required: true},
  nickname: {type: String, required: true},
  diamond: {type: Number, default: 0}, // 钻石
  gold: {type: Number, default: 0}, // 金豆
  juCount: {type: Number, default: 0}, // 累计局数
  juRank: {type: Number, default: 1}, // 胜率
  redPocket: {type: Number, default: 0}, // 红包
  activityTimes: {type: Number, default: 0}, // 在线时长
  turntableTimes: {type: Number, default: 20}, // 转盘次数
  consecutiveLoginDays: {type: Number, default: 1}, // 连续登陆天数
  sessionKey: {type: String},
  guideSteps: {type: Number, default: 1001},
  source: {type: Number, required: true, default: 1},
  ip: {type: String},
  province: {type: String},
  city: {type: String},
  robot: {type: Boolean, default: false},
  createAt: {type: Date, default: Date.now},
});

schema.index({openid: 1});
schema.index({shortId: 1});
schema.index({unionid: 1});

const Player = mongoose.model('Player', schema);

export default Player

'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true
  },
  // 道具ID
  propId: {
    type: Number,
    required: true
  },
  // 收费类型，1按天收费，2按次收费
  payType: {
    type: Number,
    required: true,
    default: 1
  },
  // 道具类型，1记牌器，2求签卡，3洗牌卡，4祈福卡，5局内表情，6局内道具
  propType: {
    type: Number,
    required: true,
  },
  // 子类型，祈福子类型，1财神卡，2关公卡，3老君卡，4招财猫卡
  childType: {
    type: Number,
  },
  // 按天收费的有效期
  times: {
    type: Number,
    required: true
  },
  // 按次收费的数量
  number: {
    type: Number,
    required: true
  },
  // 获得时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

schema.index({propId: 1});

const PlayerProp = mongoose.model('PlayerProp', schema);

export default PlayerProp

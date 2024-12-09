'use strict';
const mongoose = require('mongoose');

// 复活补充包
const schema = new mongoose.Schema({
  // 级别
  level: {
    type: Number,
    required: true,
  },

  // 价格
  price: {
    type: Number,
    required: true,
  },

  // 原价
  originPrice: {
    type: Number,
    required: true,
  },

  // 获得金豆
  gold: {
    type: Number,
    required: true
  },

  // 每日可领取次数
  todayReceiveLimit: {
    type: Number,
    required: true
  },

  // 最多可领取次数
  maxReceiveDayLimit: {
    type: Number,
    required: true
  },

  // 每日可领取金豆
  todayReceiveGold: {
    type: Number,
    required: true
  },
  // 游戏类型
  gameType: {
    type: String,
    required: true
  }
})

const goodsReviveSupplement = mongoose.model('goodsReviveSupplement', schema);
export default goodsReviveSupplement;

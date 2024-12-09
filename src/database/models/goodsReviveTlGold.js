'use strict';
const mongoose = require('mongoose');

// 复活礼包
const schema = new mongoose.Schema({
  // 金豆数量
  gold: {
    type: Number,
    required: true,
  },

  // 天乐币数量
  tlGold: {
    type: Number,
    required: true,
  },

  // 场次
  category: {
    type: String,
    required: true
  },

  // 游戏类型
  gameType: {
    type: String,
    required: true
  },

  // 级别
  level: {
    type: Number,
    required: true
  },
})

const GoodsReviveTlGold = mongoose.model('GoodsReviveTlGold', schema);
export default GoodsReviveTlGold;

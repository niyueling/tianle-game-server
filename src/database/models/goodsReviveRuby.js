'use strict';
const mongoose = require('mongoose');

// 复活礼包
const schema = new mongoose.Schema({
  // 钻石数量
  diamond: {
    type: Number,
    required: true,
  },
  // 兑换的金豆数量
  gold: {
    type: Number,
    required: true,
  },

  // 场次
  category: {
    type: String,
    required: true
  },
})

const GoodsReviveRuby = mongoose.model('GoodsReviveRuby', schema);
export default GoodsReviveRuby;

'use strict';
const mongoose = require('mongoose');

// 钻石兑换金豆
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
})

const GoodsExchangeRuby = mongoose.model('GoodsExchangeRuby', schema);
export default GoodsExchangeRuby;

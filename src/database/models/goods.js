'use strict';

const mongoose = require('mongoose');

// 商品表
const schema = new mongoose.Schema({
  // 商品类型
  goodsType: {
    type: Number,
    required: true,
  },
  // 数量
  amount: {
    type: Number,
    required: true,
  },
  // 安卓价格(单位分)
  price: {
    type: Number,
    required: true,
  },
  // 额外赠送
  originPrice: {
    type: Number,
    required: false,
  },
  // 是否上线
  isOnline: {
    type: Boolean,
    required: false,
  },
  // 首次购买赠送的数量
  firstTimeAmount: {
    type: Number,
    required: false,
  }
})

const GoodsModel = mongoose.model('Goods', schema);

export default GoodsModel;

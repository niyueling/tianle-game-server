const mongoose = require('mongoose');

// 商品表
const schema = new mongoose.Schema({
  //用户ID
  playerId: {
    type: String,
    required: false,
  },
  //shortId
  shortId: {
    type: Number,
    required: false,
  },
  // 钻石
  diamond: {
    type: Number,
    default: 0,
    required: true,
  },
  //金额
  price: {
    type: Number,
    required: true,
  },
  //模板ID
  goodsId: {
    type: String,
    required: true,
  },
  // 来源
  source: {
    type: String,
    required: false,
  },
  // 单号
  sn: {
    type: String,
    required: false,
  },
  // 支付状态
  status: {
    type:Number,
    default: 0
  },
  //第三方单号
  transactionId: {
    type: String,
    required: false,
  },
  // 创建时间
  created: {
    type: Date,
    default: Date.now,
  },
})

const UserRechargeOrder = mongoose.model('UserRechargeOrder', schema);
export default UserRechargeOrder;


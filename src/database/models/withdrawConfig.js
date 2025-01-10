'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema({
  amount: {type: Number},//提现金额
  limitCount: {type: Number},// 限制提现次数
  juShu: {type: Number, default: 0},// 提现需完成局数
  type: {type: Number, default: 2},// 提现类型，1允许提现，2不允许提现
  createAt: {type: Date, default: Date.now}
});

schema.index({price: 1});

const WithdrawConfig = mongoose.model('WithdrawConfig', schema);

export default WithdrawConfig

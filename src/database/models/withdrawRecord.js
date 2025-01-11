'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true
  },
  configId: {
    type: mongoose.Schema.ObjectId,
    required: false,
  },
  config: {
    type: Object,
    required: false,
  },
  status: {
    type: Number,
    required: true,
    default: 0
  },
  sn: {
    type: String,
    required: true
  },
  info: {
    type: String
  },
  paymentId: {
    type: String
  },
  // 创建时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const WithdrawRecord = mongoose.model('WithdrawRecord', schema);
export default WithdrawRecord

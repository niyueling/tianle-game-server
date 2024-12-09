'use strict';

const mongoose = require('mongoose');

// 每日补充包购买记录
const schema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true
  },
  recordId: {
    type: String,
    required: true
  },
  config: {
    type: Object,
    required: true
  },
  status: {
    type: Number,
    required: true
  },
  sn: {
    type: String,
    required: true
  },
  transactionId: {
    type: String
  },
  // 创建时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const PlayerDailyReviveSupplementRecord = mongoose.model('PlayerDailyReviveSupplementRecord', schema);
export default PlayerDailyReviveSupplementRecord;

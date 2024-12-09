'use strict';

const mongoose = require('mongoose');

// 复活专享补充包购买记录
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

const PlayerPayReviveSupplementRecord = mongoose.model('PlayerPayReviveSupplementRecord', schema);
export default PlayerPayReviveSupplementRecord;

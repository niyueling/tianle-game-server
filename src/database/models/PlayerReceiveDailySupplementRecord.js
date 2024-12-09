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
  gold: {
    type: Number,
    required: true
  },
  sn: {
    type: String,
    required: true
  },
  // 创建时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const PlayerReceiveDailySupplementRecord = mongoose.model('PlayerReceiveDailySupplementRecord', schema);
export default PlayerReceiveDailySupplementRecord;

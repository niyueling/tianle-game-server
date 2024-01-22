'use strict';

// 登录记录
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  playerId: {
    type: String,
    required: true
  },
  shortId: {
    type: Number,
    required: true
  },
  gold: {
    type: Number,
    required: true
  },
  config: {
    type: Object,
    required: true
  },
  // 创建时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const FreeGoldRecord = mongoose.model('FreeGoldRecord', schema);
export default FreeGoldRecord;

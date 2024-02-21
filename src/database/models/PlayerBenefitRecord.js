'use strict';

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
  helpCount: {
    type: Number,
    required: true
  },
  gold: {
    type: Number,
    required: true
  },
  // 创建时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

const PlayerBenefitRecord = mongoose.model('PlayerBenefitRecord', schema);
export default PlayerBenefitRecord

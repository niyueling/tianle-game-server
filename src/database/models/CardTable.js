'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  propId: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  // 更新时间
  createAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

schema.index({propId: 1});

const CardTable = mongoose.model('CardTable', schema);

export default CardTable

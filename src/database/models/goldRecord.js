'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  player: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  residue: {
    type: Number,
    required: true
  },
  type: {
    type: Number,
    required: true
  },
  note: {
    type: String,
    required: false
  },
  createAt: {type: Date, default: Date.now},
})

schema.index({player: 1});
schema.index({type: 1});

const GoldRecord = mongoose.model('GoldRecord', schema)

export default GoldRecord

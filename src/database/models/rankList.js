'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RankListSchema = new Schema({
  createAt: {type: Date, required: true, default: Date.now},
  players: {type: Array, required: true},
});

RankListSchema.index('createAt');
const RankList = mongoose.model('RankList', RankListSchema);

export default RankList;

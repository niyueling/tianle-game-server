'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NoticeSchema = new Schema({
  message: {type: String, required: true},
  createAt: {type: Date, required: true, default: Date.now},
});

NoticeSchema.index({createAt: -1});

const Notice = mongoose.model('Notice', NoticeSchema);

export default Notice;

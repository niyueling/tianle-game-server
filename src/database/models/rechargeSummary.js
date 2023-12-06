'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SummarySchema = new Schema({
  day: {type: Date, required: true},
  type: {type: String, required: true},
  sum: {type: Number},
  recharges: {type: Number},
  createAt: {type: Date, default: Date.now}
});

SummarySchema.index({day: 1});

const RechargeSummary = mongoose.model('RechargeSummary', SummarySchema);

export default RechargeSummary

'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const iOSRecordSchema = new Schema({
  shortId: {type: String, required: true},
  productId: {type: String, required: true},
  transactionId: {type: String, required: true},
  gem: {type: Number, require: true},
  gold: {type: Number, require: true},
  createAt: {type: Date, require: true, default: Date.now},
  receipt: {type: String, required: true}
});

iOSRecordSchema.index({shortId: 1});
iOSRecordSchema.index({productId: 1});
iOSRecordSchema.index({createAt: 1});


const IOSRecord = mongoose.model('iOsRecord', iOSRecordSchema);

export default IOSRecord

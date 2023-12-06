'use strict';
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ExtRecordSchema = new Schema({
  shortId: {type: String, required: true},
  uid: {type: String, required: true},
  gem: {type: Number, required: true},
  gold: {type: Number, required: true},
  oid: {type: String, required: true},
  from: {type: String, required: true, default: 'wechat'}
});

ExtRecordSchema.index({shortId: 1});
ExtRecordSchema.index({oid: 1});
ExtRecordSchema.index({uid: 1});


const ExtRecord = mongoose.model('IOSRecord', ExtRecordSchema);

export default ExtRecord

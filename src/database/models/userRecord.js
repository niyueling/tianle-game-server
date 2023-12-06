'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;


const UserRecordSchema = new Schema({
  from: {type: ObjectId, ref: 'GM',},
  to: {type: String, ref: 'Player'},
  amount: {type: Number, default: 0},
  relation: [{type: ObjectId, ref: 'GM'}],
  created: {type: Date, default: Date.now},
  source: {type:String, default:'admin'},
  currency: {type:String,default:'gem'},
  kickback: {type:Number,default:0},
  kickback2: {type:Number,default:0},
});

UserRecordSchema.index({from: 1, to: 1});
UserRecordSchema.index({from: 1, created: -1});
UserRecordSchema.index({to: 1});
UserRecordSchema.index({relation: 1});

const UserRecord = mongoose.model('UserRecord', UserRecordSchema);

export default  UserRecord

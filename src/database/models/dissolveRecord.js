'use strict'
import * as mongoose from 'mongoose'

const dissolveRecordSchema = new mongoose.Schema({
  roomNum: {type: String, required: true},
  juIndex: {type: String, required: true},
  time: {type: Date, default: Date.now},
  category: {type: String, required: true, default: 'shisanshui'},
  dissolveReqInfo: {type: Array, default: []},
})

dissolveRecordSchema.index({roomNum: 1, time: -1})
dissolveRecordSchema.index({time: -1})

const DissolveRecord = mongoose.model('DissolveRecord', dissolveRecordSchema)
export default DissolveRecord

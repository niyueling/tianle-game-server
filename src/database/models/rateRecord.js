'use strict'
import * as mongoose from 'mongoose'

const rateRecordSchema = new mongoose.Schema({
  level: {type: Number},
  player: {type: String},
  createAt: {type: Date, default: Date.now},
  ruleId: {type: String},
  recordId: {type: String},
  cardLists: {type: Array},
  useJoker: {type: Number},
  jokerCount: {type: Number},
  coolingcycle: {type: Number},
  cards: {type: Array},
  useCards: {type: Array},
  room: {type: Number},
  juIndex: {type: Number},
  game: {type: String},
})

rateRecordSchema.index({level: 1})
rateRecordSchema.index({createAt: -1})
rateRecordSchema.index({player: 1})
rateRecordSchema.index({cardLists: 1})

const RateRecord = mongoose.model('rateRecord', rateRecordSchema)
export default RateRecord

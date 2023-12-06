'use strict'
import * as mongoose from 'mongoose'

const gameRecordSchema = new mongoose.Schema({
  players: {type: [String], ref: 'player'},
  records: {type: Object},
  time: {type: Date, default: Date.now},
  room: {type: String},
  roomId: {type: String},
  juShu: {type: Number, default: 0},
  playersInfo: {type: []},
  record: {type: Object},
  winner: {type: String},
  events: {type: []},
  states: {type: []},
  game: {type: Object},
  type: String
})

gameRecordSchema.index({room: 1, time: -1})
gameRecordSchema.index({time: -1})
gameRecordSchema.index({winner: 1})

const GameRecord = mongoose.model('GameRecord', gameRecordSchema)
export default GameRecord

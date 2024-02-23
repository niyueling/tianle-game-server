
'use strict'
import * as mongoose from 'mongoose'

const gameCardRecordSchema = new mongoose.Schema({
  playerId: {type: String},
  cards: {type: Array},
  calcCard: {type: Number},
  room: {type: Number},
  game: {type: String},
  type: {type: Number},
  createAt: {type: Date, default: Date.now}
})

gameCardRecordSchema.index({createAt: -1})
gameCardRecordSchema.index({playerId: 1})

const GameCardRecord = mongoose.model('gameCardRecord', gameCardRecordSchema)
export default GameCardRecord

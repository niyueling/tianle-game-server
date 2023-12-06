'use strict'
import * as mongoose from 'mongoose'

const treasureBoxSchema = new mongoose.Schema({
  level: Number,
  name: String,
  star: Number,
  count: Number,
  juCount: Number,
  isOnline: Number,
  mahjong: Object
})

treasureBoxSchema.index({level: 1});
treasureBoxSchema.index({star: 1});
treasureBoxSchema.index({count: -1})
treasureBoxSchema.index({juCount: -1})

const TreasureBox = mongoose.model('treasureBox', treasureBoxSchema)
export default TreasureBox

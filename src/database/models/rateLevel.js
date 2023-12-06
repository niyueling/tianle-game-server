'use strict'
import * as mongoose from 'mongoose'

const rateLevelSchema = new mongoose.Schema({
  level: {type: Number},
  coolingcycle: {type: Number},
  createAt: {type: Date, default: Date.now},
  cardType: {type: Array},
  gamelists: {type: Array},
})

rateLevelSchema.index({level: 1})
rateLevelSchema.index({createAt: -1})
rateLevelSchema.index({cardType: 1})

const RateLevel = mongoose.model('rateLevel', rateLevelSchema)
export default RateLevel

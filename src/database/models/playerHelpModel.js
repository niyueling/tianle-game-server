'use strict'
import * as mongoose from 'mongoose'

const playerHelpDetailSchema = new mongoose.Schema({
    player: {
        type: String,
        required: true
      },
      shortId: {
        type: Number,
        index: true,
        required: true
      },
      isHelp: Number,
      estimateLevel: Number,
      treasureLevel: Number,
      coolingcycle: Number,
      juIndex: Number,
      type: Number,
      count: Number,
      juCount: Number,
      createAt: {type: Date, default: Date.now},
})

playerHelpDetailSchema.index({player: 1});
playerHelpDetailSchema.index({shortId: 1});
playerHelpDetailSchema.index({isHelp: -1})
playerHelpDetailSchema.index({estimateLevel: -1})
playerHelpDetailSchema.index({treasureLevel: -1})

const PlayerHelpDetail = mongoose.model('playerHelpDetail', playerHelpDetailSchema)
export default PlayerHelpDetail

import * as mongoose from "mongoose"

const ObjectId = mongoose.Schema.Types.ObjectId

const prizeRecordSchemas = new mongoose.Schema({
  prize: {type: ObjectId, require: true, ref: 'Prize'},
  prizeName: {type: String, require: true},
  prizeImageUrl: {type: String, require: true},
  player: {type: String, require: true, ref: 'Player'},
  playerShortId: {type: String, require: true},
  state: {type: String, require: true, default: 'NotReceived'},
  createAt: {type: Date, require: true, default: Date.now},
})

prizeRecordSchemas.index({playerShortId: 1})
prizeRecordSchemas.index({createAt: -1, playerShortId: 1})

const prizeRecord = mongoose.model('prizeRecord', prizeRecordSchemas)
export default prizeRecord

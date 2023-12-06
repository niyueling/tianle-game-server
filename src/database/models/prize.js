import * as mongoose from "mongoose"

const prizeSchemas = new mongoose.Schema({
  name: {type: String, require: true},
  imageUrl: {type: String, require: true},
  index: {type: Number, require: true, unique: true},
  onStock: {type: Boolean, default: true},
  gem: {type: Number, require: true},
  redPocket: {type: Number, require: true, default: 0},
  chance: {type: Number, require: true},
})

const prize = mongoose.model('Prize', prizeSchemas)
export default prize

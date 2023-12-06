import * as mongoose from 'mongoose'
const ObjectId = mongoose.Schema.ObjectId

const recordSchema = new mongoose.Schema({
  from: {type: ObjectId, ref: 'GM'},
  to: {type: ObjectId, ref: 'GM'},
  amount: {type: Number, default: 0},
  relation: [{type: ObjectId, ref: 'GM'}],
  created: {type: Date, default: Date.now},
})

const Record = mongoose.model('Record', recordSchema)

export default Record

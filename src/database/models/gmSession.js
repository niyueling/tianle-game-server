import * as mongoose from "mongoose"

const sessionSchemas = new mongoose.Schema({
  session: {
    userId: {type: String}
  }
})


const gmSession = mongoose.model('gmSession', sessionSchemas,'gmSessions')
export default gmSession

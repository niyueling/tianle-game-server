import * as moment from 'moment'
import GameRecord from '../database/models/gameRecord'
import RoomRecord from '../database/models/roomRecord'

async function cleanRecord() {
  const monthBefore = moment().subtract(30, 'days').toDate()
  await GameRecord.remove({time: {$lt: monthBefore}}).exec()
  await RoomRecord.remove({createAt: {$lt: monthBefore}}).exec()
}

export default cleanRecord

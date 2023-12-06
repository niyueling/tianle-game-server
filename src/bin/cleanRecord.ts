import * as moment from 'moment'
import GameRecord from '../database/models/gameRecord'
import RoomRecord from '../database/models/roomRecord'

async function cleanRecord() {
  const threeDayBefore = moment().subtract(3, 'days').toDate()
  await GameRecord.remove({time: {$lt: threeDayBefore}}).exec()
  await RoomRecord.remove({createAt: {$lt: threeDayBefore}}).exec()
}

export default cleanRecord

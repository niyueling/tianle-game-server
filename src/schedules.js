import * as schedule from 'node-schedule'
import cleanRecord from './bin/cleanRecord'

schedule.scheduleJob('0 4,14 * * *', () => {
  cleanRecord()
})

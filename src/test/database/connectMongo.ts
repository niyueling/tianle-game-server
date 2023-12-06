import * as config from '../../config'
import * as mongoose from 'mongoose'

import {RedPocketRecordModel} from '../../database/models/redPocketRecord'

before(async () => {
  console.error(`${__filename}:6 `, config.database.url)
  await mongoose.connect(config.database.url)
})

after((done) => {
  mongoose.disconnect(done)
})

describe('红包记录', () => {

  it('中奖记录', async () => {

    const rpr = await RedPocketRecordModel.create({
      player: 'testPlayer',
      from: 'testing',
      amountInFen: 10,
      createAt: new Date()
    })
  })
})

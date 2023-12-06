import {shuffle} from 'lodash'
import * as redis from 'redis'
import * as config from '../config';

const start = 111111
const end = 999999

let roomIds = []

for (let id = start; id <= end; id++) {
  roomIds.push(id)
}

roomIds = shuffle(roomIds)

const client = redis.createClient(config.redis)

client.del('roomIds', function () {
  client.lpush('roomIds', roomIds, function () {

    console.log(`${__filename}:21 `, roomIds.length, 'put roomIds in redis');

    client.quit()
  })
})

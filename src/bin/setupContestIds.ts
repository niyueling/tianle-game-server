import {shuffle} from 'lodash';
import * as redis from 'redis';
import * as config from '../config';

const start = 111111
const end = 999999

let numberArrays = []

for (let id = start; id <= end; id++) {
  numberArrays.push(id)
}

numberArrays = shuffle(numberArrays)

const client = redis.createClient(config.redis)

client.del('contestIds', function () {
  client.lpush('contestIds', numberArrays, function () {

    console.log(`${__filename}:21 `, numberArrays.length, 'put contestIds in redis');

    client.quit()
  })
})

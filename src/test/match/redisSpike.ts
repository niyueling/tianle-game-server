import * as redis from "redis"
import config from "../../utils/config"
import * as BlueBird from "bluebird"

BlueBird.promisifyAll(redis.RedisClient.prototype)


describe('Redis zset api', () => {

  let redisClient
  before(() => {
    // @ts-ignore
    redisClient = redis.createClient({host: config.get('redis.host'), port: config.get('redis.port')}) as any
  })


  after(async () => {
    await redisClient.quitAsync()
  })


  it('write and and read back', async () => {
    await redisClient.zaddAsync('t:1', 100, "p1", 200, "p2")

    const zsetwithScore = await redisClient.zrevrangebyscoreAsync('t:1', "+inf", "-inf", "withscores")
  })

})

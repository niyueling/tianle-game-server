import * as Bluebird from 'bluebird'
import * as redisLock from 'redis-lock'
import createClient from "./redis";

type unlocker = () => void
const redisClient = createClient()
export function createLock() {
  const rawLock = redisLock(redisClient)
  const wrappedWithErrorFirst = function (id, timeout, onLocked) {
    rawLock(id, timeout, function (done) {
      onLocked(null, done)
    })
  }
  const asyncLock = Bluebird.promisify<unlocker, string, number>(wrappedWithErrorFirst)
  return async function (lockId: string, timeOutInMs: number = 5000): Promise<unlocker> {
    return asyncLock(lockId, timeOutInMs)
  }
}

export const lock = createLock()

export async function withLock(lockId: string, timeOutInMs: number, func: () => Promise<any>, locker = lock) {
  const unlock = await locker(lockId, timeOutInMs)
  try {
    await func()
  } catch (e) {
    console.error(e)
    throw e
  } finally {
    unlock()
  }
}

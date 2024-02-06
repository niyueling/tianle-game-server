import {RedisKey} from "@fm/common/constants";
import * as rabbitMq from "amqplib";
import * as RedLock from 'redlock';
import * as config from "../config";
import GlobalConfig from "../database/models/globalConfig";
import {randWithSeed} from "../utils/algorithm";
import createClient, {getPubSubRedisClient} from "../utils/redis";
import BaseService from "./base";
const crypto = require('crypto');
const moment = require('moment');

// 玩家信息
export default class UtilsService extends BaseService {
  // 获取 redis lock
  /**
   * 获取锁一次, ttl 单位秒
   * @param { string } lockKey redis key
   * @param { number } ttl 秒
   * @return {Promise<*>} 返回锁
   */
  async grantLockOnce(lockKey, ttl) {
    const redLock = new RedLock([createClient()], {
      // 重试次数,不需要重试，只需要一个进程处理即可
      retryCount: 0,
    });
    return redLock.lock(lockKey, ttl * 1000).then(lock => {
      return lock;
    }).catch(() => {
      return null;
    });
  }

  // 监听后台通过
  async listenFromAdminByDating() {
    const client = getPubSubRedisClient();
    // @ts-ignore
    const resp = await client.subscribeAsync(RedisKey.adminChannelToDating);
    if (!resp) {
      console.error('subscribe from admin fail');
      return;
    } else {
      // 接收消息
      console.info('listen for channel adminChannelToDating');
      client.on('message', async (channel, message) => {
        console.log(`get message from channel ${channel}: ${message}`)
      })
    }
  }

  // 监听后台通过 redis 传过来的消息
  async listenFromAdminByGame() {
    const client = getPubSubRedisClient();
    // @ts-ignore
    const resp = await client.subscribeAsync(RedisKey.adminChannelToGame);
    if (!resp) {
      console.error('subscribe from admin fail');
      return;
    } else {
      // 接收消息
      console.info('listen for channel adminChannelToGame');
      client.on('message', async (channel, message) => {
        console.log(`get message from channel ${channel}: ${message}`)
        let msg;
        try {
          msg = JSON.parse(message);
        } catch (e) {
          console.error('message not json format', e);
          return;
        }
        const payload = msg.payload;
        switch (msg.cmd) {
          case 'dissolveRoom':
            await this.dissolveRoom(payload.playerId, payload.roomId, payload.gameType);
            break;
          default:
            console.error('unknown message', msg);
        }
      })
    }
  }

  // 查找配置表中
  async getGlobalConfigByName(name) {
    const record = await GlobalConfig.findOne({
      name,
    })
    if (!record) {
      return null;
    }
    return record.value
  }

  // 解散房间
  async dissolveRoom(playerId, roomId, gameName) {
    const connection = await rabbitMq.connect(config.rabbitmq.url);
    const channel = await connection.createChannel();
    try {
      channel.publish(
        'exGameCenter',
        `${gameName}.${roomId}`,
        this.toBuffer({name: 'forceDissolve', from: playerId, payload: {}, ip: '127.0.0.1'}),
      )
    } catch (e) {
      console.error('error to request to current room', e);
    }
    await channel.close();
  }

  toBuffer(messageJson) {
    return new Buffer(JSON.stringify(messageJson))
  }

  // https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript/47593316#47593316
  // for example
  // const rand = randWithSeed();
  // console.log(rand())
  randWithSeed(seedStr) {
    if (!seedStr) {
      // 当前时间做种子
      seedStr = Date.now().toString();
    }
    const seed = cyrb128(seedStr);
    // // Four 32-bit component hashes provide the seed for sfc32.
    // const rand = sfc32(seed[0], seed[1], seed[2], seed[3]);
    // Only one 32-bit component hash is needed for mulberry32.
    return mulberry32(seed[0]);
  }

  // 从 0 开始，随机取一个小于 max 的整数
  randomIntLessMax(max, seed?) {
    const rand = this.randWithSeed(seed);
    return Math.floor(rand() * max);
  }

  // 在最小数，最大数中随机选一个(包括最大、最小值)
  randomIntBetweenNumber(min, max, seed?) {
    const rand = this.randWithSeed(seed);
    return Math.floor(rand() * (max - min + 1)) + min;
  }

  // 随机从列表中选择一个
  sampleFromArray(arr, seed?) {
    const index = this.randomIntBetweenNumber(0, arr.length - 1, seed);
    return arr[index];
  }

  // 洗牌数组
  shuffleArray(arr) {
    const seedStr = Date.now().toString();
    for (let i = arr.length - 1; i > 0; i--) {
      const rand = randWithSeed(seedStr + i);
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 精确+
  accAdd(num1, num2) {
    const num1Digits = (num1.toString().split('.')[1] || '').length;
    const num2Digits = (num2.toString().split('.')[1] || '').length;
    const baseNum = Math.pow(10, Math.max(num1Digits, num2Digits));
    return (num1 * baseNum + num2 * baseNum) / baseNum;
  }

  // 精确 *
  accMul(arg1, arg2) {
    let m = 0;
    const s1 = arg1.toString();
    const s2 = arg2.toString();
    if (s1.split('.').length === 2) {
      m += s1.split(".")[1].length;
    }
    if (s2.split('.').length === 2) {
      m += s2.split(".")[1].length;
    }
    return Number(s1.replace(".", "")) * Number(s2.replace(".", "")) / Math.pow(10, m);
  }

  // 接口是否限流中 3s
  async isApiRateLimit(apiName, playerId, seconds = 3) {
    const lock = await this.grantLockOnce(`apiRate::${apiName}::${playerId}`, seconds)
    return !lock;
  }

  // 从list 中筛选 key 的值
  filterModel(list, field) {
    const result = [];
    list.map(value => {
      result.push(value[field]);
    })
    return result;
  }

  // 转为字典
  array2map(list, field) {
    const result = {};
    list.map(value => {
      result[value[field]] = value;
    })
    return result;
  }

  // 根据总和生成数组
  generateRandomNumber(sum, count, maxNumber?) {
    const numbers = []
    const originRum = sum;
    let cmp = 0;
    for (let i = 0; i < count - 1; i++) {
      const randomNumber = Math.floor(Math.random() * sum)
      sum -= randomNumber;
      if (cmp < randomNumber) {
        cmp = randomNumber;
      }
      numbers.push(randomNumber)
    }
    numbers.push(sum)
    if (cmp < sum) {
      cmp = sum;
    }
    if (maxNumber && cmp > maxNumber) {
      // 生成的最大的数大于 maxNumber，重新生成 or 没有总和不对
      return this.generateRandomNumber(originRum, count, maxNumber);
    }
    // console.log('generate numbers', numbers, sum, count, maxNumber) //
    return numbers;
  }

  async generateOrderNumber() {
    // 获取当前日期和时间
    const now = moment().format('YYYYMMDDHHmmss');

    // 生成随机数
    const random = crypto.randomBytes(4).toString('hex');

    // 序列号（例如：001）
    const serial = '001';

    // 组合生成18位订单号
    const orderNumber = now + random + serial;

    return orderNumber.toString().padStart(18, '0'); // 确保长度为18位
  }
}

// 新随机数
// 随机数种子
function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    // tslint:disable-next-line:no-bitwise
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    // tslint:disable-next-line:no-bitwise
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    // tslint:disable-next-line:no-bitwise
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    // tslint:disable-next-line:no-bitwise
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  // tslint:disable-next-line:no-bitwise
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  // tslint:disable-next-line:no-bitwise
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  // tslint:disable-next-line:no-bitwise
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  // tslint:disable-next-line:no-bitwise
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  // tslint:disable-next-line:no-bitwise
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    // tslint:disable-next-line:no-bitwise
    t = Math.imul(t ^ t >>> 15, t | 1);
    // tslint:disable-next-line:no-bitwise
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    // tslint:disable-next-line:no-bitwise
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

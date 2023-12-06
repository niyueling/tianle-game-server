import * as Bluebird from 'bluebird'
import {EventEmitter} from "events"
import * as redis from "redis"
import {Callback, Commands, ServerInfo} from "redis"
import {Duplex} from "stream"
import * as config from '../config'

Bluebird.promisifyAll(redis.RedisClient.prototype)
Bluebird.promisifyAll(redis.Multi.prototype);

// 保留一个 redis 连接
let redisInstance = null;
export function createClient(): AsyncRedisClient {
  if (redisInstance && redisInstance.connected) {
    // 未断开
    return redisInstance;
  }
  // 已断开,重新连接
  redisInstance = redis.createClient(config.redis);
  return redisInstance as any;
}

export default createClient

// 订阅型 redis
export function getPubSubRedisClient(): AsyncRedisClient {
  return redis.createClient(config.redis) as any;
}

interface AsyncOverloadedCommand<T, U, R> {
  (arg1: T, arg2: T, arg3: T, arg4: T, arg5: T, arg6: T,): Promise<U>;

  (arg1: T, arg2: T, arg3: T, arg4: T, arg5: T): Promise<U>;

  (arg1: T, arg2: T, arg3: T, arg4: T): Promise<U>;

  (arg1: T, arg2: T, arg3: T): Promise<U>;

  (arg1: T, arg2: T | T[]): Promise<U>;

  (arg1: T | T[]): Promise<U>;

  (...args: Array<T>): Promise<U>;
}

interface AsyncOverloadedKeyCommand<T, U, R> {
  (key: string, arg1: T, arg2: T, arg3: T, arg4: T, arg5: T, arg6: T): Promise<U>;

  (key: string, arg1: T, arg2: T, arg3: T, arg4: T, arg5: T): Promise<U>;

  (key: string, arg1: T, arg2: T, arg3: T, arg4: T): Promise<U>;

  (key: string, arg1: T, arg2: T, arg3: T): Promise<U>;

  (key: string, arg1: T, arg2: T): Promise<U>;

  (key: string, arg1: T | T[]): Promise<U>;

  (key: string, ...args: Array<T>): Promise<U>;

  (...args: Array<string | T>): Promise<U>;
}

interface AsyncCommands<R> {

  delAsync: AsyncOverloadedCommand<string, number, R>

  getAsync(key: string): Promise<string>;

  hdelAsync: AsyncOverloadedKeyCommand<string, number, R>

  hgetAsync(key: string, field: string): Promise<string>

  hgetallAsync(key: string): Promise<{ [key: string]: string }>


  hsetAsync(key: string, field: string, value: string): Promise<number>;

  lpopAsync(key: string): Promise<string>

  mgetAsync: AsyncOverloadedCommand<string, string[], R>;

  quitAsync(): Promise<'OK'>

  rpushAsync: AsyncOverloadedKeyCommand<string, number, R>;
  saddAsync: AsyncOverloadedKeyCommand<string, number, R>;

  setAsync(key: string, value: string): Promise<'OK'>;

  setAsync(key: string, value: string, flag: string): Promise<'OK'>;

  setAsync(key: string, value: string, mode: string, duration: number): Promise<'OK' | undefined>;

  setAsync(key: string, value: string, mode: string, duration: number, flag: string): Promise<'OK' | undefined>;

  setexAsync(key: string, seconds: number, value: string): Promise<string>;


  incrAsync(key: string): Promise<string>;

  decrAsync(key: string): Promise<string>;

  smembersAsync(key: string): Promise<string[]>;

  sremAsync: AsyncOverloadedKeyCommand<string, number, R>;

  spopAsync(key: string): Promise<string>;

  spopAsync(key: string, count: number): Promise<string[]>;

  sismemberAsync(key: string, member: string): Promise<number>;

  scardAsync(key: string): Promise<number>;

  zaddAsync: AsyncOverloadedKeyCommand<string | number, number, R>;

  zcardAsync(key: string): Promise<number>;


  zrevrangebyscoreAsync(key: string, min: number | string, max: number | string): Promise<string[]>

  zrevrangebyscoreAsync(key: string, min: number | string, max: number | string, withscores: string): Promise<string[]>

  zrevrangebyscoreAsync(key: string, min: number | string, max: number | string, limit: string, offset: number, count: number): Promise<string[]>

  zrevrangebyscoreAsync(key: string, min: number | string, max: number | string, withscores: string, limit: string, offset: number, count: number): Promise<string[]>

  zrangebyscoreAsync(key: string, min: number | string, max: number | string, limit: string, offset: number, count: number): Promise<string[]>


  zrangebyscoreAsync(key: string, min: number | string, max: number | string, withscores: string, limit: string, offset: number, count: number): Promise<string[]>


  brpoplpush(source: string, destination: string, timeout: number, cb?: Callback<string | null>): R;

  rpoplpush(source: string, destination: string, cb?: Callback<string>): R;
}


interface AsyncMulti extends Commands<AsyncMulti> {
  exec(cb?: Callback<any[]>): boolean;

  EXEC(cb?: Callback<any[]>): boolean;

  execAsync(): Promise<any[]>

  exec_atomic(cb?: Callback<any[]>): boolean;

  exec_atomicAsync(): Promise<boolean>;

  EXEC_ATOMIC(cb?: Callback<any[]>): boolean;
}

export interface AsyncRedisClient extends AsyncCommands<boolean>, EventEmitter {
  connected: boolean;
  command_queue_length: number;
  offline_queue_length: number;
  retry_delay: number;
  retry_backoff: number;
  command_queue: any[];
  offline_queue: any[];
  connection_id: number;
  server_info: ServerInfo;
  stream: Duplex;

  on(event: 'message' | 'message_buffer', listener: (channel: string, message: string) => void): this;

  on(event: 'pmessage' | 'pmessage_buffer', listener: (pattern: string, channel: string, message: string) => void): this;

  on(event: 'subscribe' | 'unsubscribe', listener: (channel: string, count: number) => void): this;

  on(event: 'psubscribe' | 'punsubscribe', listener: (pattern: string, count: number) => void): this;

  on(event: string, listener: (...args: any[]) => void): this;

  /**
   * Client methods.
   */

  end(flush?: boolean): void;

  unref(): void;

  cork(): void;

  uncork(): void;

  // duplicate(options?: ClientOpts, cb?: Callback<RedisClient>): RedisClient;

  sendCommandAsync(command: string): Promise<any>;

  sendCommandAsync(command: string, args?: any[]): Promise<any>;

  send_commandAsync(command: string): Promise<any>;

  send_commandAsync(command: string, args?: any[]): Promise<any>;

  addCommand(command: string): void;

  add_command(command: string): void;

  /**
   * Mark the start of a transaction block.
   */
  multi(args?: Array<Array<string | number | Callback<any>>>): AsyncMulti;

  MULTI(args?: Array<Array<string | number | Callback<any>>>): AsyncMulti;

  batch(args?: Array<Array<string | number | Callback<any>>>): AsyncMulti;

  BATCH(args?: Array<Array<string | number | Callback<any>>>): AsyncMulti;
}

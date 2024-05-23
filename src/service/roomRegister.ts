import {GameType, GameTypeList, RedisKey} from "@fm/common/constants";
import * as mongoose from 'mongoose';
import RoomJoinModel from "../database/models/roomJoin";
import {AsyncRedisClient, createClient} from "../utils/redis";
import BaseService from "./base";
import * as logger from "winston";
import RoomRecord from "../database/models/roomRecord";
import {RoomInfoModel} from "../database/models/roomInfo";

// 保存房间信息
export default class RoomRegister extends BaseService {
  redis: AsyncRedisClient

  constructor() {
    super();
    this.redis = createClient();
  }

  async putPlayerInGameRoom(player: string, game: GameType | string, roomNumber: string, playerCapacity: number) {
    await this.recordJoinRoom(player, parseInt(roomNumber, 10), game)

    // 存储房间已加入人数
    let playerCount = await this.redis.hgetAsync(`room:join:${roomNumber}`, `joinCount`);
    let capacity = await this.redis.hgetAsync(`room:join:${roomNumber}`, `capacity`);
    const joinCount = !playerCount ? 1 : Number(playerCount) + 1;
    await this.redis.hsetAsync(`room:join:${roomNumber}`, `joinCount`, String(joinCount));
    if (!capacity) {
      await this.redis.hsetAsync(`room:join:${roomNumber}`, `capacity`, String(playerCapacity));
    }
    return this.redis.hsetAsync(`u:${player}`, game, roomNumber)
  }

  async removePlayerFromGameRoom(player: string, game: GameType | string, roomNumber) {
    await this.deleteJoinRoom(player, game);
    let playerCount = await this.redis.hgetAsync(`room:join:${roomNumber}`, `joinCount`);
    const joinCount = Number(playerCount) - 1;
    await this.redis.hsetAsync(`room:join:${roomNumber}`, `joinCount`, String(joinCount));

    return this.redis.hdelAsync(`u:${player}`, game)
  }

  async allRoomsForPlayer(player: string) {
    return this.redis.hgetallAsync(`u:${player}`)
  }

  async roomNumber(player: string, game: GameType | string): Promise<number | null> {
    const roomNumber = await this.redis.hgetAsync(`u:${player}`, game)
    if (roomNumber) {
      const exists = await this.redis.getAsync(`room:${roomNumber}`)
      if (exists)
        return Number(roomNumber)
    }
    return null
  }

  // 是否游戏中
  async isPlayerInRoom(player: string) {
    const roomHash = await this.allRoomsForPlayer(player);
    if (!roomHash) {
      // 不在房间里
      return false;
    }
    for (const gameName of GameTypeList) {
      const roomNumber = roomHash[gameName];
      if (roomNumber) {
        const exists = await this.redis.getAsync(`room:${roomNumber}`)
        if (exists)
          return true;
      }
    }
    return false
  }

  // 开房
  async recordJoinRoom(joinId: string, roomId: number, gameType: string) {
    let m = await RoomJoinModel.findOne({joinId, roomId});
    if (m) {
      // 房间已经有了
      return;
    }
    m = new RoomJoinModel({
      joinId: joinId.toString(),
      gameType,
      roomId,
    });
    return m.save();
  }

  // 关闭房间
  async deleteJoinRoom(joinId: string, gameType: string) {
    const result = await RoomJoinModel.findOne({joinId, gameType});
    if (result) {
      await result.remove();
    }
  }

  // 从 mongo 中获取掉线房间号
  async getDisconnectRoomByPlayerId(joinId: string, gameType) {
    const roomNumber = await this.roomNumber(joinId, gameType);
    const roomExist = await this.redis.getAsync(this.roomKey(roomNumber))
    if (roomExist) {
      return roomNumber;
    }
    return null;
  }

  // 房间信息
  async getRoomInfo(roomNumber) {
    const roomData = await this.redis.getAsync('room:info:' + roomNumber)
    if (!roomData) {
      return {};
    }
    return JSON.parse(roomData)
  }

  roomKey(roomNum) {
    return `room:${roomNum}`
  }

  // 从 redis 中获取掉线的房间号
  async getDisconnectedRoom(playerId: string, gameName) {
    const roomNumber = await this.roomNumber(playerId, gameName);
    const roomExist = await this.redis.getAsync(this.roomKey(roomNumber));
    if (roomExist) {
      return roomNumber;
    }
  }

  async isRoomExists(roomId) {
    return this.redis.getAsync(this.roomKey(roomId));
  }

  // 保存游戏信息到 redis
  async saveRoomInfoToRedis(room) {
    await this.redis.setAsync('room:info:' + room._id, JSON.stringify(room.toJSON()))
  }

  // 添加人数统计
  async incPublicRoomCount(gameType, id) {
    const record = await this.redis.getAsync(RedisKey.publicRoomCount + `${gameType}-${id}`);
    const count = Number(record);
    if (isNaN(count)) {
      await this.redis.setAsync(RedisKey.publicRoomCount + `${gameType}-${id}`, '1');
      return;
    }
    await this.redis.incrAsync(RedisKey.publicRoomCount + `${gameType}-${id}`);
  }

  // 扣除人数统计
  async decrPublicRoomCount(gameType, id) {
    const record = await this.redis.getAsync(RedisKey.publicRoomCount + `${gameType}-${id}`);
    const count = Number(record);
    if (isNaN(count) || count < 0) {
      // 不扣了，避免负数
      return;
    }
    await this.redis.decrAsync(RedisKey.publicRoomCount + `${gameType}-${id}`);
  }

  // 所有等级的人数统计
  async getPublicRoomCount(gameType) {
    // @ts-ignore
    const keys = await this.redis.keysAsync(RedisKey.publicRoomCount + gameType + '*');
    const result = {};
    for (const k of keys) {
      const count = await this.redis.getAsync(k);
      const level = k.slice(k.indexOf('-') + 1);
      if (count && Number(count) > 0) {
        result[level] = Number(count);
      } else {
        result[level] = 0;
      }
    }
    return result;
  }

  // 初始化公共房人数
  async initPublicRoomCount() {
    // @ts-ignore
    const keys = await this.redis.keysAsync(RedisKey.publicRoomCount);
    for (const k of keys) {
      await this.redis.delAsync(k);
    }
  }

  async saveNewRoomRecord(room, gameType, player, rule) {
    let m = await RoomRecord.findOne({ roomNum: room._id });
    if (m) {
      return false;
    }
    const roomRecord = {
      players: [],
      scores: [],
      roomNum: room._id,
      room: room.uid,
      category: gameType,
      creatorId: player.shortId || 0,
      createAt: Date.now(),
      roomState: "initialization",
      juIndex: 0,
      rule
    }

    RoomRecord.update({room: room.uid}, roomRecord, {upsert: true, setDefaultsOnInsert: true})
        .catch(e => { logger.error('recordRoomScore error', e) })

    return true;
  }
}

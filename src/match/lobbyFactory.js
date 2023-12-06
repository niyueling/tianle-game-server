import Club from "../database/models/club";
import createClient from "../utils/redis";
import {service} from "../service/importService";

/**
 *
 * @param gameName
 * @param roomFactory
 * @param roomFee
 * @param normalizeRule
 * @returns { {new(): Lobby, getInstance()}}
 * @constructor
 */
export function LobbyFactory({gameName, roomFactory, roomFee, normalizeRule = async (rule) => rule}) {

  const redisClient = createClient();

  let instance = null;

  return class Lobby {
    static getInstance() {
      if (!instance) {
        instance = new Lobby();
      }
      return instance;
    }

    constructor() {
      this.publicRooms = new Map();
      this.playerRoomTable = new Map();
    }

    async getAvailablePublicRoom(playerId, roomId, rule) {
      let found = null;
      for (const kv of this.publicRooms) {
        const room = kv[1];
        if (!room.isFull() &&
          room.isPublic &&
          room.game.rule.ruleType === rule.ruleType &&
          room.gameRule.categoryId === rule.categoryId
        ) {
          found = room;
          break;
        }
      }
      if (found) {
        return found;
      }
      const ret = await this.createRoom(true, roomId, rule);
      ret.ownerId = playerId;
      this.publicRooms.set(roomId, ret);
      return ret;
    }

    hasRoom(id) {
      return Boolean(this.publicRooms.get(id));
    }

    getRoom(id) {
      if (id) {
        return this.publicRooms.get(id);
      }

      return null;
    }

    async getClubOwner(clubId) {
      const club = await Club.findOne({_id: clubId}).populate('owner')
      if (!club) {
        return
      }
      return club.owner;
    }

    async getClubRooms(clubId) {
      let clubRooms = [];
      const roomNumbers = await redisClient.smembersAsync('clubRoom:' + clubId)

      const roomInfoKeys = roomNumbers.map(num => 'room:info:' + num)

      let roomDatas = []
      if (roomInfoKeys.length > 0) {
        roomDatas = await redisClient.mgetAsync(roomInfoKeys)
      }

      for (const roomData of roomDatas) {
        const roomInfo = JSON.parse(roomData)
        if (roomInfo) {
          const rule = roomInfo.gameRule || 'err';
          const roomNum = roomInfo._id || 'err';
          const roomCreator = roomInfo.creatorName || 'err';
          const playerOnline = roomInfo.players.filter(x => x).length + roomInfo.disconnected.length
          const juIndex = roomInfo.game.juIndex

          clubRooms.push({roomNum, roomCreator, rule, playerOnline, juIndex});
        }
      }

      return clubRooms.sort((x, y) => {
        if (Math.max(x.playerOnline, y.playerOnline) < 4) {
          return y.playerOnline - x.playerOnline
        } else {
          return x.playerOnline - y.playerOnline
        }

      })
    }

    /**
     * @param roomNumber
     * @returns {Promise<{}>}
     */
    async getRoomInfo(roomNumber) {
      const roomData = await redisClient.getAsync('room:info:' + roomNumber)
      if (!roomData) {
        return {};
      }
      return JSON.parse(roomData);
    }

    async createRoom(isPublic, roomId, rule = {}) {
      let newRule = Object.assign({}, rule, {isPublic})
      const room = roomFactory(roomId, newRule)
      await room.init();
      this.listenRoom(room)
      redisClient.sadd('room', roomId)
      return room;
    }

    createTournamentRoom(roomId, rule, playerScore, reporter) {
      const room = roomFactory(roomId, rule, 'tournament', {playerScore, reporter})
      room._id = roomId
      this.listenRoom(room)
      redisClient.sadd('room', roomId)
      return room;
    }

    createBattleRoom(roomId, rule, playerScore) {
      const room = roomFactory(roomId, rule, 'battle', {playerScore})
      room._id = roomId
      this.listenRoom(room)
      redisClient.sadd('room', roomId)
      return room;
    }

    async createClubRoom(isPublic = false, roomId, rule = {}, clubId, clubOwnerPlayer) {
      let newRule = Object.assign({}, rule, {isPublic})
      const room = roomFactory(roomId, newRule);
      await room.init();
      await room.setClub(clubId, clubOwnerPlayer);
      this.listenRoom(room)
      this.listenClubRoom(room)
      redisClient.sadd('clubRoom:' + clubId, roomId)
      return room;
    }

    listenClubRoom(room) {
      room.on('empty', async () => {
        const clubId = room.clubId
        await redisClient.sremAsync('clubRoom:' + clubId, room._id)
        this.clubBroadcaster && this.clubBroadcaster.broadcast(clubId)
        if (room.robotManager) {
          // 删除机器人
          await room.robotManager.gameOver();
          room.robotManager = null;
        }
      })

      room.on('join', async () => {
        const clubId = room.clubId
        const current = room.players.filter(x => x).length + room.disconnected.length
        this.clubBroadcaster && this.clubBroadcaster.updateClubRoomInfo(clubId, {
          roomNum: room._id,
          capacity: room.capacity, current
        })
      })

      room.on('leave', async () => {
        const clubId = room.clubId
        const current = room.players.filter(x => x).length + room.disconnected.length
        this.clubBroadcaster && this.clubBroadcaster.updateClubRoomInfo(clubId, {
          roomNum: room._id,
          capacity: room.capacity, current
        })
      })
    }

    listenRoom(room) {
      room.on('empty', async (disconnectedPlayerIds = []) => {
        disconnectedPlayerIds.forEach(id => {
          service.roomRegister.removePlayerFromGameRoom(id, gameName)
            .catch(error => {
              console.error('removePlayerFromGameRoom', id, gameName, error)
            })
        })
        this.publicRooms.delete(room._id);
        if (room.robotManager) {
          // 删除机器人
          await room.robotManager.gameOver();
          room.robotManager = null;
        }
      })
    }

    clearDisConnectedPlayer(playerId) {
      this.playerRoomTable.delete(playerId);
    }

    roomFee(rule) {
      return roomFee(rule)
    }

    async normalizeRule(rule) {
      return normalizeRule(rule)
    }

    // 房间等级是否正确
    async isRoomLevelCorrect(model, categoryId) {
      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(categoryId);
      // 需要升级到高级
      let isUpper = false;
      let isMoreRuby = false;
      if (!conf) {
        console.error('invalid category config');
        return { isUpper, isMoreRuby: true };
      }
      // 检查金豆是否够扣
      isMoreRuby = model.ruby < conf.roomRate || model.ruby < conf.minAmount;
      if (isMoreRuby) {
        console.error("no enough roomRate or minAmount", conf.roomRate, conf.minAmount, "with ruby", model.ruby)
        return { isMoreRuby, isUpper };
      }
      if (conf.maxAmount) {
        // 有最大值上限
        isUpper = model.ruby > conf.maxAmount;
      }
      if (isUpper) {
        // 检查是不是还有更高等级的场次
        const maxConf = await service.gameConfig.getUpperPublicRoomCategory(conf.gameCategory, conf.maxAmount);
        if (!maxConf) {
          // 没有最大的了，允许继续玩
          isUpper = false;
        }
      }
      return { isUpper, isMoreRuby }
    }

  }
}

export default LobbyFactory;

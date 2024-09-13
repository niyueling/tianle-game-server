import createClient from "../utils/redis";
import {service} from "../service/importService";
import Enums from "./majiang/enums";
import {GameType} from "@fm/common/constants";
import * as config from "../config";

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
      this.canJoinRooms = new Map();
      this.playerRoomTable = new Map();
    }

    async getAvailablePublicRoom(playerId, roomId, rule, playerModel) {
      let found = null;
      if (!playerModel.gameJuShu || (playerModel.gameJuShu && playerModel.gameJuShu[rule.gameType] >= config.game.noviceProtection) || playerModel.robot) {
        let canJoinRooms = await redisClient.hgetallAsync("canJoinRooms");
        if (canJoinRooms) {
          for (let i = 0; i < Object.keys(canJoinRooms).length; i++) {
            const roomId = Object.keys(canJoinRooms)[i];
            for (const kv of this.publicRooms) {
              if (Number(kv[0]) === Number(roomId)) {
                const room = kv[1];
                if (!room.isFull() && room.isPublic && room.gameRule.categoryId === rule.categoryId && !room.gameState) {
                  found = room;
                  break;
                }
              }
            }
            if (found) {
              return found;
            }
          }
        }

        if (found) {
          return found;
        }
      }

      const ret = await this.createRoom(true, roomId, rule);
      ret.ownerId = playerId;
      this.publicRooms.set(roomId, ret);
      await redisClient.hsetAsync("canJoinRooms", roomId, JSON.stringify(ret));
      return ret;
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
          console.warn("room empty dissolve");
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
    async isRoomLevelCorrect(model, rule) {
      const conf = await service.gameConfig.getPublicRoomCategoryByCategory(rule.categoryId);
      // 需要升级到高级
      let isUpper = false;
      let isMoreRuby = false;
      if (!conf) {
        console.error('invalid category config');
        return { isUpper, isMoreRuby: true };
      }
      if (!rule.currency) {
        rule.currency = Enums.goldCurrency;
      }
      // 检查金豆是否够扣
      if (rule.currency && rule.currency === Enums.goldCurrency) {
        isMoreRuby = model.gold < conf.roomRate || model.gold < conf.minAmount;
      }
      if (rule.currency && rule.currency === Enums.tlGoldCurrency) {
        isMoreRuby = model.tlGold < conf.roomRate || model.tlGold < conf.minAmount;
      }

      if (isMoreRuby) {
        console.error("no enough roomRate or minAmount", conf.roomRate, conf.minAmount, "with gold", model.gold)
        return { isMoreRuby, isUpper };
      }
      if (conf.maxAmount && conf.maxAmount !== -1) {
        // 有最大值上限
        if (rule.currency && rule.currency === Enums.goldCurrency) {
          isUpper = model.gold > conf.maxAmount;
        }
        if (rule.currency && rule.currency === Enums.tlGoldCurrency) {
          isUpper = model.tlGold > conf.maxAmount;
        }

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

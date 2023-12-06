import {GameType} from "@fm/common/constants";
import Club from '../../database/models/club'
import ClubMember from '../../database/models/clubMember'
import PlayerModel from '../../database/models/player'
import biaofenLobby from '../../match/biaofen/centerlobby'
import majiangLobby from '../../match/majiang/centerlobby'
import niuniuLobby from '../../match/niuniu/centerlobby'
import paodekuaiLobby from '../../match/paodekuai/centerlobby'
import shisanshuiLobby from '../../match/shisanshui/centerLobby'
import zhadanLobby from '../../match/zhadan/centerlobby'
import {service} from "../../service/importService";
import {AsyncRedisClient} from "../../utils/redis"
import {ISocketPlayer} from "../ISocketPlayer"
import {getContestId} from './account'

export function lobbyQueueNameFrom(gameType: string) {
  return `${gameType}Lobby`
}

async function playerCanInClubRoom(player, clubId, gameType) {

  if (!clubId) {
    return false;
  }
  const ownerClub = await Club.findOne({_id: clubId})
  if (ownerClub && ownerClub.owner === player.model._id) {
    return true;
  }

  const clubMemberInfo = await ClubMember.findOne({
    member: player.model._id,
    club: clubId,
  })

  if (clubMemberInfo) {
    return true
  }
  return false;
}

const allGameName = ['paodekuai', 'niuniu', 'zhadan', 'majiang', 'shisanshui', 'biaofen']

function getLobby(gameType) {
  const gameType2Lobby = {
    niuniu: niuniuLobby,
    paodekuai: paodekuaiLobby,
    zhadan: zhadanLobby,
    shisanshui: shisanshuiLobby,
    majiang: majiangLobby,
    biaofen: biaofenLobby,
  }
  return gameType2Lobby[gameType] || gameType2Lobby.paodekuai
}

export function createHandler(redisClient: AsyncRedisClient) {

  async function isInTournaQueue(playerId: string, gameType: string): Promise<boolean> {
    const tId = await redisClient.hgetAsync(`u:${playerId}`, `'t:${gameType}`)
    return !!tId
  }

  const handlers = {
    'room/reconnect': async (player, message) => {
      const room = await service.roomRegister.getDisconnectedRoom(player._id, message.gameType);
      if (room) {
        player.currentRoom = room
        player.setGameName(message.gameType)
        player.requestToCurrentRoom('room/reconnect')
      }
    },

    // 玩家加入房间
    'room/join-friend': async (player, message) => {
      const roomInfo = await service.roomRegister.getRoomInfo(message._id);
      let resp;
      if (roomInfo.clubMode) {
        // 战队房
        const club = await Club.findById(roomInfo.clubId);
        if (!club) {
          return player.sendMessage('room/join-fail', { reason: '房间不存在' })
        }
        const unionMember = await service.club.getUnionMember(club.shortId, player.model._id);
        if (unionMember) {
          // 联盟战队
          const ownerClub = await service.club.getOwnerClub(player.model._id);
          if (ownerClub && ownerClub.shortId === unionMember.clubShortId) {
            // 战队主
            resp = await service.club.joinNormalClubRoom(roomInfo.gameRule, club._id, player.model._id);
          } else {
            resp = await service.club.joinUnionClubRoom(unionMember, roomInfo.gameRule, club._id, player.model._id);
          }
        } else {
          // 普通联盟战队
          resp = await service.club.joinNormalClubRoom(roomInfo.gameRule, club._id, player.model._id);
        }
        if (!resp.isOk) {
          return player.sendMessage('room/join-fail', resp.info);
        }
      }
      const roomExists = await service.roomRegister.isRoomExists(message._id)
      if (roomExists) {
        player.setGameName(message.gameType)
        // 加入房间
        player.requestToRoom(message._id, 'joinRoom', message)
      } else {
        player.sendMessage('room/join-fail', {reason: '房间不存在'})
      }
    },

    'room/create': async (player, message) => {
      if (await getContestId(player._id)) {
        return player.sendMessage('room/join-fail', {reason: '不能加入房间，您有未完成的比赛场'})
      }
      if (await isInTournaQueue(player._id, message.gameType)) {
        return player.sendMessage('room/join-fail', {reason: '在比赛场排队中'})
      }
      const rule = message.rule
      const gameType = rule.type || 'paodekuai'
      player.setGameName(message.gameType)
      player.requestTo(lobbyQueueNameFrom(gameType), 'createRoom', {rule, gameType})
      return
    },

    'room/createForClub': async (player, message) => {
      if (await getContestId(player._id)) {
        return player.sendMessage('room/join-fail', {reason: '不能加入房间，您有未完成的比赛场'})
      }
      if (await isInTournaQueue(player._id, message.gameType)) {
        return player.sendMessage('room/join-fail', {reason: '在比赛场排队中'})
      }
      const rule = message.rule

      if (rule.share) {
        if (player.model.gem < 1) {
          player.sendMessage('room/join-fail', {reason: '钻石不足 无法创建房间。'})
          return
        }
      } else {
        if (player.model.gem < 4) {
          player.sendMessage('room/join-fail', {reason: '钻石不足 无法创建房间。'})
          return
        }
      }
      const gameType = rule.type || 'paodekuai'
      player.requestTo(lobbyQueueNameFrom(gameType), 'createClubRoom', {rule, gameType})
      return
    },

    'room/next-game': player => {
      player.requestToCurrentRoom('room/next-game')
    },
    'room/leave': player => {
      player.requestToCurrentRoom('room/leave')
    },

    'room/ready': player => {
      player.requestToCurrentRoom('room/ready', {})
    },
    'room/creatorStartGame': player => {
      player.requestToCurrentRoom('room/creatorStartGame', {})
    },
    'room/sound-chat': (player, message) => {
      player.requestToCurrentRoom('room/sound-chat', message)
    },

    'room/buildInChat': (player, message) => {
      player.requestToCurrentRoom('room/buildInChat', message)
    },

    'room/addShuffle': player => {
      player.requestToCurrentRoom('room/addShuffle');
    },

    'room/dissolve': (player: ISocketPlayer) => {
      player.requestToCurrentRoom('room/dissolve')
    },

    'room/dissolveReq': (player: ISocketPlayer) => {
      player.requestToCurrentRoom('room/dissolveReq')
    },
    'room/AgreeDissolveReq': (player: ISocketPlayer) => {
      player.requestToCurrentRoom('room/AgreeDissolveReq')
    },
    'room/DisagreeDissolveReq': player => {
      player.requestToCurrentRoom('room/DisagreeDissolveReq')
    },
    'room/updatePosition': (player, message) => {
      player.requestToCurrentRoom('room/updatePosition', message)
    },

    'room/clubOwnerdissolve': async (player, message) => {
      const isAllow = await isOwnerOrAdmin(message.clubShortId, player.model._id);
      if (!isAllow) {
        // 非管理员或 owner
        player.sendMessage('sc/showInfo', {info: '无权执行解散操作！'})
        player.sendMessage('room/clubOwnerdissolveReply', {info: '无权执行解散操作！'})
        return
      }
      const roomExists = await service.roomRegister.isRoomExists(message._id)
      if (roomExists) {
        player.requestToRoom(message._id, 'dissolveClubRoom', {clubOwnerId: player.model._id})
      } else {
        player.sendMessage('room/join-fail', {reason: '房间不存在'})
      }
    },
    'room/forceDissolve': async (player, message) => {
      if (allGameName.findIndex(x => message.gameType === x) === -1) {
        player.sendMessage('sc/showInfo', {reason: '请输入正确的游戏类型'})
        return
      }
      const p = await PlayerModel.findOne({_id: 'super'}).lean()
      if (!p || !p.canUse || player._id !== p._id) {
        player.sendMessage('sc/showInfo', {reason: '无法使用'})
        return
      }

      const roomExists = await service.roomRegister.isRoomExists(message._id)

      if (roomExists) {
        player.requestToRoom(message._id, 'specialDissolve', {})
      } else {
        player.requestTo(`${message.gameType}DealQuestion`, 'clearRoomInfoFromRedis', {
          roomId: message._id, myGameType: player.gameName, gameType: message.gameType})
      }
    }
  }

  return handlers
}

// 是否创始人或者管理员
async function isOwnerOrAdmin(clubIdOrShortId, playerId) {
  // 检查是否创建者、管理员
  let myClub;
  if (typeof clubIdOrShortId === 'number') {
    myClub = await Club.findOne({ shortId: clubIdOrShortId});
  } else {
    // 用 id
    myClub = await Club.findById(clubIdOrShortId);
  }
  if (!myClub) {
    // 俱乐部不存在
    return false;
  }
  if (myClub.owner === playerId) {
    // 创建者
    return true;
  }
  const member = await ClubMember.findOne({ club: myClub._id, member: playerId });
  // 是成员且为管理员
  return member && member.role === 'admin';
}

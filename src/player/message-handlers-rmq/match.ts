import Club from '../../database/models/club'
import ClubMember from '../../database/models/clubMember'
import PlayerModel from '../../database/models/player'
import {service} from "../../service/importService";
import {AsyncRedisClient} from "../../utils/redis"
import {ISocketPlayer} from "../ISocketPlayer"
import {GameType, TianleErrorCode} from "@fm/common/constants";

export function lobbyQueueNameFrom(gameType: string) {
  return `${gameType}Lobby`
}

const allGameName = [GameType.mj, GameType.xueliu, GameType.guobiao, GameType.pcmj, GameType.xmmj, GameType.ddz]

export function createHandler(redisClient: AsyncRedisClient) {
  return {
    'room/reconnect': async (player, message) => {
      const room = await service.roomRegister.getDisconnectedRoom(player.model._id.toString(), message.gameType);
      if (room) {
        player.currentRoom = room
        player.setGameName(message.gameType)
        player.requestToCurrentRoom('room/reconnect')
      } else {
        player.sendMessage('room/reconnectReply', {ok: false, data: {}})
      }
    },

    // 玩家加入房间
    'room/join-friend': async (player, message) => {
      const roomExists = await service.roomRegister.isRoomExists(message._id)
      if (roomExists) {
        player.setGameName(message.gameType)
        // 加入房间
        player.requestToRoom(message._id, 'joinRoom', message)
      } else {
        player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.notInRoom})
      }
    },

    'room/login': async (player, message) => {
      const playerId = message.playerId;
      const gameType = message.gameType || GameType.xmmj;
      player.model = await PlayerModel.findOne({_id: playerId}).lean();
      player.setGameName(gameType);
      await player.connectToBackend(gameType);

      player.model.disconnectedRoom = false
      for (let i = 0; i < allGameName.length; i++) {
        // 下发掉线子游戏
        const room = await service.roomRegister.getDisconnectRoomByPlayerId(player.model._id.toString(), allGameName[i]);
        if (room) {
          // 掉线的子游戏类型
          player.model.disconnectedRoom = true;
          player.model.disconnectedRoomId = room;
          player.model.continueGameType = allGameName[i];
        }
      }

      return player.sendMessage('room/loginReply', {ok: true, data: {model: player.model}})
    },

    'room/create': async (player, message) => {
      try {
        const rule = message.rule;
        const gameType = message.gameType;
        rule.gameType = gameType;
        const playerId = message.playerId;
        player.model = await PlayerModel.findOne({_id: playerId}).lean();
        return player.requestTo(lobbyQueueNameFrom(gameType), 'createRoom', {rule, gameType});
      } catch (e) {
        console.warn(e);
      }
    },

    'room/next-game': player => {
      player.requestToCurrentRoom('room/next-game');
    },
    'room/leave': player => {
      player.requestToCurrentRoom('room/leave')
    },

    // 用户准备
    'room/ready': player => {
      player.requestToCurrentRoom('room/ready', {})
    },

    // 等待界面数据
    'room/awaitInfo': async player => {
      player.requestToCurrentRoom('room/awaitInfo', {})
    },

    // 洗牌&开始游戏
    'room/shuffleDataApply': async (player, message) => {
      player.requestToCurrentRoom('room/shuffleDataApply', message)
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
          roomId: message._id, myGameType: player.gameName, gameType: message.gameType
        })
      }
    }
  }
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

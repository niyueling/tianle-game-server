import {RuleType, TianleErrorCode} from "@fm/common/constants";
import Club from '../../database/models/club'
import ClubMember from '../../database/models/clubMember'
import {ClubRuleModel} from "../../database/models/clubRule";
import Lobby from '../../match/zhadan/centerlobby';
import ClubExtra from "../../database/models/clubExtra";
import {service} from "../../service/importService";
import {createClient} from "../../utils/redis";
import PlayerModel from '../../database/models/player'
import ClubRequest from "../../database/models/clubRequest";
import ClubMessage from "../../database/models/clubMessage";
import ClubMerge from "../../database/models/clubMerge";

function lobbyQueueNameFrom(gameType: string) {
  return `${gameType}Lobby`
}

export async function getPlayerClub(playerId, clubId?: string) {
  let clubMemberInfo;
  if (clubId) {
    clubMemberInfo = await ClubMember.findOne({member: playerId, club: clubId})
  } else {
    clubMemberInfo = await ClubMember.findOne({member: playerId})
  }

  if (!clubMemberInfo) {
    const ownerClub = await Club.findOne({owner: playerId});
    if (ownerClub) {
      return ownerClub;
    }
    return false
  }
  return await Club.findOne({_id: clubMemberInfo.club}).lean();
}

async function getClubRooms(clubId, gameType = null) {
  let clubRooms = [];
  const redis = createClient();
  const roomNumbers = await redis.smembersAsync('clubRoom:' + clubId);
  const roomInfoKeys = roomNumbers.map(num => 'room:info:' + num);
  let roomDatas = [];
  if (roomInfoKeys.length > 0) {
    roomDatas = await redis.mgetAsync(roomInfoKeys);
  }

  for (const roomData of roomDatas) {
    const roomInfo = JSON.parse(roomData);
    if (roomInfo) {
      const rule = roomInfo.gameRule || 'err';
      const roomNum = roomInfo._id || 'err';
      const roomCreator = roomInfo.creatorName || 'err';
      const playerOnline = roomInfo.players.filter(x => x).length + roomInfo.disconnected.length;
      const juIndex = roomInfo.game.juIndex;
      const playerAvatars = [];

      for (let i = 0; i < roomInfo.players.length; i++) {
        const p = roomInfo.players[i];

        if (p) {
          const pModel = await service.playerService.getPlayerModel(p);
          playerAvatars.push(pModel.avatar);
        }
      }

      if (gameType && rule.gameType !== gameType) {
        continue;
      }

      clubRooms.push({roomNum, roomCreator, rule, playerOnline, juIndex, gameType: rule.gameType, playerCount: rule.playerCount, playerAvatars: playerAvatars});
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

export async function getUnReadMessage(player) {
  const ownerClub = await Club.find({owner: player.model._id});
  const tempClub = [];
  if (ownerClub && ownerClub.length > 0) {
    // 存在俱乐部
    ownerClub.forEach(c => {
      tempClub.push(c.shortId);
    })
  }

  const myClub = tempClub;
  let joinClubShortIds = [];

  const playerShortIds = await getPlayerJoinClub(player.model._id);
  if (playerShortIds) {
    joinClubShortIds = playerShortIds;
  }

  const totalClubdIds = [...new Set([...joinClubShortIds, ...myClub])];
  // 获取是否有未读消息
  const unReadMessageIds = [];
  for (let i = 0; i < totalClubdIds.length; i++) {
    const clubShortId = totalClubdIds[i];
    const isAdmin = await playerIsAdmin(player.model._id, clubShortId);
    let messageLists = [];
    const clubMessageInfo = await ClubMessage.find({clubShortId, playerId: player.model._id, state: 1});
    messageLists = [...messageLists, ...clubMessageInfo];

    if (isAdmin) {
      const clubRequestInfo = await ClubRequest.find({clubShortId, type: 1, status: 0});
      const clubMergeInfo = await ClubMerge.find({fromClubId: clubShortId, status: 0});
      messageLists = [...messageLists, ...clubRequestInfo, ...clubMergeInfo];
    }

    if (messageLists.length > 0) {
      unReadMessageIds.push(clubShortId);
    }
  }

  return unReadMessageIds;
}

export async function playerIsAdmin(playerId, clubShortId) {
  const club = await Club.findOne({shortId: clubShortId})
  if (!club) {
    return false
  }
  const clubMemberInfo = await ClubMember.findOne({member: playerId, club: club._id})

  if (clubMemberInfo) {
    return clubMemberInfo.role === 'admin' || playerId.toString() === club.owner;
  }
  return false
}

export async function getPlayerJoinClub(playerId) {
  let clubMemberInfo = await ClubMember.find({member: playerId});
  const shortIds = [];

  for (let i = 0; i < clubMemberInfo.length; i++) {
    const clubInfo = await Club.findOne({_id: clubMemberInfo[i].club}).lean();
    shortIds.push(clubInfo.shortId);
  }

  return shortIds;
}

export async function getClubInfo(clubId, player?) {
  const playerClub = await getPlayerClub(player._id, clubId);
  if (!playerClub) {
    player.sendMessage('club/getClubInfoReply', {ok: false, info: TianleErrorCode.notClubPlayer});
    return;
  }

  const allClubMemberShips = await ClubMember.find({member: player._id}).populate('club').lean();
  const clubs = allClubMemberShips.map(cm => cm.club);
  const room = await getClubRooms(playerClub._id);
  const currentClubMemberShip = allClubMemberShips.find(x => x.club._id.toString() === clubId.toString());
  const isAdmin = (currentClubMemberShip && currentClubMemberShip.role === 'admin');
  const isClubOwner = playerClub.owner === player._id.toString();
  const isPartner = (currentClubMemberShip && currentClubMemberShip.partner);
  const clubOwnerId = playerClub.owner;
  const clubOwner = await PlayerModel.findOne({_id: clubOwnerId}).sort({nickname: 1});
  const clubRule = await getClubRule(playerClub);
  const currentClubPlayerGold = currentClubMemberShip && currentClubMemberShip.clubGold || 0;
  const unReadMessage = await getUnReadMessage(player);
  const clubInfo = {
    diamond: clubOwner.diamond,
    name: clubOwner.nickname,
    clubGold: currentClubPlayerGold,
    clubName: playerClub.name,
    freeRenameCount: playerClub.freeRenameCount,
    clubShortId: playerClub.shortId,
    publicRule: clubRule.publicRule
  }

  return { ok: true, data: {roomInfo: room, clubInfo, unReadMessage, clubs, isAdmin: !!isAdmin, isPartner: !!isPartner, isClubOwner} };
}

async function playerInClub(clubShortId: string, playerId: string) {
  if (!clubShortId) {
    return false;
  }
  const club = await Club.findOne({shortId: clubShortId});
  if (!club) {
    return false;
  }

  if (club.owner === playerId) {
    return true;
  }

  return ClubMember.findOne({club: club._id, member: playerId}).exec();
}

export async function playerInClubBlacklist(clubId, playerId) {
  const clubExtra = await getClubExtra(clubId);
  const clubBlacklist = clubExtra && clubExtra.blacklist || [];
  return clubBlacklist.find(x => x === playerId.toString());
}

export async function playerInClubPartnerBlacklist(clubId, playerId) {
  const clubExtra = await getClubExtra(clubId);
  const clubBlacklist = clubExtra && clubExtra.partnerBlacklist || [];
  return clubBlacklist.find(x => x === playerId.toString());
}

async function getClubExtra(clubId) {
  let clubExtra = await ClubExtra.findOne({clubId});
  if (!clubExtra) {
    clubExtra = await ClubExtra.create({
      clubId
    });
  }
  return clubExtra;
}

// 创建俱乐部房间
async function createClubRoom(player, message) {
  if (!await playerInClub(message.clubShortId, player._id)) {
    player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.notClubMember});
    return
  }

  const club = await Club.findOne({shortId: message.clubShortId})
  if (!club) {
    player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.clubNotExists});
    return
  }
  if (club.state === 'off') {
    player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.clubIsPause});
    return
  }
  const playerInBlacklist = await playerInClubBlacklist(club._id, player._id)
  if (playerInBlacklist) {
    player.sendMessage('room/joinReply', {ok: false, info: TianleErrorCode.notJoinClubGame});
    return
  }

  const rule = message.rule;
  const gameType = message.gameType;
  rule.gameType = gameType;
  player.setGameName(gameType);
  await player.connectToBackend(gameType);
  await player.listenClub(club._id);
  player.requestTo(lobbyQueueNameFrom(gameType), 'createClubRoom', { rule, clubId: club._id, gameType: gameType });
}

export async function requestToAllClubMember(channel, name, clubId, gameType, info) {

  const club = await Club.findOne({ _id: clubId });

  if (!club) {
    return
  }

  channel.publish(
    `exClubCenter`,
    `club:${clubId}`,
    toBuffer({ name, payload: info }))
}

function toBuffer(messageJson) {
  return new Buffer(JSON.stringify(messageJson))
}

export default {
  'club/create': createClubRoom,
}

/**
 * 获取 club 规则
 * @param club club model
 */
async function getClubRule(club) {
  const publicRule = [];
  const goldRule = [];
  const result = await ClubRuleModel.find({ clubId: club._id });
  if (result.length > 0) {
    for (const r of result) {
      if (r.ruleType === RuleType.public) {
        publicRule.push({...r.rule, ruleId: r._id.toString()});
      } else if (r.ruleType === RuleType.gold) {
        goldRule.push({...r.rule, ruleId: r._id.toString()});
      }
    }
  }
  return { publicRule, goldRule };
}

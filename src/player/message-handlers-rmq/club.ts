import {RuleType, TianleErrorCode} from "@fm/common/constants";
import Club from '../../database/models/club'
import ClubMember from '../../database/models/clubMember'
import {ClubRuleModel} from "../../database/models/clubRule";
import Lobby from '../../match/zhadan/centerlobby';
import ClubExtra from "../../database/models/clubExtra";
import {service} from "../../service/importService";
import {createClient} from "../../utils/redis";
import PlayerModel from '../../database/models/player'

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

export async function getClubInfo(clubId, player?) {
  const playerClub = await getPlayerClub(player._id, clubId);
  if (!playerClub) {
    player.sendMessage('club/getClubInfoReply', {ok: false, info: TianleErrorCode.notClubPlayer});
    return;
  }

  const allClubMemberShips = await ClubMember.find({member: player._id}).populate('club').lean();
  const clubs = allClubMemberShips.map(cm => cm.club);
  const room = await getClubRooms(playerClub._id);
  const currentClubMemberShip = allClubMemberShips.find(x => x.club._id.toString() === clubId);
  const isAdmin = (currentClubMemberShip && currentClubMemberShip.role === 'admin');
  const isClubOwner = playerClub.owner === player._id.toString();
  const isPartner = (currentClubMemberShip && currentClubMemberShip.partner);
  const clubOwnerId = playerClub.owner;
  const clubOwner = await PlayerModel.findOne({_id: clubOwnerId}).sort({nickname: 1});
  const clubRule = await getClubRule(playerClub);
  const currentClubPlayerGold = currentClubMemberShip && currentClubMemberShip.clubGold || 0;
  const clubInfo = {
    diamond: clubOwner.diamond,
    name: clubOwner.nickname,
    clubGold: currentClubPlayerGold,
    clubName: playerClub.name,
    clubShortId: playerClub.shortId,
    publicRule: clubRule.publicRule
  }

  return { ok: true, data: {roomInfo: room, clubInfo, clubs, isAdmin: !!isAdmin, isPartner: !!isPartner, isClubOwner} };
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
  const clubExtra = await getClubExtra(clubId)
  const clubBlacklist = clubExtra && clubExtra.blacklist || []
  return clubBlacklist.find(x => x === playerId)
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

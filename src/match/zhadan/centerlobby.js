/**
 * Created by user on 2016-07-05.
 */
import Room from './room';
import {LobbyFactory} from '../lobbyFactory'
import {RewardConfigModel, RewardType} from '../../database/models/RewardConfig'
import {BattleRoom, TournamentRoom} from "./TournamentRoom";
import {accAdd} from "../../utils/algorithm";
import {PublicRoom} from "./publicRoom";
import {GameType} from "@fm/common/constants";

const Lobby = LobbyFactory({
  gameName: GameType.zd,
  roomFactory: function (id, rule, roomType = '', extraObj = {}) {
    if(roomType === 'battle'){
      return new BattleRoom(rule, extraObj.playerScore)
    }
    if(roomType === 'tournament') {
      return new TournamentRoom(rule, extraObj.playerScore, extraObj.reporter)
    }
    let room;
    if (rule.isPublic) {
      room = new PublicRoom(rule);
    } else {
      room = new Room(rule);
    }
    room._id = id;
    return room
  },
  // fixme: Room 被循环引用, 暂时采用函数调用来延迟 ref roomFee
  roomFee: (rule) => Room.roomFee(rule),
  normalizeRule: async (rule) => {
    return {
      ...rule
    }
  }
})

export default Lobby;

/**
 * Created by user on 2016-07-05.
 */
import {RewardConfigModel, RewardType} from "../../database/models/RewardConfig";
import Room from './room';
import {LobbyFactory} from '../lobbyFactory'
import {accAdd} from "../../utils/algorithm";
import {PublicRoom} from "./publicRoom";

const Lobby = LobbyFactory({
  gameName: 'majiang',
  roomFactory: function (id, rule, roomType = '', extraObj = {}) {
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
    return rule
  }

})

export default Lobby;

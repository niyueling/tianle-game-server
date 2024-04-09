/**
 * Created by user on 2016-07-05.
 */
import Room from './room';
import {LobbyFactory} from '../lobbyFactory'
import {PublicRoom} from "./publicRoom";

const Lobby = LobbyFactory({
  gameName: 'xueliu',
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

    return {
      ...rule
    }
  }

})

export default Lobby;

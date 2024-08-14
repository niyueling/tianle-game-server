/**
 * Created by user on 2016-07-05.
 */

import Room from './room';
import {LobbyFactory} from '../lobbyFactory'
import {GameType} from "@fm/common/constants";
import {PublicRoom} from "./publicRoom";

const Lobby = LobbyFactory({
  gameName: GameType.ddz,
  roomFactory: function (id, rule) {
    let room;
    if (rule.isPublic) {
      room = new PublicRoom(rule, id);
    } else {
      room = new Room(rule, id);
    }
    room._id = id;
    return room
  },
  // fixme: Room 被循环引用, 暂时采用函数调用来延迟 ref roomFee
  roomFee: (rule) => Room.roomFee(rule)
})

export default Lobby;

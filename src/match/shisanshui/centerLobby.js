/**
 * Created by user on 2016-07-05.
 */

import Room from './room';
import {LobbyFactory} from '../lobbyFactory'

const Lobby = LobbyFactory({
  gameName: 'shisanshui',
  roomFactory: function (id, rule) {
    const room = new Room(rule, id);
    room._id = id;
    return room
  },
  // fixme: Room 被循环引用, 暂时采用函数调用来延迟 ref roomFee
  roomFee: (rule) => Room.roomFee(rule)
})

export default Lobby;

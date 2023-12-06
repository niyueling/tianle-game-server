/**
 * Created by comet on 2016/8/11.
 */

const handlers = {
  'chat/send': (player, message) => {
    if (player.chatChannel) {
      player.chatChannel.chat(player, message.text);
    }
  },
};

export default handlers;

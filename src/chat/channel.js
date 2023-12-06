/**
 * Created by comet on 2016/8/9.
 */

export default class Channel {
  constructor(capacity = 200) {
    this.players = new Set();
    this.capacity = capacity;
  }

  join(player) {
    if (this.players.size >= this.capacity) {
      return false;
    }
    if (this.players.has(player)) {
      return false;
    }
    player.once('disconnect', () => this.leave(player));
    this.players.add(player);
    const p = player;
    p.chatChannel = this;
    return true;
  }

  isFull() {
    return this.players.size >= this.capacity;
  }

  leave(player) {
    const p = player;
    this.players.delete(p);
    p.chatChannel = null;
  }

  chat(player, text) {
    const sender = {
      _id: player._id,
      name: player.name,
    };
    this.players.forEach((x) => x.sendMessage('chat/message', { sender, text }));
  }
}

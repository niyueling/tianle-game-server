/**
 * Created by comet on 2016/8/9.
 */
import Channel from './channel';

let instance = null;

export default class ChannelManager {
  static getInstance() {
    if (!instance) {
      instance = new ChannelManager();
    }
    return instance;
  }

  static destroyInstance() {
    instance = null;
  }

  constructor() {
    this.channels = [];
  }

  getChannel() {
    let channel = this.channels.find((x) => !x.isFull());
    if (!channel) {
      channel = new Channel();
      this.channels.push(channel);
    }
    return channel;
  }
}

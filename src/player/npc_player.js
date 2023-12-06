/**
 * Created by Color on 2016/8/10.
 */
import * as uuid from 'node-uuid';
import * as random from 'lodash/random'
import gameHandlers from './message-handlers-rmq/game';

class NpcPlayer {
  constructor(model = {}) {
    this.location = '本地';

    const played = random(20, 1000)
    this.model = {
      _id: uuid.v1(),
      shortId: 10000000 + random(1000, 9000),
      name: 'robot',
      gem: random(30, 60),
      gold: random(-100, 200),
      ruby: random(2000, 24000),
      played,
      winned: random(1, Math.round(played / 2)),
      ...model
    };

    this.ip = Array
      .from({length: 4})
      .fill(0)
      .map(() => random(1, 254))
      .join('.')

  }

  getIpAddress() {
    return this.ip
  }

  sendMessage() {

  }

  onDisconnect() {

  }

  disconnect() {

  }

  get _id() {
    return this.model._id;
  }

  get ruby() {
    return this.model.ruby;
  }

  on() {
    return this;
  }

  once() {
    return this;
  }

  removeAllListeners() {
    return this;
  }

  removeListener() {
    return this;
  }

  isRobot() {
    return true;
  }

  getGameMsgHandler() {
    return gameHandlers;
  }
}

export default NpcPlayer;

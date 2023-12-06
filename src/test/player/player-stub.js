/**
 * Created by user on 2016-07-07.
 */
import * as EventEmitter from 'events';
import * as uuid from 'node-uuid'

class PlayerStub extends EventEmitter {
  constructor() {
    super();
    this.model = {
      _id: 'comet' + uuid(),
      name: 'comet',
      gold: 10000
    };
  }

  get _id() {
    return this.model._id;
  }

  get name() {
    return this.model.name;
  }

  sendMessage() {
  }

  getIpAddress() {
    return 'localhost';
  }

  isRobot() {
    return false;
  }
}


export default PlayerStub;

import * as chai from 'chai';
import * as ms from 'ms'
import * as sinon from 'sinon';
import resourceHandler, {getRandomNum} from '../../../player/message-handlers-rmq/resource'
import * as config from '../../../config'
import Player from '../player-stub';

chai.should();

describe('ResourceHandlers', () => {
  it('should not use gem more than have', async () => {
    const player = new Player();
    player.model.gem = 10;
    const spy = sinon.spy(player, 'sendMessage');
    await resourceHandler['resource/gem2gold'](player, {gemCount: 20});
    spy.args[0][1].success.should.be.false;

    spy.args[0][1].reason.should.be.equal('当前所有钻石不足');
  });

  it.skip('10w luck draw', function () {
    this.timeout(ms('1m'))
    const map = {}
    const prizes = config.game.prizeIndex2Prize
    for (let i = 0; i < 1000000; i++) {
      let result = getRandomNum()
      const prize = prizes[result.index - 1];
      const key = prize.type + '' + prize.count
      if (map[key]) map[key]++
      else map[key] = 1
    }
    console.log("resource.js  29", map)
  });
});



/**
 * Created by Mcgrady on 2016/8/11.
 */
import * as chai from 'chai';
import * as sinon from 'sinon';
import Player from '../player-stub';
import socialHandlers from '../../../player/message-handlers-rmq/social';

chai.should();

describe('SocialHandlers', () => {
  it('shouldnot gift resource to not exist player', async () => {
    const GiftSender = new Player();
    GiftSender.model.gem = 10;
    GiftSender.model.gold = 10;
    const spy = sinon.spy(GiftSender, 'sendMessage');
    await socialHandlers['social/giftResource'](GiftSender,
      {playerName: '我根本不存在', gem: 5, gold: 5});
    spy.args[0][1].success.should.be.false;
    spy.args[0][1].errMsg.should.be.equal('查无此人');
  });
});

import * as chai from 'chai';
import * as sinon from 'sinon';
import Channel from '../../chat/channel';

import PlayerStub from '../player/player-stub';

const should = chai.should();

describe('ChatChannel', () => {
  let player = null;
  let channel = null;
  beforeEach(() => {
    player = new PlayerStub();
    channel = new Channel();
  });
  it('should receive broadcast message after added to channel.', () => {
    const spy = sinon.spy(player, 'sendMessage');
    channel.join(player);
    player.chatChannel.should.equal(channel);
    channel.chat(player, 'hello');
    const sender = { _id: player._id, name: player.name };
    spy.calledWith('chat/message', { sender, text: 'hello' }).should.be.true;
  });
  it('should leave channel when disconnect.', () => {
    channel.join(player);
    player.emit('disconnect');
    channel.players.has(player).should.be.false;
    should.not.exist(player.chatChannel);
  });
  it('should not join a full channel.', () => {
    channel = new Channel(1);
    const player2 = new PlayerStub();
    channel.join(player).should.be.true;
    channel.join(player2).should.be.false;
  });
});

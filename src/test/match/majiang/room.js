/**
 * Created by user on 2016-07-04.
 */

import * as sinon from 'sinon';
import * as chai from 'chai';

import Room, {PublicRoom} from '../../../match/majiang/room';
import * as lo from 'lodash'

const should = chai.should();
const expect = chai.expect;

describe('Room', () => {
  it('should have capacity.', () => {
    const room = new Room({});
    const player1 = new PlayerStub();
    const player2 = new PlayerStub();
    const player3 = new PlayerStub();
    const player4 = new PlayerStub();
    const player5 = new PlayerStub();
    room.join(player1).should.equal(true);
    player1.should.have.property('room');
    room.join(player2).should.equal(true);
    room.join(player3).should.equal(true);
    room.join(player4).should.equal(true);
    room.isFull().should.be.true;
    room.join(player5).should.equal(false);
  });
  it('can not join twice.', () => {
    const room = new Room({});
    const player1 = new PlayerStub();
    room.join(player1).should.equal(true);
    room.join(player1).should.equal(true);
  });
  it.skip('can leave.', () => {
    const room = new Room({});
    const player1 = new PlayerStub();
    const player2 = new PlayerStub();
    room.join(player1);
    room.join(player2);
    room.leave(player2).should.be.ok;
    should.not.exist(player2.room);
    room.leave(player2).should.not.be.ok;
    room.getPlayers().indexOf(player2).should.equal(-1);
    room.getPlayers().indexOf(player1).should.not.equal(-1);
  });

  it('should send old player join message to new player.', () => {
    const room = new Room(2);
    const player1 = new PlayerStub();
    const player2 = new PlayerStub();
    const spy1 = sinon.spy(player1, 'sendMessage');
    const spy2 = sinon.spy(player2, 'sendMessage');
    room.join(player1);
    spy1.calledOnce.should.be.truthy;
    room.join(player2);
    spy2.calledTwice.should.be.truthy;
  });
  it('should broadcast join/leave message.', () => {
    const room = new PublicRoom({isPublic: true, playerCount: 4});
    const player1 = new PlayerStub();
    const broadcastSpy = sinon.spy(room, 'broadcast');
    room.join(player1).should.equal(true);
    broadcastSpy.calledOnce.should.be.true;
    broadcastSpy.calledWith('room/join').should.be.true;
    room.leave(player1).should.equal(true);
    broadcastSpy.calledTwice.should.be.true;
    broadcastSpy.calledWith('room/leave').should.be.true;
  });
  it('should fire events.', () => {
    const onJoin = sinon.spy();
    const onLeave = sinon.spy();
    const onEmpty = sinon.spy();
    const room = new PublicRoom({isPublic: true, playerCount: 4});
    room.on('join', onJoin);
    room.on('leave', onLeave);
    room.on('empty', onEmpty);
    const player1 = new PlayerStub();
    room.join(player1);
    onJoin.calledOnce.should.be.true;
    onJoin.calledWith(player1);
    room.leave(player1);
    onLeave.calledOnce.should.be.true;
    onLeave.calledWith(player1);
    onEmpty.calledOnce.should.be.true;
  });
  it.skip('should leave on disconnect.', () => {
    const room = new Room({isPublic: true, playerCount: 4});
    const player1 = new PlayerStub();
    room.join(player1).should.be.true;
    const spy = sinon.spy(room, 'leave');
    player1.emit('disconnect', player1);
    spy.withArgs(player1).calledOnce.should.be.true;
    player1.emit('disconnect', player1);
    // should not call twice
    spy.withArgs(player1).calledOnce.should.be.true;
  });
  it('should not call leave again on left player disconnect.', () => {
    const room = new Room({isPublic: true, playerCount: 4});
    const player1 = new PlayerStub();
    room.join(player1);
    room.leave(player1);
    const spy = sinon.spy(room, 'leave');
    player1.emit('disconnect', player1);
    spy.withArgs(player1).calledOnce.should.not.be.true;
  });


  describe.skip('房间收费', function () {

    let roomShareFeeWith4Players
    beforeEach(() => {
      roomShareFeeWith4Players = new Room({share: true, playerCount: 4})
      roomShareFeeWith4Players.public = false
      lo.times(4, () => {
        roomShareFeeWith4Players.join(new PlayerStub());
      })
    })

    it('shares the fee by default', () => {
      roomShareFeeWith4Players.charge()
      const allFee = roomShareFeeWith4Players.privateRoomFee()

      for (let player of roomShareFeeWith4Players.players) {
        expect(player.model.gem).to.equal(allFee / 4)
      }
    })


    it('房费只收一次', () => {
      roomShareFeeWith4Players.charge()
      roomShareFeeWith4Players.charge()

      for (let player of roomShareFeeWith4Players.players) {
        expect(player.model.gold).to.equal(10000 - roomShareFeeWith4Players.privateRoomFee() / 4)
      }
    })

    it('私人房间 房主买单', function () {
      const room = new Room({share: false, playerCount: 4})

      lo.times(4, () => {
        room.join(new PlayerStub())
      })
      room.creator = room.players[0]


      room.charge()
      expect(room.creator.model.gold).to.equal(10000 - room.privateRoomFee())

      for (let player of room.players.slice(1)) {
        expect(player.model.gold).to.equal(10000)
      }
    });

    it('私人房间 房主买单 只收一次房主一次费用', function () {
      const room = new Room({share: false, playerCount: 4})

      lo.times(4, () => {
        room.join(new PlayerStub())
      })
      room.creator = room.players[0]

      room.charge()
      room.charge()
      expect(room.creator.model.gold).to.equal(10000 - room.privateRoomFee())

      for (let player of room.players.slice(1)) {
        expect(player.model.gold).to.equal(10000)
      }
    })

    it('公共房间所有人都收费', function () {

      let room = new Room({share: false, playerCount: 4, isPublic: true})
      lo.times(4, () => {
        room.join(new PlayerStub())
      })

      room.charge()

      for (let player of room.players) {
        expect(player.model.gold).to.equal(9000)
      }
    });

    it('公共房间可以重复收费', function () {

      let room = new Room({share: false, playerCount: 4, isPublic: true})


      lo.times(4, () => {
        room.join(new PlayerStub())
      })

      room.charge()
      room.charge()

      for (let player of room.players) {
        expect(player.model.gold).to.equal(8000)
      }
    })
  })
});

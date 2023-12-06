import * as chai from 'chai'
import TableState from '../../../match/majiang/table_state'
import setupMatch from './setupMatch'
import {displayMessage, packets} from './mockwebsocket'
import Room from "../../../match/majiang/room";
import {last} from 'lodash'

const {expect} = chai
chai.use(require('chai-properties'))


describe('解散', function() {

  let room:Room, table: TableState;
  let player1, player2, player3, player4;
  beforeEach(function () {
    let match = setupMatch()
    table = match.table
    room = match.room
    player1 = match.players[0]
    player2 = match.players[1]
    player3 = match.players[2]
    player4 = match.players[3]
  })

  it('2人在线:需要两个人同时同意',()=>{
    room.playerDisconnect(room.players[0]);
    room.playerDisconnect(room.players[1]);
    room.onRequestDissolve(room.players[2]);
    room.onAgreeDissolve(room.players[3]);
    displayMessage()
    // var msg = last(packets.filter(p => p.name === 'room/dissolve')).message
    // console.log('====msg  ' + msg.players[0])
    // expect(room.canDissolve()).to.equal(true)
    expect(last(packets)).to.have.properties({'name':'room/dissolve'})
  })

  it('3人在线:多数同意',()=>{
    room.playerDisconnect(room.players[2])
    room.onRequestDissolve(room.players[0]);
    room.onAgreeDissolve(room.players[3]);

    displayMessage()
    // expect(room.canDissolve()).to.equal(true)
    expect(last(packets)).to.have.properties({'name':'room/dissolve'})

  })

  it('4人在线:多数同意',()=>{
    room.onRequestDissolve(room.players[0]);
    room.onAgreeDissolve(room.players[3]);
    room.onAgreeDissolve(room.players[2]);
    // expect(room.canDissolve()).to.equal(true)
    expect(last(packets)).to.have.properties({'name':'room/dissolve'})
  })

  it('2人在线：1人否',()=>{
    room.playerDisconnect(room.players[0]);
    room.playerDisconnect(room.players[3]);
    room.onRequestDissolve(room.players[2]);
    room.onDisagreeDissolve(room.players[1]);
    let msg = last(packets.filter(p => p.name === 'room/dissolveReq')).message
    expect(room.canDissolve()).to.equal(false);
    let disAgrssNum = 0;
    msg.dissolveReqInfo.forEach(x => {
      if(x.type === 'disAgree') {
        disAgrssNum++;
      }
    })
    expect(disAgrssNum).to.equal(1);
  })

  it('3人在线：1人否',()=>{
    room.playerDisconnect(room.players[0]);
    room.onRequestDissolve(room.players[2]);
    room.onDisagreeDissolve(room.players[1]);
    let msg = last(packets.filter(p => p.name === 'room/dissolveReq')).message
    expect(room.canDissolve()).to.equal(false);
    let disAgrssNum = 0;
    msg.dissolveReqInfo.forEach(x => {
      if(x.type === 'disAgree') {
        disAgrssNum++;
      }
    })
    expect(disAgrssNum).to.equal(1);
  })

  it('4人在线：1人否',()=>{
    room.onRequestDissolve(room.players[2]);
    room.onDisagreeDissolve(room.players[1]);
    let msg = last(packets.filter(p => p.name === 'room/dissolveReq')).message
    expect(room.canDissolve()).to.equal(false);
    let disAgrssNum = 0;
    msg.dissolveReqInfo.forEach(x => {
      if(x.type === 'disAgree') {
        disAgrssNum++;
      }
    })
    expect(disAgrssNum).to.equal(1);
  })
});

// 吃牌
import * as chai from "chai";
import Enums from "../../../match/xmmajiang/enums";
import setupMatch, {emptyCards, filterMessage} from "./setupMatch";

chai.should();

describe('测试吃牌', async () => {
  let match;
  let table;
  let playerState1;
  let playerState2;
  let playerState3;
  let playerState4;
  let playerSockets;
  let msg;

  beforeEach(async () => {
    match = await setupMatch();
    table = match.table;
    playerSockets = match.playerSockets;
    playerState1 = match.players[0];
    playerState2 = match.players[1];
    playerState3 = match.players[2];
    playerState4 = match.players[3];
    await table.fapai();
    playerState1.cards = emptyCards();
    playerState2.cards = emptyCards();
    playerState3.cards = emptyCards();
    playerState4.cards = emptyCards();
  })
  it('吃牌', async () => {
    playerState1.cards[Enums.wanzi1] = 1;
    // 可吃
    playerState2.cards[Enums.wanzi2] = 1;
    playerState2.cards[Enums.wanzi3] = 1;
    // 可碰
    playerState3.cards[Enums.wanzi1] = 2;
    table.state = 1;
    table.stateData = {[Enums.da]: playerState1 }
    await table.onPlayerDa(playerState1, table.turn, Enums.wanzi1);
    // 可吃
    msg = filterMessage(playerSockets[1], 'game/canDoSomething');
    msg.length.should.gt(0, 'canDoSomething 消息不存在')
    msg[0].message.chi.should.equal(true)
    // 可碰
    msg = filterMessage(playerSockets[2], 'game/canDoSomething');
    msg.length.should.gt(0, 'canDoSomething 消息不存在')
    msg[0].message.peng.should.equal(true)
  });
})

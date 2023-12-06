import * as chai from "chai";
import Enums from "../../../match/xmmajiang/enums";
import {pingHuList} from "./huCards";
import setupMatch, {initBeforeMocha, resetAudit} from "./setupMatch";

chai.should();

// 结算
describe('结算', async () => {
  let match;
  // let table;
  let playerState1;
  // let playerState2;
  // let playerState3;
  // let playerState4;
  // let playerSockets;
  // let msg;
  let result;
  let targetPlayerId;
  let goldCard;
  before(async () => {
    await initBeforeMocha();
  });

  // beforeEach(async () => {
  // })
  it('花分 无大牌刻子不计分', async () => {
    await resetAudit();
    // 无大牌刻子不计分
    match = await setupMatch(4, {noBigCard: true, noKeZiScore: true });
    await match.table.fapai();
    // 更新player 牌
    playerState1 = match.players[0];
    targetPlayerId = playerState1.model._id;
    await match.room.auditManager.playerTakeCardList(targetPlayerId, pingHuList.common);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(0, '没有花,不能得花分')
    // 拿一张花牌
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.spring);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(0, '1花0分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.summer);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(1, '2花1分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.autumn);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(2, '3花2分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.winter);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(8, '4花8分')
    // 梅竹兰菊
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.mei);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(8, '5花8分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.lan);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(9, '6花9分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.zhu);
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.ju);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(16, '8花16分')
  });
  it('花分 有大牌 or 无大牌刻子计分', async () => {
    // 无大牌刻子不计分
    await resetAudit();
    match = await setupMatch(4, {noBigCard: false, noKeZiScore: true });
    await match.table.fapai();
    // 更新player 牌
    playerState1 = match.players[0];
    targetPlayerId = playerState1.model._id;
    await match.room.auditManager.playerTakeCardList(targetPlayerId, pingHuList.common);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(0, '没有花,不能得花分')
    // 拿一张花牌
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.spring);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(1, '1花1分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.summer);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(2, '2花2分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.autumn);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(3, '3花3分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.winter);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(8, '4花8分')
    // 梅竹兰菊
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.mei);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(9, '5花9分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.lan);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(10, '6花10分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.zhu);
    await match.room.auditManager.playerTakeCard(targetPlayerId, Enums.ju);
    result = match.room.auditManager.flowerScore(targetPlayerId)
    result.should.equal(16, '8花16分')
  });
  it('金分', async () => {
    await resetAudit();
    match = await setupMatch(4, {noBigCard: false, noKeZiScore: true });
    playerState1 = match.players[0];
    targetPlayerId = playerState1.model._id;
    await match.table.fapai();
    // 发财 做金
    goldCard = Enums.fa;
    await match.updateGoldCard(goldCard);
    await match.room.auditManager.playerTakeCardList(targetPlayerId, pingHuList.common);
    result = match.room.auditManager.goldScore(targetPlayerId);
    result.should.equal(0, '0金0分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, goldCard);
    result = match.room.auditManager.goldScore(targetPlayerId);
    result.should.equal(1, '1金1分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, goldCard);
    result = match.room.auditManager.goldScore(targetPlayerId);
    result.should.equal(2, '2金2分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, goldCard);
    result = match.room.auditManager.goldScore(targetPlayerId);
    result.should.equal(3, '3金3分')
    await match.room.auditManager.playerTakeCard(targetPlayerId, goldCard);
    result = match.room.auditManager.goldScore(targetPlayerId);
    result.should.equal(4, '4金4分')
  });
  it('杠分', async () => {
    match = await setupMatch(4, {noBigCard: false, noKeZiScore: true });
    playerState1 = match.players[0];
    targetPlayerId = playerState1.model._id;
    await match.table.fapai();
    playerState1.events = {
      [Enums.mingGang]: [Enums.dong]
    }
    result = match.room.auditManager.gangScore(playerState1);
    result.should.equal(3, '大牌3分')
    playerState1.events[Enums.mingGang].push(Enums.wanzi1);
    result = match.room.auditManager.gangScore(playerState1);
    result.should.equal(5, '其它一个2分')
    playerState1.events[Enums.anGang] = [Enums.bai];
    result = match.room.auditManager.gangScore(playerState1);
    result.should.equal(9, '大牌暗杠4分')
    playerState1.events[Enums.anGang].push(Enums.wanzi2);
    result = match.room.auditManager.gangScore(playerState1);
    result.should.equal(12, '非大牌暗杠3分')
  });
  it('刻子分', async () => {
    match = await setupMatch(4, {noBigCard: false, noKeZiScore: true });
    playerState1 = match.players[0];
    targetPlayerId = playerState1.model._id;
    await match.table.fapai();
    playerState1.events = {
      hu: [{
        huCards: {
        },
      }],
    }
    result = match.room.auditManager.keZiScore(playerState1);
    result.should.equal(0, '刻子不计分')
    match = await setupMatch(4, {noBigCard: false, noKeZiScore: false });
    playerState1 = match.players[0];
    targetPlayerId = playerState1.model._id;
    playerState1.events = {
      hu: [{
        huCards: {
          keZi: [],
        },
      }],
      [Enums.peng]: [Enums.dong]
    }
    result = match.room.auditManager.keZiScore(playerState1);
    result.should.equal(1, '大牌明刻1分')
    playerState1.events[Enums.peng].push(Enums.wanzi1)
    result = match.room.auditManager.keZiScore(playerState1);
    result.should.equal(1, '非大牌明刻0分')
    playerState1.events.hu[0].huCards.keZi.push(Enums.bai, Enums.tongzi1);
    result = match.room.auditManager.keZiScore(playerState1);
    result.should.equal(4, '大牌暗刻2分，非大牌1分')
  });
})

import RoomMaJiangAudit from "../../database/models/roomMaJiangAudit";
import MaJiangAudit from "../../database/models/roomMaJiangAudit";
import Enums from "./enums";

export class AuditManager {
  model: any
  rule: any
  roomId: string
  roomNum: number
  constructor(rule, roomId, roomNum) {
    this.rule = rule;
    this.roomId = roomId;
    this.roomNum = roomNum;
  }

  async init(juIndex?) {
    let model;
    if (!juIndex) {
      // 查找最新一局
      model = await MaJiangAudit.findOne({
        roomId: this.roomId,
      }).sort({ juIndex: -1 })
      if (model) {
        juIndex = model.juIndex;
      } else {
        // 一局都没开始，初始化第一局
        juIndex = 1;
      }
    }
    model = await MaJiangAudit.findOne({
      roomId: this.roomId,
      juIndex,
    });
    if (model) {
      this.model = model;
    } else {
      this.model = await MaJiangAudit.create({
        roomNum: this.roomNum,
        roomId: this.roomId,
        goldCard: 0,
        cardUsed: [],
        juIndex,
        playerCardList: {},
        gangZi: {},
        playerCardRecord: {},
      })
    }
  }

  // 下一局开始
  async start(juIndex, goldCard) {
    if (!this.model || this.model.juIndex !== juIndex) {
      await this.init(juIndex);
    }
    this.model.goldCard = goldCard;
    this.model.cardUsed = new Array(Enums.finalCard).fill(0);
    await this.save();
  }

  async cardUsed(playerId, card) {
    if (this.model.cardUsed[card] === 4) {
      // 已经出完了
      return false;
    }
    this.model.cardUsed[card]++;
    // 扣掉已经出的牌
    this.model.playerCardList[playerId][card]--;
    // 记录摸到的金牌
    if (card === this.model.goldCard) {
      this.model.playerCardRecord[playerId].goldCount--;
    }
    // 最后打的牌
    this.model.playerCardRecord[playerId].lastDa = card;
    await this.save();
  }

  async playerTakeCard(playerId, card) {
    if (!this.model.playerCardList[playerId]) {
      this.model.playerCardList[playerId] = new Array(Enums.finalCard).fill(0);
    }
    if (!this.model.playerCardRecord[playerId]) {
      this.model.playerCardRecord[playerId] = { lastTake: 0, goldCount: 0};
    }
    this.model.playerCardList[playerId][card]++;
    this.model.playerCardRecord[playerId].lastTake = card;
    // 记录摸到的金牌
    if (card === this.model.goldCard) {
      this.model.playerCardRecord[playerId].goldCount++;
    }
    await this.save();
  }

  async playerTakeCardList(playerId, cardList) {
    if (!this.model.playerCardList[playerId]) {
      this.model.playerCardList[playerId] = new Array(Enums.finalCard).fill(0);
    }
    if (!this.model.playerCardRecord[playerId]) {
      this.model.playerCardRecord[playerId] = { lastTake: 0, goldCount: 0};
    }
    for (const card of cardList) {
      this.model.playerCardList[playerId][card]++;
      // 记录摸到的金牌
      if (card === this.model.goldCard) {
        this.model.playerCardRecord[playerId].goldCount++;
      }
    }
    // 记录最后摸的牌
    this.model.playerCardRecord[playerId].lastTake = cardList[cardList.length - 1];
    await this.save();
  }

  async save() {
    // this.model.markModified('playerCardList');
    // this.model.markModified('cardUsed');
    // this.model.markModified('gangZi');
    // this.model.markModified('playerCardRecord');
    await RoomMaJiangAudit.update({ _id: this.model._id}, this.model);
  }

  // 获取手上的大牌
  async getBigCardByPlayerId(playerId, seatIndex = 0, cards = []) {
    const cardList = []
    for (let i = Enums.dong; i <= Enums.bai; i++) {
      // 忽略金牌, TODO 是否忽略白板
      if (this.model.cardUsed[i] > 0 && this.model.goldCard !== i) {
        if (this.model.goldCard < Enums.dong && i === Enums.bai) {
          continue;
        }

        // 已经出过了, 检查自己有没有一张这种牌
        // console.warn("card-%s, cardCount-%s, cardCount1-%s, seatIndex-%s, cardUsed-%s", i, this.model.playerCardList[playerId][i], cards[i], seatIndex, this.model.cardUsed[i]);
        if (cards[i] === 1) {
          cardList.push(i);
        }
      }
    }
    return cardList;
  }

  // 记录杠牌
  async recordGangZi(playerId, card, fromPlayerId, gangType) {
    // 检查 gangZi 是否存在
    if (!this.model.gangZi) {
      this.model.gangZi = {};
    }
    if (!this.model.gangZi[playerId]) {
      this.model.gangZi[playerId] = [];
    }
    for (const item of this.model.gangZi[playerId]) {
      if (item.card === card) {
        return;
      }
    }
    // 杠的类型
    this.model.gangZi[playerId].push({ card, from: fromPlayerId, gangType});
    await this.save();
  }

  // 获取杠子列表
  async getPlayerGangZiList(playerId) {
    const result = [];
    if (!this.model.gangZi[playerId]) {
      return result;
    }
    for (const item of this.model.gangZi[playerId]) {
      result.push(item.card);
    }
    return result;
  }

  // 添加底分
  calculateDiFen(playerState, diFen) {
    // if (this.rule.noBigCard && this.rule.noKeZiScore) {
    //   // 无大牌刻子不计分
    //   diFen = 0;
    // }
    const f = this.flowerScore(playerState._id);
    const g = this.gangScore(playerState);
    const k = this.keZiScore(playerState);
    const gold = this.goldScore(playerState._id);
    // tslint:disable-next-line:max-line-length
    console.debug(`di fen ${diFen}, 总分 ${diFen + f + g + k + gold}, flower score ${f}, gang score ${g}, ke zi score ${k}, gold score ${gold}`);
    return diFen + f + g + k + gold
  }

  // 计花分
  flowerScore(playerId) {
    // if (this.rule.noBigCard && this.rule.noKeZiScore) {
    //   // 无大牌刻子不计分
    //   return this.flowerWithNoBigCardNoKeZi(playerId);
    // }
    // 刻子计分
    return this.normalFlowerScore(playerId);
  }

  // 无大牌刻子不计分
  flowerWithNoBigCardNoKeZi(playerId) {
    const { seasonScore, flowerScore } = this.calculateFlower(playerId);
    let score = 0;
    for (const item of [seasonScore, flowerScore]) {
      if (item === 4) {
        score += 8;
      } else if (item > 1) {
        // 2花1分, 3花2分
        score += item - 1;
      }
    }
    return score;
  }

  // 常规花分
  normalFlowerScore(playerId) {
    const { seasonScore, flowerScore } = this.calculateFlower(playerId);
    let score = 0;
    for (const item of [seasonScore, flowerScore]) {
      if (item === 4) {
        score += 8;
      } else {
        // 1花1分, 2花2分
        score += item;
      }
    }
    return score;
  }

  calculateFlower(playerId) {
    let seasonScore = 0;
    let flowerScore = 0;
    for (let card = Enums.spring; card < Enums.finalCard; card++) {
      if (this.model.playerCardList[playerId][card] > 0) {
        if (card < Enums.mei) {
          // 春夏秋冬
          seasonScore++;
        } else {
          // 梅兰竹菊
          flowerScore++;
        }
      }
    }
    return { seasonScore, flowerScore }
  }

  // 金牌分, 1金1分
  goldScore(playerId) {
    return this.model.playerCardList[playerId] && this.model.playerCardList[playerId][this.model.goldCard] || 0;
  }

  // 杠分
  gangScore(playerState) {
    // 明杠2分, 暗杠3分
    let score = 0;
    if (playerState.events[Enums.mingGang]) {
      for (const card of playerState.events[Enums.mingGang]) {
        if (this.isBigCard(card)) {
          // 大牌 3 分
          score += 3;
        } else {
          score += 2;
        }
      }
    }
    if (playerState.events[Enums.anGang]) {
      for (const card of playerState.events[Enums.anGang]) {
        if (this.isBigCard(card)) {
          // 大牌 4 分
          score += 4;
        } else {
          score += 3;
        }
      }
    }
    return score;
  }

  // 刻子分
  keZiScore(playerState) {
    if (!playerState.events.hu) {
      // 没胡没分或者刻子不计分
      return 0;
    }
    let score = 0;
    if (playerState.events[Enums.peng]) {
      for (const card of playerState.events[Enums.peng]) {
        if (this.isBigCard(card)) {
          // 大牌明刻 1 分
          score += 1;
        }
      }
    }
    // 暗刻
    if (playerState.events.hu.length === 1) {
      // 胡了
      for (const card of playerState.events.hu[0].huCards.keZi) {
        if (this.isBigCard(card)) {
          score += 2;
        } else {
          // 基本牌型暗刻
          score += 1;
        }
      }
    }
    return score;
  }

  isBigCard(card) {
    return card >= Enums.dong && card <= Enums.bai;
  }

  getFlowerList(playerId) {
    const list = [];
    for (let card = Enums.spring; card < Enums.finalCard; card++) {
      if (this.model.playerCardList[playerId] && this.model.playerCardList[playerId][card] > 0) {
        list.push(card);
      }
    }
    return list;
  }

  getGoldCount(playerId) {
    if (!this.model.playerCardRecord[playerId]) {
      return 0;
    }
    return this.model.playerCardRecord[playerId].goldCount || 0;
  }
}

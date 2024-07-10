// 审计跑得快 （春天，反春天）
import {Serializable, serialize, serializeHelp} from "../serializeDecorator";
import Card from "./card";
import Rule from "./Rule";

interface PlayerData {
  // 是否第一个出牌
  isFirstPlay: boolean
  // 出牌次数
  playTimes: number
  // 炸弹次数
  boomTimes: number
  // 剩余牌
  remainCards: Card[]
  // 出牌顺序
  orderList: Card[][]
  // 春天的加、扣分
  springScore: number
  // 反春天的加、扣分
  antSpringScore: number
}

export class AuditPdk implements Serializable {
  @serialize
  currentRound: {[key: string]: PlayerData};

  @serialize
  rule: Rule

  constructor(rule) {
    this.currentRound = {};
    this.rule = rule;
  }

  // 开始下一局
  startNewRound() {
    const keys = Object.keys(this.currentRound);
    this.currentRound = {};
    for (const k of keys) {
      this.initData(k);
    }
  }

  initData(shortId) {
    this.currentRound[shortId] = {
      isFirstPlay: false,
      playTimes: 0,
      remainCards: [],
      orderList: [],
      boomTimes: 0,
      springScore: 0,
      antSpringScore: 0,
    }
  }

  // 第一个出牌
  setFirstPlay(shortId) {
    // 把之前设置的 firstPlay 删除
    for (const k of Object.keys(this.currentRound)) {
      this.currentRound[k].isFirstPlay = false;
    }
    this.currentRound[shortId].isFirstPlay = true;
  }

  // 添加出牌次数
  addPlayTime(shortId, cards) {
    this.currentRound[shortId].playTimes++;
    this.currentRound[shortId].orderList.push(cards);
  }

  toJSON() {
    return serializeHelp(this)
  }

  // 打印数据
  print() {
    console.log('player audit data', JSON.stringify(this.currentRound), this.isSpring());
  }

  setRemainCards(shortId, remainCards) {
    this.currentRound[shortId].remainCards = remainCards;
  }

  // 添加炸弹次数
  addBoomTime(shortId) {
    this.currentRound[shortId].boomTimes++;
  }

  // 炸弹得分, 一个炸弹 10 分
  boomScore(shortId) {
    if (this.rule.countBoomScore) {
      // 炸弹计分
      return this.currentRound[shortId].boomTimes * 10;
    }
    // 炸弹不计分
    return 0;
  }

  // 是否春天
  isSpring(): string[] {
    const playerIdList = this.filter(key => {
      return this.currentRound[key].isFirstPlay;
    })
    let springPlayer = [];
    if (playerIdList.length < 1) {
      // 一个都没有
      console.error('invalid spring check without first play', this.currentRound);
      return springPlayer;
    }
    const firstPlayId = playerIdList[0];
    const firstPlayer = this.currentRound[firstPlayId];
    if (firstPlayer.remainCards.length === 0) {
      // 第一个出牌的人赢了，有可能是春天
      springPlayer = this.filter(key => {
        if (key === firstPlayId) {
          return false;
        }
        return this.currentRound[key].playTimes === 0;
      })
    } else {
      // 第一个出牌的人没赢，而且只出牌一次，反春天
      if (firstPlayer.playTimes === 1) {
        const playCount = this.filter(key => {
          if (key !== firstPlayId) {
            return this.currentRound[key].playTimes > 0;
          }
          return false;
        })
        const noPlayCount = this.filter(key => {
          if (key !== firstPlayId) {
            return this.currentRound[key].playTimes === 0;
          }
          return false;
        })
        if (playCount.length > 0) {
          // 有人出牌，被反春天了
          springPlayer.push(firstPlayId);

          if (noPlayCount.length > 0) {
            // 其它人被春天了
            springPlayer.push(...noPlayCount);
          }
        }
      }
    }
    return springPlayer;
  }

  saveRemainCards(shortId, cards) {
    this.currentRound[shortId].remainCards = cards;
  }

  // 查找数据
  filter(checker: (key: string) => boolean) {
    const list = [];
    for (const k of Object.keys(this.currentRound)) {
      if (checker(k)) {
        list.push(k);
      }
    }
    return list;
  }

  recoverFromJson(jsonObject) {
    this.rule = jsonObject.rule;
    for (const shortId of Object.keys(jsonObject.currentRound)) {
      // 兼容旧数据
      const auditInfo = jsonObject.currentRound[shortId];
      this.currentRound[shortId] = auditInfo;
      if (auditInfo.remainCards && Array.isArray(auditInfo.remainCards)) {
        this.currentRound[shortId].remainCards = auditInfo.remainCards.map(c => Card.from(c));
      } else {
        this.currentRound[shortId].remainCards = [];
      }
      if (auditInfo.orderList) {
        const cards = [];
        for (const cardList of auditInfo.orderList) {
          cards.push(cardList.map(c => Card.from(c)));
        }
        this.currentRound[shortId].orderList = cards;
      } else {
        // 没有保存出牌
        this.currentRound[shortId].orderList = [];
      }
    }
  }
}

import {service} from "../../service/importService";
import algorithm from "../../utils/algorithm";
import Card, {CardTag, CardType, clubs, diamonds, hearts, spades} from "./card";

export class CardManager {
  playerCount: number;
  cardTags: CardTag[];
  remainCardTags: CardTag[];
  consumeCardTags: CardTag[];
  // 用户手上的牌总数
  playerCardCount: number;

  constructor(playerCount) {
    this.playerCount = playerCount;
    this.init()
  }

  // 所有牌
  init() {
    this.cardTags = [...hearts, ...clubs, ...spades, ...diamonds];
    if (this.playerCount === 2 || this.playerCount === 3) {
      // 删除 3个2，1个a
      this.excludeCardByTag(this.cardTags, CardTag.c2, CardTag.s2, CardTag.d2, CardTag.da)
    } else if (this.playerCount === 4) {
      // 删除方块2
      this.excludeCardByTag(CardTag.d2);
      // 添加一张大王
      this.cardTags.push(CardTag.bigJoker);
    }
    this.playerCardCount = this.cardTags.length / this.playerCount
    if (this.playerCount === 2) {
      this.playerCardCount = this.cardTags.length / 3;
    }

    this.consumeCardTags = this.cardTags.slice();
  }

  excludeCardByTag(list, ...elem) {
    for (const e of elem) {
      for (let i = 0; i < list.length; i++) {
        if (list[i] === e) {
          list.splice(i, 1);
          break;
        }
      }
    }
  }

  // 为每个玩家发牌
  genCardForEachPlayer(isSorted?) {
    // 洗牌
    let newCardTags = this.cardTags.slice();
    // 为每个玩家创建空列表
    const playerCards = Array.from(new Array(this.playerCount), () => []);
    if (!isSorted) {
      // 随机发牌
      algorithm.shuffle(newCardTags);
      let count = this.playerCardCount;
      while (count > 0) {
        // 每个玩家取一张牌
        for (const pc of playerCards) {
          pc.push(newCardTags.pop());
        }
        count--;
      }
    } else {
      // 将牌排序以后再发
      const randomList = this.orderCardTagBySameValue(newCardTags);
      for (let i = 0; i < this.playerCount; i++) {
        playerCards[i] = randomList.slice(i * this.playerCardCount, (i + 1) * this.playerCardCount);
      }
      // 剩下的扑克
      newCardTags = randomList.slice(this.playerCount * this.playerCardCount);
    }
    if (this.playerCount === 2) {
      // 必须下发一个黑桃3
      const index = newCardTags.indexOf(CardTag.s3);
      if (index !== -1) {
        // 随机选一个玩家， 给他加黑桃3
        const randIndex = service.utils.randomIntLessMax(this.playerCount);
        const remainCard = playerCards[randIndex].pop();
        playerCards[randIndex].push(CardTag.s3);
        // 放回黑桃3
        this.excludeCardByTag(newCardTags, CardTag.s3);
        newCardTags.push(remainCard);
      }
    }

    this.remainCardTags = newCardTags;
    return playerCards;
  }

  // 转换成 Card
  getCardTypesFromTag(tags) {
    const cards = [];
    for (const t of tags) {
      if (t >= CardTag.ha && t <= CardTag.hk) {
        cards.push(new Card(CardType.Heart, t - CardTag.ha + 1))
      } else if (t >= CardTag.ca && t <= CardTag.ck) {
        cards.push(new Card(CardType.Club, t - CardTag.ca + 1))
      } else if (t >= CardTag.sa && t <= CardTag.sk) {
        cards.push(new Card(CardType.Spades, t - CardTag.sa + 1))
      } else if (t >= CardTag.da && t <= CardTag.dk) {
        cards.push(new Card(CardType.Diamond, t - CardTag.da + 1))
      }
    }
    return cards;
  }

  // // 随机类型
  // randomCardType() {
  //   return algorithm.randomPickFromArray([cardTag.ha, cardTag.ca, cardTag.sa, cardTag.da]);
  // }

  // // 获取相同的卡
  // getRandomSameCard(count, value?, isSameType?) {
  //   if (!value) {
  //     value = algorithm.randomIntBetweenNumber(cardTag.ha, cardTag.hk);
  //   }
  //   if (isSameType) {
  //     // 所有都要相同类型
  //     return Array.from(new Array(count), () => value + this.randomCardType() - cardTag.ha)
  //   }
  //   // 不要求相同类型, 那就随机
  //   const list = [];
  //   for (let i = 0; i < count; i++) {
  //     list.push(this.randomCardType());
  //   }
  //   return list;
  // }

  // card tag 中的值
  getCardTagValue(tag) {
    if (tag >= CardTag.ha && tag <= CardTag.hk) {
      // 红桃
      return tag - CardTag.ha + 1;
    }
    if (tag >= CardTag.ca && tag <= CardTag.ck) {
      // 梅花
      return tag - CardTag.ca + 1;
    }
    if (tag >= CardTag.sa && tag <= CardTag.sk) {
      return tag - CardTag.sa + 1;
    }
    if (tag >= CardTag.da && tag <= CardTag.dk) {
      return tag - CardTag.da + 1;
    }
    // 大小王不管
    return 0;
  }

  // 所有的扑克
  allCards() {
    return this.getCardTypesFromTag(this.cardTags);
  }

  // 将牌排序, 相同值, 不同花色
  orderCardTagBySameValue(tags) {
    const values = {};
    const orderList = [];
    for (const t of tags) {
      const tagValue = this.getCardTagValue(t);
      if (values[tagValue]) {
        values[tagValue].push(t);
      } else {
        orderList.push(tagValue);
        values[tagValue] = [t];
      }
    }
    // 将 values 随机
    algorithm.shuffle(orderList);
    const randomList = [];
    for (const tagValue of orderList) {
      if (values[tagValue])
        randomList.push(...values[tagValue]);
    }
    return randomList;
  }
}

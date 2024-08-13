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
    this.cardTags = [...hearts, ...clubs, ...spades, ...diamonds, ...[CardTag.bigJoker, CardTag.littleJoker]];

    // 每个用户摸的牌数
    this.playerCardCount = (this.cardTags.length - 3) / this.playerCount;

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

  // 发放地主牌
  getLandlordCard() {
    const cards = [];
    for (let i = 0; i < 3; i++) {
      const card = this.remainCardTags.pop();
      cards.push(card);
    }

    return this.getCardTypesFromTag(cards);
  }

  // 为每个玩家发牌
  genCardForEachPlayer(isSorted?, customCards?, test?) {
    // 洗牌
    let newCardTags = this.cardTags.slice();
    // 为每个玩家创建空列表
    const playerCards = Array.from(new Array(this.playerCount), () => []);
    if (!isSorted) {
      // 随机发牌
      algorithm.shuffle(newCardTags);
      let count = this.playerCardCount;
      for (let i = 0; i < playerCards.length; i++) {
        for (let j = 0; j < count; j++) {
          if (test && customCards[i] && customCards[i].length > j) {
            // 将指定发牌从牌堆中移除
            const cardIndex = newCardTags.findIndex(c => c === customCards[i][j]);
            if (cardIndex !== -1) {
              const card = newCardTags[cardIndex];
              newCardTags.splice(cardIndex, 1);
              playerCards[i].push(card);
            } else {
              const card = newCardTags.pop();
              playerCards[i].push(card);
            }
          } else {
            const card = newCardTags.pop();
            playerCards[i].push(card);
          }
        }
      }
      // while (count > 0) {
      //   // 每个玩家取一张牌
      //   for (const pc of playerCards) {
      //     const card = newCardTags.pop();
      //     pc.push(card);
      //   }
      //   count--;
      // }
    } else {
      // 将牌排序以后再发
      const randomList = this.orderCardTagBySameValue(newCardTags);
      for (let i = 0; i < this.playerCount; i++) {
        playerCards[i] = randomList.slice(i * this.playerCardCount, (i + 1) * this.playerCardCount);
      }
      // 剩下的扑克
      newCardTags = randomList.slice(this.playerCount * this.playerCardCount);
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
      } else if (t >= CardTag.bigJoker && t <= CardTag.littleJoker) {
        cards.push(new Card(CardType.Joker, 15 + t - CardTag.bigJoker + 1))
      }
    }
    return cards;
  }

  // 转换成 Card Value
  getCardValueByType(initCards) {
    const cards = [[], [], []];
    for (let i = 0; i < initCards.length; i++) {
      for (const playerCards of initCards) {
        if (playerCards.type === CardType.Spades) {
          cards[i].push(CardTag.sa + playerCards.value - 1);
        }
        if (playerCards.type === CardType.Heart) {
          cards[i].push(CardTag.ha + playerCards.value - 1);
        }
        if (playerCards.type === CardType.Club) {
          cards[i].push(CardTag.ca + playerCards.value - 1);
        }
        if (playerCards.type === CardType.Diamond) {
          cards[i].push(CardTag.da + playerCards.value - 1);
        }
        if (playerCards.type === CardType.Joker) {
          cards[i].push(CardTag.bigJoker + playerCards.value - 16);
        }
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

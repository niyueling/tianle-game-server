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
  genCardForEachPlayer(isSorted?, customCards?, test?, players?) {
    // 洗牌
    let newCardTags = this.cardTags.slice();
    // 为每个玩家创建空列表
    const playerCards = Array.from(new Array(this.playerCount), () => []);
    // 洗牌
    algorithm.shuffle(newCardTags);

    if (!isSorted) {
      // 如果需要测试发牌，先发测试牌
      for (let i = 0; i < playerCards.length; i++) {
        for (let j = 0; j < this.playerCardCount; j++) {
          if (test && customCards[i] && customCards[i].length > j) {
            // 将指定发牌从牌堆中移除
            const cardIndex = newCardTags.findIndex(c => c === customCards[i][j]);
            if (cardIndex !== -1) {
              const card = newCardTags[cardIndex];
              newCardTags.splice(cardIndex, 1);
              playerCards[i].push(card);
            }
          }
        }
      }

      // 补发剩余牌
      for (let i = 0; i < playerCards.length; i++) {
        for (let j = playerCards[i].length; j < this.playerCardCount; j++) {
          const card = newCardTags.pop();
          playerCards[i].push(card);
        }
      }
    } else {
      // 计算炸弹
      let bombs = [];
      for (let k = CardTag.ha; k <= CardTag.hk; k++) {
        const cardCount = newCardTags.filter(c => [k, k + 13, k + 26, k + 39].includes(c)).length;
        if (cardCount === 4) {
          bombs.push(k);
        }
      }

      for (let i = 0; i < playerCards.length; i++) {
        console.warn("index %s isRobot %s", i, players[i].isRobot);
        if (!players[i].isRobot) {
          continue;
        }
        // 每个用户先发1-3个炸弹
        const bombCount = Math.floor(Math.random() * 2);

        for (let j = 0; j < bombCount; j++) {
          const isJokerBomb = Math.random() < 0.05;
          const jokerBombCount = newCardTags.filter(c => c > CardTag.dk).length;
          // console.warn("isJokerBomb-%s, jokerBombCount-%s, status-%s", isJokerBomb, jokerBombCount, isJokerBomb && jokerBombCount === 2);

          // 发放王炸
          if (isJokerBomb && jokerBombCount === 2) {
            for (let k = CardTag.bigJoker; k <= CardTag.littleJoker; k++) {
              const cardIndex = newCardTags.findIndex(c => c === k);
              if (cardIndex !== -1) {
                const card = newCardTags[cardIndex];
                newCardTags.splice(cardIndex, 1);
                playerCards[i].push(card);
              }
            }
          }

          // 发放其他炸弹
          const randomIndex = Math.floor(Math.random() * bombs.length);
          for (let k = 0; k < 4; k++) {
            const cardIndex = newCardTags.findIndex(c => c === bombs[randomIndex] + k * 13);
            // console.warn("randomIndex-%s, boomCard-%s, card-%s, cardIndex-%s", randomIndex, bombs[randomIndex], bombs[randomIndex] + k * 13, cardIndex);
            if (cardIndex !== -1) {
              const card = newCardTags[cardIndex];
              newCardTags.splice(cardIndex, 1);
              playerCards[i].push(card);
            }
          }
          bombs.splice(randomIndex, 1);
        }

        console.warn("index-%s, playerCards-%s", i, JSON.stringify(playerCards[i]));
      }

      // 补发剩余牌
      for (let i = 0; i < playerCards.length; i++) {
        for (let j = playerCards[i].length; j < this.playerCardCount; j++) {
          const card = newCardTags.pop();
          playerCards[i].push(card);
        }
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
      for (const playerCards of initCards[i]) {
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

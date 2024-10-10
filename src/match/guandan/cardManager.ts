// 生成牌
import * as uuid from 'uuid'
import {service} from "../../service/importService";
import Card, {CardType} from "./card";

// 5顺子
const shun5 = [];
const cardList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
for (let i = 5; i <= cardList.length; i++) {
  shun5.push(cardList.slice(i - 5, i))
}
export class CardMap {
  private readonly cardMap: any;
  constructor(cardMap) {
    this.cardMap = cardMap;
  }

  jokerCount() {
    return this.cardMap[16].length + this.cardMap[17].length;
  }

  jokerList() {
    const jokers = [];
    if (this.cardMap[16]) {
      jokers.push(...this.cardMap[16]);
    }
    if (this.cardMap[17]) {
      jokers.push(...this.cardMap[17]);
    }
    return jokers;
  }

  delCard(list) {
    let chkElem;
    for (const elem of list) {
      if (this.cardMap[elem.card.value] && this.cardMap[elem.card.value].length > 0) {
        for (let i = 0; i < this.cardMap[elem.card.value].length; i++) {
          chkElem = this.cardMap[elem.card.value][i];
          if (chkElem.index === elem.index) {
            // 删除
            this.cardMap[elem.card.value].splice(i, 1);
            break;
          }
        }
      }
    }
  }

  addCard(list) {
    for (const elem of list) {
      this.cardMap[elem.card.value].push(elem);
    }
  }

  // 获取可组炸弹的值列表
  getBoomCardValueList(exclude?) {
    const list = [];
    let cardValue;
    for (const k of Object.keys(this.cardMap)) {
      if (k === '16' || k === '17' || this.cardMap[k].length < 4) {
        continue;
      }
      cardValue = this.cardMap[k][0].card.value;
      if (exclude && exclude.includes(cardValue)) {
        continue;
      }
      list.push(cardValue)
    }
    return list;
  }

  // 选择炸弹卡
  selectBoomCard(value, count) {
    const list = this.getCardListByValue(value);
    if (list.length < count) {
      return [];
    }
    const cards = list.slice(0, count);
    this.delCard(cards);
    return cards;
  }

  getCardListByValue(value) {
    for (const k of Object.keys(this.cardMap)) {
      if (this.cardMap[k].length < 1) {
        continue;
      }
      if (this.cardMap[k][0].card.value === value) {
        return this.cardMap[k];
      }
    }
    return [];
  }

  selectJoker(countList) {
    const jokerList = [];
    for (let i = 0; i < this.cardMap[16].length; i++) {
      jokerList.push(this.cardMap[16][i], this.cardMap[17][i]);
    }
    const result = [];
    for (const count of countList) {
      if (count > 0) {
        result.push(jokerList.slice(0, count));
        this.delCard(jokerList.slice(0, count));
      } else {
        result.push([]);
      }
    }
    return result;
  }

  // // 随机抽一张鬼牌
  // randomJoker(maxCount) {
  //   const remainJoker = this.jokerCount();
  //   if (remainJoker < 1) {
  //     return [];
  //   }
  //   const maxJoker = remainJoker < maxCount ? remainJoker : maxCount;
  //   const jokerIndex = service.utils.randomIntLessMax(maxJoker, uuid());
  //   const jokerList = service.utils.shuffleArray(this.jokerList()).slice(0, jokerIndex);
  //   this.delCard(jokerList);
  //   return jokerList;
  // }

  // 随机选择 count 数量的牌
  randomCard(count, excludeList) {
    const list = [];
    // 能组成顺子牌的 key
    const shun = this.makeUpShunZi(excludeList);
    if (shun) {
      shun.forEach(value => {
        if (excludeList.includes(value)) {
          return;
        }
        if (this.cardMap[value].length > 0 && count > 0) {
          list.push(this.cardMap[value][0]);
          this.cardMap[value].splice(0, 1);
          count--;
        }
      })
    }
    let keys: any = Object.keys(this.cardMap);
    keys = keys.map(value => {
      return parseInt(value, 10);
    }).filter(value => {
      // 除炸弹，顺子以外的牌
      return !excludeList.includes(value);
    })
    let key;
    let index;
    for (let i = 0; i < count; i++) {
      if (keys.length === 0) {
        // 只剩下被排队的 key
        keys = excludeList;
        console.error('adding exclude cards')
      }
      key = service.utils.sampleFromArray(keys, uuid())
      if (!this.cardMap[key]) {
        console.error('invalid key', key, keys, excludeList, 'card map', JSON.stringify(this.cardMap));
      }
      if (this.cardMap[key] && this.cardMap[key].length > 0) {
        list.push(this.cardMap[key][0]);
        this.cardMap[key].splice(0, 1)
      } else {
        // 删除，重新选
        index = keys.indexOf(key)
        keys.splice(index, 1);
        i--;
      }
    }
    return list;
  }

  // 组合顺子
  makeUpShunZi(startList) {
    let result;
    for (const cardValue of startList) {
      for (const list of shun5) {
        if (list.includes(cardValue)) {
          // 检查非炸弹牌是否还有剩余
          result = list.some(value => {
            return value !== cardValue && this.cardMap[value].length < 1
          })
          if (!result) {
            return list;
          }
        }
      }
    }
    return null;
  }

  // // 选择飞机
  // getPlanList() {
  //   const list = [];
  //   let keys: any = Object.keys(this.cardMap);
  //   // 所有长度为 3 的牌
  //   keys = keys.map(value => parseInt(value, 10)).filter(value => value < 16 && this.cardMap[value].length >= 3);
  //   let tmp;
  //   for (const k of keys) {
  //     if (tmp) {
  //       if (k - tmp[tmp.length - 1] === 1) {
  //         // 连续牌
  //         tmp.push(k);
  //       } else {
  //         // 不是连续的数字，判断是不是飞机
  //         if (tmp.length >= 2) {
  //           list.push(tmp);
  //         }
  //         tmp = [ k ];
  //       }
  //     } else {
  //       tmp = [ k ];
  //     }
  //   }
  //   if (tmp && tmp.length >= 2) {
  //     list.push(tmp);
  //   }
  //   return list;
  // }
}

class CardManager {

  // 无大小王
  noJokerCards() {
    const types = [CardType.Club, CardType.Diamond, CardType.Heart, CardType.Spades]
    const cards = []

    types.forEach((type: CardType) => {
      for (let v = 1; v <= 13; v += 1) {
        cards.push(new Card(type, v), new Card(type, v))
      }
    })
    return cards;
  }

  // 带大小王
  withJokerCards(jokerCount) {
    const cards = this.noJokerCards();
    cards.push(new Card(CardType.Joker, 16));
    cards.push(new Card(CardType.Joker, 16));
    cards.push(new Card(CardType.Joker, 17));
    cards.push(new Card(CardType.Joker, 17));
    const replace = [];
    cards.forEach((value, index) => {
      if (value.value === 3) {
        replace.push(index);
      }
    });
    let addJoker = 0;
    if (jokerCount === 6) {
      // 剔除 2 张3，换成 2 张大小王
      addJoker = 2;
    } else if (jokerCount === 8) {
      // 8王，剔除 4张3，换成 4 张大小王
      addJoker = 4;
    }
    service.utils.shuffleArray(replace);
    for (let i = 0; i < addJoker; i++) {
      // 偶数加小王，奇数加大王
      cards[replace.shift()] = new Card(CardType.Joker, 16 + i % 2);
    }
    return cards;
  }

  // 将列表转为 map
  cardList2Map(cards) {
    const cardMap = {};
    let card;
    for (let i = 0; i < cards.length; i++) {
      card = cards[i];
      if (cardMap[card.value]) {
        cardMap[card.value].push({ card, index: i });
      } else {
        cardMap[card.value] = [{ card, index: i } ];
      }
    }
    return new CardMap(cardMap);
  }

  // 生成牌型
  makeCards(cardsList) {
    // 4个玩家
    const playerCards = [[], [], [], []];
    const cardMap = this.cardList2Map(cardsList);
    // 已经存在的炸弹
    const boomExist = { 0: [], 1: [], 2: [], 3: []};
    // 每个玩家至少一个炸
    let cards;
    let resultCards;
    const isBoom = index => {
      if (index === 0) {
        // 必须得给一个炸
        return true;
      }
      // 一半概率发炸弹
      return Math.random() < 0.5;
    }
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < playerCards.length; i++) {
        cards = playerCards[i];
        if (!isBoom(j)) {
          continue;
        }
        resultCards = this.randomBoom(cardMap, boomExist[i]);
        if (resultCards.length > 0) {
          boomExist[i].push(resultCards[0].card.value);
          cards.push(...resultCards);
        }
      }
    }
    // 抽鬼牌
    const jokerCount = service.utils.generateRandomNumber(cardMap.jokerCount(), playerCards.length, 6);
    const jokerList = cardMap.selectJoker(jokerCount);
    for (let i = 0; i < playerCards.length; i++) {
      cards = playerCards[i];
      if (jokerList[i].length > 0) {
        // const jokerCard = cardMap.selectJoker(jokerCount[i]);
        cards.push(...jokerList[i]);
      }
      // 检查剩下的凑成 27 张
      if (cards.length !== 27) {
        // 不要再抽鬼牌
        resultCards = cardMap.randomCard(27 - cards.length, [...boomExist[i], 16, 17])
        if (resultCards.length !== 27 - cards.length) {
          throw new Error('invalid card')
        }
        cards.push(...resultCards);
      }
    }
    return playerCards;
  }

  randomBoom(cardMap: CardMap, exclude = []) {
    const list = cardMap.getBoomCardValueList(exclude);
    const target = service.utils.sampleFromArray(list, uuid());
    const boomLength = service.utils.randomIntBetweenNumber(4, cardMap.getCardListByValue(target).length, uuid());
    // if (boomLength === 8) {
    //   console.log('full boom', target);
    // }
    return cardMap.selectBoomCard(target, boomLength);
  }
}

export const manager = new CardManager();

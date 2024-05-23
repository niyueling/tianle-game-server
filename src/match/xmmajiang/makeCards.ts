import {service} from "../../service/importService";
import {allCardExcludeFlower, allCardsTypeExcludeFlower, manager} from "./cardManager";

class MakeCards {
  // 组牌
  makeCards(count, goldCard, cardCount, opt: {
    // 杠子数
    gangZiCount: number,
    // 刻子数
    keZiCount: number,
    // 顺子数
    shunZiCount: number,
    // 金牌数
    goldCardCount: number,
    // 对子数
    duiZiCount: number,
    // // 金牌作对子
    // goldAsDuiZi?: boolean,
  },        maps?) {
    if (!maps) {
      maps = manager.card2Map(allCardExcludeFlower);
    }
    const cardList = [];
    let item;
    for (let i = 0; i < count; i++) {
      item = this.makeSingleCompose(maps, cardCount, goldCard, opt.gangZiCount, opt.keZiCount, opt.shunZiCount,
        opt.goldCardCount, opt.duiZiCount);
      cardList.push(item);
    }
    return cardList;
  }

  makeRandomCard(count, goldCard, cardCount, maps) {
    return this.makeCards(count, goldCard, cardCount, {
      duiZiCount: 0,
      gangZiCount: 0,
      keZiCount: 0,
      shunZiCount: 0,
      goldCardCount: 0,
    }, maps)
  }

  getRandomType(count, goldCard, cardMaps) {
    const randomIndex = service.utils.randomIntLessMax(allCardsTypeExcludeFlower.length);
    const randomValue = allCardsTypeExcludeFlower[randomIndex];
    if (randomValue === goldCard || cardMaps[randomValue] < count) {
      // 重新取
      return this.getRandomType(count, goldCard, cardMaps);
    }
    return randomValue;
  }

  // 组成一副胡牌
  makeSingleCompose(maps, cardCount, goldCard, gangZiCount, keZiCount, shunZiCount, goldCardCount,
                    duiZiCount) {
    const result = [];
    let randomValue;
    // 先加金牌
    if (goldCardCount > 0) {
      for (let i = 0; i < goldCardCount; i++) {
        if (cardCount > 0 && maps[goldCard] > 0) {
          maps[goldCard]--;
          result.push(goldCard);
          cardCount --;
        } else {
          break;
        }
      }
    }
    if (gangZiCount > 0) {
      // 添加杠子
      for (let i = 0; i < gangZiCount; i++) {
        if (cardCount - 4 < 0) {
          break;
        }
        randomValue = this.getRandomType(4, goldCard, maps);
        result.push(randomValue, randomValue, randomValue, randomValue);
        maps[randomValue] -= 4;
        cardCount -= 4;
      }
    }
    if (keZiCount > 0) {
      // 再找刻子
      for (let i = 0; i < keZiCount; i++) {
        if (cardCount - 3 < 0) {
          break;
        }
        randomValue = this.getRandomType(3, goldCard, maps);
        result.push(randomValue, randomValue, randomValue);
        maps[randomValue] -= 3;
        cardCount -= 3;
      }
    }
    if (shunZiCount > 0) {
      // 再找顺子
      for (let i = 0; i < shunZiCount; i++) {
        if (cardCount - 3 < 0) {
          break;
        }
        randomValue = this.getRandomType(1, goldCard, maps);
        if (maps[randomValue] > 0 && maps[randomValue + 1] > 0 && maps[randomValue + 2] > 0) {
          result.push(randomValue, randomValue + 1, randomValue + 2);
          maps[randomValue]--;
          maps[randomValue + 1]--;
          maps[randomValue + 2]--;
          cardCount -= 3;
        } else {
          // 重试
          i--;
        }
      }
    }
    // let maxDuiZi = duiZiCount;
    // if (goldAsDuiZi && goldCardCount > 0) {
    //   // 金牌要作对子
    //   if (goldCardCount % 2 > 0) {
    //     // 金牌数是奇数，加一张随机牌，作对子
    //     randomValue = this.getRandomType(1, goldCard, maps);
    //     result.push(randomValue);
    //     goldCardCount--;
    //   }
    //   const maxGoldDuiZi = Math.floor(goldCardCount / 2);
    //   maxDuiZi = duiZiCount - maxGoldDuiZi;
    // }
    if (duiZiCount > 0) {
      // 添加对子
      for (let i = 0; i < duiZiCount; i++) {
        if (cardCount - 2 < 0) {
          break;
        }
        randomValue = this.getRandomType(2, goldCard, maps);
        result.push(randomValue, randomValue);
        maps[randomValue] -= 2;
        cardCount -= 2;
      }
    }
    // 剩下单张
    for (let i = 0; i < cardCount; i++) {
      randomValue = this.getRandomType(1, goldCard, maps);
      result.push(randomValue);
      maps[randomValue]--;
    }
    return result;
  }

  // 凑成平胡
  makePingHu(playerCount, goldCard, cardCount) {
    const opt = {
      duiZiCount: 1,
      gangZiCount: 0,
      keZiCount: 5,
      shunZiCount: 0,
      goldCardCount: 0,
    }
    const cardList = this.makeCards(playerCount, goldCard, 17, opt)
    if (cardCount < 17) {
      // 不需要 17 张
      for (const list of cardList) {
        list.splice(0, 17 - cardCount);
      }
    }
    return cardList;
  }

  // 凑天胡牌
  makeTianHu(playerCount, goldCard) {
    const opt = {
      duiZiCount: 0,
      gangZiCount: 0,
      keZiCount: 5,
      shunZiCount: 0,
      goldCardCount: 1,
    }
    const maps = manager.card2Map(allCardExcludeFlower);
    const first = this.makeCards(1, goldCard, 16, opt, maps);
    const remainList = this.makeRandomCard(playerCount - 1, goldCard, 16, maps);
    remainList.unshift(first[0]);
    return remainList;
  }

  // 凑地胡牌
  makeDiHu(playerCount, goldCard, index) {
    const maps = manager.card2Map(allCardExcludeFlower);
    const list = [];
    let itemList;
    for (let i = 0; i < playerCount; i++) {
      if (i !== index) {
        itemList = this.makeRandomCard(1, goldCard, 16, maps);
      } else {
        itemList = this.makeCards(1, goldCard, 16, {
          duiZiCount: 0,
          gangZiCount: 0,
          keZiCount: 5,
          shunZiCount: 0,
          goldCardCount: 1,
        }, maps);
      }
      list.push(itemList[0]);
    }
    return list;
  }

  // 3金倒
  make3Jin(playerCount, goldCard, index) {
    const maps = manager.card2Map(allCardExcludeFlower);
    const list = [];
    let itemList;
    for (let i = 0; i < playerCount; i++) {
      if (i !== index) {
        itemList = this.makeRandomCard(1, goldCard, 16, maps);
      } else {
        itemList = this.makeCards(1, goldCard, 16, {
          duiZiCount: 0,
          gangZiCount: 0,
          keZiCount: 0,
          shunZiCount: 0,
          goldCardCount: 3,
        }, maps);
      }
      list.push(itemList[0]);
    }
    return list;
  }

  // 凑游金牌
  makeYouJin(playerCount, goldCard) {
    const opt = {
      duiZiCount: 1,
      gangZiCount: 0,
      keZiCount: 4,
      shunZiCount: 0,
      goldCardCount: 1,
    }
    return this.makeCards(playerCount, goldCard, 16, opt);
  }

  // 3游金，需要更改原始牌
  make3YouJin(cardMapList, playerCount, goldCard) {
    const maps = manager.card2Map(cardMapList);
    const opt = {
      duiZiCount: 0,
      gangZiCount: 0,
      keZiCount: 5,
      shunZiCount: 0,
      goldCardCount: 1,
    }
    // 让第一个人游金 3 次
    const cardList = this.makeRandomCard(playerCount - 1, goldCard, 16, maps);
    const youJin = this.makeCards(1, goldCard, 16, opt, maps);
    cardList.unshift(youJin[0]);
    let index;
    let randomValue;
    for (let i = 2 * playerCount; i > 0; i--) {
      // 再摸2张金牌
      if (i % playerCount === 0) {
        index = cardMapList.indexOf(goldCard);
        cardMapList.splice(index, 1);
        cardMapList.push(goldCard);
      } else {
        // 随机一张
        randomValue = this.getRandomType(1, goldCard, maps);
        index = cardMapList.indexOf(randomValue);
        cardMapList.splice(index, 1);
        cardMapList.push(randomValue)
      }
    }
    // 第一张发牌不要是金牌
    randomValue = this.getRandomType(1, goldCard, maps);
    index = cardMapList.indexOf(randomValue);
    cardMapList.splice(index, 1);
    cardMapList.push(randomValue)
    return { cardList, cardMapList }
  }
}

export const makeCards = new MakeCards();

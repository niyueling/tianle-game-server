import Card, {CardType} from "../card"
import {arraySubtract, groupBy, IMatcher, IPattern, last, PatterNames} from "./base"

export default class StraightDoublesMatcher implements IMatcher {

  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length === 6) {
      let sortedGroups = groupBy(cards.slice(), card => card.point)
        .sort((grp1, grp2) => {
          return grp1[0].point - grp2[0].point
        })

      // 计算红心级牌数量
      const caiShen = cards.filter(c => c.type === CardType.Heart && c.value === levelCard);

      if (caiShen.length) {
        // 去除红心级牌
        const subtractCards = arraySubtract(cards.slice(), caiShen);

        // 将级牌的point恢复成原有数值
        for (let i = 0; i < subtractCards.length; i++) {
          const straightCard = subtractCards[i];

          if (straightCard.point === 15) {
            if (straightCard.value === 1) {
              straightCard.point = 14;
            } else {
              straightCard.point = straightCard.value;
            }
          }
        }

        // 根据新的数组分组
        const subtractGroups = groupBy(subtractCards, card => card.point).sort((grp1, grp2) => {
          return grp1[0].point - grp2[0].point
        })

        // console.warn("restore pointWithCaishen sortedGroups %s", JSON.stringify(subtractGroups));

        let resultCaiShen = {
          name: PatterNames.doubles + 3,
          score: subtractGroups[0][0].point,
          cards,
          level: 3,
          sortKey: "pointWithCaishen"
        }

        if (!subtractGroups.every(grp => grp.length <= 2) || subtractGroups.length > 3) {
          // console.warn("error-1");
          resultCaiShen = null;
        }

        const lastCard = last(subtractGroups)[0];
        // console.warn("lastCard %s", JSON.stringify(lastCard));
        if (lastCard.point >= 15) {
          if (lastCard.value !== levelCard || lastCard.type !== CardType.Heart) {
            // console.warn("error-2");
            // console.warn("sortBy point useCaiShen sortedGroups last card is gt 15");
            resultCaiShen = null;
          }
        }

        let caiShenCount = caiShen.length;
        let useCaiShenCount = 0;

        // 判断不够对子的，用红星级牌去补
        for (let i = 0; i < subtractGroups.length; i++) {
          const subtractGroup = subtractGroups[i];

          // 如果是对子，则跳过
          if (subtractGroup.length === 2) {
            continue;
          }

          // 如果超过2张，则一定无法组成连对
          if (subtractGroup.length > 2) {
            // console.warn("error-3");
            resultCaiShen = null;
          }

          // 如果小于2张，并且红心级牌不足以补足，则一定无法组成连对
          if (subtractGroup.length < 2 && caiShenCount - useCaiShenCount < 2 - subtractGroup.length) {
            // console.warn("error-4");
            resultCaiShen = null;
          }

          const addCount = 2 - subtractGroup.length;
          for (let j = 0; j < addCount; j++) {
            subtractGroups[i].push(caiShen[0]);
            useCaiShenCount++;
          }
        }

        // 如果红心级牌补完的不符合都是对子，则一定无法组成连对
        if (!subtractGroups.every(grp => grp.length === 2)) {
          // console.warn("error-5");
          resultCaiShen = null;
        }

        // 原始牌无法直接组成连对，判断红心癞子做级牌是否能组成连对
        let prevGroupByLevelPoint = subtractGroups[0][0].point;
        const addGroupCards = [];
        for (let i = 1; i < subtractGroups.length; i++) {
          const currentGroup = subtractGroups[i][0].point;

          // 如果符合连对特征，进行下一轮比较
          if (currentGroup - prevGroupByLevelPoint === 1) {
            prevGroupByLevelPoint = currentGroup;
          } else {
            if (caiShenCount === 2) {
              addGroupCards.push(caiShen[0]);
              addGroupCards.push(caiShen[0]);
              prevGroupByLevelPoint = prevGroupByLevelPoint + 1;
              caiShenCount = 0;
              i--;
            } else {
              // console.warn("error-6 %s", JSON.stringify(subtractGroups));
              resultCaiShen = null;
            }
          }
        }

        // 将级牌的point恢复
        for (let i = 0; i < subtractCards.length; i++) {
          const straightCard = subtractCards[i];

          if (straightCard.value === levelCard && straightCard.point !== 15) {
            straightCard.point = 15;
          }
        }

        if (resultCaiShen) {
          return resultCaiShen;
        }
      }

      let result = {
        name: PatterNames.doubles + 3,
        score: sortedGroups[0][0].point,
        cards,
        level: 3,
        sortKey: "pointNotCaishen"
      }

      if (!sortedGroups.every(grp => grp.length <= 2) || sortedGroups.length > 3) {
        result = null;
      }

      // 将级牌的point恢复成原有数值
      for (let i = 0; i < cards.length; i++) {
        const straightCard = cards[i];

        if (straightCard.point === 15) {
          if (straightCard.value === 1) {
            straightCard.point = 14;
          } else {
            straightCard.point = straightCard.value;
          }
        }
      }

      sortedGroups = groupBy(cards.slice(), card => card.point)
        .sort((grp1, grp2) => {
          return grp1[0].point - grp2[0].point
        })

      // console.warn("restore pointNotCaishen sortedGroups %s", JSON.stringify(sortedGroups));

      const lastCard = last(sortedGroups)[0];
      if (lastCard.point >= 15) {
        if (lastCard.value !== levelCard || lastCard.type !== CardType.Heart) {
          // console.warn("error-7");
          // console.warn("sortBy point not CaiShen sortedGroups last card is gt 15 %s", JSON.stringify(sortedGroups));
          result = null;
        }
      }

      // 判断原始牌能否直接组成连对
      let prevGroup = sortedGroups[0];
      for (let i = 1; i < sortedGroups.length; i++) {
        const currentGroup = sortedGroups[i];
        if (currentGroup[0].point - prevGroup[0].point === 1) {
          prevGroup = currentGroup;
        } else {
          // console.warn("error-8");
          result = null;
        }
      }

      // 将级牌的point恢复
      for (let i = 0; i < cards.length; i++) {
        const straightCard = cards[i];

        if (straightCard.value === levelCard && straightCard.point !== 15) {
          straightCard.point = 15;
        }
      }

      if (result) {
        return result;
      }

      // A最小组成连对
      const sortedGroupsByValue = groupBy(cards.slice(), card => card.value)
        .sort((grp1, grp2) => {
          return grp1[0].value - grp2[0].value
        })
      // 计算红心级牌数量
      const caiShenByValue = cards.filter(c => c.type === CardType.Heart && c.value === levelCard);

      if (caiShenByValue.length) {
        // 去除红心级牌
        const subtractCards = arraySubtract(cards.slice(), caiShenByValue);

        // 根据新的数组分组
        const subtractGroupsByValue = groupBy(subtractCards, card => card.value).sort((grp1, grp2) => {
          return grp1[0].value - grp2[0].value
        })

        let resultCaiShenByValue = {
          name: PatterNames.doubles + 3,
          score: subtractGroupsByValue[0][0].value,
          cards,
          level: 3,
          sortKey: "valueWithCaishen"
        }

        if (!subtractGroupsByValue.every(grp => grp.length <= 2) || subtractGroupsByValue.length > 3) {
          // console.warn("error-9");
          resultCaiShenByValue = null;
        }

        if (last(subtractGroupsByValue)[0].value > 13) {
          // console.warn("error-10");
          // console.warn("sortBy value useCaiShen subtractGroupsByValue last card is gt 13");
          resultCaiShenByValue = null;
        }

        let caiShenCount = caiShenByValue.length;
        let useCaiShenCount = 0;

        // 判断不够对子的，用红星级牌去补
        for (let i = 0; i < subtractGroupsByValue.length; i++) {
          const subtractGroup = subtractGroupsByValue[i];

          // 如果是对子，则跳过
          if (subtractGroup.length === 2) {
            continue;
          }

          // 如果超过2张，则一定无法组成连对
          if (subtractGroup.length > 2) {
            // console.warn("error-11");
            resultCaiShenByValue = null;
          }

          // 如果小于2张，并且红心级牌不足以补足，则一定无法组成连对
          if (subtractGroup.length < 2 &&caiShenCount - useCaiShenCount < 2 - subtractGroup.length) {
            // console.warn("error-12");
            resultCaiShenByValue = null;
          }

          const addCount = 2 - subtractGroup.length;
          for (let j = 0; j < addCount; j++) {
            subtractGroupsByValue[i].push(caiShen[0]);
            useCaiShenCount++;
          }
        }

        // 如果红心级牌补完的不符合都是对子，则一定无法组成连对
        if (!subtractGroupsByValue.every(grp => grp.length === 2) || subtractGroupsByValue.length > 3) {
          // console.warn("error-13");
          resultCaiShenByValue = null;
        }

        // 原始牌无法直接组成连对，判断红心癞子做级牌是否能组成连对
        let prevGroupByLevelPoint = subtractGroupsByValue[0][0].value;
        const addGroupCards = [];
        for (let i = 1; i < subtractGroupsByValue.length; i++) {
          const currentGroup = subtractGroupsByValue[i][0].value;

          // 如果符合连对特征，进行下一轮比较
          if (currentGroup - prevGroupByLevelPoint === 1) {
            prevGroupByLevelPoint = currentGroup;
          } else {
            if (caiShenCount === 2) {
              addGroupCards.push(caiShen[0]);
              addGroupCards.push(caiShen[0]);
              prevGroupByLevelPoint = prevGroupByLevelPoint + 1;
              caiShenCount = 0;
              i--;
            } else {
              // console.warn("error-14");
              resultCaiShenByValue = null;
            }
          }
        }

        if (resultCaiShenByValue) {
          return resultCaiShenByValue;
        }
      }

      if (last(sortedGroupsByValue)[0].value > 13) {
        // console.warn("error-15");
        // console.warn("sortBy value not CaiShen subtractGroupsByValue last card is gt 13");
        return null;
      }

      if (!sortedGroupsByValue.every(grp => grp.length <= 2) || sortedGroupsByValue.length > 3) {
        // console.warn("error-16");
        return null;
      }

      // console.warn("sort by value arrays %s", JSON.stringify(sortedGroupsByValue));
      let prevGroup1 = sortedGroupsByValue[0];
      for (let i = 1; i < sortedGroupsByValue.length; i++) {
        const currentGroup = sortedGroupsByValue[i];
        if (currentGroup[0].value - prevGroup1[0].value === 1) {
          prevGroup1 = currentGroup;
        } else {
          // console.warn("error-17");
          // console.warn("sortedGroupsByValue %s", JSON.stringify(sortedGroupsByValue));
          return null
        }
      }

      return {
        name: PatterNames.doubles + 3,
        score: sortedGroupsByValue[0][0].value,
        cards,
        level: 3,
        sortKey: "valueNotCaishen"
      }
    }

    return null
  }

  promptWithPattern(target: IPattern, cards: Card[], levelCard?: Number): Card[][] {
    const len = target.cards.length

    if (cards.length < len) {
      return []
    }

    const levelCards = cards.filter(card => card.type === CardType.Heart && card.value === levelCard);
    let caiShenCount =levelCards.length;
    let subtractCards = arraySubtract(cards.slice(), levelCards).slice();

    // 将级牌的point恢复成原有数值
    for (let i = 0; i < subtractCards.length; i++) {
      const straightCard = subtractCards[i];

      if (straightCard.point === 15) {
        if (straightCard.value === 1) {
          straightCard.point = 14;
        } else {
          straightCard.point = straightCard.value;
        }
      }
    }

    const groups = groupBy(
      subtractCards.filter(c => c.point > target.score && c.point < 15),
      card => card.point)
      .filter(g => g.length >= 1 && g.length < 4)
      .sort((grp1, grp2) => {
        return grp1[0].point - grp2[0].point
      });

    const prompts = [];
    for (let i = 0; i < groups.length;) {
      let prevCard = groups[i][0].point;
      const prompt = [];
      caiShenCount = levelCards.length;

      if (groups[i].length >= 2) {
        prompt.push(...groups[i].slice(0, 2));
      } else {
        if (caiShenCount > 0) {
          prompt.push(groups[i][0]);
          prompt.push(levelCards[0]);
          caiShenCount--;
        } else {
          i++;
          continue;
        }
      }

      let j = i + 1;
      for (; j < groups.length; j++) {
        const nextCard = groups[j][0].point;
        if (nextCard - prevCard === 1) {
          prevCard = nextCard;

          if (groups[j].length >= 2) {
            prompt.push(...groups[j].slice(0, 2));
          } else {
            if (caiShenCount > 0) {
              prompt.push(groups[j][0]);
              prompt.push(levelCards[0]);
              caiShenCount--;
            } else {
              break;
            }
          }

          if (prompt.length === len) {
            break;
          }
        } else if (caiShenCount === 2) {
          prevCard = prevCard + 1;
          prompt.push(levelCards[0]);
          prompt.push(levelCards[0]);
          caiShenCount -= 2;
          j--;
          if (prompt.length === len) {
            break;
          }
        } else {
          break;
        }
      }

      if (prompt.length === len) {
        i++;
        prompts.push(prompt);
      } else {
        i = j;
      }
    }

    // 将级牌的point恢复
    for (let i = 0; i < subtractCards.length; i++) {
      const straightCard = subtractCards[i];

      if (straightCard.value === levelCard && straightCard.point !== 15) {
        straightCard.point = 15;
      }
    }

    if (prompts.length) {
      return prompts;
    }

    caiShenCount = levelCards.length;

    const groupsByValue = groupBy(
      subtractCards.filter(c => c.value > target.score),
      card => card.value)
      .filter(g => g.length >= 1 && g.length < 4)
      .sort((grp1, grp2) => {
        return grp1[0].value - grp2[0].value
      });

    for (let i = 0; i < groupsByValue.length;) {
      let prevCard = groupsByValue[i][0].value;
      const prompt = [];
      caiShenCount = levelCards.length;

      if (groupsByValue[i].length >= 2) {
        prompt.push(...groupsByValue[i].slice(0, 2));
      } else {
        if (caiShenCount > 0) {
          prompt.push(groupsByValue[i][0]);
          prompt.push(levelCards[0]);
          caiShenCount--;
        } else {
          i++;
          continue;
        }
      }

      let j = i + 1;
      for (; j < groupsByValue.length; j++) {
        const nextCard = groupsByValue[j][0].value;
        if (nextCard - prevCard === 1) {
          prevCard = nextCard;

          if (groupsByValue[j].length >= 2) {
            prompt.push(...groupsByValue[j].slice(0, 2));
          } else {
            if (caiShenCount > 0) {
              prompt.push(groupsByValue[j][0]);
              prompt.push(levelCards[0]);
              caiShenCount--;
            } else {
              break;
            }
          }

          if (prompt.length === len) {
            break
          }
        } else if (caiShenCount === 2) {
          prevCard = prevCard + 1;
          prompt.push(levelCards[0]);
          prompt.push(levelCards[0]);
          caiShenCount -= 2;
          j--;

          if (prompt.length === len) {
            break;
          }
        } else {
          break
        }
      }

      if (prompt.length === len) {
        i++;
        prompts.push(prompt);
      } else {
        i = j;
      }
    }

    return prompts
  }
}

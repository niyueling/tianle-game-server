import Card, {CardType} from "../card"
import {arraySubtract, groupBy, IMatcher, IPattern, last, PatterNames} from "./base"

export default class StraightMatcher implements IMatcher {

  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length === 5) {
      const copyCards = cards.slice().sort(Card.compare);

      // 如果癞子除外都是同一个花色，则为同花顺，不是顺子
      const levelCards = copyCards.filter(card => card.type === CardType.Heart && card.value === levelCard);
      let subtractCards = arraySubtract(copyCards.slice(), levelCards).slice();
      const startCard = subtractCards[0];
      if (subtractCards.every(card => card.type === startCard.type)) {
        console.warn("StraightMatcher error 1 %s", JSON.stringify(subtractCards));
        return null;
      }

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

      subtractCards = subtractCards.slice().sort(Card.compare);

      let result = {
        name: PatterNames.straight + copyCards.length,
        score: copyCards[0].point,
        cards: copyCards,
        level: copyCards.length
      };

      if (last(subtractCards).point > 14) {
        console.warn("StraightMatcher error 2 %s", JSON.stringify(subtractCards));
        result = null;
      }

      let lastCard = subtractCards[0].point;
      let caiShenCount = levelCards.length;
      for (let i = 1; i < subtractCards.length; i++) {
        const currentCard = subtractCards[i].point;

        if (currentCard - lastCard === 1) {
          lastCard = currentCard;
        } else if (caiShenCount > 0) {
          caiShenCount--;
          lastCard++;
          i--;
        } else {
          // console.warn("StraightMatcher error 2 %s", JSON.stringify(subtractCards));
          result = null;
        }
      }

      // 将级牌的point恢复
      for (let i = 0; i < subtractCards.length; i++) {
        const straightCard = subtractCards[i];

        if (straightCard.value === levelCard && straightCard.point !== 15) {
          straightCard.point = 15;
        }
      }

      if (result) {
        return result;
      }

      const copyCardsByValue = cards.slice().sort(Card.compareByValue);
      subtractCards = arraySubtract(copyCardsByValue.slice(), levelCards);

      let lastCard1 = subtractCards[0].value;
      for (let i = 1; i < subtractCards.length; i++) {
        const currentCard = subtractCards[i].value;

        if (currentCard - lastCard1 === 1) {
          lastCard1 = currentCard;
        } else if (caiShenCount > 0) {
          caiShenCount--;
          lastCard1++;
          i--;
        } else {
          // console.warn("StraightMatcher error 3 %s", JSON.stringify(subtractCards));
          return null;
        }
      }

      return {
        name: PatterNames.straight + copyCardsByValue.length,
        score: copyCardsByValue[0].point,
        cards: copyCardsByValue,
        level: copyCardsByValue.length
      };
    }

    console.warn("StraightMatcher error 4");

    return null;
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
      subtractCards.filter(
        c => c.point > target.score && c.type !== CardType.Joker), c => c.point)
      .filter(g => g.length < 4)
      .sort((grp1, grp2) => grp1[0].point - grp2[0].point);

    const prompts = []
    for (let i = 0; i < groups.length;) {
      let prevCard = groups[i][0].point;
      const prompt = [groups[i][0]];
      caiShenCount = levelCards.length;

      let j = i + 1;
      for (; j < groups.length; j++) {
        const nextCard = groups[j][0].point;

        if (nextCard - prevCard === 1 && nextCard < 15) {
          prevCard = nextCard;
          prompt.push(groups[j][0]);
          if (prompt.length === len) {
            break;
          }
        } else if (caiShenCount > 0) {
          prevCard = prevCard + 1;
          prompt.push(levelCards[0]);
          caiShenCount--;
          if (prompt.length === len) {
            break;
          }
        } else {
          break;
        }
      }

      if (prompt.length === len) {
        const startCard = prompt[0];
        if (prompt.every(card => card.type === startCard.type)) {
          i = j;
        } else {
          i++;
          prompts.push(prompt);
        }
      } else {
        i = j
      }
    }

    // 将级牌的point恢复
    for (let i = 0; i < subtractCards.length; i++) {
      const straightCard = subtractCards[i];

      if (straightCard.value === levelCard && straightCard.point !== 15) {
        straightCard.point = 15;
      }
    }

    // 重新设置癞子数量
    caiShenCount = levelCards.length;

    const groupsByValue = groupBy(
      subtractCards.filter(
        c => c.value > target.score && c.type !== CardType.Joker), c => c.value)
      .filter(g => g.length < 4)
      .sort((grp1, grp2) => grp1[0].value - grp2[0].value);

    for (let i = 0; i < groupsByValue.length;) {
      let prevCard = groupsByValue[i][0].value;
      const prompt = [groupsByValue[i][0]];
      caiShenCount = levelCards.length;

      let j = i + 1;
      for (; j < groupsByValue.length; j++) {
        const nextCard = groupsByValue[j][0].value;
        if (nextCard - prevCard === 1) {
          prevCard = nextCard;
          prompt.push(groupsByValue[j][0]);
          if (prompt.length === len) {
            break;
          }
        } else if (caiShenCount > 0) {
          prevCard = prevCard + 1;
          prompt.push(levelCards[0]);
          caiShenCount--;
          if (prompt.length === len) {
            break;
          }
        } else {
          break;
        }
      }

      if (prompt.length === len) {
        const startCard = prompt[0];
        if (prompt.every(card => card.type === startCard.type)) {
          i = j;
        } else {
          i++;
          prompts.push(prompt);
        }
      } else {
        i = j
      }
    }

    return prompts
  }

}

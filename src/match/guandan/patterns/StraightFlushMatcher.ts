import Card, {CardType} from "../card"
import {arraySubtract, groupBy, IMatcher, IPattern, PatterNames} from "./base"

export default class StraightFlushMatcher implements IMatcher {

  verify(cards: Card[], levelCard?: Number): IPattern | null {
    if (cards.length === 5) {
      const copyCards = cards.slice().sort(Card.compare);


      const levelCards = cards.filter(card => card.type === CardType.Heart && card.value === levelCard);
      const subtractCards = arraySubtract(cards, levelCards);
      const startCard = subtractCards[0];
      if (!subtractCards.every(card => card.type === startCard.type)) {
        return null;
      }

      let result = {
        name: PatterNames.straightFlush + copyCards.length,
        score: copyCards[0].point,
        cards: copyCards,
        level: copyCards.length
      };

      let lastCard = copyCards[0];
      for (let i = 1; i < copyCards.length; i++) {
        const currentCard = copyCards[i];

        if (currentCard.point - lastCard.point === 1 && currentCard.type === lastCard.type) {
          lastCard = currentCard;
        } else if (currentCard.type === CardType.Heart && currentCard.value === levelCard) {
          lastCard.point++;
        } else {
          result = null;
        }
      }

      if (result) {
        return result;
      }

      const copyCardsByValue = cards.slice().sort(Card.compareByValue);

      let lastCard1 = copyCardsByValue[0];
      for (let i = 1; i < copyCardsByValue.length; i++) {
        const currentCard = copyCardsByValue[i];
        if (currentCard.value - lastCard1.value === 1 && currentCard.type === lastCard.type) {
          lastCard1 = currentCard;
        } else if (currentCard.type === CardType.Heart && currentCard.value === levelCard) {
          lastCard1.point++;
        } else {
          return null;
        }
      }

      return {
        name: PatterNames.straightFlush + copyCardsByValue.length,
        score: copyCardsByValue[0].point,
        cards: copyCardsByValue,
        level: copyCardsByValue.length
      };
    }

    return null;
  }

  promptWithPattern(target: IPattern, cards: Card[], levelCard?: Number): Card[][] {
    const len = target.cards.length

    if (cards.length < len) {
      return []
    }

    const groups = groupBy(
      cards.filter(
        c => c.point > target.score && c.type !== CardType.Joker), c => c.point)
      .filter(g => g.length < 4)
      .sort((grp1, grp2) => grp1[0].point - grp2[0].point)

    const prompts = []
    for (let i = 0; i < groups.length;) {
      let prevCard = groups[i][0];
      const prompt = [prevCard];

      let j = i + 1;
      for (; j < groups.length; j++) {
        const nextCard = groups[j][0];
        if (((nextCard.point - prevCard.point === 1 && nextCard.point < 15) || nextCard.value - prevCard.value === 1) && nextCard.type === prevCard.type) {
          prevCard = nextCard;
          prompt.push(nextCard);
          if (prompt.length === len) {
            break;
          }
        } else {
          break;
        }
      }

      if (prompt.length === len) {
        i++
        prompts.push(prompt);
      } else {
        i = j
      }
    }

    return prompts
  }

}

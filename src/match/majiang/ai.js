/**
 * Created by Color on 2016/8/28.
 */
import Enums from './enums';


function getUseLessCard(cards) {
  const {caiShen} = cards
  let minScore = 99999;
  let maxScore = 99;
  let ret = 0;

  cards[caiShen] = 0
  for (let i = 0; i < cards.length; i++) {
    if (cards[i] > 0) {
      let score = 0;

      if (i === caiShen) {
        score = maxScore
      }

      if (i < Enums.dong) {

        if (i - 2 > 0 && Enums.sameType(i - 2, i) && cards[i - 2] % 2 === 1) {
          score += 1;
        }
        if (Enums.sameType(i + 2, i) && cards[i + 2] % 2 === 1) {
          score += 1;
        }
        if (i - 1 > 0 && Enums.sameType(i - 1, i) && cards[i - 1] % 2 === 1) {
          score += 2;
        }
        if (Enums.sameType(i + 1, i) && cards[i + 1] % 2 === 1) {
          score += 2;
        }
      }

      if (cards[i] > 1) {
        score += 3;
      }
      if (score < minScore) {
        minScore = score;
        ret = i;
      }
    }
  }
  return ret;
}

function onCanDoSomething(actions, cards, card) {
  if (actions.hu) {
    return Enums.hu;
  }

  if (actions.gang) {
    return Enums.gang;
  }

  if (actions.peng) {
    let dui = 0;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] > 1) {
        dui++;
      }
    }
    if (dui > 2) {
      return Enums.peng;
    } else if (dui === 2) {
      if (Math.random() < 0.5) {
        return Enums.peng;
      }
    } else if (dui === 1) {
      if (Math.random() < 0.25) {
        return Enums.peng;
      }
    }
  }

  return Enums.guo;
}


export default {
  getUseLessCard,
  onWaitForDa(actions, cards) {
    if (actions.gang) {
      return Enums.gang;
    }
    if (actions.hu) {
      return Enums.hu;
    }
    return Enums.guo;
  },

  onCanDoSomething(actions, cards, card) {
    return onCanDoSomething(actions, cards, card)
  }
}

export const playerAi = {
  getUseLessCard(cards, current) {
    return getUseLessCard(cards)
  },

  onWaitForDa(actions, cards) {
    if (actions.hu) {
      return Enums.hu;
    }
    if (actions.gang) {
      return Enums.gang;
    }
    return Enums.guo;
  },

  onCanDoSomething(actions, cards, card) {
    return onCanDoSomething(actions, cards, card)
  }
}

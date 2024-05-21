import Card, {CardType} from "../match/zhadan/card";
import alg, {randWithSeed} from '../utils/algorithm'

const genFullyCards = (useJoker: boolean = true) => {
    const types = [CardType.Club, CardType.Diamond, CardType.Heart, CardType.Spades]
    const fullCards = []

    types.forEach((type: CardType) => {
        for (let v = 1; v <= 13; v += 1) {
            fullCards.push(new Card(type, v), new Card(type, v))
        }
    })

    if (useJoker) {
        fullCards.push(new Card(CardType.Joker, 16), new Card(CardType.Joker, 16))
        fullCards.push(new Card(CardType.Joker, 17), new Card(CardType.Joker, 17))
    }
    return fullCards
}

function consumeCard(remainCards, cards) {
    const cardIndex = --remainCards
    return { card: cards[cardIndex], remainCards }
}

function rollReshuffle() {
    return Math.random() < 0.88
}

// // 从 0 开始，随机取一个小于 max 的整数
// function randomIntLessMax(max, randFunc) {
//     if (!randFunc) {
//         randFunc = randWithSeed();
//     }
//     return Math.floor(randFunc() * max);
// },

function getOnce() {
    // 6王
    const cards = genFullyCards()
    alg.shuffleForZhadan(cards)
    const canReplaceIndex = [];
    let allIndex = 0;
    let jokerTimeOnce = 0;

    cards.forEach(c => {
        if (c.value === 3) {
            canReplaceIndex.push(allIndex);
        }
        allIndex++;
    })

    alg.shuffleForZhadan(canReplaceIndex)
    cards[canReplaceIndex.shift()] = new Card(CardType.Joker, 16);
    cards[canReplaceIndex.shift()] = new Card(CardType.Joker, 17);

    let remainCards = cards.length
    const players = [];
    for (let i = 0; i < cards.length / 4; i++) {
        for (let j = 0; j < 4; j++) {
            const result = consumeCard(remainCards, cards);
            remainCards = result.remainCards;
            const card = result.card;
            const p = players[j]
            if (!p) {
                players.push([card]);
            } else {
                players[j].push(card);
            }
        }
    }
    for (const p of players) {
        const is4Joker = p.filter(c => c.type === CardType.Joker).length >= 4
        if (is4Joker) {
            // console.log('4joker');
            jokerTimeOnce++;
        }
    }
    return jokerTimeOnce;
    // console.log('cards', JSON.stringify(players))
}
let jokerTimes = 0;
for (let i = 0; i < 10000; i++) {
  let currentTimes = getOnce();
  for (let j = 0; j < 4; j ++) {
    if (currentTimes > 0 && rollReshuffle()) {
      // 重发一次
      currentTimes = getOnce();
    } else {
      break;
    }
  }
  jokerTimes += currentTimes;
}

console.log('joker times', jokerTimes);

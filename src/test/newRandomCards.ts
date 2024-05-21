import Card, {CardType} from "../match/zhadan/card";
import alg from '../utils/algorithm'

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
  return {card: cards[cardIndex], remainCards}
}

function rollReshuffle() {
  return Math.random() < 0.88
}

function shuffle(cards) {
  const jokerList = cards.filter(c => c.type === CardType.Joker)
  const noJoker = cards.filter(c => c.type !== CardType.Joker)
  alg.shuffle(jokerList)
  alg.shuffle(noJoker)
  const jokerCount = alg.genJoker(jokerList.length, 4)
  // console.log("joker count", jokerCount)
  const newCards = []
  const quarterCount = cards.length / 4
  for (let i = 0; i < 4; i++) {
    newCards.push(...jokerList.slice(0, jokerCount[i]))
    // 删除joker
    jokerList.splice(0, jokerCount[i])
    newCards.push(...noJoker.slice(0, quarterCount - jokerCount[i]))
    noJoker.splice(0, quarterCount - jokerCount[i])
  }
  return newCards.reverse()
}

function getOnce() {
  // 6王
  let cards = genFullyCards()
  alg.shuffle(cards)
  const canReplaceIndex = [];
  let allIndex = 0;
  let jokerTimeOnce = 0;

  cards.forEach(c => {
    if (c.value === 3) {
      canReplaceIndex.push(allIndex);
    }
    allIndex++;
  })

  // alg.shuffle(canReplaceIndex)
  cards[canReplaceIndex.shift()] = new Card(CardType.Joker, 16);
  cards[canReplaceIndex.shift()] = new Card(CardType.Joker, 17);
  cards = shuffle(cards)
  let remainCards = cards.length
  const players = [];
  for (let j = 0; j < 4; j++) {
    const playerCards = []
    const quarter = cards.length / 4
    for (let i = 0; i < quarter; i++) {
      const result = consumeCard(remainCards, cards);
      remainCards = result.remainCards;
      playerCards.push(result.card)
    }
    players.push(playerCards)
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
  const currentTimes = getOnce();
  jokerTimes += currentTimes;
}
console.log('joker times', jokerTimes);

// const jokerCount = genJoker()
const playerJokerCount = {
  0: 0,
  1: 0,
  2: 0,
  3: 0,
}
for (let i = 0; i < 12; i++) {
  const jokerCount = alg.genJoker(6, 4)
  for (let j = 0; j < jokerCount.length; j++) {
    if (jokerCount[j] > 0) {
      playerJokerCount[j]++
    }
  }
}

console.log("player joker count", playerJokerCount)

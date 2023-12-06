import * as process from "process";
import {manager} from "../../../match/zhadan/cardManager";
import {service} from "../../../service/importService";

const cards = manager.withJokerCards(8);
console.log('total cards', cards.length);
let cardMap = manager.cardList2Map(cards);
// const cardList = manager.makeCardsByConf(cardMap, { maxJokerCount: 5})
// console.log('take cards', JSON.stringify(cardList));
// console.log('remain joker', cardMap.jokerCount(), ', boom value list', cardMap.getBoomCardValueList())
manager.randomBoom(cardMap);
// console.log('random boom value', randomBoom[0].card.value, 'length', randomBoom.length, JSON.stringify(randomBoom) );
manager.randomBoom(cardMap);
manager.randomBoom(cardMap);
manager.randomBoom(cardMap);
// const planList = manager.randomPlan(cardMap);
// console.log('plan length', planList);
const playerCards = manager.makeCards(cards);
// console.log('all cards', JSON.stringify(playerCards));

for (let i = 0; i < 100; i++) {
  const list = service.utils.generateRandomNumber(8, 4, 6);
  cardMap = manager.cardList2Map(cards);
  const result = cardMap.selectJoker(list);
  console.log('get joker list', result, list)
}

process.exit(0)

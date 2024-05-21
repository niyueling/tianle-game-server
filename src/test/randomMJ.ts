import Enums from "../match/pcmajiang/enums";
import alg from '../utils/algorithm'

const generateCards = function () {
  const cards = []
  const addSpan = function (start, end) {
    for (let c = start; c <= end; c += 1) {
      cards.push(c)
      cards.push(c)
      cards.push(c)
      cards.push(c)
    }
  }

  addSpan(Enums.wanzi1, Enums.wanzi9)
  addSpan(Enums.tongzi1, Enums.tongzi9)
  addSpan(Enums.shuzi1, Enums.shuzi9)
  // addSpan(Enums.dong, Enums.bai);

  cards.push(Enums.zhong)
  cards.push(Enums.zhong)
  cards.push(Enums.zhong)
  cards.push(Enums.zhong)

  return cards
}

function consumeCard(remainCards, cards) {
  const cardIndex = --remainCards
  return {card: cards[cardIndex], remainCards}
}

// 生成麻将
function getOnce() {
  const cards = generateCards()
  // console.log('cars before shuffle', JSON.stringify(cards));
  alg.shuffle(cards)
  // console.log('cars after shuffle', JSON.stringify(cards));
  let sameTime = 0;
  let remainCards = cards.length
  const players = [];
  for (let i = 0; i < 4; i++) {
    // 每个人发13张
    for (let j = 0; j < 13; j++) {
      const result = consumeCard(remainCards, cards);
      remainCards = result.remainCards;
      const card = result.card;
      const p = players[i]
      if (!p) {
        players.push([card]);
      } else {
        players[i].push(card);
      }
    }
  }
  for (const p of players) {
    // 检查其中8张是不是一样
    // 万字
    let sameWan = 0;
    // 筒字
    let sameTong = 0;
    // 条子
    let sameShu = 0;
    p.forEach(value => {
      if (value >= Enums.wanzi1 && value <= Enums.wanzi9) {
        sameWan++;
      } else if (value >= Enums.tongzi1 && value <= Enums.tongzi9) {
        sameTong++;
      } else if (value >= Enums.shuzi1 && value <= Enums.shuzi9
      ) {
        sameShu++;
      }
    })
    if (sameWan >= 8 || sameTong >= 8 || sameShu >= 8) {
      console.log('cards', JSON.stringify(p));
      sameTime++;
    }
  }
  return sameTime;
}

let cardTimes = 0;
for (let i = 0; i < 10; i++) {
  cardTimes += getOnce();
}

console.log('same card times', cardTimes);

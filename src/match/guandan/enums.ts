import Card, {CardType} from "./card"

const enums = {
  ruleType: {
    zhuanZhuanMaJiang: 1,
    sanRenZhuanZhuan: 2,
    erRenZhuanZhuan: 3,
    changShaMaJiang: 4,
    lobby3Player: 5,
    lobby2Player: 6,
    lobby4Player: 7
  },

  goldCurrency: "gold",
  tlGoldCurrency: "tlGold",

  h1: new Card(CardType.Heart, 1, -1),
  h2: new Card(CardType.Heart, 2, -1),
  h3: new Card(CardType.Heart, 3, -1),
  h4: new Card(CardType.Heart, 4, -1),
  h5: new Card(CardType.Heart, 5, -1),
  h6: new Card(CardType.Heart, 6, -1),
  h7: new Card(CardType.Heart, 7, -1),
  h8: new Card(CardType.Heart, 8, -1),
  h9: new Card(CardType.Heart, 9, -1),
  h10: new Card(CardType.Heart, 10, -1),
  h11: new Card(CardType.Heart, 11, -1),
  h12: new Card(CardType.Heart, 12, -1),
  h13: new Card(CardType.Heart, 13, -1),

  c1: new Card(CardType.Club, 1, -1),
  cA: new Card(CardType.Club, 1, -1),
  c2: new Card(CardType.Club, 2, -1),
  c3: new Card(CardType.Club, 3, -1),
  c4: new Card(CardType.Club, 4, -1),
  c5: new Card(CardType.Club, 5, -1),
  c6: new Card(CardType.Club, 6, -1),
  c7: new Card(CardType.Club, 7, -1),
  c8: new Card(CardType.Club, 8, -1),
  c9: new Card(CardType.Club, 9, -1),
  c10: new Card(CardType.Club, 10, -1),
  c11: new Card(CardType.Club, 11, -1),
  cJ: new Card(CardType.Club, 11, -1),
  c12: new Card(CardType.Club, 12, -1),
  cQ: new Card(CardType.Club, 12, -1),
  c13: new Card(CardType.Club, 13, -1),
  cK: new Card(CardType.Club, 13, -1),

  s1: new Card(CardType.Spades, 1, -1),
  s2: new Card(CardType.Spades, 2, -1),
  s3: new Card(CardType.Spades, 3, -1),
  s4: new Card(CardType.Spades, 4, -1),
  s5: new Card(CardType.Spades, 5, -1),
  s6: new Card(CardType.Spades, 6, -1),
  s7: new Card(CardType.Spades, 7, -1),
  s8: new Card(CardType.Spades, 8, -1),
  s9: new Card(CardType.Spades, 9, -1),
  s10: new Card(CardType.Spades, 10, -1),
  s11: new Card(CardType.Spades, 11, -1),
  s12: new Card(CardType.Spades, 12, -1),
  s13: new Card(CardType.Spades, 13, -1),
  sK: new Card(CardType.Spades, 13, -1),

  d1: new Card(CardType.Diamond, 1, -1),
  d2: new Card(CardType.Diamond, 2, -1),
  d3: new Card(CardType.Diamond, 3, -1),
  d4: new Card(CardType.Diamond, 4, -1),
  d5: new Card(CardType.Diamond, 5, -1),
  d6: new Card(CardType.Diamond, 6, -1),
  d7: new Card(CardType.Diamond, 7, -1),
  d8: new Card(CardType.Diamond, 8, -1),
  d9: new Card(CardType.Diamond, 9, -1),
  d10: new Card(CardType.Diamond, 10, -1),
  d11: new Card(CardType.Diamond, 11, -1),
  d12: new Card(CardType.Diamond, 12, -1),
  d13: new Card(CardType.Diamond, 13, -1),

  j1: new Card(CardType.Joker, 16, -1),
  j2: new Card(CardType.Joker, 17, -1),

}

export default enums

import Card, {CardType} from "../card";
import {CalcResult, generateWildCardGroup, PatternMatcherBase} from "./base"
import {BombWithJoker as Bomb} from "./bomb"
import {DoublePairWithJoker as DoublePair} from "./doublePair"
import {FiveSameWithJoker as FiveSame} from "./fiveSame"
import {FlushWithJoker as Flush} from "./flush"
import {GourdWithJoker as Gourd} from "./gourd"
import {PairWithJoker as Pair} from "./pair"
import {SameColorWithJoker as SameColor} from "./sameColor"
import {Single} from "./single"
import {StraightWithJoker as Straight} from "./straight"
import {TripleWithJoker as Triple} from "./triple"

export default function createCalculators(opts): PatternMatcherBase[] {
  return [FiveSame, Flush, Bomb, Gourd, SameColor, Straight, Triple, DoublePair, Pair, Single]
    .map(PatternConstructor =>
      new PatternConstructor(opts)
    )
}

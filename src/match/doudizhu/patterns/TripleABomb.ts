import Card from "../card";
import {IMatcher, IPattern, PatterNames} from "./base";

export default class TripleABomb implements IMatcher {
  name: string = PatterNames.bomb;
  verify(cards: Card[], allCards: Card[] = []): IPattern | null {
    if (cards.length !== 3) {
      return null
    }

    if (cards.every(c => c.value === 1)) {
      return {
        name: this.name,
        score: 414,
        cards
      }
    }

    return null;
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    if (target.name !== this.name) {
      return [];
    }
    const aces = cards.filter(c => c.value === 1)
    if (aces.length === 3) {
      return [aces]
    }
    return [];
  }

}

import Card from "../card";
import {IMatcher, IPattern, PatterNames} from "./base";

export default class Triple2Bomb implements IMatcher {
  name: string = PatterNames.bomb;
  verify(cards: Card[]): IPattern | null {
    if (cards.length !== 3) {
      return null
    }

    if (cards.every(c => c.value === 2)) {
      return {
        name: this.name,
        score: 415,
        cards
      }
    }

    return null;
  }

  promptWithPattern(target: IPattern, cards: Card[]): Card[][] {
    if (target.name !== this.name) {
      return [];
    }
    const second = cards.filter(c => c.value === 2)
    if (second.length === 3) {
      return [second]
    }
    return [];
  }
}

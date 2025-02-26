import {Serializable, serialize, serializeHelp} from "./serializeDecorator";

export interface IGameRecorder {
  recordUserEvent(player: any, event: string, cards?: any[], pattern?: object, playerIndexs?: number[]): void;

  pushEvent(event: any)

  getEvents(): any[];
}

class GameRecorder implements IGameRecorder, Serializable {

  @serialize
  events: any[]

  game: any

  constructor(game) {
    this.game = game
    this.events = []
  }

  resume(recorder) {
    this.events = recorder.events
  }

  recordUserEvent(player, event, actionCards = [], pattern = {}, playerIndexs = []) {
    let cards = [];
    let index = -1;
    if (player) {
      cards = player.getCardsArray();
      index = player.seatIndex;
    }


    if (actionCards.length) {
      actionCards = actionCards.sort((a, b) => a.point - b.point);
    }

    const eventRecord = {
      index,
      info: {cards, actionCards, pattern, playerIndexs, createAt: new Date()},
      type: event
    }

    this.events.push(eventRecord)
  }

  pushEvent(event: any) {
    this.events.push(event)
  }

  getEvents() {
    return this.events
  }

  resetEvents() {
    this.events = []
  }

  toJSON() {
    return serializeHelp(this)
  }
}

export default GameRecorder

export class DummyRecorder implements IGameRecorder {

  recordUserEvent(player, event, card) {
    return;
  }

  getEvents() {
    return []
  }

  pushEvent(event: any) {
    return;
  }

}

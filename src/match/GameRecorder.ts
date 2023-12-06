import {Serializable, serialize, serializeHelp} from "./serializeDecorator";

export interface IGameRecorder {
  recordUserEvent(player: any, event: string, cards?: any[]): void;

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

  recordUserEvent(player, event, actionCards) {
    const cards = player.getCardsArray()
    const index = player.seatIndex

    const eventRecord = {
      index,
      info: {cards, actionCards},
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

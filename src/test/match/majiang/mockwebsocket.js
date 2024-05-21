const OPEN = 1
const CLOSED = 0
import * as ws from 'ws'

export let packets = []

class MockWebSocket {
  constructor() {
    this.readyState = ws.CLOSE;
  }

  send(packet, callback) {
    let toId = this.player.model._id
    let packetJson = JSON.parse(packet);
    packetJson.to = toId
    packets.push(packetJson);
    callback && callback();
  }

  open() {
    this.readyState = ws.OPEN;
  }

  static clear() {
    packets = [];
  }

  static displayMessage() {
    if (process.env.NODE_ENV === 'test') return

    const stack = new Error().stack.split('\n')[2].trim()
    console.log(stack)
    console.log("==========start===========");
    packets.forEach((p) => {
      console.log(p.to, p.name, JSON.stringify(p.message))
    })
    console.log("==========end=============");
    console.log()
  }

  static packetsWithMessageName(name) {
    return packets.filter(p => p.name === name)
  }

  static packetsTo(to, messageName) {
    return packets.filter(p => p.to === to)
      .filter((p) => {
        if (!messageName) return true
        return p.name === messageName
      })
  }
}


export default MockWebSocket

export const displayMessage = MockWebSocket.displayMessage
export const clearMessage = MockWebSocket.clear
export const packetsWithMessageName = MockWebSocket.packetsWithMessageName
export const packetsTo = MockWebSocket.packetsTo
export const scoreString = function () {

  let gameOverPacket = packetsWithMessageName('game/game-over')[0]
  if (gameOverPacket.message.states) {
    const stats = gameOverPacket.message.states
    return stats
      .map(s => s.score)
      .join(',')

  } else {
    return 'NOT-GAME-OVER-PACKET'
  }
}

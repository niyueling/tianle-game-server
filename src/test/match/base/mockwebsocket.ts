import * as ws from 'ws'

class MockWebSocket {
  readyState
  player: any
  packets: any[]
  constructor() {
    this.readyState = ws.CLOSE;
    this.packets = [];
  }

  send(packet, callback) {
    const toId = this.player.model._id
    const packetJson = JSON.parse(packet);
    packetJson.to = toId
    this.packets.push(packetJson);
    if (callback) {
      callback();
    }
  }

  open() {
    this.readyState = ws.OPEN;
  }

  // clear() {
  //   this.packets = [];
  // }

  displayMessage() {
    const stack = new Error().stack.split('\n')[2].trim()
    console.log(stack)
    console.log("==========start===========");
    this.packets.forEach( p => {
      console.log(p.to, p.name, JSON.stringify(p.message))
    })
    console.log("==========end=============");
    console.log()
  }

  packetsWithMessageName(name) {
    return this.packets.filter(p => p.name === name)
  }

  packetsTo(to, messageName) {
    return this.packets.filter(p => p.to === to)
      .filter( p => {
        if (!messageName) return true
        return p.name === messageName
      })
  }

  scoreString() {
      const gameOverPacket = this.packetsWithMessageName('game/game-over')[0]
      if (gameOverPacket.message.states) {
        const stats = gameOverPacket.message.states
        return stats
          .map(s => s.score)
          .join(',')
      } else {
        return 'NOT-GAME-OVER-PACKET'
      }
  }
}

export default MockWebSocket

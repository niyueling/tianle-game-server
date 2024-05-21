'use strict'

import Lobby from  '../../../match/pcmajiang/centerlobby'
import {packets, displayMessage, clearMessage}  from './mockwebsocket'

import {createPlayerSocket}  from './setupMatch'

describe('离线房间', () => {


  let lobby

  before(() => {
    lobby = Lobby.getInstance()
  })

  it('test', () => {

    const room = lobby.createRoom(false, 'roomId' ,{playerCount: 4})

    const players = ['1', '2', '3', '4'].map(id => {
      let player = createPlayerSocket(id)
      room.join(player)
      room.ready(player)
      return player
    })

    room.creator = players[0]


    const table = room.gameState


    table.fapai()


    room.playerDisconnect(players[0])

    table.gameOver()
    displayMessage()
  })
})

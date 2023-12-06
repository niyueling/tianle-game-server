const dissolveRoom = {
  payload: {
    playerId: '',
    roomId: '',
    gameType: '',
  },
  cmd: 'dissolveRoom'
}
console.log('dissolve room\n', `PUBLISH  adminChannelToGame '${JSON.stringify(dissolveRoom)}'`)

export interface IPlayerModel {
  _id: string,
  name: string,
  gold: number,
  gem: number,
  ruby: number
  shortId: number
}

export interface ISocketPlayer {

  model: IPlayerModel

  sendMessage(name: 'room/join-success', message: { _id: string, rule: any });

  sendMessage(name: 'room/join-fail', message: { reason: string });

  sendMessage(name: 'room/leave-success', message: { _id: string });

  sendMessage(name: 'resources/updateGold', message: { gold: number });

  sendMessage(name: 'resources/updateGem', message: { gem: number });

  sendMessage(name: 'resource/createRoomUsedGem', message: { createRoomNeed: number });

  sendMessage(name: 'club/updateClubInfo', message: {})

  sendMessage(name: 'club/haveRequest', message: {})

  sendMessage(name: 'tournament/wait', message: {})

  sendMessage(name: 'tournament/joinReply', message: {})

  sendMessage(name: 'tournament/quitReply', message: {})

  sendMessage(name: 'tournament/queue', message: {})

  sendMessage(name: 'resource/update', message: {})

  sendMessage(name: 'tournament/myTourIdReply', message: { currentId: string })

  sendMessage(name: 'tournament/tournamentsReply', message: {})

  sendMessage(name: 'tournament/countReply', message: {})

  requestToCurrentRoom(name: string, message?: any)

  requestTo(queue: string, name: string, message?: any)

  updateResource2Client()

  _id: string
}

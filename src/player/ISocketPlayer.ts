export interface IPlayerModel {
  _id: string,
  nickname: string,
  gold: number,
  diamond: number,
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

  requestToCurrentRoom(name: string, message?: any)

  requestTo(queue: string, name: string, message?: any)

  updateResource2Client()

  _id: string
}

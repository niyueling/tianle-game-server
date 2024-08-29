export interface IPlayerModel {
  _id: string,
  nickname: string,
  gold: number,
  diamond: number,
  tlGold: number,
  shortId: number
}

export interface ISocketPlayer {

  model: IPlayerModel

  sendMessage(name: 'room/joinReply', message: { ok: boolean, info: string });

  sendMessage(name: 'room/leaveReply', message: { playerId: string });

  sendMessage(name: 'resource/update', message: { ok: boolean, data: {gold: number, diamond: number, tlGold: number} });

  sendMessage(name: 'resources/updateGem', message: { gem: number });

  sendMessage(name: 'resource/createRoomUsedGem', message: { createRoomNeed: number });

  sendMessage(name: 'club/updateClubInfo', message: {})

  sendMessage(name: 'club/haveRequest', message: {})

  requestToCurrentRoom(name: string, message?: any)

  requestTo(queue: string, name: string, message?: any)

  updateResource2Client()

  _id: string
}

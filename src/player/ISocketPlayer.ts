export interface IPlayerModel {
  _id: string,
  nickname: string,
  gold: number,
  diamond: number,
  voucher: number,
  shortId: number
}

export interface ISocketPlayer {

  model: IPlayerModel

  sendMessage(name: 'room/joinReply', message: { ok: boolean, info: string });

  sendMessage(name: 'room/leaveReply', message: { _id: string });

  sendMessage(name: 'resource/update', message: { gold: number, diamond: number, voucher: number });

  sendMessage(name: 'resources/updateGem', message: { gem: number });

  sendMessage(name: 'resource/createRoomUsedGem', message: { createRoomNeed: number });

  sendMessage(name: 'club/updateClubInfo', message: {})

  sendMessage(name: 'club/haveRequest', message: {})

  requestToCurrentRoom(name: string, message?: any)

  requestTo(queue: string, name: string, message?: any)

  updateResource2Client()

  _id: string
}

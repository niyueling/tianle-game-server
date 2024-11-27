// @ts-ignore
import {pick, remove} from 'lodash'
import * as winston from 'winston'
import GameRecorder from '../../match/GameRecorder'
import {service} from "../../service/importService";
import alg from "../../utils/algorithm";
import {eqlModelId} from "../modelId"
import {autoSerialize, autoSerializePropertyKeys, Serializable, serialize, serializeHelp} from "../serializeDecorator"
import Card, {CardType} from "./card"
import {manager} from "./cardManager";
import {arraySubtract, groupBy, IPattern, PatterNames, patternCompare} from "./patterns/base"
import BombMatcher from './patterns/BombMatcher'
import PlayerState from './player_state'
import Room from './room'
import Rule from './Rule'
import {shopPropType, TianleErrorCode} from "@fm/common/constants";
import GoodsProp from "../../database/models/GoodsProp";
import PlayerProp from "../../database/models/PlayerProp";
import Pattern from "./patterns";
import * as config from "../../config"
import RoomTimeRecord from "../../database/models/roomTimeRecord";
import StraightFlushMatcher from "./patterns/StraightFlushMatcher";
import StraightDoublesMatcher from "./patterns/StraightDoublesMatcher";

const logger = new winston.Logger({
  level: 'debug',
  transports: [new winston.transports.Console()]
})

const stateWaitCommit = 'stateWaitCommit'
const stateGameOver = 'stateGameOver'

export enum Team {
  HomeTeam = 0,
  AwayTeam = 1,
  NoTeam = 2,
}

export const genFullyCards = (useJoker: boolean = true, room) => {
  const types = [CardType.Club, CardType.Diamond, CardType.Heart, CardType.Spades];
  const cards = [];

  types.forEach((type: CardType) => {
    for (let v = 1; v <= 13; v += 1) {
      cards.push(new Card(type, v, room.currentLevelCard), new Card(type, v, room.currentLevelCard));
    }
  })

  if (useJoker) {
    cards.push(new Card(CardType.Joker, 16, room.currentLevelCard), new Card(CardType.Joker, 16, room.currentLevelCard));
    cards.push(new Card(CardType.Joker, 17, room.currentLevelCard), new Card(CardType.Joker, 17, room.currentLevelCard));
  }

  return cards;
}

class Status {
  current = {seatIndex: 0, step: 1}
  lastCards: Card[] = []
  lastPattern: IPattern = null
  lastIndex: number = -1
  from: number
  winOrder = 0
}

abstract class Table implements Serializable {

  restJushu: number
  turn: number

  cards: Card[]

  @autoSerialize
  remainCards: number

  @serialize
  players: PlayerState[]
  zhuang: PlayerState

  rule: Rule
  room: Room

  @autoSerialize
  state: string

  @autoSerialize
  status: Status

  onRoomEmpty: () => void
  onReconnect: (player: any, index: number) => void

  @serialize
  recorder: GameRecorder

  @autoSerialize
  listenerOn: string[]

  @serialize
  stateData: any

  @autoSerialize
  soloPlayerIndex: number = -1

  isHelp: boolean = false

  @autoSerialize
  mode: 'teamwork'

  @autoSerialize
  foundFriend: boolean = true

  @autoSerialize
  friendCard: Card = null

  @autoSerialize
  tableState: string

  @autoSerialize
  autoCommitStartTime: number

  @autoSerialize
  multiple: number = 1

  @autoSerialize
  faPaiPayload: object = {}

  @autoSerialize
  kangTribute: any[] = []

  @autoSerialize
  nextSeatIndex: number = -1

  @autoSerialize
  isAllTribute: boolean = false

  pattern: Pattern

  @autoSerialize
  shuffleDelayTime: number = Date.now()
  private autoCommitTimer: NodeJS.Timer

  constructor(room, rule, restJushu) {
    this.restJushu = restJushu
    this.rule = rule
    this.room = room
    this.status = new Status()
    this.pattern = new Pattern(room);
    this.listenRoom(room)

    if (this.room.currentLevelCard && this.room.currentLevelCard !== -1) {
      this.initCards()
    }

    this.initPlayers()
    this.setGameRecorder(new GameRecorder(this))
  }

  get empty() {
    return this.players.filter(p => p).length === 0
  }

  get playerCount() {
    return this.players.filter(p => p).length
  }

  get currentPlayerStep() {
    return this.status.current.seatIndex
  }

  toJSON() {
    return serializeHelp(this)
  }

  resume(tableStateJson) {
    const keys = autoSerializePropertyKeys(this)
    Object.assign(this, pick(tableStateJson.gameState, keys))
    if (this.status.lastCards) {
      this.status.lastCards = this.status.lastCards.map(c => Card.from(c))
    }
    if (this.status.lastPattern) {
      this.status.lastPattern.cards = this.status.lastPattern.cards.map(c => Card.from(c))
    }

    if (this.friendCard) {
      this.friendCard = Card.from(this.friendCard)
    }

    if (tableStateJson.gameState.recorder) {
      this.recorder.resume(tableStateJson.gameState.recorder)
    }

    this.stateData = {}

    for (const [i, p] of this.players.entries()) {
      p.resume(tableStateJson.gameState.players[i])
    }

    this.autoCommitFunc()
  }

  abstract name()

  abstract async start(payload)

  async initPlayers() {
    const room = this.room
    const rule = this.rule

    const players = room.playersOrder
      .map(playerSocket => new PlayerState(playerSocket, room, rule))

    players[0].zhuang = true
    this.zhuang = players[0]
    players.forEach(p => this.listenPlayer(p))

    this.players = players
  }

  public setFirstDa(startPlayerIndex: number) {
    this.status.current.seatIndex = startPlayerIndex
  }

  initCards() {
    this.cards = genFullyCards(this.rule.useJoker, this.room)
    this.remainCards = this.cards.length
  }

  shuffle() {
    alg.shuffleForZhadan(this.cards)
    this.turn = 1
    this.remainCards = this.cards.length
  }

  consumeCard(helpCardard) {
    let cardIndex = --this.remainCards;
    if (helpCardard) {
      const index = this.cards.findIndex(c => c.type === helpCardard.type && c.value === helpCardard.value);
      if (index !== -1) {
        cardIndex = index;
      }
    }

    const card = this.cards[cardIndex];
    this.cards.splice(cardIndex, 1);
    // console.warn("cardCount %s remainCard %s card %s", this.cards.length, cardIndex, JSON.stringify(card));
    return card;
  }

  takeQuarterCards(p, helpCards) {
    const cards = [];
    const helpCardCount = helpCards.length;
    // console.warn("helpCardCount %s helpCards %s", helpCardCount, JSON.stringify(helpCards));
    for (let i = p.cards.length; i < this.getQuarterCount(); i++) {
      cards.push(this.consumeCard(i < helpCardCount ? helpCards[i] : null));
    }

    return cards;
  }

  getQuarterCount() {
    return 27;
  }

  async fapai(payload) {
    // payload.cards = [
    //   [{type: 2, point: 2, value: 2}, {type: 2, point: 2, value: 2}],
    //   [],
    //   [],
    //   []
    // ];
    await this._fapai(payload);

    // 分配队友
    if (this.room.game.juIndex === 1) {
      this.players[0].team = this.players[2].team = Team.HomeTeam;
      this.players[1].team = this.players[3].team = Team.AwayTeam;
      this.room.homeTeam = [this.players[0]._id.toString(), this.players[2]._id.toString()];
      this.room.awayTeam = [this.players[1]._id.toString(), this.players[3]._id.toString()];
    } else {
      const homeTeamPlayers = this.players.filter(p => this.room.homeTeam.includes(p._id.toString()));
      const awayTeamPlayers = this.players.filter(p => this.room.awayTeam.includes(p._id.toString()));
      homeTeamPlayers[0].team = homeTeamPlayers[1].team = Team.HomeTeam;
      awayTeamPlayers[0].team = awayTeamPlayers[1].team = Team.AwayTeam;
    }
  }

  // 公共房发牌
  async publicRoomFapai() {
    this.shuffle()
    this.stateData = {};
    this.turn = 1;
    this.cards = manager.withJokerCards(this.room);
    const playerCards = manager.makeCards(this.cards);
    this.remainCards = this.cards.length;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.cards = playerCards[i].map(value => value.card);
    }

    // 分配队友
    if (this.room.game.juIndex === 1) {
      this.players[0].team = this.players[2].team = Team.HomeTeam;
      this.players[1].team = this.players[3].team = Team.AwayTeam;
      this.room.homeTeam = [this.players[0]._id.toString(), this.players[2]._id.toString()];
      this.room.awayTeam = [this.players[1]._id.toString(), this.players[3]._id.toString()];
    } else {
      const homeTeamPlayers = this.players.filter(p => this.room.homeTeam.includes(p._id.toString()));
      const awayTeamPlayers = this.players.filter(p => this.room.awayTeam.includes(p._id.toString()));
      homeTeamPlayers[0].team = homeTeamPlayers[1].team = Team.HomeTeam;
      awayTeamPlayers[0].team = awayTeamPlayers[1].team = Team.AwayTeam;
    }
  }

  evictPlayer(evictPlayer: PlayerState) {
    remove(this.players, p => eqlModelId(p, evictPlayer))
    this.removeRoomListenerIfEmpty()
  }

  removeRoomListenerIfEmpty() {
    if (this.empty) {
      this.removeRoomListener()
    }
  }

  removeRoomListener() {
    this.room.removeListener('reconnect', this.onReconnect)
    this.room.removeListener('empty', this.onRoomEmpty)
  }

  listenPlayer(player: PlayerState) {
    this.listenerOn = ['game/da', 'game/guo', 'game/cancelDeposit', 'game/refresh']

    player.msgDispatcher.on('game/da', msg => this.onPlayerDa(player, msg))
    player.msgDispatcher.on('game/guo', msg => this.onPlayerGuo(player))
    player.msgDispatcher.on('game/cancelDeposit', msg => this.onCancelDeposit(player))
    // 手动刷新
    player.msgDispatcher.on('game/refresh', async () => {
      player.sendMessage('room/refresh', {ok: true, data: await this.reconnectContent(player.seatIndex, player)});
    })
  }

  onCancelDeposit(player: PlayerState) {
    player.cancelDeposit()
    this.room.robotManager.disableRobot(player._id)
    this.autoCommitFunc()
  }

  async autoCommitForPlayers() {
    const player = this.players.find(x => x.seatIndex === this.currentPlayerStep);
    if (!player || player.msgDispatcher.isRobot()) {
      // 忽略机器人
      return;
    }

    if (!player.onDeposit) {
      player.sendMessage('game/startDeposit', {ok: true, data: {onDeposit: player.onDeposit}});
      player.onDeposit = true;
    }

    if (!this.canGuo()) {
      const cards = this.promptWithFirstPlay(player);
      return this.onPlayerDa(player, {cards: cards})
    }

    const cards = this.promptWithPattern(player);
    if (cards.length > 0) {
      return this.onPlayerDa(player, {cards: cards})
    }

    return this.guoPai(player);
  }

  moveToNext() {
    let nextSeatIndex = this.currentPlayerStep

    let findNext = false
    while (!findNext) {
      nextSeatIndex = (nextSeatIndex + 1) % this.playerCount
      const playerState = this.players[nextSeatIndex]

      if (nextSeatIndex === this.status.from) {
        this.status.lastPattern = null
        this.status.lastCards = []

        if (playerState.cards.length === 0 && playerState.foundFriend) {
          nextSeatIndex = playerState.teamMate;
          this.cleanCards(playerState);
          this.room.broadcast("game/jieFeng", {ok: true, data: {index: nextSeatIndex}});
          findNext = true;
        }
      }

      if (playerState.cards.length > 0) {
        findNext = true
      } else {
        this.cleanCards(playerState)
      }
    }

    this.status.current.seatIndex = nextSeatIndex
    this.status.current.step += 1
  }

  cleanCards(player: PlayerState) {
    if (player.cleaned) {
      return
    }

    this.room.broadcast('game/cleanCards', {ok: true, data: {index: player.index}})
    player.cleaned = true

  }

  async restoreMessageForPlayer(player: PlayerState) {
    const index = this.atIndex(player)
    const soloPlayer = this.players[this.soloPlayerIndex]
    const lastRecord = await service.rubyReward.getLastRubyRecord(this.room.uid);
    let roomRubyReward = 0;
    if (lastRecord) {
      // 奖池
      roomRubyReward = lastRecord.balance;
    }
    const pushMsg = {
      index, status: [],
      mode: this.mode,
      currentPlayer: this.status.current.seatIndex,
      soloPlayerIndex: this.soloPlayerIndex,
      soloPlayerName: soloPlayer && soloPlayer.model.nickname,
      lastPattern: this.status.lastPattern,
      lastIndex: this.status.lastIndex,
      friendCard: this.friendCard,
      from: this.status.from,
      juIndex: this.room.game.juIndex,
      juShu: this.restJushu,
      foundFriend: this.foundFriend,
    }
    for (let i = 0; i < this.players.length; i++) {
      if (i === index) {
        pushMsg.status.push({
          ...this.players[i].statusForSelf(this),
          roomRubyReward,
          teamMateCards: this.teamMateCards(this.players[i])
        })
      } else {
        pushMsg.status.push({
          ...this.players[i].statusForOther(this),
          roomRubyReward,
        })
      }
    }

    return pushMsg
  }

  isCurrentStep(player) {
    return this.currentPlayerStep === player.seatIndex
  }

  daPaiFail(player, info = TianleErrorCode.systemError, cards = []) {
    player.sendMessage('game/daCardReply', {ok: false, info, data: {index: player.seatIndex, currentPlayerStep: this.currentPlayerStep, roomId: this.room._id, deposit: player.onDeposit, cards}})
  }

  guoPaiFail(player, info = TianleErrorCode.systemError) {
    player.sendMessage('game/guoCardReply', {ok: false, info})
  }

  autoCommitFunc(playerIsOndeposit = false) {
    let time = 5;

    if (this.tableState !== 'selectMode') {
      time = 15;
    }

    if (!this.room.isPublic && !this.rule.ro.autoCommit) {
      return ;
    }
    if (!this.room.isPublic && this.rule.ro.autoCommit && this.tableState !== 'selectMode') {
      time = (this.rule.ro.autoCommit + 1) * 1000;
    }

    // 如果处于进还贡状态，托管后自动选择
    if (this.tableState === 'returnTribute') {
      time = 30;
    }

    clearTimeout(this.autoCommitTimer);
    this.autoCommitStartTime = Date.now();
    const primaryDelayTime = playerIsOndeposit ? 2000 : time * 1000;
    const delayTime = primaryDelayTime - (Date.now() - this.autoCommitStartTime);
    // console.warn("currentPlayerStep %s playerIsOndeposit %s delayTime %s tableState %s", this.currentPlayerStep, playerIsOndeposit, delayTime, this.tableState);
    this.autoCommitTimer = setTimeout(async () => {
      if (this.tableState === "selectMode") {
        return await this.autoCommitForPlayerChooseMode();
      } else if (this.tableState === "returnTribute") {
        await this.autoCommitForPlayerPayOrReturn();
      } else {
        await this.autoCommitForPlayers();
      }
    }, delayTime)
  }

  async autoCommitForPlayerChooseMode() {
    const notChoosePlayers = this.players.filter(p => !p.isChooseMode);
    for (const player of notChoosePlayers) {
      if (!player || player.msgDispatcher.isRobot()) {
        // 忽略机器人
        continue;
      }

      return await this.room.gameState.onSelectMode(player, 1);
    }
  }

  async autoCommitForPlayerPayOrReturn() {
    // 如果是进还贡
    const payAndReturnPlayers = this.players.filter(p => p.payTributeState || p.returnTributeState);
    for (const player of payAndReturnPlayers) {
      if (!player || player.msgDispatcher.isRobot()) {
        // 忽略机器人
        continue;
      }

      // console.warn("tableState %s payTributeState %s returnTributeState %s", this.room.gameState.tableState, player.payTributeState, player.returnTributeState);
      const cardSlices = player.cards.slice();
      const sortCard = cardSlices.sort((grp1, grp2) => {
        return grp2.point - grp1.point
      });
      const caiShen = cardSlices.filter(c => c.type === CardType.Heart && c.value === this.room.currentLevelCard);
      const subtractCards = arraySubtract(sortCard.slice(), caiShen);

      // 进贡
      if (player.payTributeState) {
        return await this.room.gameState.onPayTribute(player, {card: subtractCards[0]});
      }

      // 还贡
      if (player.returnTributeState) {
        return await this.room.gameState.onReturnTribute(player, {card: subtractCards[subtractCards.length - 1]});
      }
    }
  }

  onPlayerDa(player, {cards: plainCards}, onDeposit?) {
    if (!this.isCurrentStep(player)) {
      this.daPaiFail(player, TianleErrorCode.notDaRound, plainCards);
      return;
    }

    const cards = plainCards.map(Card.from);
    this.status.lastIndex = this.currentPlayerStep;
    const currentPattern = this.pattern.isGreaterThanPatternForPlainCards(plainCards, this.status.lastPattern, player.cards.length);

    if (player.tryDaPai(cards.slice()) && patternCompare(currentPattern, this.status.lastPattern) > 0) {
      this.daPai(player, cards, currentPattern, onDeposit);
    } else {
      // console.warn("cards %s currentPattern %s lastPattern %s patternCompare %s", JSON.stringify(cards), JSON.stringify(currentPattern), JSON.stringify(this.status.lastPattern), patternCompare(currentPattern, this.status.lastPattern));
      this.cannotDaPai(player, cards, currentPattern);
    }
  }

  daPai(player: PlayerState, cards: Card[], pattern: IPattern, onDeposit?) {

    player.daPai(cards.slice(), pattern)
    const remains = player.remains;

    this.status.from = this.status.current.seatIndex;
    this.status.lastPattern = pattern;
    this.status.lastCards = cards;

    if (pattern.name === PatterNames.bomb || pattern.name === PatterNames.straightFlush) {
      player.recordBomb(pattern);
      const usedJoker = pattern.cards.filter(c => c.type === CardType.Joker).length;
      player.unusedJokers -= usedJoker;

      // 如果炸弹需要翻倍
      if (this.rule.allowBombDouble) {
        const firstWinPlayer = this.players.find(p => p.winOrder === 1);
        const multiple = this.calcBombCardsMultiple(pattern.cards);

        // 如果没人头游，或者是头游的队友，计算翻倍
        if (!firstWinPlayer || (firstWinPlayer && firstWinPlayer.team === player.team)) {
          this.multiple = this.multiple * multiple;
          this.room.broadcast("game/gameMultipleChange", {ok: true, data: {multiple: this.multiple, changeMultiple: multiple}});
        }
      }
    }

    let teamMateCards = [];
    if (remains === 0) {
      player.winOrder = ++this.status.winOrder;
      teamMateCards = this.teamMateCards(player);
      this.room.broadcast("game/showWinOrder", {ok: true, data: {index: player.seatIndex, winOrder: player.winOrder}});
    }

    this.moveToNext()
    player.sendMessage('game/daCardReply', {
      ok: true,
      data: {
        remains, teamMateCards,
        onDeposit: player.onDeposit || !!onDeposit
      }
    })

    const isGameOver = this.isGameOver()
    const nextPlayer = isGameOver ? -1 : this.currentPlayerStep

    this.room.broadcast('game/otherDa', {ok: true, data: {
        cards,
        remains,
        index: player.seatIndex,
        next: nextPlayer,
        pattern: this.status.lastPattern
      }})
    this.notifyTeamMateWhenTeamMateWin(player, cards);
    if (this.players[nextPlayer]) {
      // console.warn("daPai index %s _id %s onDeposit %s", this.players[nextPlayer].seatIndex, this.players[nextPlayer]._id, this.players[nextPlayer].onDeposit);
      this.autoCommitFunc(this.players[nextPlayer].onDeposit);
    }
    if (isGameOver) {
      const lostPlayers = this.players.filter(p => p.winOrder === 99);
      for (let i = 0; i < lostPlayers.length; i++) {
        this.room.broadcast("game/showWinOrder", {ok: true, data: {index: lostPlayers[i].seatIndex, winOrder: lostPlayers[i].winOrder}});
      }

      this.room.winOrderLists = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder).map(p => {return {playerId: p._id, winOrder: p.winOrder, team: p.team}});

      this.showGameOverPlayerCards()
      this.status.current.seatIndex = -1
      console.log('game over set seatIndex -1');
      this.gameOver()
    }
  }

  calcBombCardsMultiple(cards) {
    const cardCount = cards.length;
    const jokerCardCount = cards.filter(c => c.type === CardType.Joker).length;

    // 8星以下炸弹和同花顺，翻2倍
    if (cardCount < 8 && jokerCardCount !== 4) {
      return 2;
    }

    if (cardCount >= 8) {
      return 3;
    }

    if (jokerCardCount === 4) {
      return 5;
    }
  }

  showGameOverPlayerCards() {
    const playersCard = []
    this.players.forEach(p => {
      if (p.cards.length > 0) {
        playersCard.push({index: p.seatIndex, cards: p.cards})
      }
    })
    this.room.broadcast('game/gameOverPlayerCards', {ok: true, data: {
        playersCard
      }})
  }

  homeTeamPlayers(): PlayerState[] {
    return this.players.filter(p => p.team === Team.HomeTeam)
  }

  awayTeamPlayers(): PlayerState[] {
    return this.players.filter(p => p.team === Team.AwayTeam)
  }

  isGameOver(): boolean {
    const homeTeamCards = this.homeTeamPlayers().reduce((cards, p) => {
      return p.cards.length + cards
    }, 0)

    const awayTeamCards = this.awayTeamPlayers().reduce((cards, p) => {
      return p.cards.length + cards
    }, 0)

    return homeTeamCards === 0 || awayTeamCards === 0
  }

  cannotDaPai(player, cards, pattern) {
    this.room.broadcast('game/daCardReply', {
      ok: false,
      info: TianleErrorCode.cardDaError,
      data: {index: player.index, daCards: cards, inHandle: player.cards, pattern}
    })
  }

  canGuo(): boolean {
    return this.status.lastPattern !== null
  }

  onPlayerGuo(player) {
    if (!this.isCurrentStep(player)) {
      this.guoPaiFail(player)
      return
    }

    if (!this.canGuo()) {
      player.sendMessage("game/guoCardReply", {ok: false, info: TianleErrorCode.guoError});
      return
    }

    this.guoPai(player)
  }

  guoPai(player: PlayerState, onDeposit?) {

    player.guo()
    player.sendMessage("game/guoCardReply", {ok: true, data: {onDeposit: player.onDeposit || !!onDeposit}})

    this.moveToNext()

    this.room.broadcast("game/otherGuo", {ok: true, data: {
        index: player.seatIndex,
        next: this.currentPlayerStep,
        pattern: this.status.lastPattern,
      }})

    const isGameOver = this.isGameOver()
    const nextPlayer = isGameOver ? -1 : this.currentPlayerStep

    if (this.players[nextPlayer]) {
      // console.warn("guoPai index %s _id %s onDeposit %s", this.players[nextPlayer].seatIndex, this.players[nextPlayer]._id, this.players[nextPlayer].onDeposit);
      this.autoCommitFunc(this.players[nextPlayer].onDeposit)
    }
  }

  atIndex(player: PlayerState) {
    return this.players.findIndex(p => p._id === player._id)
  }

  async gameOver() {

  }

  async roomGameOver(states, nextStarterIndex: string) {
    await this.room.gameOver(states, nextStarterIndex)
  }

  listenRoom(room) {
    room.on('reconnect', this.onReconnect = async (playerMsgDispatcher, index) => {
      let m = await RoomTimeRecord.findOne({ roomId: this.room._id });
      if (m) {
        const currentTime = new Date().getTime();
        const startTime = Date.parse(m.createAt);

        // console.warn("startTime %s currentTime %s", startTime, currentTime);

        if (currentTime - startTime > config.game.dissolveTime) {
          return await this.room.forceDissolve();
        }
      }

      const player = this.players[index]
      this.replaceSocketAndListen(player, playerMsgDispatcher)
      const content = await this.reconnectContent(index, player)
      player.sendMessage('game/reconnect', {ok: true, data: content})
    })

    room.once('empty', this.onRoomEmpty = () => {
      console.log('room empty');
    })
  }

  replaceSocketAndListen(player, playerMsgDispatcher) {
    player.reconnect(playerMsgDispatcher)
    this.listenPlayer(player)
  }

  async reconnectContent(index, reconnectPlayer: PlayerState): Promise<any> {
    const state = this.state
    const stateData = this.stateData
    const juIndex = this.room.game.juIndex

    const status = this.players.map(player => {
      return player === reconnectPlayer ? player.statusForSelf(this) : player.statusForOther(this)
    })

    return {
      index,
      state,
      juIndex,
      stateData,
      status
    }
  }

  setGameRecorder(recorder) {
    this.recorder = recorder
    for (const p of this.players) {
      p.setGameRecorder(recorder)
    }
  }

  removeAllPlayerListeners() {
    this.players.forEach(p => p.removeListenersByNames(this.listenerOn))
  }

  destroy() {
    clearTimeout(this.autoCommitTimer)
    this.removeRoomListener()
    this.removeAllPlayerListeners()
    this.players = [];
  }

  teamMateCards(player: PlayerState): Card[] {
    if (player.cards.length > 0) {
      return []
    }

    const teamMate = this.players[player.teamMate]
    if (teamMate) {
      return teamMate.cards
    }
    return []
  }

  // 第一次出牌
  promptWithFirstPlay(player: PlayerState) {
    // if (this.room.gameRule.isPublic) {
    //   const result = publicRoomFirstPlayCard(player.cards);
    //   if (result) {
    //     return result;
    //   }
    // }
    const anotherTeam = this.getAnotherTeam(player.team);
    const count = anotherTeam.filter(p => p.cards.length === 1).length;
    const excludePattern = [];
    const groups = groupBy(player.cards, (card: Card) => card.point)
      .filter(group => group.length >= 2);
    if (count > 0 && groups.length > 0) {
      // 对手只剩一张，且有非单张的牌，不出单张
      excludePattern.push(PatterNames.single);
    }
    return this.pattern.firstPlayCard(player.cards, excludePattern);
  }

  // 根据出牌模式出牌
  promptWithPattern(player: PlayerState) {
    let flag = true;
    // 跳过炸弹
    let skipBomb = false;
    const probability = this.getProbability();
    // 检查是不是队友,
    if (this.status.lastPattern.name !== PatterNames.bomb) {
      // 普通队友牌能吃必吃
      if (player.index === this.players[this.status.lastIndex].teamMate) {
        if (this.foundFriend) {
          // 已经显示队友，如果剩下的牌数跟出牌数一样，那就出
          if (this.players[this.status.lastIndex].cards.length <= 3) {
            // 不压
            flag = false;
          } else {
            flag = this.status.lastPattern.cards.length === player.cards.length;
          }
        } else {
          // 没显示队友，跳过炸弹压制
          flag = true;
          skipBomb = true;
        }
      } else {
        flag = true;
      }
    } else {
      if (player.index === this.players[this.status.lastIndex].teamMate) {
        // 同队友，不吃炸弹
        return []
      } else {
        // 不是同队友
        if (this.foundFriend) {
          // 显示队友，必出
          flag = true;
        } else {
          // 有50%概率吃
          if (!probability) {
            return [];
          }
        }
      }
    }
    const matcher = new BombMatcher();
    const bombPattern = {
      name: PatterNames.bomb,
      score: 0,
      cards: Array.from({ length: 4 }),
    };
    const bombCard = matcher.promptWithPattern( bombPattern as IPattern, player.cards);
    // 没有炸弹卡
    const noBomb = bombCard.length === 0;
    const cardList = this.pattern.findMatchedPatternByPattern(this.status.lastPattern, player.cards, flag);
    for (const cards of cardList) {
      const bombResult = matcher.verify(cards, this.room.currentLevelCard);
      if (bombResult && skipBomb) {
        // 跳过炸弹
        continue;
      }
      if (!noBomb) {
        // 有炸弹，普通牌不能带鬼牌
        const jokerCount = cards.filter(value => value.type === CardType.Joker).length;
        if (jokerCount > 0) {
          // 检查card是不是炸弹
          if (!bombResult) {
            // 不是炸弹不能带鬼牌
            continue;
          }
          if (jokerCount >= 4) {
            const point = {
              // 4炸1000分
              4: 1000,
              // 5炸 2000
              5: 2000,
              // 6炸 3000
              6: 3000,
            }
            if (point[jokerCount] > this.status.lastPattern.score && point[jokerCount] !== bombResult.score) {
              // 单独的王炸也能大
              continue;
            }
          }
        }
      }
      const isOk = this.pattern.isGreaterThanPattern(cards, this.status.lastPattern)
      if (isOk) {
        return cards;
      }
    }
    return [];
  }

  private async _fapai(payload) {
    if (this.room.currentLevelCard && this.room.currentLevelCard !== -1) {
      this.initCards();
    }
    this.shuffle();
    this.stateData = {};

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.cards = [...p.cards, ...this.takeQuarterCards(p, this.rule.test && payload.cards && payload.cards[i] ? payload.cards[i] : [])];
      // const prompts = new StraightDoublesMatcher().promptWithPattern({
      //   name: PatterNames.doubles + '3',
      //   score: 0,
      //   cards: Array.from({ length: 6 }),
      // }, p.cards, this.room.currentLevelCard);
      //
      // console.warn("index %s prompts %s", i, JSON.stringify(prompts));
    }
  }

  async getCardRecorder(player) {
    const cardRecorder = await GoodsProp.findOne({propType: shopPropType.jiPaiQi}).lean();
    if (!cardRecorder) {
      return {status: false, day: 0};
    }

    let isHave = false;
    let times = 0;

    const playerProp = await PlayerProp.findOne({playerId: player._id.toString(), propId: cardRecorder.propId});

    if (playerProp) {
      // 用户是否拥有该道具
      isHave = playerProp.times === -1 || playerProp.times >= new Date().getTime();
      // 道具有效期
      times = playerProp.times === -1 || playerProp.times >= new Date().getTime() ? playerProp.times : null;
    }

    return {status: !!(isHave && times), day: times}
  };

  private notifyTeamMateWhenTeamMateWin(player: PlayerState, daCards: Card[]) {
    const teamMate = this.players[player.teamMate]
    if (teamMate && teamMate.cards.length === 0) {
      teamMate.sendMessage('game/teamMateCards', {ok: true, data: {cards: player.cards, daCards}})
    }
  }

  private getProbability() {
    return Math.random() < 0.5;
  }

  // 查找对手
  getAnotherTeam(team) {
    return this.players.filter(p => p && p.team !== team)
  }

  async onSelectMode(player: PlayerState, multiple = 1) {

  }

  async onPayTribute(player: PlayerState, msg) {

  }

  async onReturnTribute(player: PlayerState, msg) {

  }
}

export default Table

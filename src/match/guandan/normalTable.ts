import {GameType} from "@fm/common/constants";
import {service} from "../../service/importService";
import Card, {CardType} from "./card";
import {groupBy, IPattern, PatterNames} from "./patterns/base";
import PlayerState from "./player_state";
import Table from "./table";
import Enums from "./enums";

function once(target, propertyKey: string, descriptor: PropertyDescriptor) {
  const originCall = descriptor.value
  const key = `__once_${propertyKey}`

  descriptor.value = function (...argv) {
    if (this[key]) {
      return
    } else {
      this[key] = true
      originCall.apply(this, argv)
    }
  }
}

export default class NormalTable extends Table {
  selectModeTimeout: NodeJS.Timeout

  private nextAction: () => void = null

  name() {
    return "guandan"
  }

  async start(payload) {
    this.faPaiPayload = payload;
    this.room.broadcast("game/openLevelCard", {ok: true, data: {currentLevelCard: this.room.currentLevelCard, homeTeamCard: this.room.homeTeamCard, awayTeamCard: this.room.awayTeamCard}})

    const faPaiFunc = async() => {
      if (this.rule.allowDouble) {
        await this.broadcastModeRequest();
      } else {
        await this.startFaPai(payload);
        this.nextAction = this.startTeamworkGame;
        this.next();
      }

      await this.room.robotManager.setCardReady(this.rule.allowDouble);
    }

    setTimeout(faPaiFunc, 1000);
  }

  async startFaPai(payload) {
    if (this.room.gameRule.isPublic && this.rule.shuffleType === 2) {
      // 金豆房发牌
      await this.publicRoomFapai();
    } else {
      await this.fapai(payload);
    }

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      // 判断是否使用记牌器
      const cardRecorderStatus = await this.getCardRecorder(p);
      p.onShuffle(0, this.restJushu, p.cards, i, this.room.game.juIndex, this.room.shuffleData.length > 0,
        cardRecorderStatus, {homeTeamCard: this.room.homeTeamCard, awayTeamCard: this.room.awayTeamCard, currentLevelCard: this.room.currentLevelCard});
    }

    const shuffleData = this.room.shuffleData.map(x => {
      const p = this.players.find(y => y.model._id === x);
      return p.index;
    })
    this.shuffleDelayTime = Date.now() + this.room.shuffleData.length * 5000;
    this.room.broadcast('game/shuffleData', {ok: true, data: {shuffleData}});
    this.status.current.seatIndex = -1;
    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    if (this.state === 'gameOver') return null
    // return Object.assign(superJSON, {test: 'test1'})
    return super.toJSON()
  }

  private async broadcastModeRequest() {
    this.tableState = 'selectMode';
    for (const player of this.players) {
      if (!player.isChooseMode) {
        // player.msgDispatcher.on('game/chooseMultiple', async ({double}) => {
        //   await this.onSelectMode(player, double);
        //   this.room.emit('selectMode', {});
        // })

        player.sendMessage('game/startChooseMultiple', {ok: true, data: {}})
        this.autoCommitFunc();
      }
    }
  }

  @once
  private next() {

    clearTimeout(this.selectModeTimeout)
    for (const p of this.players) {
      p.msgDispatcher.removeAllListeners('game/chooseMultiple')
    }

    this.tableState = '';
    this.room.emit('selectMode', {});
    this.nextAction();

    this.autoCommitFunc()
  }

  async onSelectMode(player: PlayerState, multiple = 1) {
    const index = this.players.findIndex(p => p._id.toString() === player._id.toString());
    player.multiple = multiple;
    player.isChooseMode = true;
    this.multiple += (multiple === 1 ? 0 : 1);
    player.record(`select-mode-${multiple}`, []);
    this.room.broadcast("game/chooseMultipleReply", {ok: true, data: {seatIndex: index, isMultiple: player.isChooseMode, double: player.multiple, gameMultiple: this.multiple}});
    // console.warn("index %s multiple %s isChooseMode %s", index, player.multiple, player.isChooseMode);
    const isOk = await this.canStartGame();
    if (isOk) {
      this.next()
    }
  }

  listenPlayer(player) {
    super.listenPlayer(player);
    this.listenerOn.push('game/chooseMultiple');

    player.msgDispatcher.on('game/chooseMultiple', async ({double}) => {
      await this.onSelectMode(player, double);
      this.room.emit('selectMode', {});
    })
  }

  async canStartGame(): Promise<boolean> {
    for (const player of this.players) {
      if (!player.isChooseMode) {
        return false;
      }
    }

    await this.startFaPai(this.faPaiPayload);
    this.nextAction = this.startTeamworkGame;

    return true
  }

  broadcastFirstDa() {
    this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}});
  }

  private beTeamMate(team: PlayerState[]) {
    team[0].teamMate = team[1].index;
    team[1].teamMate = team[0].index;
  }

  setTeamMate() {
    this.beTeamMate(this.homeTeamPlayers());
    this.beTeamMate(this.awayTeamPlayers());
  }

  startTeamworkGame() {
    const startFunc = async () => {
      this.setTeamMate();
      this.setFirstDa(0);
      this.mode = 'teamwork';
      this.broadcastFirstDa();
    }

    setTimeout(startFunc, 1500);
  }

  isGameOver(): boolean {
    return super.isGameOver();
  }

  bombScorer = (bomb: IPattern) => {
    if (this.room.gameRule.isPublic) {
      return this.rubyRoomBoomScorer(bomb);
    }
    if (!bomb) return 0;

    if (bomb.name !== PatterNames.bomb) return 0;
    let bombLen = bomb.cards.length;

    if (bomb.cards.every(c => c.type === CardType.Joker)) {
      const jokerBombScore = Math.pow(2, bombLen);
      if (this.rule.ro.maxJokerBomb > 16) {
        return Math.min(this.rule.ro.maxJokerBomb, jokerBombScore);
      }
      return 16;
    }

    if (bombLen < 5) return 0;

    if (this && this.rule.ro.maxBombLevel && bombLen > this.rule.ro.maxBombLevel) {
      bombLen = this.rule.ro.maxBombLevel;
    }
    if (bombLen > 13) {
      bombLen = 13;
    }

    return Math.pow(2, bombLen - 5);
  }

  // 金豆房炸弹计分
  rubyRoomBoomScorer(bomb: IPattern) {
    if (!bomb) return 0;

    if (bomb.name !== PatterNames.bomb) return 0;
    let bombLen = bomb.cards.length;

    if (bomb.cards.every(c => c.type === CardType.Joker)) {
      return Math.pow(2, bombLen);
    }

    if (bombLen < 5) return 0;
    return Math.pow(2, bombLen - 5);
  }

  async reconnectContent(index, reconnectPlayer: PlayerState) {
    const stateData = this.stateData
    const juIndex = this.room.game.juIndex
    const status = [];

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      status.push(p._id.toString() === reconnectPlayer._id.toString() ? {
          ...await p.statusForSelf(this),
          teamMateCards: this.teamMateCards(p)
        } : await p.statusForOther(this));
    }

    const soloPlayer = this.players[this.soloPlayerIndex]

    let redPocketsData = null
    let validPlayerRedPocket = null
    if (this.room.isHasRedPocket) {
      redPocketsData = this.room.redPockets;
      validPlayerRedPocket = this.room.vaildPlayerRedPocketArray;
    }

    return {
      mode: this.mode,
      friendCard: this.friendCard,
      soloPlayerIndex: this.soloPlayerIndex,
      soloPlayerName: soloPlayer && soloPlayer.model.nickname,
      currentPlayer: this.status.current.seatIndex,
      lastPattern: this.status.lastPattern,
      isGameRunning: this.state === 'gameOver',
      lastIndex: this.status.lastIndex,
      fen: this.status.fen,
      from: this.status.from,
      foundFriend: this.foundFriend,
      redPocketsData,
      validPlayerRedPocket,
      index,
      juIndex,
      stateData,
      status,
    }
  }

  @once
  showFriend() {
    if (this.mode === 'solo') return

    this.foundFriend = true

    this.players.forEach(ps => {
      ps.foundFriend = true
    })
    this.room.broadcast('game/showFriend', {ok: true, data: {
        homeTeam: this.homeTeamPlayers().map(p => p.index),
        awayTeam: this.awayTeamPlayers().map(p => p.index)
      }})
  }

  daPai(player: PlayerState, cards: Card[], pattern: IPattern, onDeposit?) {
    if (this.friendCard && player.index !== 0) {
      if (cards.find(c => Card.compare(c, this.friendCard) === 0)) {
        this.showFriend()
      }
    }

    return super.daPai(player, cards, pattern, onDeposit)
  }

  teamWorkGameOver() {
    const playersInWinOrder = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder);
    const teamOrder = playersInWinOrder.map(p => p.team);
    const winTeam = teamOrder[0];

    let score = 1;
    if (teamOrder[0] === teamOrder[1]) {
      score = 4;
    }

    if (teamOrder[0] === teamOrder[2]) {
      score = 2;
    }

    this.upgradeMultiple = score;

    this.winTeamPlayers = this.players.filter(p => p.team === winTeam);
    this.loseTeamPlayers = this.players.filter(p => p.team !== winTeam);

    console.warn("score %s winTeamPlayers %s loseTeamPlayers %s", score, JSON.stringify(this.winTeamPlayers.map(p => p.seatIndex)), JSON.stringify(this.loseTeamPlayers.map(p => p.seatIndex)));
  }

  async gameOver() {
    if (this.state === 'gameOver') {
      return
    }

    this.state = 'gameOver';

    if (this.mode === 'teamwork') {
      this.teamWorkGameOver();
    }

    // 计算金豆
    await this.recordRubyReward();
    const states = [];
    for (const p of this.players) {
      states.push({
        model: p.model,
        index: p.index,
        score: p.balance,
        winOrder: p.winOrder,
        detail: p.detailBalance,
        mode: p.mode,
        // 是否破产
        isBroke: p.isBroke,
        // mvp 次数
        mvpTimes: 0,
      })
    }
    const gameOverMsg = {
      states,
      // 金豆奖池
      rubyReward: 0,
      juShu: this.restJushu,
      isPublic: this.room.isPublic,
      juIndex: this.room.game.juIndex,
      gameType: GameType.guandan,
      mode: this.mode,
      homeTeam: this.homeTeamPlayers().map(p => p.index),
      awayTeam: this.awayTeamPlayers().map(p => p.index),
      creator: this.room.creator.model._id,
    }
    this.room.broadcast('game/gameOverReply', {ok: true, data: gameOverMsg})
    this.stateData.gameOver = gameOverMsg
    const firstPlayer = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder)[0]
    await this.roomGameOver(states, firstPlayer._id)
  }

  destroy() {
    super.destroy()
    this.state = 'gameOver';
  }

  // 记录金豆
  async recordRubyReward() {
    if (!this.room.isPublic) {
      return null;
    }
    // 金豆房记录奖励
    await this.getBigWinner();
  }
  async getBigWinner() {
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    let times = conf.base * conf.Ante;
    let winRuby = 0;
    let lostRuby = 0;
    let maxBalance = 0;
    let maxLostBalance = 0;
    const winnerList = [];
    const lostList = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p) {
        const base = this.winTeamPlayers.includes(p.seatIndex) ? 1 : -1;
        console.warn("index %s base %s times %s", p.seatIndex, base, times);
        // 基础倍率
        p.balance = base * times * this.multiple * this.upgradeMultiple;

        if (p.balance > 0) {
          const currency = await this.PlayerGoldCurrency(p._id);
          if (p.balance > currency) {
            console.warn("winner balance-%s currency-%s", p.balance, currency);
            p.balance = currency;
          }

          winnerList.push(p);
          winRuby += p.balance;
          maxBalance += p.balance;
        } else {
          const currency = await this.PlayerGoldCurrency(p._id);
          if (currency < -p.balance) {
            console.warn("loser balance-%s currency-%s", p.balance, currency);
            p.balance = -currency;
          }

          lostList.push(p);
          maxLostBalance += p.balance;
          lostRuby += p.balance;
        }
      }
    }

    if (winRuby > -lostRuby) {
      winRuby = -lostRuby;
    }

    if (-lostRuby > winRuby) {
      lostRuby = -winRuby;
    }

    if (isNaN(winRuby)) {
      winRuby = 0;
    }
    if (isNaN(lostRuby)) {
      lostRuby = 0;
    }

    console.log('win ruby', winRuby, 'lost ruby', lostRuby, 'maxBalance', maxBalance, 'maxLostBalance', maxLostBalance);

    if (winRuby > 0) {
      for (const p of winnerList) {
        const oldBalance = p.balance;
        p.balance = Math.floor(p.balance / maxBalance * winRuby);
        console.log('winner after balance %s oldBalance %s shortId %s', p.balance, oldBalance, p.model.shortId)
      }
    }

    if (lostRuby < 0) {
      for (const p of lostList) {
        const oldBalance = p.balance;
        p.balance = Math.floor(p.balance / maxLostBalance * lostRuby);
        console.log('lost after balance %s oldBalance %s shortId %s', p.balance, oldBalance, p.model.shortId)
      }
    }
  }

  // 根据币种类型获取币种余额
  async PlayerGoldCurrency(playerId) {
    const model = await service.playerService.getPlayerModel(playerId);

    if (this.rule.currency === Enums.goldCurrency) {
      return model.gold;
    }

    return model.tlGold;
  }

  getPlayerByShortId(shortId) {
    for (const p of this.players) {
      if (p && p.model.shortId === shortId) {
        return p;
      }
    }
    return null;
  }
};

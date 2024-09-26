import {GameType} from "@fm/common/constants";
import * as ms from "ms"
import {service} from "../../service/importService";
import Card, {CardType} from "./card"
import {groupBy, IPattern, PatterNames} from "./patterns/base"
import PlayerState from "./player_state"
import Table, {Team} from "./table"
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
    return "shuangq"
  }

  async start() {
    console.log('start game')
    if (this.room.gameRule.isPublic) {
      // 金豆房发牌
      await this.publicRoomFapai();
    } else {
      await this.fapai();
    }
    // await this.publicRoomFapai();
    if (!this.selectFriendCard(this.players[0].cards)) {
      const player0 = this.players[0]
      const player1 = this.players[1]

      const card0 = player0.cards.pop()
      const card1 = player1.cards.pop()

      player0.cards.push(card1)
      player1.cards.push(card0)
    }

    await this.fourJokersReward();

    this.players.forEach((p, i) => {
        p.onShuffle(0, this.restJushu, p.cards, i, this.room.game.juIndex, this.room.shuffleData.length > 0);
      });

    const shuffleData = this.room.shuffleData.map(x => {
      const p = this.players.find(y => y.model._id === x)
      return p.index
    })
    this.shuffleDelayTime = Date.now() + this.room.shuffleData.length * 5000
    this.room.broadcast('game/shuffleData', {ok: true, data: {shuffleData}})
    this.status.current.seatIndex = -1
    // console.log('fai pa seatIndex -1');
    // 金豆房扣除开局金豆
    if (this.room.gameRule.isPublic) {
      await this.room.payRubyForStart();
    }
    this.broadcastModeRequest();
    // 记录幸运星
    for (const p of this.players) {
      if (p.cards.filter(value => value.value === 8).length === 8) {
        // 有8个8
        if (this.rule.jokerCount === 0) {
          // 一级
          service.medal.updateLuckyMedal(p.model._id, p.model.shortId, 1, 0, GameType.zd).then();
        } else if (this.rule.jokerCount === 4) {
          // 4王
          if (p.cards.filter(value => value.type === CardType.Joker).length !== 4) {
            // 没有4王
            continue;
          }
          service.medal.updateLuckyMedal(p.model._id, p.model.shortId, 2, 4, GameType.zd).then();
        } else if (this.rule.jokerCount === 6) {
          // 6王
          if (p.cards.filter(value => value.type === CardType.Joker).length !== 6) {
            // 没有6王
            continue;
          }
          if (this.rule.ro.maxJokerBomb === 16) {
            // 最多 16分
            service.medal.updateLuckyMedal(p.model._id, p.model.shortId, 3, 6, GameType.zd).then();
          } else if (this.rule.ro.maxJokerBomb === 32) {
            // 最多 32分
            service.medal.updateLuckyMedal(p.model._id, p.model.shortId, 4, 6, GameType.zd).then();
          } else if (this.rule.ro.maxJokerBomb === 64) {
            // 最多 64分
            service.medal.updateLuckyMedal(p.model._id, p.model.shortId, 4, 6, GameType.zd).then();
          }
        }
      }
    }
    await this.room.robotManager.setCardReady();
  }

  resume(json) {
    super.resume(json)
  }

  toJSON() {
    if (this.state === 'gameOver') return null
    // return Object.assign(superJSON, {test: 'test1'})
    return super.toJSON()
  }

  private broadcastModeRequest() {
    this.tableState = 'selectMode';
    for (const player of this.players) {
      if (player.mode === 'unknown') {
        player.msgDispatcher.on('game/selectMode', async ({mode}) => {
          await this.onSelectMode(player, mode)
          this.room.emit('selectMode', {});
        })
        player.sendMessage('game/startSelectMode', {ok: true, data: {}})
      }
    }
    this.autoModeTimeFunc()
  }

  autoModeTimeFunc() {
    const extraDelayTime = Math.floor((this.shuffleDelayTime - Date.now()) / 1000)
    const delayTime = 30 + extraDelayTime
    this.selectModeTimeout = setTimeout(async () => {
      // 初始化机器人 model(所有人都在线的话，不会加 model)
      if (!this.room.robotManager) {
        // 房间解散了
        console.error('room dissolve')
        clearTimeout(this.selectModeTimeout);
        return;
      }
      if (this.players.some(p => p.mode === 'solo')) {
        this.nextAction = this.startSoloModeGame
      } else {
        this.nextAction = this.startTeamworkGame
      }
      this.tableState = '';
      this.next()
    }, ms(delayTime + 's'))
  }

  @once
  private next() {

    clearTimeout(this.selectModeTimeout)
    for (const p of this.players) {
      p.msgDispatcher.removeAllListeners('game/selectMode')
    }

    this.tableState = '';
    this.room.emit('selectMode', {});
    this.nextAction();

    this.autoCommitFunc()
  }

  async onSelectMode(player: PlayerState, mode: 'teamwork' | 'solo') {
    player.mode = mode
    player.record(`select-${mode}`, [])
    const isOk = await this.canStartGame();
    if (isOk) {
      this.next()
    }
  }

  listenPlayer(player) {
    super.listenPlayer(player)
    this.listenerOn.push('game/selectMode')

    player.msgDispatcher.on('game/selectMode', async ({mode}) => {
      await this.onSelectMode(player, mode)
      this.room.emit('selectMode', {});
    })
  }

  async canStartGame(): Promise<boolean> {
    for (const player of this.players) {
      if (player.mode === 'unknown') {
        return false
      }

      if (player.mode === 'solo') {
        this.nextAction = this.startSoloModeGame
        return true
      }
    }
    this.nextAction = this.startTeamworkGame
    return true
  }

  startSoloModeGame() {
    let startPlayerIndex = 0
    for (const [i, player] of this.players.entries()) {
      if (player.mode === 'solo') {
        startPlayerIndex = i
        this.soloPlayerIndex = i
        break;
      }
    }
    this.room.broadcast('game/gameMode', {ok: true, data: {
        mode: 'solo',
        soloPlayer: startPlayerIndex,
        soloPlayerName: this.players[startPlayerIndex].model.nickname
      }})
    this.setFirstDa(startPlayerIndex)
    this.players.forEach(p => p.team = Team.AwayTeam)
    this.players[startPlayerIndex].team = Team.HomeTeam
    this.mode = 'solo'

    this.broadcastFirstDa()
  }

  broadcastFirstDa() {
    this.room.broadcast('game/startDa', {ok: true, data: {index: this.currentPlayerStep}})
  }

  private beTeamMate(team: PlayerState[]) {
    team[0].teamMate = team[1].index
    team[1].teamMate = team[0].index
  }

  setTeamMate() {
    this.beTeamMate(this.homeTeamPlayers())
    this.beTeamMate(this.awayTeamPlayers())
  }

  startTeamworkGame() {
    const zhuang = this.players[0]
    this.friendCard = this.selectFriendCard(zhuang.cards)

    for (const p of this.players) {
      if (p.cards.find(c => Card.compare(this.friendCard, c) === 0)) {
        p.team = Team.HomeTeam
      } else {
        p.team = Team.AwayTeam
      }
    }
    this.setTeamMate()

    this.setFirstDa(0)
    this.mode = 'teamwork'
    this.room.broadcast('game/gameMode', {ok: true, data: {mode: 'teamwork', friendCard: this.friendCard}})
    this.broadcastFirstDa()
  }

  selectFriendCard(cards: Card[]): Card {
    const singleCarsGroup = groupBy(cards, card => card.type * 100 + card.point)
      .filter(grp => grp.length === 1)
      .sort((grp1, grp2) => grp2[0].point - grp1[0].point)

    if (singleCarsGroup.length === 1) {
      return singleCarsGroup[0][0]
    }

    return singleCarsGroup.filter(grp => grp[0].type !== CardType.Joker)[0][0];
  }

  isGameOver(): boolean {
    if (this.mode === 'solo') {
      return this.homeTeamPlayers().some(p => p.cards.length === 0) ||
        this.awayTeamPlayers().some(p => p.cards.length === 0)
    }
    return super.isGameOver()
  }

  private winFromTeam(winTeam: PlayerState[], loseTeam: PlayerState[], score: number) {
    for (const winner of winTeam) {
      for (const loser of loseTeam) {
        winner.winFrom(loser, score)
      }
    }
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

    if (bomb.cards.some(c => c.value === 2)) {
      bombLen += 1;
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
    if (!bomb) return 0

    if (bomb.name !== PatterNames.bomb) return 0
    let bombLen = bomb.cards.length

    if (bomb.cards.every(c => c.type === CardType.Joker)) {
      return Math.pow(2, bombLen)
      // if (this.rule.ro.maxJokerBomb > 16) {
      //   return Math.min(this.rule.ro.maxJokerBomb, jokerBombScore)
      // }
      // return 16
    }
    if (bomb.cards.some(c => c.value === 2)) {
      bombLen += 1
    }
    if (bombLen < 5) return 0
    // if (this && this.rule.ro.maxBombLevel && bombLen > this.rule.ro.maxBombLevel) {
    //   bombLen = this.rule.ro.maxBombLevel
    // }
    // if (bombLen > 13) {
    //   bombLen = 13;
    // }
    return Math.pow(2, bombLen - 5)
  }

  calcUnusedJoker() {
    for (const winner of this.players) {
      for (const loser of this.players) {
        winner.winFrom(loser, loser.unusedJokers, 'joker')
      }
    }
  }

  reconnectContent(index, reconnectPlayer: PlayerState) {
    const stateData = this.stateData
    const juIndex = this.room.game.juIndex

    const status = this.players.map(player => {
      return player === reconnectPlayer ? {
        ...player.statusForSelf(this),
        teamMateCards: this.teamMateCards(player)
      } : player.statusForOther(this)
    })

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
    const playersInWinOrder = this.players.slice().sort((p1, p2) => p1.winOrder - p2.winOrder)

    const teamOrder = playersInWinOrder.map(p => p.team)

    const winTeam = teamOrder[0]
    const firstWinTeamZhuaFen = this.players.filter(p => p.team === winTeam)
      .reduce((fen, p) => p.zhuaFen + fen, 0)

    let score;
    if (teamOrder[0] === teamOrder[1]) {
      score = 2
    } else {
      score = 1

      if (playersInWinOrder[1].zhuaFen > 100) {
        score = -1
      }

      if (teamOrder[0] === teamOrder[3]) {
        score = -1
        if (firstWinTeamZhuaFen >= 100) {
          score = 1
        }
      }

    }

    const winTeamPlayers = this.players.filter(p => p.team === winTeam)
    const loseTeamPlayers = this.players.filter(p => p.team !== winTeam)

    for (let i = 0; i < 2; i++) {
      const winner = winTeamPlayers[i]
      const loser = loseTeamPlayers[i]
      winner.winFrom(loser, score)
    }
  }

  isHomeTeamWin(): boolean {
    return this.homeTeamPlayers().some(p => p.cards.length === 0)
  }

  soloGameOver() {
    if (this.isHomeTeamWin()) {
      this.winFromTeam(this.homeTeamPlayers(), this.awayTeamPlayers(), 3)
    } else {
      this.winFromTeam(this.awayTeamPlayers(), this.homeTeamPlayers(), 3)
    }
  }

  private calcSoloGameBombScore() {
    if (this.isHomeTeamWin()) {

      for (const winner of this.homeTeamPlayers()) {
        const allBombScore = winner.bombScore(this.bombScorer)

        for (const loser of this.awayTeamPlayers()) {
          winner.winFrom(loser, allBombScore, 'bomb')
        }
      }
    } else {
      const loser = this.homeTeamPlayers()[0];
      for (const winner of this.awayTeamPlayers()) {
        let allBombScore = winner.bombScore(this.bombScorer)

        if (this.rule.allBombScore) {
          allBombScore += winner.unusedBombsScore(this.bombScorer)
        }

        winner.winFrom(loser, allBombScore * 3, 'bomb')
      }
    }
  }

  async gameOver() {
    if (this.state === 'gameOver') {
      return
    }

    this.state = 'gameOver'
    if (this.mode === 'teamwork') {
      this.calcUnusedJoker()
    } else if (this.rule.shaoJi) {
      this.calcUnusedJoker()
    }

    if (this.mode === 'teamwork') {
      this.calcExtraBomb()
      this.teamWorkGameOver()
    } else {
      this.calcSoloGameBombScore()
      this.soloGameOver()
    }
    // 计算金豆
    await this.recordRubyReward();
    const states = [];
    for (const p of this.players) {
      states.push({
        model: p.model,
        index: p.index,
        score: p.balance,
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
      ruleType: this.rule.ruleType,
      juIndex: this.room.game.juIndex,
      gameType: GameType.zd,
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
    this.state = 'gameOver'
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
    // 将分数 * 倍率
    const conf = await service.gameConfig.getPublicRoomCategoryByCategory(this.room.gameRule.categoryId);
    let times = 1;
    if (!conf) {
      // 配置失败
      console.error('invalid room level');
    } else {
      times = conf.base * conf.Ante;
    }
    let winRuby = 0;
    let lostRuby = 0;
    let maxBalance = 0;
    let maxLostBalance = 0;
    const winnerList = [];
    const lostList = [];
    for (let i = 0; i < this.players.length; i ++) {
      const p = this.players[i];
      if (p) {
        // 基础倍率
        p.balance -= p.detailBalance['base'];
        p.balance *= times;
        p.detailBalance['base'] *= times;
        p.balance += p.detailBalance['base'];
        p.detailBalance['joker'] *= times;
        p.detailBalance['bomb'] *= times;
        p.detailBalance['noLoss'] *= times;
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

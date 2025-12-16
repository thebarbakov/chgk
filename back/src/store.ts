import crypto from "crypto";
import {
  Answer,
  Game,
  GameBlock,
  GameSector,
  Id,
  Player,
  Question,
  QuestionBlock,
  QuestionKind,
  QuestionSeries,
  Score,
  Team,
  TeamPlayer,
} from "../Chgk";

export type SessionRole = "player" | "host" | "tv";

export type GameSession = {
  token: string;
  role: SessionRole;
  gameId: Id;
  teamId?: Id;
  displayName?: string;
  createdAt: number;
};

type Maybe<T> = T | undefined;

export class InMemoryStore {
  private seq = 1;
  questionBlocks: QuestionBlock[] = [];
  questionSeries: QuestionSeries[] = [];
  questions: Question[] = [];
  games: Game[] = [];
  gameBlocks: GameBlock[] = [];
  players: Player[] = [];
  teams: Team[] = [];
  teamPlayers: TeamPlayer[] = [];
  scores: Score[] = [];
  answers: Answer[] = [];
  gameSectors: GameSector[] = [];
  sessions: GameSession[] = [];
  teamLocks: { gameId: Id; teamId: Id; sessionToken: string; lockedAt: number }[] = [];
  blitzState: {
    [gameId: number]: {
      seriesId?: number;
      questionIndex: number;
      activeTeams: Set<Id>;
      eliminatedTeams: Set<Id>;
    };
  } = {};

  lockedTeams(gameId: Id): Id[] {
    return this.teamLocks.filter((l) => l.gameId === gameId).map((l) => l.teamId);
  }

  private nextId(): Id {
    return this.seq++;
  }

  private now(): Date {
    return new Date();
  }

  createBlock(title: string): QuestionBlock {
    const block = new QuestionBlock(title, this.nextId(), this.now());
    this.questionBlocks.push(block);
    return block;
  }

  updateBlock(id: Id, patch: Partial<QuestionBlock>): Maybe<QuestionBlock> {
    const block = this.questionBlocks.find((b) => b.id === id);
    if (!block) return undefined;
    Object.assign(block, patch);
    return block;
  }

  deleteBlock(id: Id): boolean {
    const before = this.questionBlocks.length;
    this.questionBlocks = this.questionBlocks.filter((b) => b.id !== id);
    this.questionSeries = this.questionSeries.filter((s) => s.blockId !== id);
    this.questions = this.questions.filter((q) => q.blockId !== id);
    this.gameBlocks = this.gameBlocks.filter((gb) => gb.blockId !== id);
    this.gameSectors = this.gameSectors.filter((s) => this.questions.some((q) => q.id === s.questionId));
    return this.questionBlocks.length !== before;
  }

  createSeries(input: {
    kind: QuestionKind;
    title?: string;
    blockId?: Id;
  }): QuestionSeries {
    const series = new QuestionSeries(input.kind, input.title, input.blockId, this.nextId(), this.now());
    this.questionSeries.push(series);
    return series;
  }

  updateSeries(id: Id, patch: Partial<QuestionSeries>): Maybe<QuestionSeries> {
    const series = this.questionSeries.find((s) => s.id === id);
    if (!series) return undefined;
    Object.assign(series, patch);
    return series;
  }

  deleteSeries(id: Id): boolean {
    const before = this.questionSeries.length;
    this.questionSeries = this.questionSeries.filter((s) => s.id !== id);
    this.questions = this.questions.filter((q) => q.seriesId !== id);
    return this.questionSeries.length !== before;
  }

  createQuestion(input: {
    blockId: Id;
    questionText: string;
    answerText: string;
    kind: QuestionKind;
    questionFullText?: string;
    explanationText?: string;
    mediaQuestionPath?: string;
    mediaExplPath?: string;
    authorName?: string;
    authorCity?: string;
    seriesId?: Id;
    seriesOrder?: number;
    isBlackBox?: boolean;
  }): Question {
    const question = new Question(
      input.blockId,
      input.questionText,
      input.answerText,
      input.kind,
      input.questionFullText,
      input.explanationText,
      input.mediaQuestionPath,
      input.mediaExplPath,
      input.authorName,
      input.authorCity,
      input.seriesId,
      input.seriesOrder,
      input.isBlackBox,
      this.nextId(),
      this.now()
    );
    this.questions.push(question);
    return question;
  }

  updateQuestion(id: Id, patch: Partial<Question>): Maybe<Question> {
    const question = this.questions.find((q) => q.id === id);
    if (!question) return undefined;
    Object.assign(question, patch);
    return question;
  }

  deleteQuestion(id: Id): boolean {
    const before = this.questions.length;
    this.questions = this.questions.filter((q) => q.id !== id);
    this.gameSectors = this.gameSectors.filter((s) => s.questionId !== id);
    return this.questions.length !== before;
  }

  createGame(input: {
    gameDate: Date;
    location: string;
    pinCode: string;
    usePhones?: boolean;
    hasViewers?: boolean;
    isActive?: boolean;
  }): Game {
    const game = new Game(
      input.gameDate,
      input.location,
      input.pinCode,
      input.usePhones ?? false,
      input.hasViewers ?? false,
      input.isActive ?? false,
      this.nextId(),
      this.now()
    );
    this.games.push(game);
    return game;
  }

  updateGame(id: Id, patch: Partial<Game>): Maybe<Game> {
    const game = this.games.find((g) => g.id === id);
    if (!game) return undefined;
    Object.assign(game, patch);
    return game;
  }

  deleteGame(id: Id): boolean {
    const before = this.games.length;
    this.games = this.games.filter((g) => g.id !== id);
    this.gameBlocks = this.gameBlocks.filter((gb) => gb.gameId !== id);
    this.gameSectors = this.gameSectors.filter((s) => s.gameId !== id);
    this.answers = this.answers.filter((a) => a.gameId !== id);
    this.scores = this.scores.filter((s) => s.gameId !== id);
    this.sessions = this.sessions.filter((s) => s.gameId !== id);
    this.teamLocks = this.teamLocks.filter((lock) => lock.gameId !== id);
    return this.games.length !== before;
  }

  linkGameBlock(gameId: Id, blockId: Id, blockOrder?: number): GameBlock {
    const gb = new GameBlock(gameId, blockId, blockOrder, this.nextId());
    this.gameBlocks.push(gb);
    return gb;
  }

  deleteGameBlock(id: Id): boolean {
    const before = this.gameBlocks.length;
    this.gameBlocks = this.gameBlocks.filter((gb) => gb.id !== id);
    return this.gameBlocks.length !== before;
  }

  createTeam(name: string): Team {
    const team = new Team(name, this.nextId(), this.now());
    this.teams.push(team);
    return team;
  }

  updateTeam(id: Id, patch: Partial<Team>): Maybe<Team> {
    const team = this.teams.find((t) => t.id === id);
    if (!team) return undefined;
    Object.assign(team, patch);
    return team;
  }

  deleteTeam(id: Id): boolean {
    const before = this.teams.length;
    this.teams = this.teams.filter((t) => t.id !== id);
    this.teamPlayers = this.teamPlayers.filter((tp) => tp.teamId !== id);
    this.scores = this.scores.filter((s) => s.teamId !== id);
    this.answers = this.answers.filter((a) => a.teamId !== id);
    this.teamLocks = this.teamLocks.filter((l) => l.teamId !== id);
    return this.teams.length !== before;
  }

  createPlayer(name: string): Player {
    const player = new Player(name, this.nextId(), this.now());
    this.players.push(player);
    return player;
  }

  updatePlayer(id: Id, patch: Partial<Player>): Maybe<Player> {
    const player = this.players.find((p) => p.id === id);
    if (!player) return undefined;
    Object.assign(player, patch);
    return player;
  }

  deletePlayer(id: Id): boolean {
    const before = this.players.length;
    this.players = this.players.filter((p) => p.id !== id);
    this.teamPlayers = this.teamPlayers.filter((tp) => tp.playerId !== id);
    return this.players.length !== before;
  }

  linkTeamPlayer(teamId: Id, playerId: Id): TeamPlayer {
    const tp = new TeamPlayer(teamId, playerId);
    this.teamPlayers.push(tp);
    return tp;
  }

  deleteTeamPlayer(teamId: Id, playerId: Id): boolean {
    const before = this.teamPlayers.length;
    this.teamPlayers = this.teamPlayers.filter((tp) => tp.teamId !== teamId || tp.playerId !== playerId);
    return this.teamPlayers.length !== before;
  }

  upsertScore(gameId: Id, teamId: Id, points: number, reason?: string): Score {
    const score = new Score(gameId, teamId, points, reason, this.nextId(), this.now());
    this.scores.push(score);
    return score;
  }

  upsertAnswer(input: {
    gameId: Id;
    teamId: Id;
    questionId: Id;
    answerText?: string;
    isCorrect?: boolean;
    points?: number;
  }): Answer {
    const existing = this.answers.find(
      (a) => a.gameId === input.gameId && a.teamId === input.teamId && a.questionId === input.questionId
    );
    if (existing) {
      Object.assign(existing, input, { answeredAt: this.now() });
      return existing;
    }
    const answer = new Answer(
      input.gameId,
      input.teamId,
      input.questionId,
      input.answerText,
      input.isCorrect,
      input.points,
      this.nextId(),
      this.now()
    );
    this.answers.push(answer);
    return answer;
  }

  generateSectors(gameId: Id, questionIds: Id[], shuffle = true): GameSector[] {
    let ids = questionIds.slice();
    if (shuffle) {
      ids = ids
        .map((id) => ({ id, rnd: Math.random() }))
        .sort((a, b) => a.rnd - b.rnd)
        .map((x) => x.id);
    }
    const sectors: GameSector[] = [];
    ids.forEach((qid, idx) => {
      const sector = new GameSector(gameId, qid, idx + 1, false, undefined, this.nextId());
      sectors.push(sector);
    });
    this.gameSectors = this.gameSectors.filter((s) => s.gameId !== gameId).concat(sectors);
    return sectors;
  }

  listQuestionsByBlocks(blockIds: Id[]): Question[] {
    return this.questions.filter((q) => blockIds.includes(q.blockId));
  }

  issueGameSession(role: SessionRole, gameId: Id, teamId?: Id, displayName?: string): GameSession {
    const session: GameSession = {
      token: crypto.randomUUID(),
      role,
      gameId,
      teamId,
      displayName,
      createdAt: Date.now(),
    };
    this.sessions.push(session);
    return session;
  }

  lockTeam(gameId: Id, teamId: Id, sessionToken: string): boolean {
    const already = this.teamLocks.find((l) => l.gameId === gameId && l.teamId === teamId);
    if (already) return false;
    this.teamLocks.push({ gameId, teamId, sessionToken, lockedAt: Date.now() });
    return true;
  }

  releaseTeam(gameId: Id, teamId: Id): void {
    this.teamLocks = this.teamLocks.filter((l) => !(l.gameId === gameId && l.teamId === teamId));
  }
}

// Domain objects mirroring the SQL schema in back/utils/db/gen_tables.sql.

export type Id = number;

export enum QuestionKind {
  Regular = "regular",
  Blitz = "blitz",
  SuperBlitz = "super_blitz",
}

export class Game {
  constructor(
    public gameDate: Date,
    public location: string,
    public pinCode: string,
    public usePhones: boolean = false,
    public hasViewers: boolean = false,
    public isActive: boolean = false,
    public id?: Id,
    public createdAt?: Date
  ) {}
}

export class QuestionBlock {
  constructor(public title: string, public id?: Id, public createdAt?: Date) {}
}

export class QuestionSeries {
  constructor(
    public kind: QuestionKind,
    public title?: string,
    public blockId?: Id,
    public id?: Id,
    public createdAt?: Date
  ) {}
}

export class Question {
  constructor(
    public blockId: Id,
    public questionText: string,
    public answerText: string,
    public kind: QuestionKind = QuestionKind.Regular,
    public questionFullText?: string,
    public explanationText?: string,
    public mediaQuestionPath?: string,
    public mediaExplPath?: string,
    public authorName?: string,
    public authorCity?: string,
    public seriesId?: Id,
    public seriesOrder?: number,
    public isBlackBox?: boolean,
    public id?: Id,
    public createdAt?: Date
  ) {}
}

export class GameBlock {
  constructor(
    public gameId: Id,
    public blockId: Id,
    public blockOrder?: number,
    public id?: Id
  ) {}
}

export class Player {
  constructor(public name: string, public id?: Id, public createdAt?: Date) {}
}

export class Team {
  constructor(public name: string, public id?: Id, public createdAt?: Date) {}
}

export class TeamPlayer {
  constructor(public teamId: Id, public playerId: Id) {}
}

export class Score {
  constructor(
    public gameId: Id,
    public teamId: Id,
    public points: number,
    public reason?: string,
    public id?: Id,
    public createdAt?: Date
  ) {}
}

export class Answer {
  constructor(
    public gameId: Id,
    public teamId: Id,
    public questionId: Id,
    public answerText?: string,
    public isCorrect?: boolean,
    public points?: number,
    public id?: Id,
    public answeredAt?: Date
  ) {}
}

export class GameSector {
  constructor(
    public gameId: Id,
    public questionId: Id,
    public sectorNumber: number,
    public isUsed: boolean = false,
    public usedAt?: Date,
    public id?: Id
  ) {}
}

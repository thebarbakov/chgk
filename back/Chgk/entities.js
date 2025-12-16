"use strict";
// Domain objects mirroring the SQL schema in back/utils/db/gen_tables.sql.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameSector = exports.Answer = exports.Score = exports.TeamPlayer = exports.Team = exports.Player = exports.GameBlock = exports.Question = exports.QuestionSeries = exports.QuestionBlock = exports.Game = exports.QuestionKind = void 0;
var QuestionKind;
(function (QuestionKind) {
    QuestionKind["Regular"] = "regular";
    QuestionKind["Blitz"] = "blitz";
    QuestionKind["SuperBlitz"] = "super_blitz";
})(QuestionKind || (exports.QuestionKind = QuestionKind = {}));
class Game {
    constructor(gameDate, location, pinCode, usePhones = false, hasViewers = false, isActive = false, id, createdAt) {
        this.gameDate = gameDate;
        this.location = location;
        this.pinCode = pinCode;
        this.usePhones = usePhones;
        this.hasViewers = hasViewers;
        this.isActive = isActive;
        this.id = id;
        this.createdAt = createdAt;
    }
}
exports.Game = Game;
class QuestionBlock {
    constructor(title, id, createdAt) {
        this.title = title;
        this.id = id;
        this.createdAt = createdAt;
    }
}
exports.QuestionBlock = QuestionBlock;
class QuestionSeries {
    constructor(kind, title, blockId, id, createdAt) {
        this.kind = kind;
        this.title = title;
        this.blockId = blockId;
        this.id = id;
        this.createdAt = createdAt;
    }
}
exports.QuestionSeries = QuestionSeries;
class Question {
    constructor(blockId, questionText, answerText, kind = QuestionKind.Regular, questionFullText, explanationText, mediaQuestionPath, mediaExplPath, authorName, authorCity, seriesId, seriesOrder, id, createdAt) {
        this.blockId = blockId;
        this.questionText = questionText;
        this.answerText = answerText;
        this.kind = kind;
        this.questionFullText = questionFullText;
        this.explanationText = explanationText;
        this.mediaQuestionPath = mediaQuestionPath;
        this.mediaExplPath = mediaExplPath;
        this.authorName = authorName;
        this.authorCity = authorCity;
        this.seriesId = seriesId;
        this.seriesOrder = seriesOrder;
        this.id = id;
        this.createdAt = createdAt;
    }
}
exports.Question = Question;
class GameBlock {
    constructor(gameId, blockId, blockOrder, id) {
        this.gameId = gameId;
        this.blockId = blockId;
        this.blockOrder = blockOrder;
        this.id = id;
    }
}
exports.GameBlock = GameBlock;
class Player {
    constructor(name, id, createdAt) {
        this.name = name;
        this.id = id;
        this.createdAt = createdAt;
    }
}
exports.Player = Player;
class Team {
    constructor(name, id, createdAt) {
        this.name = name;
        this.id = id;
        this.createdAt = createdAt;
    }
}
exports.Team = Team;
class TeamPlayer {
    constructor(teamId, playerId) {
        this.teamId = teamId;
        this.playerId = playerId;
    }
}
exports.TeamPlayer = TeamPlayer;
class Score {
    constructor(gameId, teamId, points, reason, id, createdAt) {
        this.gameId = gameId;
        this.teamId = teamId;
        this.points = points;
        this.reason = reason;
        this.id = id;
        this.createdAt = createdAt;
    }
}
exports.Score = Score;
class Answer {
    constructor(gameId, teamId, questionId, answerText, isCorrect, points, id, answeredAt) {
        this.gameId = gameId;
        this.teamId = teamId;
        this.questionId = questionId;
        this.answerText = answerText;
        this.isCorrect = isCorrect;
        this.points = points;
        this.id = id;
        this.answeredAt = answeredAt;
    }
}
exports.Answer = Answer;
class GameSector {
    constructor(gameId, questionId, sectorNumber, isUsed = false, usedAt, id) {
        this.gameId = gameId;
        this.questionId = questionId;
        this.sectorNumber = sectorNumber;
        this.isUsed = isUsed;
        this.usedAt = usedAt;
        this.id = id;
    }
}
exports.GameSector = GameSector;

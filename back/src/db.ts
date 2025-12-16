import { Pool, types } from "pg";
import { QuestionKind } from "../Chgk";
import { config } from "./config";

// Normalize Postgres numeric/int8 values to numbers so IDs/scores don't arrive as strings.
const parseNumeric = (val: string) => {
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
};
types.setTypeParser(20, parseNumeric); // int8
types.setTypeParser(1700, parseNumeric); // numeric

const pool = new Pool({
  connectionString: config.databaseUrl,
});

export type Row = Record<string, any>;

async function query<T = Row>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

async function one<T = Row>(sql: string, params: any[] = []): Promise<T | null> {
  const res = await pool.query(sql, params);
  return (res.rows[0] as T) ?? null;
}

// Question blocks
export const BlocksRepo = {
  list: () => query("SELECT id, title, created_at FROM question_blocks ORDER BY id"),
  create: (title: string) =>
    one("INSERT INTO question_blocks (title) VALUES ($1) RETURNING id, title, created_at", [title]),
  update: (id: number, title: string) =>
    one("UPDATE question_blocks SET title=$2 WHERE id=$1 RETURNING id, title, created_at", [id, title]),
  delete: (id: number) => one("DELETE FROM question_blocks WHERE id=$1 RETURNING id", [id]),
};

// Question series
export const SeriesRepo = {
  list: () =>
    query("SELECT id, kind, title, block_id AS \"blockId\", created_at AS \"createdAt\" FROM question_series ORDER BY id"),
  create: (kind: QuestionKind, title?: string, blockId?: number) =>
    one(
      "INSERT INTO question_series (kind, title, block_id) VALUES ($1,$2,$3) RETURNING id, kind, title, block_id AS \"blockId\", created_at AS \"createdAt\"",
      [kind, title ?? null, blockId ?? null]
    ),
  update: (id: number, data: Partial<{ kind: QuestionKind; title?: string; blockId?: number }>) =>
    one(
      "UPDATE question_series SET kind=COALESCE($2, kind), title=COALESCE($3,title), block_id=COALESCE($4, block_id) WHERE id=$1 RETURNING id, kind, title, block_id AS \"blockId\", created_at AS \"createdAt\"",
      [id, data.kind ?? null, data.title ?? null, data.blockId ?? null]
    ),
  delete: (id: number) => one("DELETE FROM question_series WHERE id=$1 RETURNING id", [id]),
};

// Questions
export const QuestionsRepo = {
  list: () =>
    query(
      `SELECT id, block_id AS "blockId", question_full_text AS "questionFullText", question_text AS "questionText",
              answer_text AS "answerText", explanation_text AS "explanationText", media_question_path AS "mediaQuestionPath",
              media_expl_path AS "mediaExplPath", author_name AS "authorName", author_city AS "authorCity",
              kind, series_id AS "seriesId", series_order AS "seriesOrder", is_black_box AS "isBlackBox", created_at AS "createdAt"
       FROM questions ORDER BY id`
    ),
  create: (data: any) =>
    one(
      `INSERT INTO questions (block_id, question_full_text, question_text, answer_text, explanation_text, media_question_path, media_expl_path, author_name, author_city, kind, series_id, series_order, is_black_box)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, block_id AS "blockId", question_full_text AS "questionFullText", question_text AS "questionText",
                 answer_text AS "answerText", explanation_text AS "explanationText", media_question_path AS "mediaQuestionPath",
                 media_expl_path AS "mediaExplPath", author_name AS "authorName", author_city AS "authorCity", kind,
                 series_id AS "seriesId", series_order AS "seriesOrder", is_black_box AS "isBlackBox", created_at AS "createdAt"`,
      [
        data.blockId,
        data.questionFullText ?? null,
        data.questionText,
        data.answerText,
        data.explanationText ?? null,
        data.mediaQuestionPath ?? null,
        data.mediaExplPath ?? null,
        data.authorName ?? null,
        data.authorCity ?? null,
        data.kind ?? QuestionKind.Regular,
        data.seriesId ?? null,
        data.seriesOrder ?? null,
        data.isBlackBox ?? false,
      ]
    ),
  findById: (id: number) =>
    one(
      `SELECT id, block_id AS "blockId", question_full_text AS "questionFullText", question_text AS "questionText",
              answer_text AS "answerText", explanation_text AS "explanationText", media_question_path AS "mediaQuestionPath",
              media_expl_path AS "mediaExplPath", author_name AS "authorName", author_city AS "authorCity", kind,
              series_id AS "seriesId", series_order AS "seriesOrder", is_black_box AS "isBlackBox", created_at AS "createdAt"
       FROM questions WHERE id=$1`,
      [id]
    ),
  update: (id: number, data: any) =>
    one(
      `UPDATE questions SET
         block_id = COALESCE($2, block_id),
         question_full_text = COALESCE($3, question_full_text),
         question_text = COALESCE($4, question_text),
         answer_text = COALESCE($5, answer_text),
         explanation_text = COALESCE($6, explanation_text),
         media_question_path = COALESCE($7, media_question_path),
         media_expl_path = COALESCE($8, media_expl_path),
         author_name = COALESCE($9, author_name),
         author_city = COALESCE($10, author_city),
         kind = COALESCE($11, kind),
         series_id = COALESCE($12, series_id),
         series_order = COALESCE($13, series_order),
         is_black_box = COALESCE($14, is_black_box)
       WHERE id=$1
       RETURNING id, block_id AS "blockId", question_full_text AS "questionFullText", question_text AS "questionText",
                 answer_text AS "answerText", explanation_text AS "explanationText", media_question_path AS "mediaQuestionPath",
                 media_expl_path AS "mediaExplPath", author_name AS "authorName", author_city AS "authorCity", kind,
                 series_id AS "seriesId", series_order AS "seriesOrder", is_black_box AS "isBlackBox", created_at AS "createdAt"`,
      [
        id,
        data.blockId ?? null,
        data.questionFullText ?? null,
        data.questionText ?? null,
        data.answerText ?? null,
        data.explanationText ?? null,
        data.mediaQuestionPath ?? null,
        data.mediaExplPath ?? null,
        data.authorName ?? null,
        data.authorCity ?? null,
        data.kind ?? null,
        data.seriesId ?? null,
        data.seriesOrder ?? null,
        data.isBlackBox ?? null,
      ]
    ),
  delete: (id: number) => one("DELETE FROM questions WHERE id=$1 RETURNING id", [id]),
  listByBlocks: (blockIds: number[]) =>
    query(
      `SELECT id, block_id AS "blockId", question_full_text AS "questionFullText", question_text AS "questionText",
              answer_text AS "answerText", explanation_text AS "explanationText", media_question_path AS "mediaQuestionPath",
              media_expl_path AS "mediaExplPath", author_name AS "authorName", author_city AS "authorCity",
              kind, series_id AS "seriesId", series_order AS "seriesOrder", is_black_box AS "isBlackBox", created_at AS "createdAt"
       FROM questions WHERE block_id = ANY($1::bigint[]) ORDER BY id`,
      [blockIds]
    ),
};

// Games
export const GamesRepo = {
  list: () =>
    query(
      `SELECT id, game_date AS "gameDate", location, pin_code AS "pinCode",
              use_phones AS "usePhones", has_viewers AS "hasViewers", is_active AS "isActive", created_at AS "createdAt"
       FROM games ORDER BY id`
    ),
  listActive: () =>
    query(
      `SELECT id, game_date AS "gameDate", location, pin_code AS "pinCode",
              use_phones AS "usePhones", has_viewers AS "hasViewers", is_active AS "isActive", created_at AS "createdAt"
       FROM games WHERE is_active = true ORDER BY game_date DESC`
    ),
  findById: (id: number) =>
    one(
      `SELECT id, game_date AS "gameDate", location, pin_code AS "pinCode",
              use_phones AS "usePhones", has_viewers AS "hasViewers", is_active AS "isActive", created_at AS "createdAt"
       FROM games WHERE id=$1`,
      [id]
    ),
  create: (data: any) =>
    one(
      `INSERT INTO games (game_date, location, pin_code, use_phones, has_viewers, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, game_date AS "gameDate", location, pin_code AS "pinCode",
                 use_phones AS "usePhones", has_viewers AS "hasViewers", is_active AS "isActive", created_at AS "createdAt"`,
      [data.gameDate, data.location, data.pinCode, data.usePhones ?? false, data.hasViewers ?? false, data.isActive ?? false]
    ),
  update: (id: number, data: any) =>
    one(
      `UPDATE games SET
         game_date = COALESCE($2, game_date),
         location = COALESCE($3, location),
         pin_code = COALESCE($4, pin_code),
         use_phones = COALESCE($5, use_phones),
         has_viewers = COALESCE($6, has_viewers),
         is_active = COALESCE($7, is_active)
       WHERE id=$1
       RETURNING id, game_date AS "gameDate", location, pin_code AS "pinCode",
                 use_phones AS "usePhones", has_viewers AS "hasViewers", is_active AS "isActive", created_at AS "createdAt"`,
      [id, data.gameDate ?? null, data.location ?? null, data.pinCode ?? null, data.usePhones ?? null, data.hasViewers ?? null, data.isActive ?? null]
    ),
  delete: (id: number) => one("DELETE FROM games WHERE id=$1 RETURNING id", [id]),
};

// Game blocks
export const GameBlocksRepo = {
  list: () => query(`SELECT id, game_id AS "gameId", block_id AS "blockId", block_order AS "blockOrder" FROM game_blocks`),
  create: (gameId: number, blockId: number, blockOrder?: number) =>
    one(
      `INSERT INTO game_blocks (game_id, block_id, block_order) VALUES ($1,$2,$3)
       RETURNING id, game_id AS "gameId", block_id AS "blockId", block_order AS "blockOrder"`,
      [gameId, blockId, blockOrder ?? null]
    ),
  delete: (id: number) => one("DELETE FROM game_blocks WHERE id=$1 RETURNING id", [id]),
};

// Teams
export const TeamsRepo = {
  list: () => query(`SELECT id, name, created_at AS "createdAt" FROM teams ORDER BY id`),
  create: (name: string) =>
    one(`INSERT INTO teams (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"`, [name]),
  update: (id: number, name: string) =>
    one(`UPDATE teams SET name=$2 WHERE id=$1 RETURNING id, name, created_at AS "createdAt"`, [id, name]),
  delete: (id: number) => one(`DELETE FROM teams WHERE id=$1 RETURNING id`, [id]),
};

// Players
export const PlayersRepo = {
  list: () => query(`SELECT id, name, created_at AS "createdAt" FROM players ORDER BY id`),
  create: (name: string) =>
    one(`INSERT INTO players (name) VALUES ($1) RETURNING id, name, created_at AS "createdAt"`, [name]),
  update: (id: number, name: string) =>
    one(`UPDATE players SET name=$2 WHERE id=$1 RETURNING id, name, created_at AS "createdAt"`, [id, name]),
  delete: (id: number) => one(`DELETE FROM players WHERE id=$1 RETURNING id`, [id]),
};

export const TeamPlayersRepo = {
  list: () => query(`SELECT team_id AS "teamId", player_id AS "playerId" FROM team_players`),
  create: (teamId: number, playerId: number) =>
    one(`INSERT INTO team_players (team_id, player_id) VALUES ($1,$2) RETURNING team_id AS "teamId", player_id AS "playerId"`, [
      teamId,
      playerId,
    ]),
  delete: (teamId: number, playerId: number) =>
    one(`DELETE FROM team_players WHERE team_id=$1 AND player_id=$2 RETURNING team_id AS "teamId", player_id AS "playerId"`, [
      teamId,
      playerId,
    ]),
};

// Game teams link
export const GameTeamsRepo = {
  list: () => query(`SELECT game_id AS "gameId", team_id AS "teamId" FROM game_teams`),
  listByGame: (gameId: number) =>
    query(`SELECT game_id AS "gameId", team_id AS "teamId" FROM game_teams WHERE game_id=$1 ORDER BY team_id`, [gameId]),
  link: (gameId: number, teamId: number) =>
    one(
      `INSERT INTO game_teams (game_id, team_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING
       RETURNING game_id AS "gameId", team_id AS "teamId"`,
      [gameId, teamId]
    ),
  unlink: (gameId: number, teamId: number) =>
    one(`DELETE FROM game_teams WHERE game_id=$1 AND team_id=$2 RETURNING game_id AS "gameId", team_id AS "teamId"`, [gameId, teamId]),
};

export const GameSectorsRepo = {
  listByGame: (gameId: number) =>
    query(`SELECT id, game_id AS "gameId", question_id AS "questionId", sector_number AS "sectorNumber", is_used AS "isUsed", used_at AS "usedAt"
           FROM game_sectors WHERE game_id=$1 ORDER BY sector_number`, [gameId]),
  replaceForGame: async (gameId: number, questionIds: number[]) => {
    await query(`DELETE FROM game_sectors WHERE game_id=$1`, [gameId]);
    const values: string[] = [];
    const params: any[] = [gameId];
    questionIds.forEach((qid, idx) => {
      params.push(qid, idx + 1);
      values.push(`($1, $${params.length - 1}, $${params.length}, FALSE, NULL)`);
    });
    if (values.length === 0) return [];
    const inserted = await query(
      `INSERT INTO game_sectors (game_id, question_id, sector_number, is_used, used_at)
       VALUES ${values.join(",")}
       RETURNING id, game_id AS "gameId", question_id AS "questionId", sector_number AS "sectorNumber", is_used AS "isUsed", used_at AS "usedAt"`,
      params
    );
    return inserted;
  },
  markUsed: (sectorId: number) =>
    one(
      `UPDATE game_sectors SET is_used=TRUE, used_at=NOW() WHERE id=$1 RETURNING id, game_id AS "gameId", question_id AS "questionId", sector_number AS "sectorNumber", is_used AS "isUsed", used_at AS "usedAt"`,
      [sectorId]
    ),
  pickNextUnused: async (gameId: number): Promise<Row | null> => {
    const rows = await query(
      `SELECT id, game_id AS "gameId", question_id AS "questionId", sector_number AS "sectorNumber", is_used AS "isUsed" FROM game_sectors WHERE game_id=$1 AND is_used=FALSE ORDER BY sector_number LIMIT 1`,
      [gameId]
    );
    return rows[0] ?? null;
  },
  pickByClockwise: async (gameId: number, _fromSector: number | null): Promise<Row | null> => {
    const rows = await query(
      `SELECT id, game_id AS "gameId", question_id AS "questionId", sector_number AS "sectorNumber", is_used AS "isUsed"
       FROM game_sectors
       WHERE game_id=$1 AND is_used=FALSE
       ORDER BY random()
       LIMIT 1`,
      [gameId]
    );
    return rows[0] ?? null;
  },
};

export const ScoresRepo = {
  listByGame: (gameId: number) =>
    query(`SELECT id, game_id AS "gameId", team_id AS "teamId", points, reason, created_at AS "createdAt" FROM scores WHERE game_id=$1`, [
      gameId,
    ]),
  add: (gameId: number, teamId: number, points: number, reason?: string) =>
    one(
      `INSERT INTO scores (game_id, team_id, points, reason) VALUES ($1,$2,$3,$4)
       RETURNING id, game_id AS "gameId", team_id AS "teamId", points, reason, created_at AS "createdAt"`,
      [gameId, teamId, points, reason ?? null]
    ),
  summary: (gameId: number) =>
    query(
      `SELECT team_id AS "teamId", COALESCE(SUM(points),0) AS score
       FROM scores WHERE game_id=$1 GROUP BY team_id ORDER BY score DESC`,
      [gameId]
    ),
};

export const AnswersRepo = {
  listByGame: (gameId: number) =>
    query(
      `SELECT id, game_id AS "gameId", team_id AS "teamId", question_id AS "questionId", answer_text AS "answerText", is_correct AS "isCorrect", points, answered_at AS "answeredAt"
       FROM answers WHERE game_id=$1`,
      [gameId]
    ),
  upsert: (gameId: number, teamId: number, questionId: number, answerText: string) =>
    one(
      `INSERT INTO answers (game_id, team_id, question_id, answer_text, is_correct)
       VALUES ($1,$2,$3,$4,NULL)
       ON CONFLICT (game_id, team_id, question_id)
       DO UPDATE SET answer_text = EXCLUDED.answer_text, answered_at = NOW()
       RETURNING id, game_id AS "gameId", team_id AS "teamId", question_id AS "questionId", answer_text AS "answerText", is_correct AS "isCorrect", points, answered_at AS "answeredAt"`,
      [gameId, teamId, questionId, answerText]
    ),
  markCorrect: (gameId: number, teamId: number, questionId: number, isCorrect: boolean, points: number | null) =>
    one(
      `UPDATE answers SET is_correct=$4, points=$5 WHERE game_id=$1 AND team_id=$2 AND question_id=$3
       RETURNING id, game_id AS "gameId", team_id AS "teamId", question_id AS "questionId", answer_text AS "answerText", is_correct AS "isCorrect", points, answered_at AS "answeredAt"`,
      [gameId, teamId, questionId, isCorrect, points]
    ),
};

export { pool, query, one };

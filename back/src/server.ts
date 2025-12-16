import http from "http";
import cors, { CorsOptions } from "cors";
import express, { NextFunction, Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { config } from "./config";
import { AdminSessionManager, requireAdmin } from "./adminAuth";
import { InMemoryStore } from "./store";
import { QuestionKind } from "../Chgk";
import {
  BlocksRepo,
  SeriesRepo,
  QuestionsRepo,
  GamesRepo,
  GameBlocksRepo,
  TeamsRepo,
  GameTeamsRepo,
  PlayersRepo,
  TeamPlayersRepo,
  GameSectorsRepo,
  ScoresRepo,
  AnswersRepo,
} from "./db";

const app = express();
app.set("trust proxy", 1);

type RateLimiter = (key: string) => boolean;

function createInMemoryLimiter(windowMs: number, max: number): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    current.count += 1;
    if (current.count > max) return true;
    buckets.set(key, current);
    return false;
  };
}

const limiters = {
  adminLogin: createInMemoryLimiter(10 * 60 * 1000, 10), // 10 attempts per 10 minutes per IP
  joinGame: createInMemoryLimiter(10 * 60 * 1000, 50), // 50 joins per 10 minutes per IP+game
  websocket: createInMemoryLimiter(10 * 60 * 1000, 60), // 60 WS connects per 10 minutes per IP
};

const rateLimit =
  (name: keyof typeof limiters, keySelector: (req: Request) => string, message = "too many requests") =>
  (req: Request, res: Response, next: NextFunction) => {
    const limited = limiters[name](keySelector(req));
    if (limited) return res.status(429).json({ error: message });
    return next();
  };

const corsOrigins = config.corsOrigins.length ? config.corsOrigins : ["http://localhost:3000"];
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = corsOrigins.includes(origin);
    if (allowed) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Serve media from project-level /media whether running from src or dist
const mediaDirCandidates = [
  path.join(__dirname, "..", "..", "uploads"), // when bundled to dist/src
  path.join(__dirname, "..", "uploads"), // when running ts-node from src
];
const mediaDir = mediaDirCandidates.find((p) => fs.existsSync(p)) ?? mediaDirCandidates[0];
app.use("/uploads", express.static(mediaDir));

const adminSessions = new AdminSessionManager();
const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.cookieSecure,
  maxAge: adminSessions.getTtlMs(),
  path: "/",
};
const store = new InMemoryStore();

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post(
  "/api/admin/login",
  rateLimit("adminLogin", (req) => req.ip || req.socket.remoteAddress || "unknown", "too many login attempts"),
  (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const { login, password } = parsed.data;
    if (login !== config.adminLogin || password !== config.adminPassword) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    const token = adminSessions.issue(login);
    res.cookie(config.adminCookieName, token, adminCookieOptions);
    return res.json({
      ok: true,
      expiresAt: Date.now() + adminSessions.getTtlMs(),
    });
  }
);

app.post("/api/admin/logout", (req, res) => {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const cookieToken =
    req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .map((c) => c.split("="))
      .reduce<Record<string, string>>((acc, [k, v]) => {
        if (k) acc[k] = decodeURIComponent(v || "");
        return acc;
      }, {})?.[config.adminCookieName] ?? undefined;
  const token = bearer || cookieToken;
  adminSessions.revoke(token);
  res.clearCookie(config.adminCookieName, { ...adminCookieOptions, maxAge: 0 });
  res.json({ ok: true });
});

// Admin-protected routes
const adminRouter = express.Router();
adminRouter.use(requireAdmin(adminSessions));

const allowedMediaFolders = ["intro", "questions", "answers", "sfx"] as const;
type MediaFolder = (typeof allowedMediaFolders)[number];
const allowedMimeByFolder: Record<MediaFolder, string[]> = {
  intro: ["video/"],
  questions: ["audio/", "video/", "image/"],
  answers: ["audio/", "video/", "image/"],
  sfx: ["audio/"],
};
const maxUploadSizeBytes = 20 * 1024 * 1024; // 20 MB

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    const folder =
      (req.body?.folder as MediaFolder | undefined) ||
      (req.query?.folder as MediaFolder | undefined) ||
      (file.fieldname === "file" && (file as any).targetFolder) ||
      "questions";
    const safeFolder = allowedMediaFolders.includes(folder) ? folder : "questions";
    const dest = path.join(__dirname, "..", "uploads", safeFolder);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxUploadSizeBytes },
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const folder = (req.body?.folder || req.query?.folder) as MediaFolder;
    const safeFolder = allowedMediaFolders.includes(folder) ? folder : "questions";
    const allowedPrefixes = allowedMimeByFolder[safeFolder];
    (file as any).targetFolder = safeFolder;
    const mimetype = file.mimetype || "";
    const allowed = allowedPrefixes.some((prefix) => mimetype.startsWith(prefix));
    if (!allowed) {
      (req as Request & { fileValidationError?: string }).fileValidationError = "unsupported file type";
      return cb(null, false);
    }
    cb(null, true);
  },
});

// Question blocks CRUD
const blockSchema = z.object({ title: z.string().min(1) });
adminRouter.get("/question-blocks", async (_req, res) => res.json(await BlocksRepo.list()));
adminRouter.post("/question-blocks", async (req, res) => {
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const block = await BlocksRepo.create(parsed.data.title);
  res.status(201).json(block);
});
adminRouter.patch("/question-blocks/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = blockSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = await BlocksRepo.update(id, parsed.data.title ?? "");
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});
adminRouter.delete("/question-blocks/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await BlocksRepo.delete(id);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Question series CRUD
const seriesSchema = z.object({
  kind: z.nativeEnum(QuestionKind),
  title: z.string().optional(),
  blockId: z.number().optional(),
});
adminRouter.get("/question-series", async (_req, res) => res.json(await SeriesRepo.list()));
adminRouter.post("/question-series", async (req, res) => {
  const parsed = seriesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const series = await SeriesRepo.create(parsed.data.kind, parsed.data.title, parsed.data.blockId);
  res.status(201).json(series);
});
adminRouter.patch("/question-series/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = seriesSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = await SeriesRepo.update(id, parsed.data);
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});
adminRouter.delete("/question-series/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await SeriesRepo.delete(id);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Questions CRUD
const questionSchema = z.object({
  blockId: z.number(),
  questionText: z.string(),
  answerText: z.string(),
  kind: z.nativeEnum(QuestionKind).default(QuestionKind.Regular),
  questionFullText: z.string().optional(),
  explanationText: z.string().optional(),
  mediaQuestionPath: z.string().optional(),
  mediaExplPath: z.string().optional(),
  authorName: z.string().optional(),
  authorCity: z.string().optional(),
  seriesId: z.number().optional(),
  seriesOrder: z.number().optional(),
  isBlackBox: z.boolean().optional(),
});
adminRouter.get("/questions", async (_req, res) => res.json(await QuestionsRepo.list()));
adminRouter.post("/questions", async (req, res) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const question = await QuestionsRepo.create(parsed.data);
  res.status(201).json(question);
});
adminRouter.patch("/questions/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = questionSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = await QuestionsRepo.update(id, parsed.data);
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});
adminRouter.delete("/questions/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await QuestionsRepo.delete(id);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Games CRUD
const gameSchema = z.object({
  gameDate: z.coerce.date(),
  location: z.string(),
  pinCode: z.string().min(3),
  usePhones: z.boolean().optional(),
  hasViewers: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
adminRouter.get("/games", async (_req, res) => res.json(await GamesRepo.list()));
adminRouter.post("/games", async (req, res) => {
  const parsed = gameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const game = await GamesRepo.create(parsed.data);
  res.status(201).json(game);
});
adminRouter.patch("/games/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = gameSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = await GamesRepo.update(id, parsed.data);
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});
adminRouter.delete("/games/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await GamesRepo.delete(id);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Game blocks link
const gameBlockSchema = z.object({
  blockId: z.number(),
  blockOrder: z.number().optional(),
});
adminRouter.post("/games/:id/blocks", async (req, res) => {
  const gameId = Number(req.params.id);
  const parsed = gameBlockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const gb = await GameBlocksRepo.create(gameId, parsed.data.blockId, parsed.data.blockOrder);
    res.status(201).json(gb);
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "block already linked to this game" });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "failed to link block" });
  }
});
adminRouter.delete("/games/:id/blocks/:gameBlockId", async (req, res) => {
  const gameBlockId = Number(req.params.gameBlockId);
  const deleted = await GameBlocksRepo.delete(gameBlockId);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});
adminRouter.get("/game-blocks", async (_req, res) => res.json(await GameBlocksRepo.list()));
adminRouter.get("/game-teams", async (_req, res) => res.json(await GameTeamsRepo.list()));

// Teams CRUD
const teamSchema = z.object({ name: z.string().min(1) });
adminRouter.get("/teams", async (_req, res) => res.json(await TeamsRepo.list()));
adminRouter.post("/teams", async (req, res) => {
  const parsed = teamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const team = await TeamsRepo.create(parsed.data.name);
  res.status(201).json(team);
});
adminRouter.patch("/teams/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = teamSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = parsed.data.name ? await TeamsRepo.update(id, parsed.data.name) : await TeamsRepo.list().then((t) => t.find((x) => x.id === id));
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});
adminRouter.delete("/teams/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await TeamsRepo.delete(id);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Game-team links
adminRouter.get("/games/:id/teams", async (req, res) => {
  const gameId = Number(req.params.id);
  const teams = await GameTeamsRepo.listByGame(gameId);
  res.json(teams);
});
adminRouter.post("/games/:id/teams", async (req, res) => {
  const gameId = Number(req.params.id);
  const parsed = z.object({ teamId: z.number() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const linked = await GameTeamsRepo.link(gameId, parsed.data.teamId);
  res.status(201).json(linked);
});
adminRouter.delete("/games/:id/teams/:teamId", async (req, res) => {
  const gameId = Number(req.params.id);
  const teamId = Number(req.params.teamId);
  const deleted = await GameTeamsRepo.unlink(gameId, teamId);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Players CRUD
const playerSchema = z.object({ name: z.string().min(1) });
adminRouter.get("/players", async (_req, res) => res.json(await PlayersRepo.list()));
adminRouter.post("/players", async (req, res) => {
  const parsed = playerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const player = await PlayersRepo.create(parsed.data.name);
  res.status(201).json(player);
});
adminRouter.patch("/players/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = playerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const updated = parsed.data.name ? await PlayersRepo.update(id, parsed.data.name) : await PlayersRepo.list().then((p) => p.find((x) => x.id === id));
  if (!updated) return res.status(404).json({ error: "not found" });
  res.json(updated);
});
adminRouter.delete("/players/:id", async (req, res) => {
  const id = Number(req.params.id);
  const deleted = await PlayersRepo.delete(id);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Team players
adminRouter.post("/teams/:id/players", async (req, res) => {
  const teamId = Number(req.params.id);
  const parsed = z.object({ playerId: z.number() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const tp = await TeamPlayersRepo.create(teamId, parsed.data.playerId);
  res.status(201).json(tp);
});
adminRouter.delete("/teams/:teamId/players/:playerId", async (req, res) => {
  const teamId = Number(req.params.teamId);
  const playerId = Number(req.params.playerId);
  const deleted = await TeamPlayersRepo.delete(teamId, playerId);
  if (!deleted) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});
adminRouter.get("/team-players", async (_req, res) => res.json(await TeamPlayersRepo.list()));

// Generate sectors
adminRouter.post("/games/:id/sectors/generate", (req, res) => {
  const gameId = Number(req.params.id);
  const parsed = z
    .object({
      shuffle: z.boolean().optional(),
      fromBlockIds: z.array(z.number()).optional(),
      includeSeries: z.boolean().optional(),
      useAllIfEmpty: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  (async () => {
  const blockIds =
    parsed.data.fromBlockIds ??
    (await GameBlocksRepo.list())
      .filter((gb) => Number(gb.gameId) === gameId)
      .map((gb) => Number(gb.blockId));
    if (!blockIds.length && !parsed.data.useAllIfEmpty) {
      return res.status(400).json({ error: "no blocks linked to game" });
    }
    const rawQuestions = blockIds.length ? await QuestionsRepo.listByBlocks(blockIds) : parsed.data.useAllIfEmpty ? await QuestionsRepo.list() : [];
    // Формируем сектора: одиночные вопросы + по одному конверту на каждую серию
    const regular = rawQuestions.filter((q: any) => !q.seriesId);
    const seriesPick = new Map<number, any>();
    rawQuestions
      .filter((q: any) => q.seriesId)
      .forEach((q: any) => {
        const sid = Number(q.seriesId);
        const order = q.seriesOrder ?? Number.MAX_SAFE_INTEGER;
        const current = seriesPick.get(sid);
        const currentOrder = current?.seriesOrder ?? Number.MAX_SAFE_INTEGER;
        if (!current || order < currentOrder || (order === currentOrder && Number(q.id) < Number(current.id))) {
          seriesPick.set(sid, q);
        }
      });
    const seriesOnly = Array.from(seriesPick.values());
    const questions = [...regular, ...seriesOnly];
    if (!questions.length) {
      return res.status(400).json({ error: "no questions found for selected blocks" });
    }
    const questionIds = questions.map((q: any) => Number(q.id));
    let ids = questionIds.slice();
    if (parsed.data.shuffle ?? true) {
      ids = ids
        .map((id) => ({ id, rnd: Math.random() }))
        .sort((a, b) => a.rnd - b.rnd)
        .map((x) => x.id);
    }
    const sectors = await GameSectorsRepo.replaceForGame(gameId, ids);
    res.json({ created: sectors.length, sectors });
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "failed to generate sectors" });
  });
});

adminRouter.get("/results", (req, res) => {
  const gameId = Number(req.query.gameId);
  if (!gameId) return res.status(400).json({ error: "gameId is required" });
  Promise.all([ScoresRepo.listByGame(gameId), AnswersRepo.listByGame(gameId), GameSectorsRepo.listByGame(gameId)])
    .then(([scores, answers, sectors]) => res.json({ scores, answers, sectors }))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      res.status(500).json({ error: "failed to load results" });
    });
});

adminRouter.post("/upload", (req: Request, res: Response) => {
  upload.single("file")(req, res, (err: any) => {
    const validationError = (req as Request & { fileValidationError?: string }).fileValidationError;
    if (err) return res.status(400).json({ error: err.message || "failed to upload" });
    if (validationError) return res.status(400).json({ error: validationError });
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) return res.status(400).json({ error: "no file" });
    const folder = (req.body?.folder || req.query?.folder) as MediaFolder;
    const safeFolder = allowedMediaFolders.includes(folder) ? folder : "questions";
    res.json({
      fileName: file.filename,
      folder: safeFolder,
      path: `uploads/${safeFolder}/${file.filename}`,
      size: file.size,
      originalName: file.originalname,
    });
  });
});

app.use("/api/admin", adminRouter);
// Support accidental extra /api prefix used by some clients.
app.use("/api/admin/api", adminRouter);

// Public endpoints
app.get("/api/games/active", async (_req, res) => {
  const games = await GamesRepo.listActive();
  res.json(games);
});

// Public read-only teams list (for selection/debug)
app.get("/api/teams", async (_req, res) => {
  const teams = await TeamsRepo.list();
  res.json(teams);
});

app.post(
  "/api/games/:id/join",
  rateLimit(
    "joinGame",
    (req) => `${req.ip || req.socket.remoteAddress || "unknown"}:${req.params.id || "game"}`,
    "too many join attempts"
  ),
  async (req, res) => {
  const gameId = Number(req.params.id);
  const parsed = z
    .object({
      pinCode: z.string(),
      displayName: z.string().optional(),
      teamId: z.number().optional(),
      role: z.enum(["player", "host", "tv"]).default("player"),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const game = await GamesRepo.findById(gameId);
  if (!game) return res.status(404).json({ error: "game not found" });
  if (game.pinCode !== parsed.data.pinCode) return res.status(401).json({ error: "invalid pin" });

  const { role, teamId, displayName } = parsed.data;
  if (teamId) {
    const allowedTeams = await GameTeamsRepo.listByGame(gameId);
    const teamExists =
      (allowedTeams.length > 0 ? allowedTeams.some((t) => t.teamId === teamId) : (await TeamsRepo.list()).some((t) => t.id === teamId));
    if (!teamExists) return res.status(404).json({ error: "team not found" });
  }
  if (role === "player" && teamId) {
    const locked = store.lockTeam(gameId, teamId, "");
    if (!locked) {
      return res.status(409).json({ error: "team already taken" });
    }
  }
  const session = store.issueGameSession(role, gameId, teamId, displayName);
  if (role === "player" && teamId) {
    store.releaseTeam(gameId, teamId);
    store.lockTeam(gameId, teamId, session.token);
    broadcast(gameId, { type: "team.locked", payload: { teamId } });
  }
  res.json(session);
  }
);

app.post("/api/games/:id/teams/:teamId/release", requireAdmin(adminSessions), (req, res) => {
  const gameId = Number(req.params.id);
  const teamId = Number(req.params.teamId);
  store.releaseTeam(gameId, teamId);
  broadcast(gameId, { type: "team.unlocked", payload: { teamId } });
  res.json({ ok: true });
});

app.get("/api/games/:id/teams/status", async (req, res) => {
  const gameId = Number(req.params.id);
  const linked = await GameTeamsRepo.listByGame(gameId);
  const allTeams = await TeamsRepo.list();
  type TeamRow = { id: number; name: string; createdAt?: any };
  const normalizedAll = allTeams
    .map((t) => ({ ...t, id: Number(t.id) }))
    .filter((t): t is TeamRow => Number.isFinite(t.id));

  const teams: TeamRow[] =
    linked.length > 0
      ? linked
          .map((l) => {
            const teamId = Number(l.teamId);
            return normalizedAll.find((t) => t.id === teamId) || null;
          })
          .filter((t): t is TeamRow => Boolean(t))
      : normalizedAll;
  const locks = store.teamLocks.filter((l) => l.gameId === gameId);
  const mapped = teams.map((t) => {
    const lock = locks.find((l) => Number(l.teamId) === Number(t.id));
    return { ...t, locked: Boolean(lock), lockedAt: lock?.lockedAt, sessionToken: lock?.sessionToken };
  });
  res.json(mapped);
});

app.get("/api/games/:id/sectors", async (req, res) => {
  const gameId = Number(req.params.id);
  const sectors = await GameSectorsRepo.listByGame(gameId);
  const questions = await QuestionsRepo.list();
  const payload = sectors.map((s) => ({
    ...s,
    question: questions.find((q) => q.id === s.questionId),
  }));
  res.json(payload);
});

const server = http.createServer(app);

type WSClient = {
  role: "tv" | "host" | "player" | "admin";
  gameId?: number;
  teamId?: number;
  displayName?: string;
  sessionToken?: string;
};

type GameRuntime = {
  gameId: number;
  currentSectorId?: number;
  currentQuestionId?: number;
  phase: "idle" | "spinning" | "question" | "discussion" | "review" | "finished";
  timer?: {
    endsAt: number;
    interval?: NodeJS.Timeout;
  };
  lastSectorNumber?: number;
  blackBoxMusicPlaying?: boolean;
  blitz?: {
    seriesId: number;
    questionIds: number[];
    index: number;
    activeTeams: Set<number>;
    eliminatedTeams: Set<number>;
    kind: QuestionKind;
  };
};

const clientMeta = new WeakMap<any, WSClient>();
const gameRuntimes = new Map<number, GameRuntime>();

function broadcast(gameId: number, data: any) {
  wss.clients.forEach((client: any) => {
    const meta = clientMeta.get(client);
    if (meta?.gameId === gameId && client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

function getRuntime(gameId: number): GameRuntime {
  const rt = gameRuntimes.get(gameId);
  if (rt) return rt;
  const created: GameRuntime = { gameId, phase: "idle", blackBoxMusicPlaying: false };
  gameRuntimes.set(gameId, created);
  return created;
}

function stopTimer(rt: GameRuntime) {
  if (rt.timer?.interval) clearInterval(rt.timer.interval);
  rt.timer = undefined;
}

function stopBlackBoxMusic(rt: GameRuntime, gameId: number) {
  if (!rt.blackBoxMusicPlaying) return;
  rt.blackBoxMusicPlaying = false;
  broadcast(gameId, { type: "blackbox.music", payload: { play: false } });
}

async function finishGame(gameId: number, reason?: string) {
  const scores = await ScoresRepo.summary(gameId);
  const max = Math.max(...scores.map((s) => Number(s.score)), 0);
  const winners = scores.filter((s) => Number(s.score) === max).map((s) => s.teamId);
  await GamesRepo.update(gameId, { isActive: false });
  broadcast(gameId, { type: "game.finished", payload: { scores, winners, reason } });
  const rt = getRuntime(gameId);
  rt.phase = "finished";
  stopTimer(rt);
  stopBlackBoxMusic(rt, gameId);
}

async function maybeCheckViewerWin(gameId: number) {
  const game = await GamesRepo.findById(gameId);
  if (!game?.hasViewers) return false;
  const scores = await ScoresRepo.summary(gameId);
  if (scores.length !== 1) return false;
  if (Number(scores[0].score) >= 6) {
    await finishGame(gameId, "win_points_reached");
    return true;
  }
  return false;
}

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (socket, req) => {
  const ip = req?.socket?.remoteAddress || "unknown";
  if (limiters.websocket(ip)) {
    socket.close(1013, "rate limited");
    return;
  }

  socket.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "session.connect") {
        const { role, gameId, pinCode, teamId, displayName } = msg.payload || {};
        const numericGameId = Number(gameId);
        if (!role || !numericGameId || !pinCode) {
          socket.send(JSON.stringify({ type: "error", error: "missing fields" }));
          return;
        }
        const game = await GamesRepo.findById(Number(numericGameId));
        if (!game || game.pinCode !== pinCode) {
          socket.send(JSON.stringify({ type: "error", error: "invalid pin" }));
          return;
        }
        const meta: WSClient = { role, gameId: numericGameId, displayName };
        if (role === "player") {
          const numericTeamId = Number(teamId);
          if (!Number.isFinite(numericTeamId) || numericTeamId <= 0) {
            socket.send(JSON.stringify({ type: "error", error: "team required" }));
            return;
          }
          const linkedTeams = await GameTeamsRepo.listByGame(numericGameId);
          const allTeams = await TeamsRepo.list();
          const teamExists =
            linkedTeams.length > 0
              ? linkedTeams.some((t) => Number(t.teamId) === numericTeamId)
              : allTeams.some((t) => Number(t.id) === numericTeamId);
          if (!teamExists) {
            socket.send(JSON.stringify({ type: "error", error: "team not found" }));
            return;
          }
          const sessionToken = crypto.randomUUID();
          const locked = store.lockTeam(numericGameId, numericTeamId, sessionToken);
          if (!locked) {
            socket.send(JSON.stringify({ type: "error", error: "team already taken" }));
            return;
          }
          meta.teamId = numericTeamId;
          meta.sessionToken = sessionToken;
        }
        clientMeta.set(socket, meta);
        if (role === "player" && meta.teamId) {
          broadcast(numericGameId, { type: "team.locked", payload: { teamId: meta.teamId } });
        }
        socket.send(JSON.stringify({ type: "state.sync", payload: { status: "connected", game } }));
        const scores = await ScoresRepo.summary(numericGameId);
        broadcast(numericGameId, { type: "score.updated", payload: scores });
        return;
      }

      const meta = clientMeta.get(socket);
      if (!meta?.gameId) {
        socket.send(JSON.stringify({ type: "error", error: "not connected" }));
        return;
      }
      const gameId = meta.gameId;
      const rt = getRuntime(gameId);

      if (msg.type === "host.spin" && meta.role === "host") {
        rt.phase = "spinning";
        broadcast(gameId, { type: "spin.started" });
        stopBlackBoxMusic(rt, gameId);
        setTimeout(async () => {
          const sector = await GameSectorsRepo.pickByClockwise(gameId, rt.lastSectorNumber ?? null);
          if (!sector) {
            await finishGame(gameId, "no sectors left");
            return;
          }
          const question = await QuestionsRepo.findById(sector.questionId);
          rt.currentSectorId = sector.id;
          rt.currentQuestionId = sector.questionId;
          rt.lastSectorNumber = sector.sectorNumber;
          // Если это блиц/суперблиц — собираем все вопросы этой серии
          if (question?.seriesId && (question.kind === QuestionKind.Blitz || question.kind === QuestionKind.SuperBlitz)) {
            // Используем поле question_series_id если пришло (для совместимости)
            const seriesQuestions = await QuestionsRepo.listByBlocks([question.blockId]);
            const inSeries = seriesQuestions
              .filter((q: any) => q.seriesId === question.seriesId)
              .sort((a: any, b: any) => (a.seriesOrder || 0) - (b.seriesOrder || 0))
              .map((q: any) => q.id);
            rt.blitz = {
              seriesId: question.seriesId,
              questionIds: inSeries,
              index: 0,
              activeTeams: new Set<number>(store.lockedTeams(gameId)),
              eliminatedTeams: new Set<number>(),
              kind: question.kind,
            };
          } else {
            rt.blitz = undefined;
          }
          rt.phase = "question";
          broadcast(gameId, {
            type: "spin.stopped",
            payload: {
              sector,
              question,
              activeTeams: rt.blitz ? Array.from(rt.blitz.activeTeams) : [],
              eliminatedTeams: rt.blitz ? Array.from(rt.blitz.eliminatedTeams) : [],
              blitzTotal: rt.blitz ? rt.blitz.questionIds.length : undefined,
            },
          });
        }, 6000);
        return;
      }

      if (msg.type === "host.reveal-question" && meta.role === "host") {
        if (!rt.currentQuestionId) return;
        const question = await QuestionsRepo.findById(rt.currentQuestionId);
        broadcast(gameId, { type: "question.revealed", payload: question });
        if (msg.payload?.showMedia && question?.mediaQuestionPath) {
          broadcast(gameId, { type: "media.play", payload: { path: question.mediaQuestionPath, kind: "question" } });
        }
        return;
      }

      if (msg.type === "host.play-media" && meta.role === "host") {
        const overridePath = msg.payload?.path as string | undefined;
        let pathToPlay: string | null = overridePath ?? null;
        let kind = (msg.payload?.kind as string | undefined) || "question";
        if (!pathToPlay && rt.currentQuestionId) {
          const question = await QuestionsRepo.findById(rt.currentQuestionId);
          pathToPlay = question?.mediaQuestionPath ?? null;
        }
        if (!pathToPlay) return;
        broadcast(gameId, { type: "media.play", payload: { path: pathToPlay, kind } });
        return;
      }

      if (msg.type === "host.hide-media" && meta.role === "host") {
        broadcast(gameId, { type: "media.stop" });
        return;
      }

      if (msg.type === "host.blackbox-music" && meta.role === "host") {
        const play = Boolean(msg.payload?.play);
        const path = (msg.payload?.path as string | undefined) || config.blackBoxMusicPath;
        rt.blackBoxMusicPlaying = play;
        broadcast(gameId, { type: "blackbox.music", payload: { play, path } });
        return;
      }

      if (msg.type === "host.reveal-answer" && meta.role === "host") {
        if (!rt.currentQuestionId) return;
        const question = await QuestionsRepo.findById(rt.currentQuestionId);
        broadcast(gameId, { type: "answer.revealed", payload: question });
        return;
      }

      if (msg.type === "host.hide-answer" && meta.role === "host") {
        broadcast(gameId, { type: "answer.hidden" });
        return;
      }

      if (msg.type === "host.award-score" && meta.role === "host") {
        const teamId = Number(msg.payload?.teamId);
        const points = Number(msg.payload?.points ?? 0);
        if (!teamId || !Number.isFinite(points) || points === 0) return;
        await ScoresRepo.add(gameId, teamId, points, "manual adjust");
        const scores = await ScoresRepo.summary(gameId);
        broadcast(gameId, { type: "score.updated", payload: scores });
        return;
      }

      if (msg.type === "host.start-timer" && meta.role === "host") {
        const duration = Number(msg.payload?.durationSeconds ?? 60);
        stopTimer(rt);
        const endsAt = Date.now() + duration * 1000;
        broadcast(gameId, { type: "sfx", payload: { sound: "gong_start" } });
        rt.timer = {
          endsAt,
          interval: setInterval(() => {
            const remaining = Math.max(0, rt.timer!.endsAt - Date.now());
            broadcast(gameId, { type: "timer.ticked", payload: { remaining } });
            if (remaining <= 0) {
              stopTimer(rt);
              broadcast(gameId, { type: "sfx", payload: { sound: "gong_end" } });
              broadcast(gameId, { type: "timer.finished" });
            }
          }, 1000),
        };
        if (duration > 10) {
          setTimeout(() => {
            broadcast(gameId, { type: "sfx", payload: { sound: "beep_10s" } });
          }, (duration - 10) * 1000);
        }
        broadcast(gameId, { type: "timer.started", payload: { duration, endsAt } });
        return;
      }

      if (msg.type === "host.stop-timer" && meta.role === "host") {
        stopTimer(rt);
        broadcast(gameId, { type: "timer.finished" });
        return;
      }

      if (msg.type === "player.answer" && meta.role === "player") {
        if (!rt.currentQuestionId || !meta.teamId) return;
        if (rt.timer && Date.now() > rt.timer.endsAt) {
          socket.send(JSON.stringify({ type: "error", error: "timer finished" }));
          return;
        }
        const answerText = msg.payload?.answerText ?? "";
        const ans = await AnswersRepo.upsert(gameId, meta.teamId, rt.currentQuestionId, answerText);
        broadcast(gameId, { type: "answer.submitted", payload: { teamId: meta.teamId, answerText: ans?.answerText } });
        return;
      }

      if (msg.type === "host.resolve-answer" && meta.role === "host") {
        const correctTeams: number[] = msg.payload?.correctTeams ?? [];
        if (!rt.currentQuestionId) return;
        const question = await QuestionsRepo.findById(rt.currentQuestionId);
        stopBlackBoxMusic(rt, gameId);
        const kind = question?.kind ?? QuestionKind.Regular;

        if (kind === QuestionKind.Regular) {
          await Promise.all(
            correctTeams.map((teamId: number) => ScoresRepo.add(gameId, teamId, 1, "correct answer"))
          );
        }

        if (rt.blitz && (kind === QuestionKind.Blitz || kind === QuestionKind.SuperBlitz)) {
          const active = rt.blitz.activeTeams.size ? rt.blitz.activeTeams : new Set(correctTeams.concat());
          if (active.size === 0) {
            correctTeams.forEach((id) => active.add(id));
          }
          const nextIndex = rt.blitz.index + 1;
          const successTeams = new Set<number>();
          correctTeams.forEach((t) => successTeams.add(t));
          // Выбиваем неправильные
          const surviving = new Set<number>();
          active.forEach((t) => {
            if (successTeams.has(t)) surviving.add(t);
            else rt.blitz!.eliminatedTeams.add(t);
          });
          rt.blitz.activeTeams = surviving;

          if (nextIndex >= rt.blitz.questionIds.length) {
            // серия завершена
            if (surviving.size > 0) {
              await Promise.all(Array.from(surviving).map((teamId) => ScoresRepo.add(gameId, teamId, 1, `${kind} full correct`)));
            }
            // очищаем зачёркнутых/активных
            broadcast(gameId, { type: "blitz.reset" });
            rt.blitz = undefined;
            if (rt.currentSectorId) await GameSectorsRepo.markUsed(rt.currentSectorId);
            const scores = await ScoresRepo.summary(gameId);
            broadcast(gameId, { type: "score.updated", payload: scores });
            broadcast(gameId, { type: "question.closed", payload: { sectorId: rt.currentSectorId, questionId: rt.currentQuestionId } });
            rt.currentQuestionId = undefined;
            rt.currentSectorId = undefined;
            stopTimer(rt);
            await maybeCheckViewerWin(gameId);
            return;
          } else {
            rt.blitz.index = nextIndex;
            rt.currentQuestionId = rt.blitz.questionIds[nextIndex];
            const nextQuestion = await QuestionsRepo.findById(rt.currentQuestionId);
            broadcast(gameId, {
              type: "blitz.next",
              payload: {
                question: nextQuestion,
                index: nextIndex,
                activeTeams: Array.from(rt.blitz.activeTeams),
                eliminatedTeams: Array.from(rt.blitz.eliminatedTeams),
                blitzTotal: rt.blitz.questionIds.length,
              },
            });
            stopTimer(rt);
            return;
          }
        }

        if (rt.currentSectorId) {
          await GameSectorsRepo.markUsed(rt.currentSectorId);
        }
        await Promise.all(
          correctTeams.map((teamId: number) => AnswersRepo.markCorrect(gameId, teamId, rt.currentQuestionId!, true, kind === QuestionKind.Regular ? 1 : null))
        );
        const scores = await ScoresRepo.summary(gameId);
        broadcast(gameId, { type: "score.updated", payload: scores });
        broadcast(gameId, { type: "question.closed", payload: { sectorId: rt.currentSectorId, questionId: rt.currentQuestionId } });
        rt.currentQuestionId = undefined;
        rt.currentSectorId = undefined;
        stopTimer(rt);
        await maybeCheckViewerWin(gameId);
        return;
      }

      if (msg.type === "host.finish-game" && meta.role === "host") {
        await finishGame(gameId, "manual");
        return;
      }

      if (msg.type === "host.show-rules" && meta.role === "host") {
        stopBlackBoxMusic(rt, gameId);
        broadcast(gameId, { type: "screen.rules" });
        return;
      }
      if (msg.type === "host.show-info" && meta.role === "host") {
        stopBlackBoxMusic(rt, gameId);
        broadcast(gameId, { type: "screen.info" });
        return;
      }
      if (msg.type === "host.show-field" && meta.role === "host") {
        stopBlackBoxMusic(rt, gameId);
        broadcast(gameId, { type: "screen.field" });
        return;
      }
      if (msg.type === "host.start-intro" && meta.role === "host") {
        stopBlackBoxMusic(rt, gameId);
        broadcast(gameId, { type: "media.play", payload: { path: "media/intro/intro_main.mp4", kind: "intro" } });
        return;
      }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    socket.send(JSON.stringify({ type: "error", error: "bad payload" }));
  }
  });

  socket.on("close", () => {
    const meta = clientMeta.get(socket as any);
    if (meta?.role === "player" && meta.gameId && meta.teamId) {
      const wasLocked = store.lockedTeams(meta.gameId).includes(meta.teamId);
      store.releaseTeam(meta.gameId, meta.teamId);
      if (wasLocked) {
        broadcast(meta.gameId, { type: "team.unlocked", payload: { teamId: meta.teamId } });
      }
    }
    clientMeta.delete(socket as any);
  });
});

const port = config.port;
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`CHGK server listening on http://localhost:${port}`);
});

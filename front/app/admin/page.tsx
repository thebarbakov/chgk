"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminApi, ApiError } from "../lib/api";
import { BackLink, Field, Panel, PrimaryButton } from "../components/ui";

type Id = number;

type QuestionBlock = { id: Id; title: string };
type Question = {
  id: Id;
  blockId: Id;
  questionText: string;
  answerText: string;
  kind: "regular" | "blitz" | "super_blitz";
  seriesId?: Id;
  mediaQuestionPath?: string;
  mediaExplPath?: string;
  questionFullText?: string;
  explanationText?: string;
  authorName?: string;
  authorCity?: string;
  seriesOrder?: number;
  isBlackBox?: boolean;
};
type QuestionSeries = { id: Id; blockId?: Id; title?: string; kind: "blitz" | "super_blitz" };
type Game = {
  id: Id;
  gameDate: string;
  location: string;
  pinCode: string;
  usePhones?: boolean;
  hasViewers?: boolean;
  isActive?: boolean;
};
type GameBlock = { id: Id; gameId: Id; blockId: Id; blockOrder?: number };
type GameTeam = { gameId: Id; teamId: Id };
type Team = { id: Id; name: string };
type Player = { id: Id; name: string };
type TeamPlayer = { teamId: Id; playerId: Id };
type ResultPayload = {
  scores: { id: Id; teamId: Id; points: number; reason?: string }[];
  answers: { id: Id; teamId: Id; questionId: Id; answerText?: string; isCorrect?: boolean }[];
  sectors: { id: Id; sectorNumber: number; isUsed: boolean }[];
};
type MediaFolder = "intro" | "questions" | "answers" | "sfx";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [loginForm, setLoginForm] = useState({ login: "", password: "" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [gameBlocks, setGameBlocks] = useState<GameBlock[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [gameTeams, setGameTeams] = useState<GameTeam[]>([]);
  const [series, setSeries] = useState<QuestionSeries[]>([]);
  const [results, setResults] = useState<ResultPayload | null>(null);
  const [resultsGameId, setResultsGameId] = useState<Id | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"blocks" | "questions" | "series" | "games" | "teams" | "results">("blocks");
  const adminApi = useMemo(
    () =>
      new AdminApi({
        onUnauthorized: () => {
          setAuthed(false);
          setLoginError((prev) => (authed ? "Сессия истекла, войдите снова" : prev));
        },
      }),
    [authed]
  );
  const stats = useMemo(
    () => [
      { label: "Блоки", value: blocks.length },
      { label: "Вопросы", value: questions.length },
      { label: "Игры", value: games.length },
      { label: "Команды", value: teams.length },
    ],
    [blocks.length, games.length, questions.length, teams.length]
  );

  const loadAll = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const [blocksRes, questionsRes, gamesRes, teamsRes, playersRes, gameBlocksRes, teamPlayersRes, seriesRes, gameTeamsRes] =
        await Promise.all([
          adminApi.request<QuestionBlock[]>("/question-blocks"),
          adminApi.request<Question[]>("/questions"),
          adminApi.request<Game[]>("/games"),
          adminApi.request<Team[]>("/teams"),
          adminApi.request<Player[]>("/players"),
          adminApi.request<GameBlock[]>("/game-blocks"),
          adminApi.request<TeamPlayer[]>("/team-players"),
          adminApi.request<QuestionSeries[]>("/question-series"),
          adminApi.request<GameTeam[]>("/game-teams"),
        ]);
      setBlocks(blocksRes);
      setQuestions(questionsRes);
      setGames(gamesRes);
      setTeams(teamsRes);
      setPlayers(playersRes);
      setGameBlocks(gameBlocksRes);
      setTeamPlayers(teamPlayersRes);
      setSeries(seriesRes);
      setGameTeams(gameTeamsRes);
      setMessage("Данные обновлены");
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 401) {
        setLoginError("Сессия истекла, авторизуйтесь снова");
      } else {
        setLoginError(err?.message || "Ошибка загрузки");
      }
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 2500);
    }
  }, [adminApi, authed]);

  useEffect(() => {
    loadAll();
  }, [authed, loadAll]);

  useEffect(() => {
    if (authed) return;
    adminApi
      .request<QuestionBlock[]>("/question-blocks")
      .then((data) => {
        setAuthed(true);
        setBlocks(data);
      })
      .catch(() => {});
  }, [adminApi, authed]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      await adminApi.login(loginForm);
      setAuthed(true);
      setMessage("Авторизация успешна");
    } catch (err: any) {
      setLoginError(err?.message || "Ошибка входа");
    }
  };

  const logout = () => {
    adminApi.logout().catch(() => {});
    setAuthed(false);
    setResults(null);
  };

  const uploadMedia = useCallback(
    async (file: File, folder: MediaFolder) => {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", folder);
      const res = await adminApi.request<{ path: string }>(`/upload?folder=${folder}`, {
        method: "POST",
        body: form,
      });
      return res.path;
    },
    [adminApi]
  );

  const blockNameById = useMemo(() => {
    const map = new Map<Id, string>();
    blocks.forEach((b) => map.set(b.id, b.title));
    return map;
  }, [blocks]);

  const handleCreateBlock = async (title: string) => {
    const created = await adminApi.request<QuestionBlock>("/question-blocks", {
      method: "POST",
      json: { title },
    });
    setBlocks((prev) => [...prev, created]);
  };

  const handleDeleteBlock = async (id: Id) => {
    await adminApi.request(`/question-blocks/${id}`, { method: "DELETE" });
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleRenameBlock = async (id: Id) => {
    const current = blocks.find((b) => b.id === id);
    const next = window.prompt("Новое название блока", current?.title ?? "");
    if (!next) return;
    const updated = await adminApi.request<QuestionBlock>(`/question-blocks/${id}`, {
      method: "PATCH",
      json: { title: next },
    });
    setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
  };

  const handleCreateQuestion = async (payload: Partial<Question> & { blockId: Id }) => {
    const blockId = Number(payload.blockId);
    if (Number.isNaN(blockId)) throw new Error("Укажите блок (blockId)");
    const created = await adminApi.request<Question>("/questions", {
      method: "POST",
      json: {
        blockId,
        questionText: payload.questionText,
        questionFullText: payload.questionFullText,
        answerText: payload.answerText,
        explanationText: payload.explanationText,
        authorName: payload.authorName,
        authorCity: payload.authorCity,
        kind: payload.kind ?? "regular",
        seriesId: payload.seriesId !== undefined ? Number(payload.seriesId) : undefined,
        seriesOrder: payload.seriesOrder !== undefined ? Number(payload.seriesOrder) : undefined,
        mediaQuestionPath: payload.mediaQuestionPath,
        mediaExplPath: payload.mediaExplPath,
        isBlackBox: payload.isBlackBox ?? false,
      },
    });
    setQuestions((prev) => [...prev, created]);
  };

  const handleUpdateQuestion = async (id: Id, payload: Partial<Question>) => {
    const body = {
      ...payload,
      blockId: payload.blockId !== undefined ? Number(payload.blockId) : undefined,
      seriesId: payload.seriesId !== undefined ? Number(payload.seriesId) : undefined,
      seriesOrder: payload.seriesOrder !== undefined ? Number(payload.seriesOrder) : undefined,
    };
    const updated = await adminApi.request<Question>(`/questions/${id}`, {
      method: "PATCH",
      json: body,
    });
    setQuestions((prev) => prev.map((q) => (q.id === id ? updated : q)));
  };

  const handleDeleteQuestion = async (id: Id) => {
    await adminApi.request(`/questions/${id}`, { method: "DELETE" });
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleCreateGame = async (payload: Partial<Game>) => {
    const created = await adminApi.request<Game>("/games", {
      method: "POST",
      json: {
        gameDate: payload.gameDate,
        location: payload.location,
        pinCode: payload.pinCode,
        usePhones: payload.usePhones ?? false,
        hasViewers: payload.hasViewers ?? false,
        isActive: payload.isActive ?? false,
      },
    });
    setGames((prev) => [...prev, created]);
  };

  const handleDeleteGame = async (id: Id) => {
    await adminApi.request(`/games/${id}`, { method: "DELETE" });
    setGames((prev) => prev.filter((g) => g.id !== id));
  };

  const handleToggleGameActive = async (id: Id, isActive: boolean) => {
    const updated = await adminApi.request<Game>(`/games/${id}`, {
      method: "PATCH",
      json: { isActive },
    });
    setGames((prev) => prev.map((g) => (g.id === id ? updated : g)));
  };

  const handleLinkBlock = async (gameId: Id, blockId: Id, blockOrder?: number) => {
    const gb = await adminApi.request<GameBlock>(`/games/${gameId}/blocks`, {
      method: "POST",
      json: { blockId: Number(blockId), blockOrder },
    });
    setGameBlocks((prev) => [...prev, gb]);
  };

  const handleLinkGameTeam = async (gameId: Id, teamId: Id) => {
    const gt = await adminApi.request<GameTeam>(`/games/${gameId}/teams`, {
      method: "POST",
      json: { teamId: Number(teamId) },
    });
    if (gt) setGameTeams((prev) => (prev.some((g) => g.gameId === gameId && g.teamId === teamId) ? prev : [...prev, gt]));
  };

  const handleUnlinkGameTeam = async (gameId: Id, teamId: Id) => {
    await adminApi.request(`/games/${gameId}/teams/${teamId}`, { method: "DELETE" });
    setGameTeams((prev) => prev.filter((g) => !(g.gameId === gameId && g.teamId === teamId)));
  };

  const handleGenerateSectors = async (gameId: Id) => {
    const res = await adminApi.request<{ created: number }>(`/games/${gameId}/sectors/generate`, {
      method: "POST",
      json: { shuffle: true },
    });
    setMessage(`Сгенерировано секторов: ${res.created}`);
  };

  const handleCreateTeam = async (name: string) => {
    const team = await adminApi.request<Team>("/teams", {
      method: "POST",
      json: { name },
    });
    setTeams((prev) => [...prev, team]);
  };

  const handleDeleteTeam = async (id: Id) => {
    await adminApi.request(`/teams/${id}`, { method: "DELETE" });
    setTeams((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCreatePlayer = async (name: string) => {
    const player = await adminApi.request<Player>("/players", {
      method: "POST",
      json: { name },
    });
    setPlayers((prev) => [...prev, player]);
  };

  const handleDeletePlayer = async (id: Id) => {
    await adminApi.request(`/players/${id}`, { method: "DELETE" });
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const handleLinkTeamPlayer = async (teamId: Id, playerId: Id) => {
    const tp = await adminApi.request<TeamPlayer>(`/teams/${teamId}/players`, {
      method: "POST",
      json: { playerId },
    });
    setTeamPlayers((prev) => [...prev, tp]);
  };

  const handleLoadResults = async (gameId: Id) => {
    const data = await adminApi.request<ResultPayload>(`/results?gameId=${gameId}`);
    setResults(data);
    setResultsGameId(gameId);
  };

  const handleCreateSeries = async (payload: { kind: QuestionSeries["kind"]; blockId?: Id; title?: string }) => {
    const created = await adminApi.request<QuestionSeries>("/question-series", {
      method: "POST",
      json: {
        ...payload,
        blockId: payload.blockId !== undefined ? Number(payload.blockId) : undefined,
      },
    });
    setSeries((prev) => [...prev, created]);
  };

  const handleDeleteSeries = async (id: Id) => {
    await adminApi.request(`/question-series/${id}`, { method: "DELETE" });
    setSeries((prev) => prev.filter((s) => s.id !== id));
  };

  if (!authed) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-amber-50 overflow-hidden">
        <img
          src="/media/images/logo.png"
          alt="logo"
          className="pointer-events-none absolute right-4 top-4 h-16 md:h-20 w-auto opacity-90 drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
        />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(210,168,93,0.12),transparent_26%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.06),transparent_24%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
        </div>
        <main className="relative mx-auto flex min-h-screen max-w-5xl items-center justify-between px-8 py-12 gap-10">
          <div className="max-w-xl space-y-4">
            <BackLink />
            <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">Администратор</p>
            <h1 className="text-5xl font-semibold leading-tight text-amber-50">Кабинет управления</h1>
            <p className="text-amber-100/80">
              Логин и пароль берём из `.env` бэкенда. Сессия хранится в HTTP-only cookie; при истечении потребуется войти снова.
            </p>
            {loginError ? <p className="text-sm text-red-200">{loginError}</p> : null}
          </div>
          <div className="w-full max-w-md rounded-2xl border border-amber-500/25 bg-white/5 p-6 shadow-[0_10px_50px_rgba(0,0,0,0.4)] backdrop-blur">
            <form className="space-y-4" onSubmit={handleLogin}>
              <Field
                label="Логин"
                required
                value={loginForm.login}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLoginForm((f) => ({ ...f, login: e.target.value }))
                }
              />
              <Field
                label="Пароль"
                type="password"
                required
                value={loginForm.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setLoginForm((f) => ({ ...f, password: e.target.value }))
                }
              />
              <PrimaryButton label="Войти" type="submit" />
            </form>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <img
        src="/media/images/logo.png"
        alt="logo"
        className="pointer-events-none absolute right-4 top-4 h-16 md:h-20 w-auto opacity-90 drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
      />
      <img
        src="/media/images/logo.png"
        alt="logo"
        className="pointer-events-none absolute left-4 top-4 h-12 w-auto opacity-90 drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
      />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(210,168,93,0.12),transparent_26%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.08),transparent_24%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent" />
      </div>

      <main className="relative mx-auto max-w-6xl px-6 pb-16 pt-12 lg:px-10">
        <div className="flex items-center justify-between">
          <BackLink />
          <div className="flex items-center gap-3">
            <button
              onClick={loadAll}
              className="text-sm text-amber-200/80 underline-offset-2 hover:text-amber-50 hover:underline"
            >
              Обновить
            </button>
            <button
              onClick={logout}
              className="text-sm text-amber-200/80 underline-offset-2 hover:text-amber-50 hover:underline"
            >
              Выйти
            </button>
          </div>
        </div>

        <header className="mt-6 space-y-3 rounded-3xl border border-amber-500/25 bg-black/50 p-6 shadow-[0_16px_60px_rgba(0,0,0,0.45)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">Администратор</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-4xl font-semibold leading-tight text-amber-50 lg:text-5xl">
                Управление контентом
              </h1>
              <p className="max-w-3xl text-base text-amber-100/80">
                Блоки вопросов, серии, игры и команды. Генерация секторов доступна из карточки игры.
              </p>
            </div>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 shadow-inner">
              <p className="font-semibold">Сессия активна</p>
              <p className="text-amber-200/80">Нажмите «Выйти», если нужно сменить пользователя.</p>
            </div>
          </div>
          {message ? <p className="text-sm text-emerald-200">{message}</p> : null}
        </header>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-amber-500/30 bg-white/5 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">{s.label}</p>
              <p className="text-3xl font-bold text-amber-50 mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        <nav className="mt-8 flex flex-wrap gap-2 text-sm text-amber-100/80">
          {[
            { key: "blocks", label: "Блоки" },
            { key: "questions", label: "Вопросы" },
            { key: "series", label: "Серии (блиц/супер)" },
            { key: "games", label: "Игры" },
            { key: "teams", label: "Команды/игроки" },
            { key: "results", label: "Результаты" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`rounded-full px-4 py-2 transition ${
                activeTab === tab.key
                  ? "bg-amber-500/30 text-amber-50 shadow-[0_10px_30px_rgba(255,193,7,0.2)] border border-amber-400/40"
                  : "border border-amber-500/30 bg-white/5 hover:bg-white/10"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="mt-8">
          {activeTab === "blocks" ? (
            <Panel title="Блоки вопросов">
              <BlockManager
                blocks={blocks}
                onCreate={handleCreateBlock}
                onDelete={handleDeleteBlock}
                onRename={handleRenameBlock}
              />
            </Panel>
          ) : null}

          {activeTab === "questions" ? (
            <Panel title="Вопросы">
              <QuestionManager
                blocks={blocks}
                questions={questions}
                series={series}
                onCreate={handleCreateQuestion}
                onUpdate={handleUpdateQuestion}
                onDelete={handleDeleteQuestion}
                onUpload={uploadMedia}
              />
            </Panel>
          ) : null}

          {activeTab === "series" ? (
            <Panel title="Серии для блицов и суперблицов">
              <SeriesManager blocks={blocks} series={series} onCreate={handleCreateSeries} onDelete={handleDeleteSeries} />
            </Panel>
          ) : null}

          {activeTab === "games" ? (
              <Panel title="Игры">
                <GameManager
                  games={games}
                  blocks={blocks}
                  teams={teams}
                  gameBlocks={gameBlocks}
                  onCreate={handleCreateGame}
                  onDelete={handleDeleteGame}
                  onToggleActive={handleToggleGameActive}
                  onLinkBlock={handleLinkBlock}
                  gameTeams={gameTeams}
                  onLinkTeam={handleLinkGameTeam}
                  onUnlinkTeam={handleUnlinkGameTeam}
                  onGenerateSectors={handleGenerateSectors}
                />
              </Panel>
            ) : null}

          {activeTab === "teams" ? (
            <Panel title="Команды и участники">
              <TeamManager
                teams={teams}
                players={players}
                teamPlayers={teamPlayers}
                onCreateTeam={handleCreateTeam}
                onDeleteTeam={handleDeleteTeam}
                onCreatePlayer={handleCreatePlayer}
                onDeletePlayer={handleDeletePlayer}
                onLink={handleLinkTeamPlayer}
              />
            </Panel>
          ) : null}

          {activeTab === "results" ? (
            <Panel title="Результаты">
              <ResultViewer games={games} results={results} selectedGameId={resultsGameId} onLoad={handleLoadResults} />
            </Panel>
          ) : null}
        </div>

        <div className="mt-10 flex gap-4 text-sm text-amber-100/70">
          <Link href="/tv" className="underline-offset-2 hover:text-amber-50 hover:underline">
            Экран зала
          </Link>
          <Link href="/host" className="underline-offset-2 hover:text-amber-50 hover:underline">
            Пульт ведущего
          </Link>
          <Link href="/player" className="underline-offset-2 hover:text-amber-50 hover:underline">
            Интерфейс игрока
          </Link>
        </div>
      </main>
    </div>
  );
}

function BlockManager({
  blocks,
  onCreate,
  onDelete,
  onRename,
}: {
  blocks: QuestionBlock[];
  onCreate: (title: string) => Promise<void>;
  onDelete: (id: Id) => Promise<void>;
  onRename: (id: Id) => Promise<void>;
}) {
  const [title, setTitle] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название блока"
          className="flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <PrimaryButton
          label="Создать"
          type="button"
          onClick={() => {
            if (!title.trim()) return;
            onCreate(title.trim());
            setTitle("");
          }}
        />
      </div>
      <div className="space-y-2 text-sm text-amber-100/80">
        {blocks.length === 0 ? <p>Блоков пока нет.</p> : null}
        {blocks.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-white/5 px-3 py-2"
          >
            <span>{b.title}</span>
            <div className="flex gap-3 text-xs">
              <button className="text-amber-200 hover:text-amber-50" onClick={() => onRename(b.id)}>
                Переименовать
              </button>
              <button className="text-red-200 hover:text-red-100" onClick={() => onDelete(b.id)}>
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionManager({
  blocks,
  questions,
  series,
  onCreate,
  onUpdate,
  onDelete,
  onUpload,
}: {
  blocks: QuestionBlock[];
  questions: Question[];
  series: QuestionSeries[];
  onCreate: (payload: Partial<Question> & { blockId: Id }) => Promise<void>;
  onUpdate: (id: Id, payload: Partial<Question>) => Promise<void>;
  onDelete: (id: Id) => Promise<void>;
  onUpload: (file: File, folder: MediaFolder) => Promise<string>;
}) {
  const [filterBlock, setFilterBlock] = useState<Id | "all">("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    blockId: blocks[0]?.id ?? 0,
    questionText: "",
    questionFullText: "",
    answerText: "",
    explanationText: "",
    authorName: "",
    authorCity: "",
    kind: "regular" as Question["kind"],
    seriesId: "" as string | Id,
    seriesOrder: "",
    mediaQuestionPath: "",
    mediaExplPath: "",
    isBlackBox: false,
  });
  const [editingId, setEditingId] = useState<Id | null>(null);

  useEffect(() => {
    if (!form.blockId && blocks.length > 0) {
      setForm((f) => ({ ...f, blockId: blocks[0].id }));
    }
  }, [blocks, form.blockId]);

  const latestQuestions = useMemo(() => questions.slice(-5).reverse(), [questions]);
  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...questions]
      .filter((q) => {
        if (filterBlock !== "all" && q.blockId !== filterBlock) return false;
        if (!term) return true;
        const haystack = [
          q.questionText,
          q.questionFullText,
          q.answerText,
          q.authorName,
          q.authorCity,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => b.id - a.id);
  }, [filterBlock, questions, search]);

  const handleUpload = async (
    file: File,
    target: "question" | "answer",
    folder: MediaFolder = target === "question" ? "questions" : "answers"
  ) => {
    const path = await onUpload(file, folder);
    setForm((f) => ({
      ...f,
      mediaQuestionPath: target === "question" ? path : f.mediaQuestionPath,
      mediaExplPath: target === "answer" ? path : f.mediaExplPath,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <select
          value={form.blockId}
          onChange={(e) => setForm((f) => ({ ...f, blockId: Number(e.target.value) }))}
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        >
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <input
          value={form.questionFullText}
          onChange={(e) => setForm((f) => ({ ...f, questionFullText: e.target.value }))}
          placeholder="Полный текст вопроса (опционально)"
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <input
          value={form.questionText}
          onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
          placeholder="Текст вопроса"
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <input
          value={form.answerText}
          onChange={(e) => setForm((f) => ({ ...f, answerText: e.target.value }))}
          placeholder="Ответ"
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <input
          value={form.explanationText}
          onChange={(e) => setForm((f) => ({ ...f, explanationText: e.target.value }))}
          placeholder="Пояснение к ответу (опционально)"
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={form.authorName}
            onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))}
            placeholder="Автор вопроса"
            className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
          />
          <input
            value={form.authorCity}
            onChange={(e) => setForm((f) => ({ ...f, authorCity: e.target.value }))}
            placeholder="Город автора"
            className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-amber-100/80">
          <input
            type="checkbox"
            checked={form.isBlackBox}
            onChange={(e) => setForm((f) => ({ ...f, isBlackBox: e.target.checked }))}
          />
          Черный ящик
        </label>
        <select
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Question["kind"] }))}
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        >
          <option value="regular">Обычный</option>
          <option value="blitz">Блиц</option>
          <option value="super_blitz">Суперблиц</option>
        </select>
        {(form.kind === "blitz" || form.kind === "super_blitz") && (
          <select
            value={form.seriesId}
            onChange={(e) => setForm((f) => ({ ...f, seriesId: e.target.value }))}
            className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
          >
            <option value="">Серия не выбрана</option>
            {series
              .filter((s) => s.kind === form.kind)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || `${s.kind} #${s.id}`} · {blockTitle(blocks, s.blockId ?? 0)}
                </option>
              ))}
          </select>
        )}
        {(form.kind === "blitz" || form.kind === "super_blitz") && (
          <input
            type="number"
            value={form.seriesOrder}
            onChange={(e) => setForm((f) => ({ ...f, seriesOrder: e.target.value }))}
            placeholder="Порядок в серии"
            className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
          />
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <input
              value={form.mediaQuestionPath}
              onChange={(e) => setForm((f) => ({ ...f, mediaQuestionPath: e.target.value }))}
              placeholder="Путь к медиа вопроса (опционально)"
              className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
            />
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file, "question").catch((err) => alert(err.message));
              }}
              className="text-xs text-amber-100/80"
            />
          </div>
          <div className="space-y-1">
            <input
              value={form.mediaExplPath}
              onChange={(e) => setForm((f) => ({ ...f, mediaExplPath: e.target.value }))}
              placeholder="Путь к медиа ответа (опционально)"
              className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
            />
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file, "answer").catch((err) => alert(err.message));
              }}
              className="text-xs text-amber-100/80"
            />
          </div>
        </div>
        <PrimaryButton
          label={editingId ? "Сохранить вопрос" : "Добавить вопрос"}
          type="button"
          onClick={() => {
            if (!form.blockId || !form.questionText || !form.answerText) return;
            const payload = {
              blockId: form.blockId,
              questionText: form.questionText,
              questionFullText: form.questionFullText || undefined,
              answerText: form.answerText,
              explanationText: form.explanationText || undefined,
              authorName: form.authorName || undefined,
              authorCity: form.authorCity || undefined,
              kind: form.kind,
              seriesId: form.seriesId ? Number(form.seriesId) : undefined,
              seriesOrder: form.seriesOrder ? Number(form.seriesOrder) : undefined,
              mediaQuestionPath: form.mediaQuestionPath || undefined,
              mediaExplPath: form.mediaExplPath || undefined,
              isBlackBox: form.isBlackBox,
            };
            if (editingId) {
              onUpdate(editingId, payload);
            } else {
              onCreate(payload);
            }
            setForm((f) => ({
              ...f,
              questionText: "",
              questionFullText: "",
              answerText: "",
              explanationText: "",
              authorName: "",
              authorCity: "",
              seriesId: "",
              seriesOrder: "",
              mediaQuestionPath: "",
              mediaExplPath: "",
              isBlackBox: false,
            }));
            setEditingId(null);
          }}
        />
        {editingId ? (
          <button
            className="text-sm text-amber-200/80 underline-offset-2 hover:text-amber-50 hover:underline"
            onClick={() => {
              setEditingId(null);
              setForm((f) => ({
                ...f,
                questionText: "",
                questionFullText: "",
                answerText: "",
                explanationText: "",
                authorName: "",
                authorCity: "",
                seriesId: "",
                seriesOrder: "",
                mediaQuestionPath: "",
                mediaExplPath: "",
                isBlackBox: false,
              }));
            }}
          >
            Отменить редактирование
          </button>
        ) : null}
      </div>
      <div className="space-y-2 text-sm text-amber-100/80">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Последние вопросы</p>
        {latestQuestions.length === 0 ? <p>Еще нет вопросов.</p> : null}
        {latestQuestions.map((q) => (
          <div
            key={q.id}
            className="rounded-lg border border-amber-500/30 bg-white/5 p-3"
          >
            <div className="flex items-center justify-between text-xs text-amber-200/70">
              <span>{blocks.find((b) => b.id === q.blockId)?.title ?? "Без блока"}</span>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-500/20 px-2 py-1 text-amber-50">{q.kind}</span>
                {q.isBlackBox ? (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-50">
                    Черный ящик
                  </span>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-sm text-amber-50">{q.questionText}</p>
            {q.questionFullText ? (
              <p className="mt-1 text-xs text-amber-100/70">Полный текст: {q.questionFullText}</p>
            ) : null}
            {q.explanationText ? (
              <p className="mt-1 text-xs text-amber-100/70">Пояснение: {q.explanationText}</p>
            ) : null}
            {(q.authorName || q.authorCity) ? (
              <p className="mt-1 text-xs text-amber-100/70">
                Автор: {q.authorName || "—"} {q.authorCity ? `(${q.authorCity})` : ""}
              </p>
            ) : null}
            {q.seriesId ? (
              <p className="mt-1 text-xs text-amber-100/70">
                Серия #{q.seriesId} {q.seriesOrder ? `· порядок ${q.seriesOrder}` : ""}
              </p>
            ) : null}
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-amber-100/70">Ответ: {q.answerText}</span>
              <div className="flex gap-3">
                <button
                  className="text-amber-200 hover:text-amber-50"
                  onClick={() => {
                    setEditingId(q.id);
                    setForm({
                      blockId: q.blockId,
                      questionText: q.questionText,
                      questionFullText: q.questionFullText ?? "",
                      answerText: q.answerText,
                      explanationText: q.explanationText ?? "",
                      authorName: q.authorName ?? "",
                      authorCity: q.authorCity ?? "",
                      kind: q.kind,
                      seriesId: q.seriesId ?? "",
                      seriesOrder: q.seriesOrder?.toString() ?? "",
                      mediaQuestionPath: q.mediaQuestionPath ?? "",
                      mediaExplPath: q.mediaExplPath ?? "",
                      isBlackBox: Boolean(q.isBlackBox),
                    });
                  }}
                >
                  Редактировать
                </button>
                <button className="text-red-200 hover:text-red-100" onClick={() => onDelete(q.id)}>
                  Удалить
                </button>
              </div>
            </div>
            <div className="mt-1 text-[11px] text-amber-100/60 space-y-1">
              {q.mediaQuestionPath ? <p>Медиа вопроса: {q.mediaQuestionPath}</p> : null}
              {q.mediaExplPath ? <p>Медиа ответа: {q.mediaExplPath}</p> : null}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 text-sm text-amber-100/80">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">
            Все вопросы ({filteredQuestions.length})
          </p>
          <select
            value={filterBlock === "all" ? "all" : filterBlock}
            onChange={(e) => {
              const val = e.target.value === "all" ? "all" : Number(e.target.value);
              setFilterBlock(val);
            }}
            className="rounded-lg border border-amber-500/30 bg-black/30 px-3 py-1.5 text-xs text-amber-50"
          >
            <option value="all">Все блоки</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по тексту, ответу, автору"
            className="min-w-[220px] flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-1.5 text-xs text-amber-50"
          />
        </div>
        <div className="grid max-h-[520px] gap-2 overflow-auto pr-1">
          {filteredQuestions.length === 0 ? <p className="text-amber-200/70">Ничего не найдено.</p> : null}
          {filteredQuestions.map((q) => (
            <div key={q.id} className="rounded-lg border border-amber-500/30 bg-white/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-200/70">
                <span>
                  #{q.id} · {blocks.find((b) => b.id === q.blockId)?.title ?? "Без блока"}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-500/20 px-2 py-1 text-amber-50">{q.kind}</span>
                  {q.isBlackBox ? (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-50">
                      Черный ящик
                    </span>
                  ) : null}
                  {q.seriesId ? (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-50">
                      Серия #{q.seriesId}
                      {q.seriesOrder ? ` · ${q.seriesOrder}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-sm text-amber-50">{q.questionText || q.questionFullText}</p>
              {q.questionFullText && q.questionFullText !== q.questionText ? (
                <p className="mt-1 text-xs text-amber-100/70">Полный текст: {q.questionFullText}</p>
              ) : null}
              <div className="mt-1 text-xs text-amber-100/70 flex flex-wrap gap-3">
                <span>Ответ: {q.answerText}</span>
                {q.explanationText ? <span>Пояснение: {q.explanationText}</span> : null}
              </div>
              {(q.authorName || q.authorCity) ? (
                <p className="mt-1 text-[11px] text-amber-100/70">
                  Автор: {q.authorName || "—"} {q.authorCity ? `(${q.authorCity})` : ""}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="text-amber-100/60 space-y-1">
                  {q.mediaQuestionPath ? <p>Медиа вопроса: {q.mediaQuestionPath}</p> : null}
                  {q.mediaExplPath ? <p>Медиа ответа: {q.mediaExplPath}</p> : null}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="text-amber-200 hover:text-amber-50"
                    onClick={() => {
                      setEditingId(q.id);
                      setForm({
                        blockId: q.blockId,
                        questionText: q.questionText,
                        questionFullText: q.questionFullText ?? "",
                        answerText: q.answerText,
                        explanationText: q.explanationText ?? "",
                        authorName: q.authorName ?? "",
                        authorCity: q.authorCity ?? "",
                        kind: q.kind,
                        seriesId: q.seriesId ?? "",
                        seriesOrder: q.seriesOrder?.toString() ?? "",
                        mediaQuestionPath: q.mediaQuestionPath ?? "",
                        mediaExplPath: q.mediaExplPath ?? "",
                        isBlackBox: Boolean(q.isBlackBox),
                      });
                    }}
                  >
                    Редактировать
                  </button>
                  <button className="text-red-200 hover:text-red-100" onClick={() => onDelete(q.id)}>
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameManager({
  games,
  blocks,
  teams,
  gameBlocks,
  onCreate,
  onDelete,
  onToggleActive,
  onLinkBlock,
  gameTeams,
  onLinkTeam,
  onUnlinkTeam,
  onGenerateSectors,
}: {
  games: Game[];
  blocks: QuestionBlock[];
  teams: Team[];
  gameBlocks: GameBlock[];
  onCreate: (payload: Partial<Game>) => Promise<void>;
  onDelete: (id: Id) => Promise<void>;
  onToggleActive: (id: Id, active: boolean) => Promise<void>;
  onLinkBlock: (gameId: Id, blockId: Id, order?: number) => Promise<void>;
  gameTeams: GameTeam[];
  onLinkTeam: (gameId: Id, teamId: Id) => Promise<void>;
  onUnlinkTeam: (gameId: Id, teamId: Id) => Promise<void>;
  onGenerateSectors: (gameId: Id) => Promise<void>;
}) {
  const [form, setForm] = useState({
    gameDate: "",
    location: "",
    pinCode: "",
    usePhones: false,
    hasViewers: false,
    isActive: true,
  });
  const [linkForms, setLinkForms] = useState<Record<Id, { blockId: Id; order?: number }>>({});

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <input
          type="datetime-local"
          value={form.gameDate}
          onChange={(e) => setForm((f) => ({ ...f, gameDate: e.target.value }))}
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <input
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="Локация"
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <input
          value={form.pinCode}
          onChange={(e) => setForm((f) => ({ ...f, pinCode: e.target.value }))}
          placeholder="PIN"
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <div className="flex flex-wrap gap-4 text-sm text-amber-100/80">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.usePhones}
              onChange={(e) => setForm((f) => ({ ...f, usePhones: e.target.checked }))}
            />
            Участники отвечают с телефонов
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.hasViewers}
              onChange={(e) => setForm((f) => ({ ...f, hasViewers: e.target.checked }))}
            />
            Телезрители участвуют
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Активная игра
          </label>
        </div>
        <PrimaryButton
          label="Создать игру"
          type="button"
          onClick={() => {
            if (!form.gameDate || !form.location || !form.pinCode) return;
            onCreate(form);
            setForm({
              gameDate: "",
              location: "",
              pinCode: "",
              usePhones: false,
              hasViewers: false,
              isActive: true,
            });
          }}
        />
      </div>

      <div className="space-y-3 text-sm text-amber-100/80">
        {games.length === 0 ? <p>Игры пока не созданы.</p> : null}
        {games.map((g) => {
          const links = gameBlocks.filter((gb) => gb.gameId === g.id);
          const lf = linkForms[g.id] ?? { blockId: blocks[0]?.id ?? 0, order: undefined };
          return (
            <div key={g.id} className="rounded-lg border border-amber-500/30 bg-white/5 p-4">
              <div className="flex items-center justify-between text-xs text-amber-200/70">
                <span>
                  {new Date(g.gameDate).toLocaleString("ru-RU")} · {g.location}
                </span>
                <span className="rounded-full bg-amber-500/20 px-2 py-1 text-amber-50">PIN: {g.pinCode}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-amber-100/70">
                {g.isActive ? <span className="rounded-full bg-emerald-500/20 px-2 py-1">Активна</span> : null}
                {g.usePhones ? <span className="rounded-full bg-amber-500/20 px-2 py-1">Ответы с телефонов</span> : null}
                {g.hasViewers ? <span className="rounded-full bg-amber-500/20 px-2 py-1">Телезрители</span> : null}
              </div>

              <div className="mt-3 grid gap-2">
                <div className="flex items-center gap-2">
                  <select
                    value={lf.blockId}
                    onChange={(e) =>
                      setLinkForms((prev) => ({
                        ...prev,
                        [g.id]: { ...lf, blockId: Number(e.target.value) },
                      }))
                    }
                    className="flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
                  >
                    {blocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Порядок"
                    value={lf.order ?? ""}
                    onChange={(e) =>
                      setLinkForms((prev) => ({
                        ...prev,
                        [g.id]: { ...lf, order: e.target.value ? Number(e.target.value) : undefined },
                      }))
                    }
                    className="w-28 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
                  />
                  <PrimaryButton
                    label="Добавить блок"
                    type="button"
                    onClick={() => {
                      if (!lf.blockId) return;
                      onLinkBlock(g.id, lf.blockId, lf.order);
                    }}
                  />
                </div>
                {links.length ? (
                  <p className="text-xs text-amber-100/70">
                    Подключенные блоки:{" "}
                    {links
                      .map((l) => blockTitle(blocks, l.blockId, l.blockOrder))
                      .join(", ")}
                  </p>
                ) : (
                  <p className="text-xs text-amber-100/70">Блоки не подключены</p>
                )}
              </div>

              <div className="mt-4 grid gap-2 text-xs">
                <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">Команды в игре</p>
                <div className="flex flex-wrap gap-2">
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      className={`rounded-full border px-3 py-1 transition ${
                        gameTeams.some((gt) => gt.gameId === g.id && gt.teamId === t.id)
                          ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100"
                          : "border-amber-500/30 bg-black/30 text-amber-100"
                      }`}
                      onClick={() =>
                        gameTeams.some((gt) => gt.gameId === g.id && gt.teamId === t.id)
                          ? onUnlinkTeam(g.id, t.id)
                          : onLinkTeam(g.id, t.id)
                      }
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <button
                  className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-50"
                  onClick={() => onGenerateSectors(g.id)}
                >
                  Сгенерировать сектора
                </button>
                <button
                  className="text-amber-200 hover:text-amber-50"
                  onClick={() => onToggleActive(g.id, !g.isActive)}
                >
                  {g.isActive ? "Сделать неактивной" : "Сделать активной"}
                </button>
                <button className="text-red-200 hover:text-red-100" onClick={() => onDelete(g.id)}>
                  Удалить игру
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function blockTitle(blocks: QuestionBlock[], id: Id, order?: number) {
  const name = blocks.find((b) => b.id === id)?.title ?? `Блок ${id}`;
  return order ? `${order}. ${name}` : name;
}

function SeriesManager({
  blocks,
  series,
  onCreate,
  onDelete,
}: {
  blocks: QuestionBlock[];
  series: QuestionSeries[];
  onCreate: (payload: { kind: QuestionSeries["kind"]; blockId?: Id; title?: string }) => Promise<void>;
  onDelete: (id: Id) => Promise<void>;
}) {
  const [form, setForm] = useState<{ kind: QuestionSeries["kind"]; blockId?: Id; title?: string }>({
    kind: "blitz",
    blockId: blocks[0]?.id,
    title: "",
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <select
          value={form.kind}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as QuestionSeries["kind"] }))}
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        >
          <option value="blitz">Блиц</option>
          <option value="super_blitz">Суперблиц</option>
        </select>
        <select
          value={form.blockId ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, blockId: e.target.value ? Number(e.target.value) : undefined }))}
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        >
          <option value="">Без блока</option>
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Название серии (опционально)"
          className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        />
        <PrimaryButton
          label="Создать серию"
          type="button"
          onClick={() => {
            onCreate(form);
            setForm((f) => ({ ...f, title: "" }));
          }}
        />
      </div>

      <div className="space-y-2 text-sm text-amber-100/80">
        {series.length === 0 ? <p>Серий пока нет.</p> : null}
        {series.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-white/5 px-3 py-2"
          >
            <div className="space-y-1">
              <p className="text-amber-50">
                {s.title || `${s.kind} #${s.id}`} — {s.kind === "blitz" ? "Блиц" : "Суперблиц"}
              </p>
              <p className="text-xs text-amber-200/70">Блок: {s.blockId ? blockTitle(blocks, s.blockId) : "Не указан"}</p>
            </div>
            <button className="text-red-200 hover:text-red-100 text-xs" onClick={() => onDelete(s.id)}>
              Удалить
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaUploader({ onUpload }: { onUpload: (file: File, folder: MediaFolder) => Promise<string> }) {
  const [folder, setFolder] = useState<MediaFolder>("questions");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setStatus("Загрузка...");
    setError(null);
    try {
      const path = await onUpload(file, folder);
      setStatus(`Файл загружен: ${path}`);
    } catch (err: any) {
      setError(err?.message || "Ошибка загрузки");
      setStatus(null);
    }
  };

  return (
    <div className="space-y-4 text-sm text-amber-100/80">
      <div className="flex flex-wrap gap-3">
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value as typeof folder)}
          className="rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        >
          <option value="intro">Заставки</option>
          <option value="questions">Медиа вопросов</option>
          <option value="answers">Медиа ответов</option>
          <option value="sfx">Звуки</option>
        </select>
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-amber-50"
        />
        <PrimaryButton label="Загрузить" type="button" onClick={handleUpload} />
      </div>
      {status ? <p className="text-emerald-200">{status}</p> : null}
      {error ? <p className="text-red-200">{error}</p> : null}
    </div>
  );
}

function TeamManager({
  teams,
  players,
  teamPlayers,
  onCreateTeam,
  onDeleteTeam,
  onCreatePlayer,
  onDeletePlayer,
  onLink,
}: {
  teams: Team[];
  players: Player[];
  teamPlayers: TeamPlayer[];
  onCreateTeam: (name: string) => Promise<void>;
  onDeleteTeam: (id: Id) => Promise<void>;
  onCreatePlayer: (name: string) => Promise<void>;
  onDeletePlayer: (id: Id) => Promise<void>;
  onLink: (teamId: Id, playerId: Id) => Promise<void>;
}) {
  const [teamName, setTeamName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [link, setLink] = useState<{ teamId?: Id; playerId?: Id }>({});

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <div className="flex gap-2">
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Название команды"
            className="flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
          />
          <PrimaryButton
            label="Создать команду"
            type="button"
            onClick={() => {
              if (!teamName.trim()) return;
              onCreateTeam(teamName.trim());
              setTeamName("");
            }}
          />
        </div>

        <div className="flex gap-2">
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Имя игрока"
            className="flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
          />
          <PrimaryButton
            label="Создать игрока"
            type="button"
            onClick={() => {
              if (!playerName.trim()) return;
              onCreatePlayer(playerName.trim());
              setPlayerName("");
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={link.teamId ?? ""}
            onChange={(e) => setLink((l) => ({ ...l, teamId: Number(e.target.value) }))}
            className="flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
          >
            <option value="">Команда</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={link.playerId ?? ""}
            onChange={(e) => setLink((l) => ({ ...l, playerId: Number(e.target.value) }))}
            className="flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
          >
            <option value="">Игрок</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <PrimaryButton
            label="Добавить в команду"
            type="button"
            onClick={() => {
              if (!link.teamId || !link.playerId) return;
              onLink(link.teamId, link.playerId);
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 text-sm text-amber-100/80">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Команды</p>
          {teams.length === 0 ? <p>Команд нет.</p> : null}
          {teams.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-white/5 px-3 py-2">
              <span>{t.name}</span>
              <button className="text-red-200 hover:text-red-100 text-xs" onClick={() => onDeleteTeam(t.id)}>
                Удалить
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-2 text-sm text-amber-100/80">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Игроки</p>
          {players.length === 0 ? <p>Игроков нет.</p> : null}
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-white/5 px-3 py-2">
              <span>{p.name}</span>
              <button className="text-red-200 hover:text-red-100 text-xs" onClick={() => onDeletePlayer(p.id)}>
                Удалить
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 text-sm text-amber-100/80">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Составы</p>
        {teamPlayers.length === 0 ? <p>Участники не назначены.</p> : null}
        <div className="space-y-1">
          {teamPlayers.map((tp, idx) => (
            <div key={`${tp.teamId}-${tp.playerId}-${idx}`} className="rounded-lg border border-amber-500/30 bg-white/5 px-3 py-2">
              <span className="text-amber-50">{teams.find((t) => t.id === tp.teamId)?.name ?? tp.teamId}</span>
              <span className="text-amber-200/70"> — {players.find((p) => p.id === tp.playerId)?.name ?? tp.playerId}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultViewer({
  games,
  results,
  selectedGameId,
  onLoad,
}: {
  games: Game[];
  results: ResultPayload | null;
  selectedGameId: Id | null;
  onLoad: (gameId: Id) => Promise<void>;
}) {
  const [gameId, setGameId] = useState<Id | "">("");

  useEffect(() => {
    if (selectedGameId) setGameId(selectedGameId);
  }, [selectedGameId]);

  return (
    <div className="space-y-4 text-sm text-amber-100/80">
      <div className="flex items-center gap-2">
        <select
          value={gameId}
          onChange={(e) => setGameId(e.target.value ? Number(e.target.value) : "")}
          className="flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
        >
          <option value="">Выберите игру</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {new Date(g.gameDate).toLocaleString("ru-RU")} · {g.location}
            </option>
          ))}
        </select>
        <PrimaryButton label="Показать" type="button" onClick={() => gameId && onLoad(Number(gameId))} />
      </div>
      {results && selectedGameId === gameId ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/30 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Очки</p>
            {results.scores.length === 0 ? <p className="mt-1 text-amber-100/70">Очков нет.</p> : null}
            {results.scores.map((s) => (
              <p key={s.id} className="text-amber-50">
                Команда {s.teamId}: {s.points} ({s.reason || "—"})
              </p>
            ))}
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Ответы</p>
            {results.answers.length === 0 ? <p className="mt-1 text-amber-100/70">Ответов нет.</p> : null}
            {results.answers.map((a) => (
              <p key={a.id} className="text-amber-50">
                Вопрос {a.questionId}: команда {a.teamId} — {a.answerText || "—"} ({a.isCorrect ? "верно" : "неверно"})
              </p>
            ))}
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Сектора</p>
            {results.sectors.length === 0 ? <p className="mt-1 text-amber-100/70">Сектора не сгенерированы.</p> : null}
            <p className="mt-1 text-amber-50">
              {results.sectors.map((s) => `№${s.sectorNumber}${s.isUsed ? " (сыгран)" : ""}`).join(", ")}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-amber-100/70">Выберите игру и нажмите «Показать».</p>
      )}
    </div>
  );
}

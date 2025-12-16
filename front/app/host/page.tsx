"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MEDIA_BASE_URL, WS_URL, gamesApi } from "../lib/api";
import { BackLink, Field, Panel, PrimaryButton } from "../components/ui";

const MAX_RECONNECT_ATTEMPTS = 7;

type Game = { id: number; gameDate: string; location: string; pinCode: string };
type Question = {
  id: number;
  questionText?: string;
  questionFullText?: string;
  answerText?: string;
  explanationText?: string;
  mediaQuestionPath?: string;
  mediaExplPath?: string;
  authorName?: string;
  authorCity?: string;
  kind: string;
  seriesId?: number;
  isBlackBox?: boolean;
};

type ScoreRow = { teamId: number; score: number };

const toId = (value: unknown): number | null => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeGames = (list: any): Game[] =>
  (Array.isArray(list) ? list : [])
    .map((g) => {
      const id = toId(g?.id);
      if (id === null) return null;
      return { id, gameDate: g.gameDate, location: g.location, pinCode: g.pinCode } as Game;
    })
    .filter((g): g is Game => Boolean(g));

const normalizeTeams = (list: any): { id: number; name: string; locked?: boolean }[] =>
  (Array.isArray(list) ? list : [])
    .map((t) => {
      const id = toId(t?.id);
      if (id === null) return null;
      return { id, name: t.name ?? `Команда ${id}`, locked: Boolean(t.locked) };
    })
    .filter((t): t is { id: number; name: string; locked?: boolean } => Boolean(t));

const normalizeScores = (list: any): ScoreRow[] =>
  (Array.isArray(list) ? list : [])
    .map((s) => {
      const teamId = toId(s?.teamId);
      if (teamId === null) return null;
      const score = Number(s?.score);
      return { teamId, score: Number.isFinite(score) ? score : 0 };
    })
    .filter((s): s is ScoreRow => Boolean(s));

const normalizeAnswers = (list: any): { teamId: number; answerText?: string }[] =>
  (Array.isArray(list) ? list : [])
    .map((a) => {
      const teamId = toId(a?.teamId);
      if (teamId === null) return null;
      return { teamId, answerText: a?.answerText };
    })
    .filter((a): a is { teamId: number; answerText?: string } => Boolean(a));

const normalizeIdArray = (list: any): number[] =>
  (Array.isArray(list) ? list : [])
    .map((v) => toId(v))
    .filter((v): v is number => v !== null);

const normalizeQuestion = (q: any): Question | null => {
  if (!q) return null;
  const id = toId(q.id);
  if (id === null) return null;
  const seriesId = q.seriesId === undefined || q.seriesId === null ? undefined : toId(q.seriesId) ?? undefined;
  return { ...q, id, seriesId };
};

export default function HostPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<{ id: number; name: string; locked?: boolean }[]>([]);
  const [form, setForm] = useState({ gameId: "", pin: "", host: "" });
  const [connected, setConnected] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [wsError, setWsError] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [sector, setSector] = useState<{ id: number; sectorNumber: number } | null>(null);
  const [timer, setTimer] = useState<{ remaining: number; endsAt: number } | null>(null);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [answeringTeam, setAnsweringTeam] = useState("");
  const [answers, setAnswers] = useState<{ teamId: number; answerText?: string }[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const [screenState, setScreenState] = useState<"info" | "rules" | "intro" | "field" | "question" | "win">("info");
  const [blitzIndex, setBlitzIndex] = useState<number | null>(null);
  const [blitzTotal, setBlitzTotal] = useState<number | null>(null);
  const [blitzActiveTeams, setBlitzActiveTeams] = useState<number[]>([]);
  const [blitzEliminated, setBlitzEliminated] = useState<number[]>([]);
  const [awardModal, setAwardModal] = useState<{ teamId: number | null }>({ teamId: null });
  const [answerVisible, setAnswerVisible] = useState(false);
  const [blackBoxMusicOn, setBlackBoxMusicOn] = useState(false);
  const [teamNotice, setTeamNotice] = useState<string | null>(null);
  const [spinActive, setSpinActive] = useState(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sessionReadyRef = useRef(false);

  const buildMediaUrl = useMemo(
    () => (path?: string | null) => {
      if (!path) return null;
      if (/^(https?:)?\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) return path;
      const clean = path.replace(/^\/+/, "");
      const base = (MEDIA_BASE_URL || "").replace(/\/$/, "");
      return base ? `${base}/${clean}` : `/${clean}`;
    },
    []
  );

  useEffect(() => {
    gamesApi
      .getActiveGames()
      .then((data) => setGames(normalizeGames(data)))
      .catch(() => setGames([]));
  }, []);

  const refreshTeams = React.useCallback(() => {
    if (!form.gameId) return;
    gamesApi
      .getTeamsStatus(form.gameId)
      .then((data) => setTeams(normalizeTeams(data)))
      .catch(() => {});
  }, [form.gameId]);

  useEffect(() => {
    refreshTeams();
  }, [refreshTeams]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((t) => (t ? { ...t, remaining: Math.max(0, t.endsAt - Date.now()) } : null));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!teamNotice) return;
    const t = setTimeout(() => setTeamNotice(null), 4000);
    return () => clearTimeout(t);
  }, [teamNotice]);

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sessionReadyRef.current = false;
    };
  }, []);

  const connect = (isRetry = false) => {
    if (!form.gameId || !form.pin) {
      setWsError("Укажите игру и PIN");
      return;
    }
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (!isRetry) {
      reconnectAttemptsRef.current = 0;
      setReconnectAttempt(0);
      setReconnecting(false);
      setWsError(null);
    }
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      refreshTeams();
      ws.send(
        JSON.stringify({
          type: "session.connect",
          payload: {
            role: "host",
            gameId: Number(form.gameId),
            pinCode: form.pin,
            displayName: form.host,
          },
        })
      );
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "state.sync") {
        setConnected(true);
        setSessionReady(true);
        sessionReadyRef.current = true;
        setReconnecting(false);
        setReconnectAttempt(0);
        reconnectAttemptsRef.current = 0;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        setWsError(null);
        refreshTeams();
      }
      if (msg.type === "spin.stopped") {
        const sectorId = toId(msg.payload?.sector?.id);
        const sectorNumber = toId(msg.payload?.sector?.sectorNumber);
        const normalizedQuestion = normalizeQuestion(msg.payload?.question);
        setSector(sectorId !== null && sectorNumber !== null ? { id: sectorId, sectorNumber } : null);
        setQuestion(normalizedQuestion);
        setScreenState("question");
        setAnswerVisible(false);
        setSpinActive(false);
        setBlackBoxMusicOn(false);
        if (normalizedQuestion?.kind === "blitz" || normalizedQuestion?.kind === "super_blitz") {
          setBlitzIndex(0);
        } else {
          setBlitzIndex(null);
        }
        setBlitzTotal(toId(msg.payload?.blitzTotal));
        setBlitzActiveTeams(normalizeIdArray(msg.payload.activeTeams));
        setBlitzEliminated(normalizeIdArray(msg.payload.eliminatedTeams));
      }
      if (msg.type === "question.revealed") {
        const normalizedQuestion = normalizeQuestion(msg.payload);
        setQuestion(normalizedQuestion);
        setAnswerVisible(false);
        if (normalizedQuestion?.kind === "blitz" || normalizedQuestion?.kind === "super_blitz")
          setBlitzIndex((idx) => (idx === null ? 0 : idx));
        setBlitzTotal((prev) => prev ?? toId((msg.payload as any)?.blitzTotal) ?? null);
      }
      if (msg.type === "timer.started") setTimer({ remaining: msg.payload.duration * 1000, endsAt: msg.payload.endsAt });
      if (msg.type === "timer.ticked") setTimer({ remaining: msg.payload.remaining, endsAt: Date.now() + msg.payload.remaining });
      if (msg.type === "timer.finished") setTimer(null);
      if (msg.type === "score.updated") setScores(normalizeScores(msg.payload));
      if (msg.type === "question.closed") {
        setQuestion(null);
        setSector(null);
        setTimer(null);
        setBlitzIndex(null);
        setBlitzTotal(null);
        setAnswers([]);
        setBlitzActiveTeams([]);
        setBlitzEliminated([]);
        setAnswerVisible(false);
        setBlackBoxMusicOn(false);
        setScreenState("field");
      }
      if (msg.type === "error") setWsError(msg.error || "ws error");
      if (msg.type === "game.finished") setScreenState("win");
      if (msg.type === "screen.rules") setScreenState("rules");
      if (msg.type === "screen.info") setScreenState("info");
      if (msg.type === "screen.field") setScreenState("field");
      if (msg.type === "media.play" && msg.payload?.kind === "intro") setScreenState("intro");
      if (msg.type === "spin.started") {
        setSpinActive(true);
        setScreenState("field");
        setBlitzIndex(null);
        setBlitzTotal(null);
      }
      if (msg.type === "blitz.next") {
        const normalizedQuestion = normalizeQuestion(msg.payload.question);
        setQuestion(normalizedQuestion);
        setBlitzIndex(toId(msg.payload.index) ?? null);
        setBlitzTotal(toId(msg.payload?.blitzTotal) ?? blitzTotal);
        setScreenState("question");
        setAnswerVisible(false);
        if (msg.payload?.activeTeams) setBlitzActiveTeams(normalizeIdArray(msg.payload.activeTeams));
        if (msg.payload?.eliminatedTeams) setBlitzEliminated(normalizeIdArray(msg.payload.eliminatedTeams));
      }
      if (msg.type === "answer.revealed") setAnswerVisible(true);
      if (msg.type === "answer.hidden") setAnswerVisible(false);
      if (msg.type === "blackbox.music") setBlackBoxMusicOn(Boolean(msg.payload?.play));
      if (msg.type === "answer.submitted") {
        setAnswers((prev) => {
          const teamId = toId(msg.payload.teamId);
          if (teamId === null) return prev;
          const existing = prev.find((a) => a.teamId === teamId);
          if (existing) {
            return prev.map((a) => (a.teamId === teamId ? { ...a, answerText: msg.payload.answerText } : a));
          }
          return [...prev, { teamId, answerText: msg.payload.answerText }];
        });
      }
      if (msg.type === "team.locked") {
        const teamId = toId(msg.payload.teamId);
        if (teamId === null) return;
        let lockedName = `Команда ${teamId}`;
        setTeams((prev) => {
          const exists = prev.find((t) => t.id === teamId);
          lockedName = exists ? exists.name : lockedName;
          const updated = exists
            ? prev.map((t) => (t.id === teamId ? { ...t, locked: true } : t))
            : [...prev, { id: teamId, name: lockedName, locked: true }];
          return updated;
        });
        setTeamNotice(`${lockedName} подключилась`);
        refreshTeams();
      }
      if (msg.type === "team.unlocked") {
        const teamId = toId(msg.payload.teamId);
        if (teamId === null) return;
        let unlockedName = `Команда ${teamId}`;
        setTeams((prev) => {
          const exists = prev.find((t) => t.id === teamId);
          unlockedName = exists ? exists.name : unlockedName;
          return prev.map((t) => (t.id === teamId ? { ...t, locked: false } : t));
        });
        setTeamNotice(`${unlockedName} покинула слот`);
        refreshTeams();
      }
    };
    ws.onerror = () => setWsError((prev) => prev || "ws error");
    ws.onclose = () => {
      setConnected(false);
      if (!sessionReadyRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setReconnecting(false);
        setWsError("Связь потеряна. Попробуйте переподключиться.");
        return;
      }
      const nextAttempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = nextAttempt;
      setReconnectAttempt(nextAttempt);
      setReconnecting(true);
      setWsError(`Связь потеряна. Переподключаемся (${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})...`);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        connect(true);
      }, Math.min(5000, 1000 * nextAttempt));
    };
    socketRef.current = ws;
  };

  const send = (payload: any) => {
    if (!socketRef.current || socketRef.current.readyState !== 1) return;
    socketRef.current.send(JSON.stringify(payload));
  };

  const scoreList = useMemo(() => scores.map((s) => ({ ...s, score: Number(s.score) })).sort((a, b) => b.score - a.score), [scores]);
  const connectedTeams = useMemo(() => teams.filter((t) => t.locked), [teams]);
  const [correctSelection, setCorrectSelection] = useState<number[]>([]);

  const screenActive = useMemo(
    () => ({
      field: screenState === "field",
      rules: screenState === "rules",
      info: screenState === "info",
      intro: screenState === "intro",
    }),
    [screenState]
  );
  const currentGame = useMemo(
    () => games.find((g) => g.id === Number(form.gameId)),
    [games, form.gameId]
  );
  const connectionNotice =
    reconnecting || !connected
      ? reconnecting
        ? `Связь потеряна. Переподключаемся (${Math.min(reconnectAttempt || 1, MAX_RECONNECT_ATTEMPTS)}/${MAX_RECONNECT_ATTEMPTS})...`
        : wsError || "Нет соединения с сервером."
      : null;
  const showReconnectNotice =
    sessionReady && (!!connectionNotice || reconnecting || !connected);

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-amber-50 relative overflow-hidden host-page">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(255,255,255,0.08),transparent_25%),radial-gradient(circle_at_8%_35%,rgba(210,168,93,0.08),transparent_25%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
        </div>
        <main className="relative mx-auto flex min-h-screen max-w-5xl items-center justify_between px-8 py-12 gap-10">
          <div className="max-w-xl space-y-4">
            <BackLink />
            <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">Ведущий</p>
            <h1 className="text-5xl font-semibold leading-tight text-amber-50">Пульт управления</h1>
            <p className="text-amber-100/80">Вход по PIN игры. Без подключения управление недоступно.</p>
            {wsError ? <p className="text-sm text-red-200">{wsError}</p> : null}
          </div>
          <div className="w-full max-w-md rounded-2xl border border-amber-500/25 bg-white/5 p-6 shadow-[0_10px_50px_rgba(0,0,0,0.4)] backdrop-blur">
            <div className="space-y-3">
              <label className="text-sm text-amber-100/80">
                Игра
                <select
                  value={form.gameId}
                  onChange={(e) => setForm((f) => ({ ...f, gameId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
                >
                  <option value="">Выберите игру</option>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {new Date(g.gameDate).toLocaleString("ru-RU")} · {g.location}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="PIN игры"
                placeholder="901245"
                required
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
              />
              <PrimaryButton label="Войти как ведущий" type="button" onClick={() => connect()} disabled={connected} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 to-slate-900 text-amber-50 host-page">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(255,255,255,0.08),transparent_25%),radial-gradient(circle_at_8%_35%,rgba(210,168,93,0.08),transparent_25%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
      </div>

      {showReconnectNotice && connectionNotice ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-50 -translate-x-1/2 px-4">
          <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-amber-500/50 bg-black/80 px-4 py-3 text-sm text-amber-100 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <span className="text-lg">🔌</span>
            <div className="space-y-1">
              <p>{connectionNotice}</p>
              <button
                className="text-xs font-semibold text-amber-200 underline decoration-amber-400/60 decoration-dashed underline-offset-4"
                onClick={() => connect()}
                disabled={reconnecting}
              >
                Переподключиться
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="relative mx-auto max-w-6xl px-6 pb-16 pt-12 lg:px-10">
        <div className="flex items-center justify-between">
          <BackLink />
          <div className="flex flex-wrap items-center gap-3 justify-end">
            <div
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold shadow ${
                connected
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                  : "border-red-400/40 bg-red-500/10 text-red-100"
              }`}
            >
              <span className="text-base">{connected ? "🟢" : "🔴"}</span>
              <span>{connected ? "WS онлайн" : "WS нет соединения"}</span>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 shadow">
              <span className="text-base">🟢</span>
              <span>
                Подключено: {connectedTeams.length}/{teams.length || 0}
              </span>
            </div>
            {teamNotice ? (
              <div className="animate-[pulse_1.4s_ease-in-out_infinite] rounded-2xl border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-50 shadow">
                {teamNotice}
              </div>
            ) : null}
            <span className="px-2 py-1">
              <img src="/media/images/logo.png" alt="logo" className="h-10 w-auto" />
            </span>
          </div>
        </div>

        <header className="mt-6 space-y-3">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">Ведущий</p>
          <h1 className="text-4xl font-semibold leading-tight text-amber-50 lg:text-5xl">
            Пульт управления игрой
          </h1>
          <p className="max-w-3xl text-base text-amber-100/80">
            Быстрый спин, показ вопроса/медиа, таймеры 60/20 секунд, блиц-статус, сбор ответов и начисление очков.
          </p>
          {currentGame ? (
            <div className="inline-flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-white/5 px-4 py-3 text-sm text-amber-100/80 shadow">
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-50">
                {new Date(currentGame.gameDate).toLocaleString("ru-RU")}
              </span>
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-50">Локация: {currentGame.location}</span>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-100">PIN: {currentGame.pinCode}</span>
            </div>
          ) : null}
          {teams.length ? (
            <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/25 bg-white/5 px-4 py-2 text-xs text-amber-100/80 shadow">
              <span className="font-semibold text-amber-50">Команды:</span>
              {connectedTeams.length ? (
                connectedTeams.map((t) => (
                  <span key={t.id} className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-100 shadow-inner">
                    🟢 {t.name}
                  </span>
                ))
              ) : (
                <span className="text-amber-200/70">Пока никто не подключен</span>
              )}
            </div>
          ) : null}
        </header>

        <div className="mt-8 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <Panel title="Быстрые действия">
              <div className="space-y-4 text-sm text-amber-100/80">
                <div className="grid gap-2 sm:grid-cols-1">
                  <PrimaryButton
                    label="ℹ️ Инфо"
                    type="button"
                    onClick={() => send({ type: "host.show-info" })}
                    className="py-3 text-base w-full"
                  />
                  <PrimaryButton
                    label="📜 Правила"
                    type="button"
                    fullWidth
                    className={`py-3 text-base w-full ${screenActive.rules ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900" : ""}`}
                    onClick={() => send({ type: "host.show-rules" })}
                  />
                  <PrimaryButton
                    label="🎬 Заставка"
                    type="button"
                    fullWidth
                    className={`py-3 text-base w-full ${screenActive.intro ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900" : ""}`}
                    onClick={() => send({ type: "host.start-intro" })}
                  />
                  <PrimaryButton
                    label="🧭 Показать поле"
                    type="button"
                    fullWidth
                    className={`py-3 text-base w-full ${screenActive.field ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900" : ""}`}
                    onClick={() => send({ type: "host.show-field" })}
                  />
                  <PrimaryButton
                    label="🎯 Запустить спин"
                    type="button"
                    fullWidth
                    className={`py-3 text-base w-full ${spinActive ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900" : ""}`}
                    onClick={() => send({ type: "host.spin" })}
                  />
                  <PrimaryButton
                    label="⛔ Завершить игру"
                    type="button"
                    className="py-3 text-base w-full bg-red-900/40 hover:bg-red-900/60 border-red-400/40"
                    onClick={() => {
                      if (window.confirm("Завершить игру? Это остановит партию.")) {
                        send({ type: "host.finish-game" });
                      }
                    }}
                  />
                </div>
              </div>
            </Panel>

            <Panel title="Текущий вопрос">
              {sector ? (
                <div className="space-y-4 text-sm text-amber-100/80">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xl font-semibold text-amber-50">Сектор №{sector.sectorNumber}</p>
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em]">
                          {question?.kind ? (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-100">{question.kind}</span>
                          ) : null}
                          {question?.isBlackBox ? (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-100">Черный ящик</span>
                          ) : null}
                          {blitzIndex !== null ? (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-100">
                              Блиц {blitzIndex + 1}
                              {blitzTotal ? ` / ${blitzTotal}` : ""}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right">
                        {timer ? (
                          <p className="text-lg font-semibold text-amber-50">
                            Таймер: {Math.ceil(timer.remaining / 1000).toString().padStart(2, "0")} сек
                          </p>
                        ) : (
                          <p className="text-xs text-amber-200/70">Таймер не запущен</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {question?.isBlackBox ? (
                        <PrimaryButton
                          label={blackBoxMusicOn ? "🎵 Стоп ящик" : "🎵 Музыка ящика"}
                          type="button"
                          fullWidth={false}
                          className={`py-3 px-4 text-base ${blackBoxMusicOn ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900" : ""}`}
                          onClick={() => {
                            const next = !blackBoxMusicOn;
                            setBlackBoxMusicOn(next);
                            send({ type: "host.blackbox-music", payload: { play: next, path: "/media/sfx/black_box.mp3" } });
                          }}
                        />
                      ) : null}
                      <div className="space-y-2 rounded-xl border border-amber-500/30 bg-white/5 px-3 py-2 text-xs text-amber-200/80 min-w-[220px]">
                        <div className="flex items-center gap-2 font-semibold text-amber-50">
                          🎬 <span>Медиа</span>
                        </div>
                        <div className="grid gap-2 grid-cols-2">
                          <PrimaryButton
                            label="Показать медиа"
                            type="button"
                            fullWidth
                            className="py-2 text-sm"
                            onClick={() => {
                              send({ type: "host.play-media", payload: { kind: "question" } });
                            }}
                          />
                          <PrimaryButton
                            label="Скрыть медиа"
                            type="button"
                            fullWidth
                            className="py-2 text-sm"
                            onClick={() => send({ type: "host.hide-media" })}
                          />
                        </div>
                      </div>
                      <PrimaryButton
                        label="📜 Показать вопрос"
                        type="button"
                        fullWidth={false}
                        onClick={() => send({ type: "host.reveal-question", payload: { showMedia: true } })}
                        className="py-3 px-4 text-base"
                      />
                      <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-white/5 px-3 py-2 text-xs text-amber-200/80 min-w-[220px]">
                        <div className="flex items-center gap-2 font-semibold text-amber-50">
                          ⏱️ <span>Таймер</span>
                        </div>
                        <div className="grid gap-2 grid-cols-3">
                          <PrimaryButton
                            label="60 сек"
                            type="button"
                            fullWidth
                            className="py-2 text-sm"
                            onClick={() => send({ type: "host.start-timer", payload: { durationSeconds: 60 } })}
                          />
                          <PrimaryButton
                            label="20 сек"
                            type="button"
                            fullWidth
                            className="py-2 text-sm"
                            onClick={() => send({ type: "host.start-timer", payload: { durationSeconds: 20 } })}
                          />
                          <button
                            className="rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-xs font-semibold text-amber-50 transition hover:border-amber-300"
                            onClick={() => send({ type: "host.stop-timer" })}
                          >
                            Стоп
                          </button>
                        </div>
                      </div>
                      <PrimaryButton
                        label="💡 Ответ"
                        type="button"
                        fullWidth={false}
                        className="py-4 px-5 text-lg font-semibold"
                        onClick={() => {
                          if (!window.confirm("Показать ответ на экране?")) return;
                          send({ type: "host.reveal-answer" });
                          setAnswerVisible(true);
                        }}
                      />
                      <button
                        className="rounded-lg border border-amber-500/30 bg-black/30 px-4 py-3 text-xs font-semibold text-amber-50 transition hover:border-amber-300"
                        onClick={() => {
                          send({ type: "host.hide-answer" });
                          setAnswerVisible(false);
                        }}
                      >
                        Скрыть ответ
                      </button>
                    </div>
                  </div>

                  {question?.questionFullText ? (
                    <div className="rounded-xl border border-amber-500/30 bg-white/5 p-4 shadow-inner">
                      <p className="text-lg text-amber-50">{question.questionFullText}</p>
                      {question.questionText ? (
                        <p className="mt-2 text-sm text-amber-100/80">Короткий текст: {question.questionText}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {question?.answerText ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/80">Ответ</p>
                      <p className="text-xl font-semibold text-emerald-50">{question.answerText}</p>
                      {question.explanationText ? <p className="mt-1 text-emerald-100/80">Пояснение: {question.explanationText}</p> : null}
                      <p className="mt-1 text-xs text-emerald-100/70">{answerVisible ? "Ответ показан на экране" : "Ответ скрыт на экране"}</p>
                    </div>
                  ) : null}

                  {(question?.mediaQuestionPath || question?.mediaExplPath) ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {(() => {
                        const src = buildMediaUrl(question?.mediaQuestionPath);
                        if (!src) return null;
                        if (/\.(mp4|webm|mov)$/i.test(src)) {
                          return (
                            <div className="rounded-lg border border-amber-500/30 bg-black/20 p-3">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">Медиа вопроса</p>
                              <video src={src} className="mt-2 w-full rounded-md" controls />
                            </div>
                          );
                        }
                        if (/\.(mp3|wav|ogg|aac|m4a)$/i.test(src)) {
                          return (
                            <div className="rounded-lg border border-amber-500/30 bg-black/20 p-3">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">Медиа вопроса</p>
                              <audio src={src} className="mt-2 w-full" controls />
                            </div>
                          );
                        }
                        return (
                          <div className="rounded-lg border border-amber-500/30 bg-black/20 p-3">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">Медиа вопроса</p>
                            <img src={src} alt="media question" className="mt-2 w-full rounded-md" />
                          </div>
                        );
                      })()}
                      {(() => {
                        const src = buildMediaUrl(question?.mediaExplPath);
                        if (!src) return null;
                        if (/\.(mp4|webm|mov)$/i.test(src)) {
                          return (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">Медиа ответа</p>
                              <video src={src} className="mt-2 w-full rounded-md" controls />
                            </div>
                          );
                        }
                        if (/\.(mp3|wav|ogg|aac|m4a)$/i.test(src)) {
                          return (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                              <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">Медиа ответа</p>
                              <audio src={src} className="mt-2 w-full" controls />
                            </div>
                          );
                        }
                        return (
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/70">Медиа ответа</p>
                            <img src={src} alt="media answer" className="mt-2 w-full rounded-md" />
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}

                  {blitzIndex !== null ? (
                    <div className="space-y-2 rounded-xl border border-amber-500/30 bg-white/5 p-3 text-xs text-amber-200/80">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">
                        Блиц ход {blitzIndex + 1}
                        {blitzTotal ? ` / ${blitzTotal}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {blitzActiveTeams.length === 0 ? <span className="text-amber-100/70">Активных нет</span> : null}
                        {blitzActiveTeams.map((id) => (
                          <span key={id} className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-emerald-100">
                            {teams.find((t) => t.id === id)?.name || id}
                          </span>
                        ))}
                      </div>
                      {blitzEliminated.length ? (
                        <div className="flex flex-wrap gap-2 text-red-200/80">
                          {blitzEliminated.map((id) => (
                            <span key={id} className="rounded-full border border-red-400/40 bg-red-500/10 px-2 py-1 line-through">
                              {teams.find((t) => t.id === id)?.name || id}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {question?.authorName ? (
                    <p className="text-xs text-amber-200/70">
                      Автор: {question.authorName} {question.authorCity ? `(${question.authorCity})` : ""}
                    </p>
                  ) : null}

                  {answers.length ? (
                    <div className="space-y-1 rounded-lg border border-amber-500/30 bg-white/5 p-3 text-xs text-amber-100/80">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">Ответы</p>
                      {answers.map((a) => (
                        <p key={a.teamId} className="flex justify-between gap-3">
                          <span className="truncate">{teams.find((t) => t.id === a.teamId)?.name || `Команда ${a.teamId}`}</span>
                          <span className="truncate text-amber-50">{a.answerText}</span>
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-3 rounded-xl border border-amber-500/30 bg-white/5 p-4">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">Отметить правильные</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {teams.map((t) => {
                        const active = correctSelection.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            className={`min-h-[70px] rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                              active ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100" : "border-amber-500/30 bg-black/30 text-amber-100/80"
                            }`}
                            onClick={() =>
                              setCorrectSelection((prev) =>
                                prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                              )
                            }
                          >
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PrimaryButton
                        label="Зачесть выбранных"
                        onClick={() => {
                          send({ type: "host.resolve-answer", payload: { correctTeams: correctSelection } });
                          setCorrectSelection([]);
                        }}
                        className="flex-1"
                      />
                      <button
                        className="min-h-[70px] flex-1 rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-xs font-semibold text-amber-100/80"
                        onClick={() => setCorrectSelection([])}
                      >
                        Сбросить выбор
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-100/70">Сектор не выбран.</p>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Счёт">
              {scoreList.length === 0 ? (
                <p className="text-sm text-amber-100/70">Очков нет.</p>
              ) : (
                <div className="space-y-2">
                  {scoreList.map((s) => (
                    <div key={s.teamId} className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-white/5 px-3 py-2">
                      <span>{teams.find((t) => t.id === s.teamId)?.name || `Команда ${s.teamId}`}</span>
                      <span className="text-lg font-semibold text-amber-50">{s.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Начисление баллов">
              <div className="space-y-2 text-sm text-amber-100/80">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Выберите команду</p>
                <div className="flex flex-wrap gap-2">
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      className="rounded-lg border border-amber-500/30 bg-black/30 px-4 py-2 text-sm font-semibold text-amber-50 hover:border-amber-300 transition"
                      onClick={() => setAwardModal({ teamId: t.id })}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Команды (занятость)">
              <div className="space-y-2 text-sm text-amber-100/80">
                {teams.length === 0 ? <p>Нет команд.</p> : null}
                {teams.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-white/5 px-3 py-2"
                  >
                    <span>{t.name}</span>
                    <div className="flex items-center gap-2">
                      {t.locked ? <span className="text-xs text-red-300">занято</span> : <span className="text-xs text-emerald-300">свободно</span>}
                      <button
                        className="text-xs text-amber-200 hover:text-amber-50"
                        onClick={() => gamesApi.releaseTeam(form.gameId || 0, t.id)}
                      >
                        Освободить
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => {
                    if (!form.gameId) return;
                    gamesApi
                      .getTeamsStatus(form.gameId)
                      .then(setTeams)
                      .catch(() => {});
                  }}
                  className="text-xs text-amber-200 underline-offset-2 hover:text-amber-50 hover:underline"
                >
                  Обновить список команд
                </button>
              </div>
            </Panel>
          </div>
        </div>
      </main>

      {awardModal.teamId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-amber-500/30 bg-slate-900/90 p-6 shadow-xl">
            <p className="text-lg font-semibold text-amber-50">Начислить балл</p>
            <p className="text-sm text-amber-100/80">
              Команда: {teams.find((t) => t.id === awardModal.teamId)?.name || awardModal.teamId}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <PrimaryButton
                label="+1"
                onClick={() => {
                  send({ type: "host.award-score", payload: { teamId: Number(awardModal.teamId), points: 1 } });
                  setAwardModal({ teamId: null });
                }}
              />
              <button
                className="rounded-lg border border-red-400/50 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 shadow hover:border-red-300 transition"
                onClick={() => {
                  send({ type: "host.award-score", payload: { teamId: Number(awardModal.teamId), points: -1 } });
                  setAwardModal({ teamId: null });
                }}
              >
                -1
              </button>
            </div>
            <button className="text-xs text-amber-200 hover:text-amber-50" onClick={() => setAwardModal({ teamId: null })}>
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

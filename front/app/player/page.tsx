"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { WS_URL, gamesApi } from "../lib/api";
import { BackLink, Field, Panel, PrimaryButton } from "../components/ui";

const MAX_RECONNECT_ATTEMPTS = 7;

type Game = { id: number; gameDate: string; location: string; pinCode: string };
type TeamStatus = { id: number; name: string; locked?: boolean };
type Question = { id: number; questionText?: string; questionFullText?: string };

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

const normalizeTeams = (list: any): TeamStatus[] =>
  (Array.isArray(list) ? list : [])
    .map((t) => {
      const id = toId(t?.id);
      if (id === null) return null;
      return { id, name: t.name ?? `Команда ${id}`, locked: Boolean(t.locked) };
    })
    .filter((t): t is TeamStatus => Boolean(t));

const normalizeQuestion = (q: any): Question | null => {
  if (!q) return null;
  const id = toId(q.id);
  if (id === null) return null;
  return { ...q, id };
};

export default function PlayerPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<TeamStatus[]>([]);
  const [form, setForm] = useState({ gameId: "", pin: "", name: "", teamId: "" });
  const [connected, setConnected] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [wsError, setWsError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("Ожидаем вопрос");
  const [timer, setTimer] = useState<number | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sessionReadyRef = useRef(false);

  useEffect(() => {
    gamesApi
      .getActiveGames()
      .then((data) => setGames(normalizeGames(data)))
      .catch(() => setGames([]));
  }, []);

  useEffect(() => {
    if (!form.gameId) return;
    gamesApi
      .getTeamsStatus(form.gameId)
      .then((data) => setTeams(normalizeTeams(data)))
      .catch(() => {});
  }, [form.gameId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((t) => (t ? Math.max(0, t - 1) : null));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sessionReadyRef.current = false;
    };
  }, []);

  const connect = (isRetry = false) => {
    if (!form.gameId || !form.pin || !form.teamId) {
      setWsError("Укажите игру, PIN и команду");
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
      ws.send(
        JSON.stringify({
          type: "session.connect",
          payload: {
            role: "player",
            gameId: Number(form.gameId),
            pinCode: form.pin,
            teamId: Number(form.teamId),
            displayName: form.name,
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
        setStatus("Подключено. Ждём вопрос.");
      }
      if (msg.type === "question.revealed") {
        setStatus("Вопрос открыт. Пишите ответ.");
        setQuestion(normalizeQuestion(msg.payload));
      }
      if (msg.type === "timer.started") setTimer(Math.ceil(msg.payload.duration || 0));
      if (msg.type === "timer.ticked") setTimer(Math.ceil(msg.payload.remaining / 1000));
      if (msg.type === "timer.finished") {
        setStatus("Время вышло.");
        setTimer(null);
      }
      if (msg.type === "question.closed") {
        setStatus("Вопрос закрыт. Ждём следующий.");
        setQuestion(null);
      }
      if (msg.type === "answer.submitted") setStatus("Ответ отправлен");
      if (msg.type === "error") setWsError(msg.error || "ws error");
      if (msg.type === "game.finished") setStatus("Игра завершена");
      if (msg.type === "team.locked") {
        const teamId = toId(msg.payload.teamId);
        if (teamId !== null) setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, locked: true } : t)));
      }
      if (msg.type === "team.unlocked") {
        const teamId = toId(msg.payload.teamId);
        if (teamId !== null) setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, locked: false } : t)));
      }
    };
    ws.onerror = () => setWsError((prev) => prev || "ws error");
    ws.onclose = () => {
      setConnected(false);
      if (sessionReadyRef.current) setStatus("Связь потеряна. Пытаемся переподключиться...");
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

  const sendAnswer = () => {
    if (!socketRef.current || socketRef.current.readyState !== 1) return;
    if (timer === null || timer <= 0) {
      setStatus("Время вышло");
      return;
    }
    socketRef.current.send(JSON.stringify({ type: "player.answer", payload: { answerText: answer } }));
    setStatus("Ответ отправлен");
  };

  const disableSend = useMemo(
    () => !connected || !answer.trim() || timer === null || timer <= 0,
    [connected, answer, timer]
  );
  const connectionNotice =
    reconnecting || !connected
      ? reconnecting
        ? `Связь потеряна. Переподключаемся (${Math.min(reconnectAttempt || 1, MAX_RECONNECT_ATTEMPTS)}/${MAX_RECONNECT_ATTEMPTS})...`
        : wsError || "Нет соединения с сервером."
      : null;
  const showReconnectNotice =
    sessionReady && (!!connectionNotice || reconnecting || !connected);

  return (
    <div className="relative overflow-hidden">
      <img
        src="/media/images/logo.png"
        alt="logo"
        className="pointer-events-none absolute right-4 top-4 h-16 md:h-20 w-auto opacity-90 drop-shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
      />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(210,168,93,0.09),transparent_25%),radial-gradient(circle_at_90%_30%,rgba(255,255,255,0.06),transparent_25%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
      </div>

      {showReconnectNotice && connectionNotice ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-50 -translate-x-1/2 px-4">
          <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-amber-500/50 bg-black/80 px-4 py-3 text-sm text-amber-100 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur">
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

      <main className="relative mx-auto max-w-3xl px-6 pb-16 pt-12 lg:px-10">
        <BackLink />

        <header className="mt-6 space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">Игрок</p>
          <h1 className="text-4xl font-semibold leading-tight text-amber-50 lg:text-5xl">Что? Где? Когда?</h1>
          {wsError ? <p className="text-sm text-red-200">{wsError}</p> : null}
        </header>

        {!sessionReady ? (
          <div className="mt-8">
            <Panel title="Подключение игрока">
              <div className="space-y-3">
                <label className="text-sm text-amber-100/80">
                  Игра
                  <select
                    value={form.gameId}
                    onChange={(e) => setForm((f) => ({ ...f, gameId: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
                  >
                    <option value="">Выберите игру</option>
                    {(Array.isArray(games) ? games : []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {new Date(g.gameDate).toLocaleString("ru-RU")} · {g.location}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="PIN игры"
                  placeholder="623715"
                  required
                  value={form.pin}
                  onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                />
                <Field
                  label="Имя"
                  placeholder="Ник или имя"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <select
                  value={form.teamId}
                  onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}
                  className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
                >
                  <option value="">Выберите команду</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.locked}>
                      {t.name} {t.locked ? "(занято)" : ""}
                    </option>
                  ))}
                </select>
                <PrimaryButton label="Войти в игру" type="button" onClick={() => connect()} disabled={connected} />
              </div>
            </Panel>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <Panel title="Вопрос и ответ">
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-500/30 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">Статус</p>
                  <p className="text-base text-amber-100/90">{status}</p>
                  <p className="mt-2 text-xs text-amber-200/70">Можно отвечать только пока идёт таймер.</p>
                </div>
                <div className="w-full rounded-2xl border border-amber-500/30 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-amber-200/70">Вопрос</p>
                    <p className="mt-3 text-lg leading-relaxed text-amber-50">
                      {question?.questionText || question?.questionFullText || "Вопрос ещё не открыт"}
                    </p>
                  </div>
                <div className="space-y-3">
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center min-w-[160px]">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-200/80">Таймер</p>
                      {timer !== null ? (
                        <p className="text-3xl font-bold text-emerald-50 mt-1">{timer.toString().padStart(2, "0")} сек</p>
                      ) : (
                        <p className="text-xs text-emerald-200/80 mt-1">Не запущен</p>
                      )}
                    </div>
                  </div>
                </div>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Ваш ответ"
                  className="w-full rounded-lg border border-amber-500/30 bg-black/30 px-3 py-2 text-sm text-amber-50"
                  rows={3}
                />
                <div className="space-y-2">
                  <PrimaryButton label="Отправить ответ" type="button" onClick={sendAnswer} disabled={disableSend} />
                  {disableSend && (timer === null || timer <= 0) ? (
                    <p className="text-xs text-amber-200/70">Кнопка активируется, когда ведущий запустит таймер.</p>
                  ) : null}
                </div>
              </div>
            </Panel>
          </div>
        )}
      </main>
    </div>
  );
}

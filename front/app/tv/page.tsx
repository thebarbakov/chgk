"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MEDIA_BASE_URL, WS_URL, gamesApi } from "../lib/api";
import { Field, PrimaryButton } from "../components/ui";

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
type TeamRow = { id: number; name: string; locked?: boolean };
type AnswerPreview = { teamId: number; answerText?: string };
type SectorWithQuestion = {
  id: number;
  questionId: number;
  sectorNumber: number;
  isUsed: boolean;
  question?: Question;
};

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

const normalizeTeams = (list: any): TeamRow[] =>
  (Array.isArray(list) ? list : [])
    .map((t) => {
      const id = toId(t?.id);
      if (id === null) return null;
      return { id, name: t.name ?? `Команда ${id}`, locked: Boolean(t.locked) };
    })
    .filter((t): t is TeamRow => Boolean(t));

const normalizeScores = (list: any): ScoreRow[] =>
  (Array.isArray(list) ? list : [])
    .map((s) => {
      const teamId = toId(s?.teamId);
      if (teamId === null) return null;
      const score = Number(s?.score);
      return { teamId, score: Number.isFinite(score) ? score : 0 };
    })
    .filter((s): s is ScoreRow => Boolean(s));

const normalizeAnswers = (list: any): AnswerPreview[] =>
  (Array.isArray(list) ? list : [])
    .map((a) => {
      const teamId = toId(a?.teamId);
      if (teamId === null) return null;
      return { teamId, answerText: a?.answerText };
    })
    .filter((a): a is AnswerPreview => Boolean(a));

const normalizeIdArray = (list: any): number[] =>
  (Array.isArray(list) ? list : [])
    .map((v) => toId(v))
    .filter((v): v is number => v !== null);

const normalizeQuestion = (q: any): Question | undefined => {
  if (!q) return undefined;
  const id = toId(q.id);
  if (id === null) return undefined;
  const seriesId = q.seriesId === undefined || q.seriesId === null ? undefined : toId(q.seriesId) ?? undefined;
  return { ...q, id, seriesId } as Question;
};

const normalizeSectors = (list: any): SectorWithQuestion[] =>
  (Array.isArray(list) ? list : [])
    .map((s) => {
      const id = toId(s?.id);
      const questionId = toId(s?.questionId);
      const sectorNumber = toId(s?.sectorNumber);
      if (id === null || questionId === null || sectorNumber === null) return null;
      return {
        id,
        questionId,
        sectorNumber,
        isUsed: Boolean(s?.isUsed),
        question: normalizeQuestion(s?.question),
      };
    })
    .filter((s): s is SectorWithQuestion => Boolean(s));

export default function TvPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [form, setForm] = useState({ gameId: "", pin: "" });
  const [connected, setConnected] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [wsError, setWsError] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [timer, setTimer] = useState<{
    remaining: number;
    endsAt: number;
  } | null>(null);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [screen, setScreen] = useState<
    "info" | "rules" | "field" | "question" | "win" | "intro"
  >("info");
  const socketRef = useRef<WebSocket | null>(null);
  const [media, setMedia] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<string | null>(null);
  const [answerVisible, setAnswerVisible] = useState(false);
  const [answerMedia, setAnswerMedia] = useState<string | null>(null);
  const [blackBoxMusicOn, setBlackBoxMusicOn] = useState(false);
  const [blackBoxMusicSrc, setBlackBoxMusicSrc] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [activeSector, setActiveSector] = useState<number | null>(null);
  const [pointerAngle, setPointerAngle] = useState(0);
  const [blitzIndex, setBlitzIndex] = useState<number | null>(null);
  const [blitzTotal, setBlitzTotal] = useState<number | null>(null);
  const [blitzActiveTeams, setBlitzActiveTeams] = useState<number[]>([]);
  const [blitzEliminated, setBlitzEliminated] = useState<number[]>([]);
  const [answers, setAnswers] = useState<AnswerPreview[]>([]);
  const [winners, setWinners] = useState<number[]>([]);
  const [envelopeFlipped, setEnvelopeFlipped] = useState(false);
  const [envelopeRevealing, setEnvelopeRevealing] = useState(false);
  const [postSpinPause, setPostSpinPause] = useState(false);
  const [sectors, setSectors] = useState<SectorWithQuestion[]>([]);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const answerMediaRef = useRef<HTMLMediaElement | null>(null);
  const globalMediaRef = useRef<HTMLMediaElement | null>(null);
  const blackBoxAudioRef = useRef<HTMLAudioElement | null>(null);
  const skipQuestionMediaRef = useRef(false);
  const [envelopeRadius, setEnvelopeRadius] = useState(0);
  const circleRef = useRef<HTMLDivElement | null>(null);
  const introVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeSectorRef = useRef<number | null>(null);
  const sectorsRef = useRef<SectorWithQuestion[]>([]);
  const sectorCountRef = useRef(12);
  const postSpinPauseRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sessionReadyRef = useRef(false);
  const audioRefs = {
    gongStart: useRef<HTMLAudioElement | null>(null),
    gongEnd: useRef<HTMLAudioElement | null>(null),
    beep10: useRef<HTMLAudioElement | null>(null),
    spinSong: useRef<HTMLAudioElement | null>(null),
  };
  const pointerSpinRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const envelopeRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const postSpinPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingEnvelopeReveal = useRef<number | null>(null);
  const spinStartRef = useRef<number | null>(null);
  const spinStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerTurnsRef = useRef(0);
  const pointerHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setTimer((t) =>
        t ? { ...t, remaining: Math.max(0, t.endsAt - Date.now()) } : null
      );
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (pointerSpinRef.current) clearInterval(pointerSpinRef.current);
      if (envelopeRevealTimer.current)
        clearTimeout(envelopeRevealTimer.current);
      if (postSpinPauseTimer.current) clearTimeout(postSpinPauseTimer.current);
      if (pointerHighlightTimer.current) clearTimeout(pointerHighlightTimer.current);
      if (spinStopTimer.current) clearTimeout(spinStopTimer.current);
      if (blackBoxAudioRef.current) {
        blackBoxAudioRef.current.pause();
        blackBoxAudioRef.current.currentTime = 0;
      }
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      sessionReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeSectorRef.current = activeSector;
  }, [activeSector]);

  useEffect(() => {
    postSpinPauseRef.current = postSpinPause;
  }, [postSpinPause]);

  useEffect(() => {
    if (!circleRef.current) return;
    const updateRadius = () => {
      const rect = circleRef.current?.getBoundingClientRect();
      if (!rect) return;
      setEnvelopeRadius(Math.min(rect.width, rect.height) * 1);
    };
    updateRadius();
    const ro = new ResizeObserver(updateRadius);
    ro.observe(circleRef.current);
    window.addEventListener("resize", updateRadius);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateRadius);
    };
  }, []);

  const connect = (isRetry = false) => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (!isRetry) {
      reconnectAttemptsRef.current = 0;
      setReconnectAttempt(0);
      setReconnecting(false);
      setWsError(null);
    }
    if (!form.gameId || !form.pin) {
      setWsError("Укажите игру и PIN");
      return;
    }
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "session.connect",
          payload: {
            role: "tv",
            gameId: Number(form.gameId),
            pinCode: form.pin,
          },
        })
      );
      if (form.gameId) {
        gamesApi
          .getSectors(form.gameId)
          .then((data) => setSectors(normalizeSectors(data)))
          .catch(() => {});
      }
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
      }
      if (msg.type === "spin.started") {
        setScreen("field");
        setSpinning(true);
        spinStartRef.current = Date.now();
        if (spinStopTimer.current) clearTimeout(spinStopTimer.current);
        setPointerAngle(0);
        setAnswerVisible(false);
        setAnswerMedia(null);
        const spinAudio = audioRefs.spinSong.current;
        if (spinAudio) {
          spinAudio.currentTime = 0;
          spinAudio.play().catch(() => {});
        }
        if (pointerHighlightTimer.current) clearTimeout(pointerHighlightTimer.current);
        pointerTurnsRef.current = 0;
        activeSectorRef.current = null;
        pendingEnvelopeReveal.current = null;
        postSpinPauseRef.current = false;
        setPostSpinPause(false);
        if (postSpinPauseTimer.current)
          clearTimeout(postSpinPauseTimer.current);
        if (envelopeRevealTimer.current)
          clearTimeout(envelopeRevealTimer.current);
        startPointerSpin();
        setActiveSector(null);
        setEnvelopeFlipped(false);
        setEnvelopeRevealing(false);
        setQuestion(null);
        setAnswers([]);
        setMedia(null);
        setMediaKind(null);
        setBlackBoxMusicOn(false);
        setBlackBoxMusicSrc(null);
        skipQuestionMediaRef.current = false;
        setBlitzIndex(null);
        setBlitzTotal(null);
        setBlitzActiveTeams([]);
        setBlitzEliminated([]);
      }
      if (msg.type === "spin.stopped") {
        const elapsed = spinStartRef.current
          ? Date.now() - spinStartRef.current
          : 0;
        const delay = Math.max(0, minSpinDurationMs - elapsed);
        if (spinStopTimer.current) clearTimeout(spinStopTimer.current);
        spinStopTimer.current = setTimeout(() => {
          spinStartRef.current = null;
          setSpinning(false);
          const spinAudio = audioRefs.spinSong.current;
          if (spinAudio) {
            spinAudio.pause();
            spinAudio.currentTime = 0;
          }
          if (pointerHighlightTimer.current) clearTimeout(pointerHighlightTimer.current);
          const stoppedSectorNumber = toId(msg.payload?.sector?.sectorNumber);
          if (stoppedSectorNumber !== null) {
            settlePointer(stoppedSectorNumber);
            highlightSector(stoppedSectorNumber, 1100);
          }
          setAnswerVisible(false);
          setAnswerMedia(null);
          setEnvelopeFlipped(false);
          setEnvelopeRevealing(false);
          // Hold the wheel view for a moment so the pointer stop is visible.
          setPostSpinPause(true);
        postSpinPauseRef.current = true;
        if (postSpinPauseTimer.current)
          clearTimeout(postSpinPauseTimer.current);
          postSpinPauseTimer.current = setTimeout(() => {
            postSpinPauseRef.current = false;
          setPostSpinPause(false);
          setScreen("question");
          if (pendingEnvelopeReveal.current !== null) {
            runEnvelopeReveal(pendingEnvelopeReveal.current);
            pendingEnvelopeReveal.current = null;
          } else {
            animateEnvelopeIntro();
          }
        }, 3000);
        setBlitzActiveTeams(normalizeIdArray(msg.payload.activeTeams));
        setBlitzEliminated(normalizeIdArray(msg.payload.eliminatedTeams));
        const total = toId(msg.payload?.blitzTotal);
        setBlitzTotal(total ?? 3);
        setSectors((prev) => {
            const updated = normalizeSectors([
              { ...(msg.payload?.sector || {}), question: msg.payload?.question },
            ])[0];
            if (!updated) return prev;
            const filtered = prev.filter(
              (s) =>
                s.id !== updated.id &&
                s.sectorNumber !== updated.sectorNumber &&
                s.questionId !== updated.questionId
            );
            return [...filtered, updated].sort(
              (a, b) => a.sectorNumber - b.sectorNumber
            );
          });
          if (
            msg.payload.question?.kind === "blitz" ||
            msg.payload.question?.kind === "super_blitz"
          ) {
            setBlitzIndex(0);
          } else {
            setBlitzIndex(null);
          }
        }, delay);
      }
      if (msg.type === "question.revealed") {
        const sectorNo = resolveSectorNumber(msg.payload);
        if (sectorNo) {
          settlePointer(sectorNo);
          highlightSector(sectorNo, 1100);
        }
        setAnswerVisible(false);
        setAnswerMedia(null);
        setQuestion(normalizeQuestion(msg.payload) ?? null);
        if (!postSpinPauseRef.current) setScreen("question");
        triggerEnvelopeReveal(sectorNo);
        if (
          msg.payload?.kind === "blitz" ||
          msg.payload?.kind === "super_blitz"
        ) {
          setBlitzIndex((prev) => (prev === null ? 0 : prev));
          const payloadTotal = toId((msg.payload as any)?.blitzTotal);
          setBlitzTotal((prev) => (prev !== null ? prev : payloadTotal ?? 3));
        }
      }
      if (msg.type === "blitz.next") {
        const sectorNo = resolveSectorNumber(msg.payload);
        if (sectorNo) {
          settlePointer(sectorNo);
          highlightSector(sectorNo, 1100);
        }
        setEnvelopeFlipped(false);
        setEnvelopeRevealing(false);
        setAnswerVisible(false);
        setAnswerMedia(null);
        setQuestion(normalizeQuestion(msg.payload.question) ?? null);
        setBlitzIndex(toId(msg.payload.index) ?? null);
        setBlitzTotal(toId(msg.payload?.blitzTotal) ?? blitzTotal ?? 3);
        if (msg.payload?.activeTeams)
          setBlitzActiveTeams(normalizeIdArray(msg.payload.activeTeams));
        if (msg.payload?.eliminatedTeams)
          setBlitzEliminated(normalizeIdArray(msg.payload.eliminatedTeams));
        setScreen("question");
      }
      if (msg.type === "media.play") {
        if ((msg.payload?.kind === "question" || !msg.payload?.kind) && skipQuestionMediaRef.current) {
          skipQuestionMediaRef.current = false;
          return;
        }
        setMedia(buildMediaUrl(msg.payload.path));
        setMediaKind(msg.payload.kind || null);
        if (msg.payload.kind === "intro") {
          if (postSpinPauseTimer.current)
            clearTimeout(postSpinPauseTimer.current);
          postSpinPauseRef.current = false;
          setPostSpinPause(false);
          setSpinning(false);
          setScreen("intro");
        }
      }
      if (msg.type === "media.stop") {
        mediaRef.current?.pause();
        answerMediaRef.current?.pause();
        globalMediaRef.current?.pause();
        setMedia(null);
        setMediaKind(null);
        if (screen !== "question" || !envelopeFlipped) {
          skipQuestionMediaRef.current = true;
        }
      }
      if (msg.type === "blackbox.music") {
        const play = Boolean(msg.payload?.play);
        const path = msg.payload?.path ? msg.payload.path : null;
        console.log(msg.payload.path)
        if (path) setBlackBoxMusicSrc(path);
        setBlackBoxMusicOn(play);
        if (!play && blackBoxAudioRef.current) {
          blackBoxAudioRef.current.pause();
          blackBoxAudioRef.current.currentTime = 0;
        }
      }
      if (msg.type === "timer.started") {
        const remaining = msg.payload.duration * 1000;
        setTimer(
          remaining > 0 ? { remaining, endsAt: msg.payload.endsAt } : null
        );
      }
      if (msg.type === "timer.ticked") {
        const remaining = msg.payload.remaining;
        setTimer(
          remaining > 0 ? { remaining, endsAt: Date.now() + remaining } : null
        );
      }
      if (msg.type === "timer.finished") setTimer(null);
      if (msg.type === "score.updated") setScores(normalizeScores(msg.payload));
      if (msg.type === "answer.submitted") {
        setAnswers((prev) => {
          const teamId = toId(msg.payload.teamId);
          if (teamId === null) return prev;
          const existing = prev.find((a) => a.teamId === teamId);
          if (existing) {
            return prev.map((a) =>
              a.teamId === teamId
                ? { ...a, answerText: msg.payload.answerText }
                : a
            );
          }
          return [
            ...prev,
            { teamId, answerText: msg.payload.answerText },
          ];
        });
      }
      if (msg.type === "game.finished") {
        if (msg.payload?.scores) setScores(normalizeScores(msg.payload.scores));
        if (msg.payload?.winners) setWinners(normalizeIdArray(msg.payload.winners));
        setAnswerVisible(false);
        setAnswerMedia(null);
        setScreen("win");
      }
      if (msg.type === "answer.revealed") {
        const merged = msg.payload || question;
        setAnswerVisible(true);
        setQuestion((prev) =>
          prev
            ? {
                ...prev,
                answerText: merged?.answerText ?? prev.answerText,
                explanationText:
                  merged?.explanationText ?? prev.explanationText,
                mediaExplPath: merged?.mediaExplPath ?? prev.mediaExplPath,
              }
            : merged
        );
        setAnswerMedia(buildMediaUrl(merged?.mediaExplPath));
      }
      if (msg.type === "answer.hidden") {
        setAnswerVisible(false);
        setAnswerMedia(null);
      }
      if (msg.type === "question.closed" && msg.payload?.sectorId) {
        if (pointerHighlightTimer.current) clearTimeout(pointerHighlightTimer.current);
        const closedSectorId = toId(msg.payload.sectorId);
        if (closedSectorId !== null) {
          setSectors((prev) =>
            prev.map((s) => (s.id === closedSectorId ? { ...s, isUsed: true } : s))
          );
        }
        setActiveSector(null);
        activeSectorRef.current = null;
        setEnvelopeFlipped(false);
        setAnswerVisible(false);
        setAnswerMedia(null);
        skipQuestionMediaRef.current = false;
        setBlackBoxMusicOn(false);
        setBlackBoxMusicSrc(null);
        setBlitzActiveTeams([]);
        setBlitzEliminated([]);
        setBlitzIndex(null);
        setBlitzTotal(null);
        setScreen("field");
        skipQuestionMediaRef.current = false;
      }
      if (msg.type === "blitz.reset") {
        setBlitzActiveTeams([]);
        setBlitzEliminated([]);
        setBlitzIndex(null);
        setBlitzTotal(null);
      }
      if (msg.type === "screen.rules") setScreen("rules");
      if (msg.type === "screen.field") setScreen("field");
      if (msg.type === "screen.info") setScreen("info");
      if (msg.type === "sfx") {
        const kind = msg.payload?.sound;
        if (kind === "gong_start")
          audioRefs.gongStart.current?.play().catch(() => {});
        if (kind === "gong_end")
          audioRefs.gongEnd.current?.play().catch(() => {});
        if (kind === "beep_10s")
          audioRefs.beep10.current?.play().catch(() => {});
      }
      if (msg.type === "error") setWsError(msg.error || "ws error");
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

  const teamById = useMemo(() => {
    const map = new Map<number, TeamRow>();
    teams.forEach((t) => {
      if (!map.has(t.id)) map.set(t.id, t);
    });
    return map;
  }, [teams]);
  const getTeamName = useCallback(
    (teamId: number) => teamById.get(Number(teamId))?.name || `Команда ${teamId}`,
    [teamById]
  );
  const scoreList = useMemo(() => {
    const scoreMap = new Map<number, number>();
    scores.forEach((s) => scoreMap.set(s.teamId, Number(s.score)));
    const combined: ScoreRow[] = [];
    const seen = new Set<string>();
    teamById.forEach((_team, id) => {
      combined.push({ teamId: id, score: scoreMap.get(id) ?? 0 });
      seen.add(String(id));
    });
    scores.forEach((s) => {
      if (!seen.has(String(s.teamId))) {
        combined.push({ teamId: s.teamId, score: Number(s.score) });
        seen.add(String(s.teamId));
      }
    });
    return combined.sort((a, b) => b.score - a.score);
  }, [scores, teamById]);
  const normalizedSectors = useMemo(() => {
    if (!sectors.length) return [];
    const bySectorNumber = new Set<number>();
    const byQuestion = new Set<number>();
    const unique: SectorWithQuestion[] = [];
    sectors.forEach((s) => {
      if (bySectorNumber.has(s.sectorNumber)) return;
      if (byQuestion.has(s.questionId)) return;
      bySectorNumber.add(s.sectorNumber);
      byQuestion.add(s.questionId);
      unique.push(s);
    });
    return unique.sort((a, b) => a.sectorNumber - b.sectorNumber);
  }, [sectors]);
  const displaySectors: SectorWithQuestion[] = useMemo(() => normalizedSectors, [normalizedSectors]);
  const sectorCount = Math.max(displaySectors.length, 1);
  const boardStyle = useMemo(
    () =>
      ({
        ["--sector-count" as string]: sectorCount,
        ["--slice" as string]: `${360 / Math.max(1, sectorCount)}deg`,
      } as React.CSSProperties),
    [sectorCount]
  );
  const minSpinDurationMs = 8000;
  const currentGame = useMemo(
    () => games.find((g) => g.id === Number(form.gameId)),
    [games, form.gameId]
  );
  const mediaIsVideo = useMemo(() => (media ? /\.(mp4|webm|mov)$/i.test(media) : false), [media]);
  const mediaIsAudio = useMemo(() => (media ? /\.(mp3|wav|ogg|aac|m4a)$/i.test(media) : false), [media]);
  const mediaIsImage = useMemo(() => (media ? /\.(png|jpe?g|gif|webp|svg)$/i.test(media) : false), [media]);
  const infoLine = useCallback((q?: Question | null) => {
    if (!q) return "Город не указан · Автор неизвестен";
    if ( q.kind === "blitz") return `${q.isBlackBox ? "Черный ящик · " : ""}Блиц`;
    if ( q.kind === "super_blitz") return `${q.isBlackBox ? "Черный ящик · " : ""}Суперблиц`;
    const name = (q.authorName ?? "").trim();
    const city = (q.authorCity ?? "").trim();
    const base = `${city ? city : "Город N"} · ${name ? name : "Безымянный автор"}`;
    return q.isBlackBox ? `Черный ящик · ${base}` : base;
  }, []);
  const activeSectorQuestion = useMemo(() => {
    if (activeSector === null) return null;
    return displaySectors.find((s) => s.sectorNumber === activeSector)?.question ?? null;
  }, [activeSector, displaySectors]);
  const questionInfo = infoLine(question ?? activeSectorQuestion);
  const isBlackBox = Boolean(question?.isBlackBox || activeSectorQuestion?.isBlackBox);
  const highlightSector = useCallback(
    (sectorNumber: number | null, delayMs = 1200) => {
      if (pointerHighlightTimer.current) clearTimeout(pointerHighlightTimer.current);
      if (sectorNumber === null) {
        setActiveSector(null);
        activeSectorRef.current = null;
        return;
      }
      pointerHighlightTimer.current = setTimeout(() => {
        setActiveSector(sectorNumber);
        activeSectorRef.current = sectorNumber;
      }, Math.max(0, delayMs));
    },
    []
  );
  const sectorAngle = useCallback(
    (sectorNumber: number) => {
      const count = Math.max(1, sectorCount);
      const slice = 360 / count;
      return (sectorNumber - 1) * slice + slice / 2;
    },
    [sectorCount]
  );

  useEffect(() => {
    sectorsRef.current = normalizedSectors;
  }, [normalizedSectors]);

  useEffect(() => {
    sectorCountRef.current = sectorCount;
  }, [sectorCount]);

  useEffect(() => {
    if (screen === "intro" && introVideoRef.current) {
      introVideoRef.current.muted = false;
      introVideoRef.current.play().catch(() => {
        /* autoplay with sound can be blocked; user can hit play manually */
      });
    }
  }, [screen, media]);

  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.muted = false;
      mediaRef.current.play().catch(() => {});
    }
  }, [media, mediaKind]);

  useEffect(() => {
    if (answerMediaRef.current) {
      answerMediaRef.current.muted = false;
      answerMediaRef.current.play().catch(() => {});
    }
  }, [answerMedia]);

  useEffect(() => {
    if (answerVisible) {
      mediaRef.current?.pause();
      globalMediaRef.current?.pause();
    }
  }, [answerVisible]);

  useEffect(() => {
    if (!media || mediaIsImage || answerVisible) {
      globalMediaRef.current?.pause();
      return;
    }
    if (globalMediaRef.current) {
      globalMediaRef.current.muted = false;
      globalMediaRef.current.play().catch(() => {});
    }
  }, [media, mediaIsImage, answerVisible, screen]);

  useEffect(() => {
    const audio = blackBoxAudioRef.current;
    if (!audio) return;
    if (!blackBoxMusicOn || !blackBoxMusicSrc) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    audio.src = blackBoxMusicSrc;
    audio.loop = true;
    audio.muted = false;
    audio.play().catch(() => {});
  }, [blackBoxMusicOn, blackBoxMusicSrc]);

  const resolveSectorNumber = useCallback((payload: any) => {
    const nested = toId(payload?.sector?.sectorNumber);
    if (nested !== null) return nested;
    const direct = toId(payload?.sectorNumber);
    if (direct !== null) return direct;
    const sectorId = toId(payload?.sectorId);
    if (sectorId !== null) {
      const found = sectorsRef.current.find((s) => s.id === sectorId);
      if (found) return found.sectorNumber;
    }
    return activeSectorRef.current;
  }, []);

  const buildMediaUrl = useCallback((path?: string | null) => {
    if (!path) return null;
    if (
      /^(https?:)?\/\//i.test(path) ||
      path.startsWith("blob:") ||
      path.startsWith("data:")
    )
      return path;
    const cleanPath = path.replace(/^\/+/, "");
    const base = (MEDIA_BASE_URL || "").replace(/\/$/, "");
    return base ? `${base}/${cleanPath}` : `/${cleanPath}`;
  }, []);

  const startPointerSpin = useCallback(() => {
    if (pointerSpinRef.current) clearInterval(pointerSpinRef.current);
    pointerSpinRef.current = setInterval(() => {
      setPointerAngle((angle) => angle + 18);
    }, 40);
  }, []);

  const settlePointer = useCallback((sectorNumber: number) => {
    if (pointerSpinRef.current) {
      clearInterval(pointerSpinRef.current);
      pointerSpinRef.current = null;
    }
    const count = Math.max(
      1,
      sectorCountRef.current || sectorCount || displaySectors.length || 12
    );
    const slice = 360 / count;
    const target = (sectorNumber - 1) * slice + slice / 2;
    setPointerAngle((current) => {
      const normalizedCurrent = ((current % 360) + 360) % 360;
      const normalizedTarget = ((target % 360) + 360) % 360;
      const currentTurn = Math.floor((current - normalizedCurrent) / 360);
      let nextAngle = normalizedTarget + currentTurn * 360;
      if (nextAngle < current - 0.5) {
        nextAngle += 360;
      }
      pointerTurnsRef.current = Math.floor(nextAngle / 360);
      return nextAngle;
    });
  }, []);

  const runEnvelopeReveal = useCallback(
    (sectorNumber?: number) => {
      if (sectorNumber) settlePointer(sectorNumber);
      if (envelopeRevealTimer.current)
        clearTimeout(envelopeRevealTimer.current);
      setEnvelopeFlipped(false);
      setEnvelopeRevealing(true);
      envelopeRevealTimer.current = setTimeout(() => {
        setEnvelopeFlipped(true);
        setEnvelopeRevealing(false);
      }, 450);
    },
    [settlePointer]
  );

  const triggerEnvelopeReveal = useCallback(
    (sectorNumber?: number) => {
      if (postSpinPauseRef.current) {
        pendingEnvelopeReveal.current = sectorNumber ?? null;
        return;
      }
      runEnvelopeReveal(sectorNumber);
    },
    [runEnvelopeReveal]
  );

  const animateEnvelopeIntro = useCallback(() => {
    if (envelopeRevealTimer.current) clearTimeout(envelopeRevealTimer.current);
    setEnvelopeRevealing(true);
    envelopeRevealTimer.current = setTimeout(
      () => setEnvelopeRevealing(false),
      500
    );
  }, []);

  const sectorLabel = (s: SectorWithQuestion) => {
    if (s.question?.isBlackBox) return "Черный ящик";
    const kind = s.question?.kind;
    if (kind === "blitz") return "Блиц";
    if (kind === "super_blitz") return "Суперблиц";
    if (s.question?.authorCity || s.question?.authorName) {
      return (
        `${s.question.authorCity ?? ""}${
          s.question.authorCity && s.question.authorName ? " · " : ""
        }${s.question.authorName ?? ""}`.trim() || "Вопрос"
      );
    }
    return "Вопрос";
  };

  const connectionNotice =
    reconnecting || !connected
      ? reconnecting
        ? `Связь потеряна. Переподключаемся (${Math.min(
            reconnectAttempt || 1,
            MAX_RECONNECT_ATTEMPTS
          )}/${MAX_RECONNECT_ATTEMPTS})...`
        : wsError || "Нет соединения с сервером."
      : null;
  const showReconnectNotice =
    sessionReady && (!!connectionNotice || reconnecting || !connected);

  const content = (
    <div className="relative h-screen overflow-hidden bg-gradient-to-br from-slate-950 to-slate-900 text-amber-50">
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
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_10%,rgba(255,255,255,0.08),transparent_25%),radial-gradient(circle_at_5%_40%,rgba(210,168,93,0.08),transparent_25%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
        </div>

      <main className="relative mx-auto max-w-8xl px-[60px] py-[60px] h-full flex flex-col gap-4 text-[18px] sm:text-[20px] leading-relaxed">
        <div className="flex items-start gap-8 flex-1 overflow-hidden">
          <div className="flex-[1.5] h-full flex flex-col">
            {screen === "intro" ? (
              <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-black/50 shadow-[0_14px_50px_rgba(0,0,0,0.45)] flex-1 flex items-center justify-center">
                <video
                  ref={introVideoRef}
                  src="/media/intro/intro_main.mp4"
                  className="h-full w-full object-contain"
                  autoPlay
                  loop={false}
                  controls
                  playsInline
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-500/25 bg-white/5 p-5 shadow-[0_10px_50px_rgba(0,0,0,0.35)] flex-1 overflow-hidden">
                {screen === "info" && (
                  <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-500/25 bg-black/60">
                    <div
                      className="absolute inset-0 opacity-65"
                      style={{
                        backgroundImage: "url(/media/images/logo.png)",
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "center 20%",
                        backgroundSize: "40%",
                        filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.45))",
                      }}
                    />
                    <div className="relative h-full w-full p-8 flex items-end justify-center pb-12">
                      <div className="space-y-3 text-center">
                        <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">Телевизор подключен</p>
                        <p className="text-2xl font-semibold text-amber-50">Ожидаем запуск от ведущего</p>
                        <p className="text-sm text-amber-100/80">Спин, правила или интро появятся автоматически после команды.</p>
                      </div>
                    </div>
                  </div>
                )}
                {screen === "rules" && (
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-900/30 via-black/40 to-slate-900/50 p-10 shadow-[0_18px_50px_rgba(0,0,0,0.4)]">
                      <p className="text-lg uppercase tracking-[0.35em] text-amber-200/90">Правила раунда</p>
                      <div className="mt-6 grid gap-6 text-2xl text-amber-100/90 leading-relaxed">
                        <div className="flex items-start gap-4">
                          <span className="mt-2 text-amber-300 text-3xl">⏱️</span>
                          <p>Обычный вопрос — 60 секунд, +1 очко за верный ответ.</p>
                        </div>
                        <div className="flex items-start gap-4">
                          <span className="mt-2 text-amber-300 text-3xl">⚡</span>
                          <p>Блиц — 3 вопроса по 20 секунд, нужно 3 из 3 для очка.</p>
                        </div>
                        <div className="flex items-start gap-4">
                          <span className="mt-2 text-amber-300 text-3xl">🎯</span>
                          <p>Суперблиц — 3 вопроса по 20 секунд для одного игрока, 3 из 3 для очка.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {screen === "field" && (
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-center h-full overflow-hidden">
                    <div className="relative mx-auto aspect-square w-full max-w-[810px]" ref={circleRef}>
                      <div
                        className={`roulette-board ${
                          spinning ? "roulette-board--spinning" : ""
                        }`}
                        style={boardStyle}
                      >
                        <div className="roulette-lines">
                          {displaySectors.map((s) => {
                            const angle =
                              ((s.sectorNumber - 1) /
                                Math.max(1, sectorCount)) *
                              360;
                            return (
                              <span
                                key={`divider-${s.id ?? s.sectorNumber}`}
                                className="roulette-divider"
                                style={{
                                  height: "52%",
                                  transform: `translate(-50%, -100%) rotate(${angle}deg)`,
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div className="roulette-envelopes">
                        {displaySectors.map((s) => {
                          const angle = sectorAngle(s.sectorNumber);
                          const rad = ((angle - 90) * Math.PI) / 180;
                          const radius = envelopeRadius || 390;
                          const offsetX = Math.cos(rad) * radius;
                          const offsetY = Math.sin(rad) * radius;
                          const isActive = activeSector === s.sectorNumber;
                          const tilt = isActive
                            ? 0
                            : s.sectorNumber % 2 === 0
                            ? -4
                            : 4;
                          return (
                            <div
                              key={s.id ?? s.sectorNumber}
                              className={`sector-envelope ${
                                isActive ? "sector-envelope--active" : ""
                              } ${s.isUsed ? "sector-envelope--used" : ""}`}
                              style={{
                                transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
                              }}
                            >
                              <div
                                className="sector-envelope__inner"
                                style={
                                  {
                                    ["--rotation" as string]: `${tilt}deg`,
                                    ["--scale" as string]: isActive
                                      ? "1.08"
                                      : "1",
                                  } as React.CSSProperties
                                }
                              >
                                <div className="envelope-plain envelope-plain--compact">
                                  <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800/80">
                                    Сектор {s.sectorNumber}
                                  </p>
                                  <p className="mt-1 text-[13px] font-semibold leading-tight text-slate-900">
                                    {sectorLabel(s)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div
                        className={`gyro-pointer ${spinning ? "gyro-pointer--live" : ""}`}
                        style={{ ["--pointer-angle" as string]: `${pointerAngle}deg` } as React.CSSProperties}
                      >
                        <div className="gyro-horse" />
                        <div className="gyro-needle" />
                        <div className="gyro-cap" />
                      </div>
                      <div className="roulette-center-cap" />
                    </div>
                  </div>
                )}
                {screen === "question" && (
                  <div className="space-y-6 text-amber-50 overflow-auto pr-2 text-[20px] sm:text-[22px] leading-relaxed">
                    {!envelopeFlipped ? (
                    <div className="relative w-full flex justify-center">
                      <div
                        className={`envelope-plain envelope-plain--large rounded-3xl p-8 text-slate-900 shadow-[0_18px_50px_rgba(0,0,0,0.35)] min-h-[480px] w-full max-w-4xl flex flex-col items-center justify-center text-center gap-4 ${
                          envelopeRevealing ? "envelope-reveal" : ""
                        }`}
                      >
                          <p className="absolute top-0 inset-x-0 text-center text-2xl uppercase tracking-[0.28em] text-slate-800">
                            Сектор {activeSector ?? "?"}
                          </p>
                          <div className="envelope-info-bar">{questionInfo}</div>
                          {isBlackBox ? (
                            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-600/60 bg-amber-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-amber-100 shadow-sm">
                              Черный ящик
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`relative rounded-2xl border border-amber-500/30 bg-white/5 p-5 shadow-[0_14px_40px_rgba(0,0,0,0.35)] ${
                          envelopeRevealing ? "envelope-reveal" : ""
                        }`}
                      >
                        <p className="inset-x-0 text-center text-2xl uppercase tracking-[0.28em] text-amber-200/80">
                          Сектор {activeSector ?? "?"}
                        </p>
                        {isBlackBox ? (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-amber-50">
                            Черный ящик
                          </div>
                        ) : null}
                        {question?.authorName ? (
                          <p className="text-base text-center text-amber-100/80">
                            Автор: {question.authorName}{" "}
                            {question.authorCity
                              ? `(${question.authorCity})`
                              : ""}
                          </p>
                        ) : null}
                        {blitzIndex !== null ? (
                          <p className="text-sm text-amber-200/70">
                            Блиц {blitzIndex + 1}
                            {blitzTotal ? ` / ${blitzTotal}` : ""}
                          </p>
                        ) : null}
                        <p className="mt-4 text-3xl leading-relaxed">
                          {question?.questionFullText ||
                            question?.questionText ||
                            "Вопрос готовится..."}
                        </p>
                        {question?.questionText &&
                        question?.questionFullText ? (
                          <p className="mt-3 text-2xl text-amber-50">
                            {question.questionText}
                          </p>
                        ) : null}
                      </div>
                    )}

                    {answerVisible ? (
                      <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5 shadow-[0_14px_40px_rgba(0,0,0,0.35)]">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200">
                          Ответ
                        </p>
                        <p className="mt-2 text-4xl font-semibold text-amber-50">
                          {question?.answerText || "Ответ пока не указан."}
                        </p>
                        {question?.explanationText ? (
                          <p className="mt-3 text-lg text-amber-100/80">
                            {question.explanationText}
                          </p>
                        ) : null}
                        {(() => {
                          const mediaSrc =
                            answerMedia ||
                            buildMediaUrl(question?.mediaExplPath);
                          if (!mediaSrc) return null;
                          return mediaSrc.match(/\.(mp4|webm|mov)$/i) ? (
                            <video
                              src={mediaSrc}
                              className="mt-4 w-full max-h-[60vh] rounded-xl border border-emerald-300/30 bg-black/40 object-contain"
                              controls
                              autoPlay
                              playsInline
                              ref={(el) => {
                                answerMediaRef.current = el;
                                if (el) {
                                  el.muted = false;
                                  el.play().catch(() => {});
                                }
                              }}
                            />
                          ) : mediaSrc.match(/\.(mp3|wav|ogg|aac|m4a)$/i) ? (
                            <audio
                              src={mediaSrc}
                              className="mt-4 w-full"
                              controls
                              autoPlay
                              ref={(el) => {
                                answerMediaRef.current = el;
                                if (el) {
                                  el.muted = false;
                                  el.play().catch(() => {});
                                }
                              }}
                            />
                          ) : (
                            <img
                              src={mediaSrc}
                              alt="media answer"
                              className="mt-4 w-full max-h-[60vh] rounded-xl border border-emerald-300/30 bg-black/40 object-contain"
                            />
                          );
                        })()}
                      </div>
                    ) : null}

                    <div className="grid gap-5 lg:grid-cols-2 pb-20">
                      {!answerVisible && media ? (
                        <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-black/30 lg:col-span-2 flex items-center justify-center p-3">
                          {media.match(/\.(mp4|webm|mov)$/i) ? (
                            <video
                              src={media}
                              className="w-full max-w-[1200px] max-h-[60vh] object-contain"
                              controls
                              autoPlay
                              playsInline
                              ref={(el) => {
                                mediaRef.current = el;
                                if (el) {
                                  el.muted = false;
                                  el.play().catch(() => {});
                                }
                              }}
                            />
                          ) : media.match(/\.(mp3|wav|ogg|aac|m4a)$/i) ? (
                            <audio
                              src={media}
                              className="w-full max-w-[900px]"
                              controls
                              autoPlay
                              ref={(el) => {
                                mediaRef.current = el;
                                if (el) {
                                  el.muted = false;
                                  el.play().catch(() => {});
                                }
                              }}
                            />
                          ) : (
                            <img
                              src={media}
                              alt="media"
                              className="w-full max-w-[1200px] max-h-[60vh] object-contain"
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
                      <div className="rounded-full border border-amber-500/40 bg-black/60 px-8 py-4 shadow-[0_14px_30px_rgba(0,0,0,0.35)] backdrop-blur">
                        {timer && timer.remaining > 0 ? (
                          <p className="text-5xl font-semibold tracking-[0.3em]">
                            {Math.ceil(timer.remaining / 1000).toString().padStart(2, "0")}
                          </p>
                        ) : (
                          <p className="text-lg text-amber-200/80">
                            Таймер не запущен
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {screen === "win" && (
                  <div className="relative overflow-hidden rounded-3xl border border-amber-500/50 bg-gradient-to-br from-[#1f2937]/80 via-[#f59e0b]/20 to-[#0f172a]/85 p-10 text-amber-50 shadow-[0_22px_70px_rgba(0,0,0,0.55)] min-h-[460px]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_25%),radial-gradient(circle_at_80%_0%,rgba(253,230,138,0.16),transparent_28%)] pointer-events-none" />
                    <div className="win-shine" />
                    <div className="win-spot" />
                    <div className="relative space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-2">
                          <p className="text-sm uppercase tracking-[0.4em] text-amber-200/90">Триумф</p>
                          <p className="text-5xl font-extrabold drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]">Игра завершена!</p>
                          <p className="text-lg text-amber-100/80">Результаты подведены — поздравляем победителей.</p>
                        </div>
                        {winners.length ? (
                              <div className="rounded-3xl border border-emerald-400/60 bg-emerald-500/15 px-5 py-4 text-emerald-50 shadow-[0_10px_30px_rgba(16,185,129,0.35)]">
                                <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/85">Победители</p>
                                <p className="text-2xl font-bold flex items-center gap-2">
                                  🏆{" "}
                                  {winners
                                .map((id) => getTeamName(id))
                                .join(", ")}
                                </p>
                              </div>
                            ) : (
                              <div className="rounded-3xl border border-amber-400/60 bg-amber-500/15 px-5 py-4 text-amber-100 shadow">
                            <p className="text-xs uppercase tracking-[0.35em] text-amber-200/85">По очкам</p>
                            <p className="text-xl font-semibold">Победитель определяется по счёту.</p>
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 text-sm text-amber-100/85">
                        {scoreList.map((s, idx) => {
                          const topPlace = idx === 0;
                          const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "🏅";
                          return (
                            <div
                              key={s.teamId}
                              className={`rounded-xl border border-amber-500/30 bg-white/5 px-5 py-4 flex items-center justify-between shadow-inner ${
                                topPlace ? "lg:col-span-3 sm:col-span-2 col-span-1 ring-2 ring-amber-300/60 backdrop-blur" : ""
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/25 text-2xl ${topPlace ? "h-14 w-14 text-3xl" : ""}`}
                                >
                                  {medal}
                                </span>
                                <span className={`font-semibold ${topPlace ? "text-2xl" : "text-lg"}`}>
                                  {getTeamName(s.teamId)}
                                </span>
                              </div>
                              <span className={`font-extrabold text-amber-50 ${topPlace ? "text-4xl" : "text-2xl"}`}>{s.score}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="fireworks">
                      {Array.from({ length: 10 }).map((_, i) => {
                        const left = Math.random() * 100;
                        const delay = (i * 0.25) % 2.5;
                        const top = 20 + Math.random() * 40;
                        return (
                          <div
                            key={i}
                            className="firework"
                            style={{
                              left: `${left}%`,
                              top: `${top}%`,
                              animationDelay: `${delay}s`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="w-80 shrink-0 rounded-3xl border border-amber-400/40 bg-gradient-to-b from-amber-900/30 via-black/30 to-slate-900/50 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur h-full overflow-auto">
            <div className="flex items-center justify-between">
              <p className="text-sm uppercase tracking-[0.35em] text-amber-100">
                Счёт
              </p>
              <img src="/media/images/logo.png" alt="logo" className="h-20 w-auto" />
            </div>
            <div className="mt-4 space-y-3">
              {scoreList.length === 0 ? (
                <p className="text-base text-amber-100/80">Очков нет.</p>
              ) : (
                scoreList.map((s, idx) => (
                  <div
                    key={s.teamId}
                    className={`flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-black/35 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] ${
                      blitzEliminated.includes(s.teamId)
                        ? "opacity-60 line-through"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/20 text-xl font-bold text-amber-50">
                        {idx + 1}
                      </span>
                      <span className="truncate text-lg font-semibold">
                        {getTeamName(s.teamId)}
                      </span>
                    </div>
                    <span className="text-3xl font-extrabold text-amber-100 drop-shadow-[0_4px_8px_rgba(0,0,0,0.25)]">
                      {s.score}
                    </span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
        {media && !answerVisible && !mediaIsImage && screen !== "question" ? (
          mediaIsVideo ? (
            <video
              src={media}
              className="hidden"
              autoPlay
              playsInline
              ref={(el) => {
                globalMediaRef.current = el;
                if (el) {
                  el.muted = false;
                  el.play().catch(() => {});
                }
              }}
            />
          ) : mediaIsAudio ? (
            <audio
              src={media}
              className="hidden"
              autoPlay
              ref={(el) => {
                globalMediaRef.current = el;
                if (el) {
                  el.muted = false;
                  el.play().catch(() => {});
                }
              }}
            />
          ) : null
        ) : null}
        {connected ? (
          <div className="flex justify-end">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-100">
              Подключено
            </span>
          </div>
        ) : null}
      </main>

      <audio
        ref={audioRefs.gongStart}
        src="/media/sounds/gong_start.mp3"
        preload="auto"
      />
      <audio
        ref={audioRefs.spinSong}
        src="/media/sfx/spin.mp3"
        preload="auto"
        loop
      />
      <audio
        ref={audioRefs.gongEnd}
        src="/media/sounds/gong_end.mp3"
        preload="auto"
      />
      <audio
        ref={audioRefs.beep10}
        src="/media/sounds/beep_10s.mp3"
        preload="auto"
      />
      <audio
        ref={blackBoxAudioRef}
        src={blackBoxMusicSrc ?? undefined}
        preload="auto"
        loop
        className="hidden"
      />
    </div>
  );

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-amber-50 flex items-center justify-center px-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-500/25 bg-white/5 p-6 shadow-[0_10px_50px_rgba(0,0,0,0.4)]">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/80">
            Телевизор
          </p>
          <h1 className="text-3xl font-semibold">Вход на экран</h1>
          {wsError ? <p className="text-sm text-red-200">{wsError}</p> : null}
          <div className="space-y-3">
            <label className="text-sm text-amber-100/80">
              Игра
              <select
                value={form.gameId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gameId: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-amber-500/30 bg-black/40 px-3 py-2 text-sm text-amber-50"
              >
                <option value="">Выберите игру</option>
                {(Array.isArray(games) ? games : []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {new Date(g.gameDate).toLocaleString("ru-RU")} ·{" "}
                    {g.location}
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
            <PrimaryButton
              label="Войти на экран"
              type="button"
              onClick={() => connect()}
              disabled={connected}
            />
          </div>
        </div>
      </div>
    );
  }

  return content;
}

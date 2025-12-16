# CHGK API & WebSocket sketch

API is JSON over HTTP. Auth for admin endpoints uses `Authorization: Bearer <token>` issued after login.

## Auth
- `POST /api/admin/login` — body `{login, password}` → `{token, expiresAt}`. Login/password come from `.env`.
- `POST /api/admin/logout` — header auth required; server invalidates token (in-memory for now).

## Admin CRUD (HTTP)
- `GET/POST /api/question-blocks`, `PATCH/DELETE /api/question-blocks/:id`.
- `GET/POST /api/question-series`, `PATCH/DELETE /api/question-series/:id`.
- `GET/POST /api/questions`, `PATCH/DELETE /api/questions/:id`.
- `GET/POST /api/games`, `PATCH/DELETE /api/games/:id`.
- `POST /api/games/:id/blocks` — body `{blockId, blockOrder?}`; `DELETE /api/games/:id/blocks/:gameBlockId`.
- `POST /api/games/:id/sectors/generate` — body `{shuffle?: boolean, fromBlockIds?: Id[], includeSeries?: boolean}`; response returns created `game_sectors`.
- `GET/POST /api/teams`, `PATCH/DELETE /api/teams/:id`.
- `GET/POST /api/players`, `PATCH/DELETE /api/players/:id`.
- `POST /api/teams/:id/players` — body `{playerId}`; `DELETE /api/teams/:id/players/:playerId`.
- `GET /api/results?gameId=:id` — resolved answers and scores.

## Public flows (HTTP)
- `GET /api/games/active` — list of active games for selection.
- `POST /api/games/:id/join` — body `{pinCode, displayName, teamId?}`; returns session token for player/host/tv.
- `POST /api/games/:id/teams/:teamId/release` — host/admin can free a team slot.

## WebSocket (`/ws`)
Single socket; all events include `role` (`tv|host|player|admin`) and `sessionToken` when required.

Server → Client events:
- `state.sync` — full game snapshot (game, teams, sectors, current timers).
- `spin.started`, `spin.stopped` — spinning state and chosen sector.
- `question.revealed` — question payload with media flags.
- `timer.started|timer.ticked|timer.finished` — countdowns for 60s/20s.
- `media.play` — `{kind: "intro"|"question"|"answer"|"sfx", path}` for TV to render.
- `answer.submitted` — broadcast info about which team/player answered.
- `score.updated` — scores and rating panel update.
- `game.finished` — winner payload for win-screen.

Client → Server events:
- `session.connect` — `{role, gameId, pinCode, displayName?, teamId?}`.
- `host.spin` — start spinning; server broadcasts `spin.started` and after delay `spin.stopped`.
- `host.reveal-question` — flips envelope, optionally with `showMedia: boolean`.
- `host.start-timer` — `{durationSeconds, mode: "regular"|"blitz"|"superblitz"}`; `host.stop-timer` for early answers.
- `player.answer` — `{answerText}`; allows resubmission before timer end.
- `host.resolve-answer` — `{questionId, correctTeams: Id[], mediaAnswer?: boolean}`; awards points and optionally plays answer media.
- `host.finish-game` — optional reason/confirmation to trigger winner screen.
- `admin.lock-team` / `admin.release-team` — manage occupied teams in lobby.

## Media folders
- `back/media/intro` — intro and stingers.
- `back/media/questions` — assets shown when revealing a question.
- `back/media/answers` — assets shown with correct answers.
- `back/media/sfx` — gong, warning beep, ticking.

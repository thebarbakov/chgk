-- =====================================================================
-- ENUM для типов вопросов / серий
-- =====================================================================

CREATE TYPE question_kind AS ENUM ('regular', 'blitz', 'super_blitz');

-- =====================================================================
-- 1. Игры
-- =====================================================================

CREATE TABLE games (
    id              BIGSERIAL PRIMARY KEY,
    game_date       TIMESTAMP NOT NULL,               -- Дата/время игры
    location        TEXT      NOT NULL,               -- Место проведения

    use_phones      BOOLEAN   NOT NULL DEFAULT FALSE, -- Участники отвечают с телефонов
    has_viewers     BOOLEAN   NOT NULL DEFAULT FALSE, -- Участвуют телезрители
    is_active       BOOLEAN   NOT NULL DEFAULT FALSE, -- Активная игра для выбора/подключения

    pin_code        VARCHAR(10) NOT NULL,             -- PIN игры (например, 4–6 цифр)
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Быстрый поиск и уникальность игры по PIN
CREATE UNIQUE INDEX idx_games_pin_code ON games(pin_code);

-- =====================================================================
-- 2. Блоки вопросов
-- =====================================================================

CREATE TABLE question_blocks (
    id          BIGSERIAL PRIMARY KEY,
    title       TEXT       NOT NULL,           -- Название блока (например, "История", "Музыка")
    created_at  TIMESTAMP  NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 3. Серии вопросов (блиц / супер-блиц)
-- =====================================================================

CREATE TABLE question_series (
    id          BIGSERIAL PRIMARY KEY,
    kind        question_kind NOT NULL,        -- 'blitz' или 'super_blitz'
    title       TEXT,                          -- Например: "Блиц №3"
    block_id    BIGINT REFERENCES question_blocks(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_question_series_block_id ON question_series(block_id);

-- =====================================================================
-- 4. Вопросы
-- =====================================================================

CREATE TABLE questions (
    id                    BIGSERIAL PRIMARY KEY,
    block_id              BIGINT     NOT NULL REFERENCES question_blocks(id) ON DELETE CASCADE,

    -- Полный текст вопроса
    question_full_text    TEXT,

    -- Сам вопрос
    question_text         TEXT       NOT NULL,

    -- Правильный ответ
    answer_text           TEXT       NOT NULL,

    -- Пояснение к ответу
    explanation_text      TEXT,

    -- Медиа-файл для вопроса (путь до файла)
    media_question_path   TEXT,

    -- Медиа-файл для пояснения (путь до файла)
    media_expl_path       TEXT,

    -- Автор вопроса
    author_name           TEXT,
    -- Город автора
    author_city           TEXT,

    -- Тип вопроса: обычный / блиц / супер-блиц
    kind                  question_kind NOT NULL DEFAULT 'regular',

    -- Привязка к серии (для блица / супер-блица), NULL для обычных
    series_id             BIGINT REFERENCES question_series(id) ON DELETE SET NULL,

    -- Порядок внутри серии (1,2,3...)
    series_order          INTEGER,

    -- Отметка для черного ящика
    is_black_box          BOOLEAN NOT NULL DEFAULT FALSE,

    created_at            TIMESTAMP  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_block_id  ON questions(block_id);
CREATE INDEX idx_questions_series_id ON questions(series_id);

-- =====================================================================
-- 5. Связь игры и блоков вопросов
-- =====================================================================

CREATE TABLE game_blocks (
    id          BIGSERIAL PRIMARY KEY,
    game_id     BIGINT NOT NULL REFERENCES games(id)           ON DELETE CASCADE,
    block_id    BIGINT NOT NULL REFERENCES question_blocks(id) ON DELETE CASCADE,

    -- Порядок блока в игре (1,2,3...)
    block_order INTEGER,

    UNIQUE (game_id, block_id)
);

CREATE INDEX idx_game_blocks_game_id  ON game_blocks(game_id);
CREATE INDEX idx_game_blocks_block_id ON game_blocks(block_id);

-- =====================================================================
-- 6. Игроки
-- =====================================================================

CREATE TABLE players (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT       NOT NULL,          -- Имя/ник игрока
    created_at  TIMESTAMP  NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 7. Команды
-- =====================================================================

CREATE TABLE teams (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT       NOT NULL,          -- Название команды
    created_at  TIMESTAMP  NOT NULL DEFAULT NOW()
);

-- Связь "команда – игрок"
CREATE TABLE team_players (
    team_id     BIGINT NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
    player_id   BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,

    PRIMARY KEY (team_id, player_id)
);

CREATE INDEX idx_team_players_team_id   ON team_players(team_id);
CREATE INDEX idx_team_players_player_id ON team_players(player_id);

-- =====================================================================
-- 8. Баллы
-- =====================================================================

-- Отдельная таблица для начислений/штрафов по команде в рамках игры.
-- Очки от -1 до +1.
CREATE TABLE scores (
    id          BIGSERIAL PRIMARY KEY,
    game_id     BIGINT   NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id     BIGINT   NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    points      SMALLINT NOT NULL,                    -- -1, 0 или +1
    reason      TEXT,                                 -- За что начислено/снято

    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),

    CHECK (points BETWEEN -1 AND 1)
);

CREATE INDEX idx_scores_game_team ON scores(game_id, team_id);

-- =====================================================================
-- 9. Результаты ответов
-- =====================================================================

CREATE TABLE answers (
    id              BIGSERIAL PRIMARY KEY,
    game_id         BIGINT NOT NULL REFERENCES games(id)     ON DELETE CASCADE,
    team_id         BIGINT NOT NULL REFERENCES teams(id)     ON DELETE CASCADE,
    question_id     BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,

    answer_text     TEXT,          -- Что написали/ввели
    is_correct      BOOLEAN,       -- Правильный/неправильный
    points          SMALLINT,      -- Очки за конкретный ответ (-1..+1, если используешь)

    answered_at     TIMESTAMP NOT NULL DEFAULT NOW(),

    CHECK (points IS NULL OR points BETWEEN -1 AND 1),

    -- Одна команда один раз отвечает на вопрос в рамках одной игры
    UNIQUE (game_id, team_id, question_id)
);

CREATE INDEX idx_answers_game_team_question ON answers(game_id, team_id, question_id);
CREATE INDEX idx_answers_question_id        ON answers(question_id);

CREATE TABLE game_sectors (
    id              BIGSERIAL PRIMARY KEY,

    game_id         BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    question_id     BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,

    sector_number   INTEGER NOT NULL,          -- Номер сектора на поле
    is_used         BOOLEAN NOT NULL DEFAULT FALSE,  -- Был ли он уже сыгран
    used_at         TIMESTAMP,                 -- Когда сектор был сыгран

    UNIQUE (game_id, sector_number)            -- В каждой игре сектор уникален
);

CREATE INDEX idx_game_sectors_game_id     ON game_sectors(game_id);
CREATE INDEX idx_game_sectors_question_id ON game_sectors(question_id);

-- =====================================================================
-- 10. Привязка команд к игре
-- =====================================================================
CREATE TABLE game_teams (
    game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, team_id)
);

CREATE INDEX idx_game_teams_game_id ON game_teams(game_id);
CREATE INDEX idx_game_teams_team_id ON game_teams(team_id);

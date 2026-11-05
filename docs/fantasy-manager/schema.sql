-- Fantasy Manager Tools: πλήρες σχήμα PostgreSQL (για τη μελλοντική έκδοση με backend).
-- Στη σημερινή στατική έκδοση (GitHub Pages) κάθε πίνακας αντιστοιχεί σε αρχείο JSON στο data/fantasy/
-- ή σε localStorage του χρήστη (βλ. στήλη «σήμερα» στα σχόλια).

-- ============ Δεδομένα EuroLeague (κοινά για όλους) ============
CREATE TABLE seasons (                      -- σήμερα: data/cache.json, data/pbp/<season>
  season_code   TEXT PRIMARY KEY,           -- 'E2026'
  label         TEXT NOT NULL,              -- '2026-27'
  is_current    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE teams (
  team_code     TEXT PRIMARY KEY,           -- 'PAN'
  name_el       TEXT NOT NULL, name_en TEXT NOT NULL, name_es TEXT, name_sr TEXT
);

CREATE TABLE players (
  player_id     TEXT PRIMARY KEY,           -- κωδικός EuroLeague '003469'
  full_name     TEXT NOT NULL,
  position      TEXT NOT NULL CHECK (position IN ('Guard','Forward','Center')),
  birth_date    DATE, height_cm SMALLINT, country TEXT
);

CREATE TABLE player_team_seasons (
  player_id     TEXT REFERENCES players, season_code TEXT REFERENCES seasons, team_code TEXT REFERENCES teams,
  jersey        TEXT, PRIMARY KEY (player_id, season_code, team_code)
);

CREATE TABLE fantasy_rounds (               -- σήμερα: data/fantasy/latest.json (round, days)
  season_code   TEXT REFERENCES seasons, round_no SMALLINT,
  deadline_at   TIMESTAMPTZ,
  PRIMARY KEY (season_code, round_no)
);

CREATE TABLE fantasy_turns (                -- ένα turn = μία αγωνιστική μέρα μέσα στον γύρο
  season_code   TEXT, round_no SMALLINT, turn_no SMALLINT,
  game_date     DATE NOT NULL, first_tip_at TIMESTAMPTZ,
  PRIMARY KEY (season_code, round_no, turn_no),
  FOREIGN KEY (season_code, round_no) REFERENCES fantasy_rounds
);

CREATE TABLE games (                        -- σήμερα: cache.json league.games, data/matchups/fixtures.json
  game_id       TEXT PRIMARY KEY,           -- 'E2026-87'
  season_code   TEXT REFERENCES seasons, round_no SMALLINT, turn_no SMALLINT,
  home_team     TEXT REFERENCES teams, away_team TEXT REFERENCES teams,
  tip_at        TIMESTAMPTZ NOT NULL, home_score SMALLINT, away_score SMALLINT, overtime BOOLEAN DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','final','postponed'))
);
CREATE INDEX ON games (season_code, round_no);

CREATE TABLE player_game_stats (            -- σήμερα: cache.json players[].g (box score ανά αγώνα)
  game_id TEXT REFERENCES games, player_id TEXT REFERENCES players, team_code TEXT REFERENCES teams,
  started BOOLEAN, seconds SMALLINT, pts SMALLINT, reb SMALLINT, ast SMALLINT, stl SMALLINT, tov SMALLINT,
  blk SMALLINT, blk_against SMALLINT, fouls SMALLINT, fouls_drawn SMALLINT,
  fgm2 SMALLINT, fga2 SMALLINT, fgm3 SMALLINT, fga3 SMALLINT, ftm SMALLINT, fta SMALLINT, plus_minus SMALLINT,
  pir SMALLINT NOT NULL,
  PRIMARY KEY (game_id, player_id)
);
CREATE INDEX ON player_game_stats (player_id);

-- ============ Fantasy αγορά (υπολογίζεται σε κάθε ενημέρωση) ============
CREATE TABLE fantasy_prices (               -- σήμερα: data/fantasy/price_hist.json (+ prices.csv για επίσημες τιμές)
  season_code TEXT, round_no SMALLINT, player_id TEXT REFERENCES players,
  price NUMERIC(4,1) NOT NULL, source TEXT NOT NULL CHECK (source IN ('official','estimate')),
  PRIMARY KEY (season_code, round_no, player_id)
);

CREATE TABLE availability (                 -- σήμερα: τραυματίες από το site + data/fantasy/status.csv
  id BIGSERIAL PRIMARY KEY, player_id TEXT REFERENCES players,
  status TEXT NOT NULL CHECK (status IN ('playing','probable','doubtful','out','injured','rest','returning')),
  detail TEXT, expected_return DATE, source TEXT NOT NULL, source_url TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON availability (player_id, observed_at DESC);

CREATE TABLE model_runs (                   -- σήμερα: data/fantasy/history/r<round>_<date>_<model>.json
  run_id BIGSERIAL PRIMARY KEY, model_version TEXT NOT NULL, season_code TEXT, target_round SMALLINT,
  trained_rows INT, mae NUMERIC(5,2), mae_baseline NUMERIC(5,2), coverage_80 NUMERIC(4,3), created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE player_projections (           -- σήμερα: data/fantasy/latest.json players[]
  run_id BIGINT REFERENCES model_runs, player_id TEXT REFERENCES players, game_id TEXT REFERENCES games,
  proj_min NUMERIC(4,1), proj_pir NUMERIC(4,1), p10 NUMERIC(4,1), p50 NUMERIC(4,1), p90 NUMERIC(4,1),
  starter_prob NUMERIC(3,2), confidence SMALLINT, fixture_difficulty SMALLINT CHECK (fixture_difficulty BETWEEN 1 AND 5),
  back_to_back BOOLEAN, sample_games SMALLINT, hidden_small_sample BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (run_id, player_id, game_id)
);

CREATE TABLE transfer_market_snapshot (     -- materialized: όλα τα metrics του Transfer Market ανά παίκτη/γύρο
  season_code TEXT, round_no SMALLINT, player_id TEXT REFERENCES players,
  price NUMERIC(4,1), price_d3 NUMERIC(4,1), price_d5 NUMERIC(4,1), price_d10 NUMERIC(4,1),
  pir_l3 NUMERIC(4,1), pir_l5 NUMERIC(4,1), pir_l10 NUMERIC(4,1), pir_per_min NUMERIC(4,3),
  proj_next NUMERIC(4,1), proj_next3 NUMERIC(5,1), pir_per_credit NUMERIC(4,2),
  min_l3 NUMERIC(4,1), min_l10 NUMERIC(4,1), starter_prob NUMERIC(3,2), games_played SMALLINT,
  signal TEXT CHECK (signal IN ('buy','hold','sell')), signal_reasons TEXT[],
  value_grade TEXT CHECK (value_grade IN ('A+','A','B+','B','C+','C','D')),
  PRIMARY KEY (season_code, round_no, player_id)
);

CREATE TABLE coach_projections (
  run_id BIGINT REFERENCES model_runs, team_code TEXT REFERENCES teams, game_id TEXT REFERENCES games,
  price NUMERIC(4,1), exp_points NUMERIC(4,1), p10 SMALLINT, p50 SMALLINT, p90 SMALLINT, win_prob NUMERIC(4,3),
  PRIMARY KEY (run_id, team_code, game_id)
);

-- ============ Χρήστες και σύνθεση ============
CREATE TABLE users (                        -- σήμερα: δεν υπάρχει λογαριασμός· όλα στο localStorage
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email CITEXT UNIQUE, locale TEXT DEFAULT 'el',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fantasy_teams (                -- σήμερα: localStorage 'fmt-teams'
  team_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users ON DELETE CASCADE,
  name TEXT NOT NULL, season_code TEXT REFERENCES seasons,
  budget NUMERIC(5,1) NOT NULL DEFAULT 100, transfers_left SMALLINT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fantasy_rosters (              -- μία εγγραφή ανά γύρο: η σύνθεση εκείνου του γύρου
  roster_id BIGSERIAL PRIMARY KEY, team_id UUID REFERENCES fantasy_teams ON DELETE CASCADE, round_no SMALLINT,
  formation TEXT CHECK (formation IN ('1-2-2','2-2-1','1-3-1','2-1-2','1-1-3','3-1-1')),  -- G-F-C στην πεντάδα
  coach_team TEXT REFERENCES teams, captain_id TEXT REFERENCES players, sixth_id TEXT REFERENCES players,
  UNIQUE (team_id, round_no)
);

CREATE TABLE roster_slots (
  roster_id BIGINT REFERENCES fantasy_rosters ON DELETE CASCADE, player_id TEXT REFERENCES players,
  slot TEXT NOT NULL CHECK (slot IN ('start','sixth','bench')), buy_price NUMERIC(4,1),
  PRIMARY KEY (roster_id, player_id)
);

CREATE TABLE roster_turn_moves (            -- field/bench αλλαγές ανά turn (round planner)
  roster_id BIGINT REFERENCES fantasy_rosters ON DELETE CASCADE, turn_no SMALLINT,
  player_out TEXT REFERENCES players, player_in TEXT REFERENCES players, captain_change_to TEXT REFERENCES players,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE trades (                       -- trade simulator / multi-trade optimizer
  trade_id BIGSERIAL PRIMARY KEY, team_id UUID REFERENCES fantasy_teams ON DELETE CASCADE, round_no SMALLINT,
  player_out TEXT REFERENCES players, player_in TEXT REFERENCES players,
  budget_before NUMERIC(5,1), budget_after NUMERIC(5,1), delta_next NUMERIC(5,1), delta_next3 NUMERIC(5,1),
  recommendation TEXT CHECK (recommendation IN ('strong_buy','buy','neutral','avoid','strong_avoid')),
  executed BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now()
);

-- ============ Alerts, ειδήσεις, ειδοποιήσεις ============
CREATE TABLE news_items (                   -- σήμερα: data/fantasy/news.json (από αλλαγές στα δεδομένα)
  news_id BIGSERIAL PRIMARY KEY, player_id TEXT REFERENCES players, team_code TEXT REFERENCES teams,
  kind TEXT NOT NULL CHECK (kind IN ('injury','probable_starter','rotation','coach_quote','transfer','minutes_trend','projection_change','captain_availability','return')),
  title TEXT NOT NULL, body TEXT, proj_before NUMERIC(4,1), proj_after NUMERIC(4,1),
  recommended_action TEXT, source TEXT NOT NULL, source_url TEXT, published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON news_items (published_at DESC);

CREATE TABLE alerts (                       -- εξατομικευμένα: news × σύνθεση χρήστη
  alert_id BIGSERIAL PRIMARY KEY, user_id UUID REFERENCES users ON DELETE CASCADE, team_id UUID REFERENCES fantasy_teams,
  news_id BIGINT REFERENCES news_items, player_id TEXT REFERENCES players,
  event_type TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  affected_slots TEXT[], proj_before NUMERIC(4,1), proj_after NUMERIC(4,1), recommended_action TEXT,
  source TEXT, created_at TIMESTAMPTZ DEFAULT now(), read_at TIMESTAMPTZ
);
CREATE INDEX ON alerts (user_id, created_at DESC);

CREATE TABLE alert_settings (
  user_id UUID PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  in_app BOOLEAN DEFAULT TRUE, email BOOLEAN DEFAULT FALSE, web_push BOOLEAN DEFAULT FALSE,
  digest_before_turn BOOLEAN DEFAULT TRUE, min_severity TEXT DEFAULT 'warning', quiet_hours INT4RANGE
);

CREATE TABLE push_subscriptions (
  id BIGSERIAL PRIMARY KEY, user_id UUID REFERENCES users ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notification_log (
  id BIGSERIAL PRIMARY KEY, alert_id BIGINT REFERENCES alerts ON DELETE CASCADE,
  channel TEXT CHECK (channel IN ('in_app','email','web_push','digest')), sent_at TIMESTAMPTZ DEFAULT now(), ok BOOLEAN, error TEXT
);

-- ============ Fantasy Captain & Strategy Tools ============
CREATE TABLE captain_projections (          -- σήμερα: /api/fantasy/captain-advisor/latest.json (ανά παίκτη, ο χρήστης φιλτράρει με τη σύνθεσή του)
  run_id BIGINT REFERENCES model_runs, player_id TEXT REFERENCES players, game_id TEXT REFERENCES games,
  cap_floor NUMERIC(5,1), cap_median NUMERIC(5,1), cap_expected NUMERIC(5,1), cap_ceiling NUMERIC(5,1),
  risk_score SMALLINT CHECK (risk_score BETWEEN 0 AND 100), captain_value NUMERIC(5,2), differential_score SMALLINT,
  opp_drtg NUMERIC(5,1), game_pace NUMERIC(4,1), rest_days SMALLINT, back_to_back BOOLEAN,
  hist_cap_avg NUMERIC(5,1), hist_cap_hit_rate NUMERIC(4,3),   -- ιστορικό: 2×PIR και ποσοστό αγώνων με PIR ≥ 20 (τελευταίοι 10)
  PRIMARY KEY (run_id, player_id, game_id)
);

CREATE TABLE value_board_snapshot (         -- σήμερα: /api/fantasy/value-board.json
  season_code TEXT, round_no SMALLINT, player_id TEXT REFERENCES players,
  value_per_credit NUMERIC(5,3),            -- projected_PIR / price
  fantasy_value_per_credit NUMERIC(5,3),    -- projected_fantasy_points / price
  pos_percentile NUMERIC(5,2), pos_rank SMALLINT, overall_rank SMALLINT,
  signal TEXT CHECK (signal IN ('buy_low','sell_high','hold','avoid')), signal_score SMALLINT CHECK (signal_score BETWEEN -100 AND 100),
  signal_factors TEXT[], signal_confidence TEXT CHECK (signal_confidence IN ('low','medium','high')),
  PRIMARY KEY (season_code, round_no, player_id)
);

CREATE TABLE whatif_scenarios (             -- σήμερα: localStorage 'fmt-v1' (έως 5 ανά γύρο)
  scenario_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID REFERENCES fantasy_teams ON DELETE CASCADE,
  round_no SMALLINT NOT NULL, name TEXT NOT NULL,
  formation TEXT, captain_id TEXT REFERENCES players, sixth_id TEXT REFERENCES players, coach_team TEXT REFERENCES teams,
  start_ids TEXT[] NOT NULL, bench_ids TEXT[] NOT NULL,
  trades JSONB DEFAULT '[]',                -- [{out, in}]
  overrides JSONB DEFAULT '{}',             -- {player_id: {status, minutes}}
  result JSONB,                             -- expected, floor, median, ceiling, risk, exposure, budget
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX ON whatif_scenarios (team_id, round_no, name);
-- κανόνας εφαρμογής: έως 5 scenarios ανά (team_id, round_no)

-- ============ Optimizer v2 (ακριβής βελτιστοποίηση) ============
CREATE TABLE optimizer_runs (               -- σήμερα: /api/fantasy/optimizer/<mode>.json + localStorage για τα δικά σου runs
  optimization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID REFERENCES fantasy_teams,
  round_no SMALLINT, mode TEXT CHECK (mode IN ('safe','balanced','ceiling')), solver TEXT,  -- 'dp-bnb-v1'
  inputs JSONB NOT NULL,                    -- budget, formation, max_per_team, locks, excludes, sold, current_turn, fixed_slots
  status TEXT CHECK (status IN ('optimal','feasible_timeout','infeasible','fallback')),
  objective NUMERIC(7,2), expected NUMERIC(6,1), floor NUMERIC(6,1), median NUMERIC(6,1), ceiling NUMERIC(6,1),
  risk_score SMALLINT, captain_risk SMALLINT, bench_risk SMALLINT, team_exposure JSONB, budget_left NUMERIC(5,1),
  solution JSONB NOT NULL,                  -- formation, start[], sixth, bench[], captain, coach
  runtime_ms INT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE optimizer_explanations (
  optimization_id UUID REFERENCES optimizer_runs ON DELETE CASCADE, player_id TEXT REFERENCES players,
  decision TEXT CHECK (decision IN ('start','sixth','bench','captain','coach','not_selected')),
  reasons TEXT[] NOT NULL, PRIMARY KEY (optimization_id, player_id)
);
CREATE TABLE optimizer_alternatives (
  optimization_id UUID REFERENCES optimizer_runs ON DELETE CASCADE, rank SMALLINT,
  label TEXT, solution JSONB NOT NULL, objective NUMERIC(7,2), delta NUMERIC(6,2), PRIMARY KEY (optimization_id, rank)
);
CREATE TABLE optimizer_turn_plans (
  optimization_id UUID REFERENCES optimizer_runs ON DELETE CASCADE, turn_no SMALLINT,
  lineup JSONB, captain TEXT REFERENCES players, playing TEXT[], substitutions JSONB, expected_points NUMERIC(6,1),
  PRIMARY KEY (optimization_id, turn_no)
);

-- ============ Optimizer: explainability, εναλλακτικές, sensitivity ============
CREATE TABLE optimizer_contributions (
  optimization_id UUID REFERENCES optimizer_runs ON DELETE CASCADE, player_id TEXT REFERENCES players,   -- player_id NULL = προπονητής (βλ. coach_team)
  coach_team TEXT REFERENCES teams, slot TEXT, is_captain BOOLEAN,
  points NUMERIC(6,2), captain_extra NUMERIC(6,2), share_total NUMERIC(5,4),
  floor_contrib NUMERIC(6,2), ceiling_contrib NUMERIC(6,2), risk_share NUMERIC(5,4), points_per_credit NUMERIC(5,3),
  explanation TEXT                          -- κείμενο που παράγεται από τα features (όχι ελεύθερο κείμενο)
);
CREATE TABLE optimizer_key_factors (
  optimization_id UUID REFERENCES optimizer_runs ON DELETE CASCADE, factor TEXT,   -- budget, concentration, positions, captain, bench, injury, fixtures, pace, ownership
  score SMALLINT, available BOOLEAN DEFAULT TRUE, params JSONB, PRIMARY KEY (optimization_id, factor)
);
CREATE TABLE optimizer_sensitivity (
  optimization_id UUID REFERENCES optimizer_runs ON DELETE CASCADE, player_id TEXT REFERENCES players,
  scenario TEXT CHECK (scenario IN ('dnp','dnp_captain_swap','minutes_down_25','minutes_up_25')),
  delta_total NUMERIC(6,2), impact TEXT CHECK (impact IN ('high','medium','low')), single_point_of_failure BOOLEAN,
  PRIMARY KEY (optimization_id, player_id, scenario)
);
-- optimizer_alternatives.label ∈ ('safest','balanced','ceiling','value','differential'); 'differential' μένει κενό χωρίς ownership

-- ============ Fantasy Live Tracker & Round Progress ============
-- Στο site (στατικό) τα box scores έρχονται κατευθείαν από το επίσημο live feed στον browser και τα τελικά από το build
-- (api/fantasy/live/<round>.json). Οι πίνακες περιγράφουν την αντίστοιχη μορφή σε βάση, αν χρειαστεί ποτέ server.
CREATE TABLE live_rounds (
  season TEXT NOT NULL, round INT NOT NULL, days DATE[] NOT NULL, current_turn INT, finished BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (season, round));
CREATE TABLE live_games (
  season TEXT, round INT, game_id TEXT, home TEXT, away TEXT, tipoff TIMESTAMPTZ, turn INT,
  state TEXT CHECK (state IN ('scheduled','live','final')), quarter INT, remaining TEXT, home_score INT, away_score INT, overtime BOOLEAN,
  updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (season, round, game_id));
CREATE TABLE live_player_stats (
  season TEXT, round INT, game_id TEXT, player_code TEXT, minutes NUMERIC(4,1), pir INT, pts INT, reb INT, ast INT, stl INT, blk INT, tov INT,
  fgm2 INT, fga2 INT, fgm3 INT, fga3 INT, ftm INT, fta INT, pf INT, provisional BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (season, round, player_code));
CREATE TABLE live_lineup_snapshots (
  team_id UUID REFERENCES fantasy_teams(team_id) ON DELETE CASCADE, season TEXT, round INT,
  lineup JSONB NOT NULL,              -- {start[5], sixth, bench[4], captain, coach}
  initial_projection NUMERIC(6,1),    -- πριν από τον πρώτο αγώνα του γύρου
  taken_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (team_id, season, round));
CREATE TABLE live_alerts (
  id BIGSERIAL PRIMARY KEY, team_id UUID REFERENCES fantasy_teams(team_id) ON DELETE CASCADE, season TEXT, round INT,
  kind TEXT CHECK (kind IN ('captain_out','starter_out','bench_hot','injury','dnp','low_minutes','game_final','captain_opportunity','better_captain','better_swap','projection_drop')),
  severity TEXT CHECK (severity IN ('info','warning','critical')), player_code TEXT, impact NUMERIC(6,1), action TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE round_reviews (
  team_id UUID REFERENCES fantasy_teams(team_id) ON DELETE CASCADE, season TEXT, round INT,
  final_points NUMERIC(6,1), initial_projection NUMERIC(6,1), best_player TEXT, worst_player TEXT,
  captain_points NUMERIC(6,1), captain_missed NUMERIC(6,1), bench_points NUMERIC(6,1), coach_points NUMERIC(6,1),
  best_arrangement JSONB, best_roster JSONB, lessons JSONB, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (team_id, season, round));

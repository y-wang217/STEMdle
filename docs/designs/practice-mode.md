# practice-mode: unlimited practice from the approved pool

**Risk:** Medium (new table and player-facing routes; does not touch daily scoring, the leaderboard, the validator or identity, but the selection rules guard against spoiling future daily sets)

## Problem
STEMdle is once a day: after the eight-question run a student has nothing more to do. AP Academy students preparing for MCR3U/MHF4U/MCV4U and the sciences want to keep going on the slot (topic) where they got stuck, with the same verified questions and worked solutions.

## Approach
- **Schema** — `supabase/migrations/20261117000007_practice.sql` adds
  - `practice_sessions (id, player_id → anonymous_players, slot nullable = any topic, created_at, last_active_at)`
  - `practice_attempts (id, session_id, question_id, question_version_id, presented_at, option_id, is_correct, answered_at, answer_ms)` with `unique (session_id, question_id)` (no repeats in a session, enforced by the database) and a partial unique index allowing one unanswered attempt per session.
  - A guard trigger: an answered attempt is immutable; deletes are refused. RLS enabled and all grants revoked for `anon`/`authenticated`, like every other table.
  - No change to `game_runs`, `answer_submissions`, `score_corrections` or the leaderboard.
- **Logic** — `src/lib/game/practice.ts`
  - `practicePoolFilter`: a question is servable when `questions.status = 'approved'`, `question_version_publishable(current_version_id) is null` (the same database check that gates daily approval: four options, one correct, latest validation passed or explicitly math-verified), **and** it is not in any `challenge_questions` row whose `daily_challenges.challenge_date >= today (Toronto)`, whatever that challenge's status (draft, approved, published or withdrawn), so neither today's nor any scheduled future set leaks.
  - `defaultPracticeSlot(playerId, challengeId)`: the slot where today's run ended (`current_slot` for failed/skipped/active, 8 for cleared), 1 when there is no run.
  - `startPractice`, `nextPracticeQuestion`, `answerPractice`: server-authoritative. The public question carries no `is_correct`, solution, rationale or misconception. The answer response reveals the correct option, each option's rationale/misconception, the key insight and the stored solution, plus session stats.
- **API** — `src/app/api/practice/{start,next,answer}/route.ts`, same-origin checked, zod-validated, rate limited (`start` per IP 30/min like `/api/game/start`; `next`/`answer` per player 60/min).
- **UI** — `src/app/practice/page.tsx` (server: player, default slot, slot names from `bucket_profiles`) and a new client component `src/components/practice/Practice.tsx` that imports `QuestionView` and `ui.tsx` from `src/components/game/` without modifying them.

## Acceptance criteria
- **AC1.** A student opens `/practice` → a topic picker lists the eight slots by name plus "Any topic", preselected to the slot where today's run ended (slot 1 with no run).
- **AC2.** The student starts practice → a question from the chosen slot appears; the response JSON contains no `is_correct`, solution, rationale or misconception.
- **AC3.** The student picks an option → the server records the attempt and returns correct/incorrect, the correct option, the key insight and the stored solution; the UI marks the options and shows the solution.
- **AC4.** Every question served is approved, passes `question_version_publishable`, and is not in today's or any future-dated challenge (any status); a question used only in a past challenge may be served.
- **AC5.** Within one session no question is served twice; when the slot's pool is exhausted the API returns `question: null` and the UI says so.
- **AC6.** Practice answers never change `game_runs`, `answer_submissions` or the leaderboard; a second answer to the same attempt, an option from another question, or another player's session is rejected (409/400/404).
- **AC7.** The practice endpoints are rate limited and reject cross-origin POSTs (403).
- **AC8.** The page works at iPhone 13 and 360px widths with no horizontal scroll.

## Test plan
| AC | Test (file › name) | Kind |
|---|---|---|
| AC1 | `tests/integration/practice.test.ts` › default slot follows today's run; `tests/e2e/practice.spec.ts` › phone practice flow | integration, e2e |
| AC2 | practice.test.ts › serves only the requested slot and leaks no answers | integration |
| AC3 | practice.test.ts › answer flow reveals the solution and records the attempt; practice.spec.ts | integration, e2e |
| AC4 | practice.test.ts › never serves today's or future scheduled questions, or unapproved/unvalidated ones | integration |
| AC5 | practice.test.ts › no repeats within a session; pool exhaustion returns null | integration |
| AC6 | practice.test.ts › does not touch daily scoring; rejects double answers, foreign options and foreign sessions | integration |
| AC7 | practice.spec.ts › cross-origin POST is rejected; rate limit uses `enforceRateLimit` (same helper as the game routes) | e2e, review |
| AC8 | practice.spec.ts (iPhone 13) and the 360px check in the same spec; screenshots in `screenshots/practice-mode/` | e2e, screenshot |

## Risks
- **Reverse spoiler:** a question practised today could be scheduled into a future daily set by the composer later. The pool rule prevents serving already-scheduled questions; preferring unpractised questions in `autoCompose` is a follow-up (composer is outside this task).
- **Pool size:** slots with few approved, unscheduled questions exhaust quickly; the UI says so and offers another topic.
- **Voided/retired questions** leave the pool because voiding sets `questions.status = 'retired'`.
- **Concurrency:** two `next` calls racing in one session are serialised with `select … for update` on the session row; the partial unique index backs that up.
- **Version deletion:** `practice_attempts.question_version_id` references `question_versions`; approved versions are not deleted by the factory, so the FK only blocks deleting versions students already saw, which is the desired behaviour.

## Decisions
| Decision | Default chosen | Why |
|---|---|---|
| Schema change | New `practice_sessions` + `practice_attempts` tables (migration 000007) | Records per anonymous player without touching daily tables; human-merged |
| "Scheduled" definition | Any challenge dated today or later, any status | Safest reading of "no spoilers"; drafts can become approved |
| Topic filter | By slot (each slot is one topic/category in `bucket_profiles`) plus "Any topic" | Slots are the existing topic unit; no new taxonomy |
| Session lifetime | Client-held session id; reload or topic change starts a new session | No new cookie or identity change (identity.ts is off limits) |
| Skip / give up inside practice | Not in v1: the next question requires answering the current one; changing topic starts a fresh session | Keeps the attempt record simple; follow-up |
| Analytics | No new analytics events; `practice_attempts` is the record | Avoids polluting daily analytics |

## Follow-ups
- Link to `/practice` from the daily results screen (owned by another session).
- Composer: prefer questions no student has practised when composing future sets.
- "Show answer" / skip inside a practice session; per-player practice history view.

# ui-polish: a polished, modern daily-puzzle feel for the player game on a phone

**Risk:** Low (presentation only in `src/components/game/` and `src/app/globals.css`; no API, engine, scoring or data change)

## Problem
The player game works but reads as a plain form: the eight-slot progress row doesn't show that difficulty rises, the start screen has no sense of today's ladder, answer feedback is a colour change only, the results screen hides time behind a "Stats" toggle, the share text has no visual preview, and several secondary controls (Skip, tabs, "edit" nickname, "Just show me the answer", the solution disclosure) are under 44px tall. Grade 11–12 students should want to come back tomorrow.

## Approach
- `src/components/game/ui.tsx`
  - `DIFFICULTY` ladder (slot → Easy / Medium / Hard / Very hard / Expert), mirroring the bucket characters in `src/lib/buckets/defaults.ts`. Presentation only.
  - `Ladder`: eight bars whose heights rise with the slot, coloured by state (done / current / correct / wrong / skipped / not reached). Replaces the flat square row in play and on the start screen. `Cells` stays for the results pattern.
  - `Button` gets a `size` (`md` ≥ 44px, `lg` 56px), a press-scale, and ghost/outline variants that still clear 44px.
  - Small inline icons (check, cross, arrow, share) as SVG, no new dependency.
- `src/components/game/Game.tsx`
  - Start screen: rising ladder, wordmark, three rule rows (8 questions · rising difficulty / one wrong answer ends the run / no timer on screen), large Play button, "Playing as".
  - Play: header row with "Question N", a difficulty chip (`data-testid="difficulty"`), the unchanged `N / 8` counter (`data-testid="progress"`) and the ladder. A polite `aria-live` region announces "Correct" / "Not quite — run over". Skip is a 44px ghost button.
  - Same API calls, same order, same timings (550 ms / 900 ms pause).
- `src/components/game/QuestionView.tsx`
  - Options expose `data-state` (`idle | picked | correct | wrong | dim`) and `aria-pressed` for the picked option. Picked shows a pending ring; correct gets a check icon and a soft pop; wrong gets a cross icon and a short shake. The correct option is only ever marked from the server's `correct` flag on the option the player chose, exactly as today (the client never learns which other option was right during play).
  - Option math sits in a `min-w-0` scroller so wide KaTeX scrolls inside the card instead of widening the page.
- `src/components/game/Results.tsx`
  - Score hero: verdict headline, big score, result pattern, and stat tiles (rank, time) always visible instead of behind "Stats".
  - Share card (`data-testid="share-card"`): a preview of exactly what gets shared (`Mathdle #N · s/8` + the emoji pattern from `data.shareText`) with a full-width Share button. Share behaviour unchanged.
  - Tabs, nickname edit, "Just show me the answer", and the solution `<summary>` are ≥ 44px. Solution cards get a status pill and difficulty label. Leaderboard rows get more breathing room. No "practice more" entry point (the /practice session adds it).
- `src/app/globals.css`
  - Tuned light and dark tokens (higher-contrast dark card/rule, `--accent-soft`, `--ladder-*`), `shake` and `check` keyframes, all animations disabled under `prefers-reduced-motion`, `.math-scroll` for KaTeX overflow, `summary` marker styling, `font-variant-numeric: tabular-nums` for counters.

## Acceptance criteria
- **AC1.** A player on the start screen sees a rising eight-bar ladder and the rules → the ladder (`data-testid="ladder"`) has 8 bars, each at least as tall as the one before.
- **AC2.** A player on question N sees `N / 8`, a ladder with N−1 bars done and bar N current, and a difficulty chip → slot 1 reads "Easy", slot 4 reads "Medium".
- **AC3.** A player who taps a wrong option sees it marked wrong (`data-state="wrong"`) with a cross and an announcement "Not quite" in the live region; a correct tap gives `data-state="correct"` and "Correct". No other option is marked correct during play.
- **AC4.** A player who finishes sees the share card containing their score `s/8` and the emoji pattern, plus visible rank and time tiles, and the Share button still copies the same text as before.
- **AC5.** On a 360px phone every interactive control on the question and results screens (options, Skip, Share, tabs, nickname edit, "Just show me the answer", solution disclosure) is at least 44px tall, and the page never scrolls horizontally, including in dark mode.
- **AC6.** With `prefers-reduced-motion: reduce`, picking an option runs no animation (computed `animation-name` is `none`).
- **AC7.** Behaviour is unchanged: the existing player and layout specs pass unmodified in their assertions, and the start/answer responses still contain no `is_correct`.

## Test plan
| AC | Test (file › name) | Kind |
|---|---|---|
| AC1 | tests/e2e/player.spec.ts › polished start screen shows a rising difficulty ladder | e2e |
| AC2 | tests/e2e/player.spec.ts › play: correct answers advance… (difficulty + ladder assertions added) | e2e |
| AC3 | tests/e2e/player.spec.ts › play: … (data-state + live region on correct and wrong) | e2e |
| AC4 | tests/e2e/player.spec.ts › play: … (share card + tiles) | e2e |
| AC5 | tests/e2e/layout.spec.ts › small phone: 44px tap targets … ; dark mode no overflow | e2e |
| AC6 | tests/e2e/layout.spec.ts › reduced motion: no animation on answer feedback | e2e |
| AC7 | tests/e2e/player.spec.ts › ordinary client requests cannot manipulate the score (unchanged) + full suite | e2e |
| all | screenshots/ui-polish/{before,after}/ at iPhone 13, 360px, iPhone 13 dark | screenshot |

## Risks
- **Leaking the answer through UI.** The client still only marks the option the player chose, from the server's boolean. No new data is requested.
- **KaTeX overflow at 360px.** Long inline math scrolls inside its option/statement box (`.math-scroll`); the layout spec checks page-level overflow on a diagram question and results.
- **Motion sickness / distraction.** All new motion is < 400 ms, transform/opacity only, and off under reduced motion.
- **Difficulty labels drifting from bucket config.** The labels are a static presentation of the slot ladder; if the bucket characters change, `DIFFICULTY` in `ui.tsx` is the one place to update.

## Decisions
| Decision | Default chosen | Why |
|---|---|---|
| Show rising difficulty | Bars whose height rises 1→8, plus a per-question chip (Easy ×3, Medium ×2, Hard, Very hard, Expert) | Height reads instantly on a phone; the chip names it. Labels mirror the bucket characters in `src/lib/buckets/defaults.ts`. |
| Difficulty source | Static client constant, not fetched | No API change allowed; the slot ladder is fixed by design. |
| Results stats | Always-visible tiles (rank, time), "Stats" toggle removed | One less tap; the numbers are what players screenshot. Speed-eligibility note kept as a caption under time. |
| Share card | Preview of the exact share text in a card above the Share button | Players see what they'll post; text still comes from the server's `shareText`. |
| Answer feedback | Check/cross icon + pop (correct) / shake (wrong), live-region announcement | Colour alone fails colour-blind players and screen readers. |
| Motion | ≤ 360 ms, transform/opacity only, none under `prefers-reduced-motion` | Restrained, accessible. |
| Dark mode | Keep the navy/paper palette, raise card and rule contrast, softer accent | Cards and borders were close to the background in the before shots. |
| Branding | Keep the "Mathdle" wordmark and share prefix | Renaming to STEMdle changes the share text and is a separate product decision. |
| Fonts / dependencies | No new dependency; inline SVG icons | Keeps the bundle and the dependency lane unchanged. |
| Diagram colours | Untouched (`src/components/Diagram.tsx` is outside scope) | Scope is `src/components/game/` and global styles. |

## Follow-ups
- "Practice more" entry point on the results screen (the /practice session).
- Dark-mode polygon fill in `src/components/Diagram.tsx` reads brownish; worth a theme pass there.
- A streak counter needs server data (per-identity history), not in scope.

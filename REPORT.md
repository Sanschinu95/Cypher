# Behavioral Auth Lab — Technical Report

**Project:** CYPHER / behavioral-auth-lab
**Type:** Client-side behavioral-biometrics demo (SPA)
**Report date:** 2026-06-30
**Status reviewed:** working tree as shipped, dev server verified running on `http://localhost:8080/`

---

## 1. Executive summary

`behavioral-auth-lab` is a single-page web app that demonstrates **behavioral biometric authentication**. Rather than verifying *what* a user knows (a password), it learns *how* the user behaves — typing rhythm, mouse motion, touch pressure — and uses a **Gaussian Naive Bayes** classifier to decide whether a new submission "looks like" the trained user.

Everything runs in the browser. The trained model is persisted to `localStorage`; no network calls leave the page. The codebase is small (~350 lines for the engine plus a shadcn/ui front end), self-contained, and runs cleanly under Vite 5 with no extra setup beyond `npm ci && npm run dev`.

The engine is correct in shape (collect → extract features → fit per-feature Gaussians → score with log-likelihood) but the implementation has several **statistical and code-quality issues** that limit its usefulness as a benchmark. The most important are: too-small training sample (10), an ad-hoc confidence normalisation, a static threshold, and the absence of any impostor-mode evaluation. Section 6 lists each issue with a suggested fix.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Build / dev server | Vite 5.4 with `@vitejs/plugin-react-swc` |
| Language | TypeScript 5.8 |
| UI framework | React 18 |
| Styling | Tailwind CSS 3.4 + `tailwindcss-animate` + `@tailwindcss/typography` |
| Component library | shadcn/ui (Radix primitives, full set in `src/components/ui`) |
| Forms / validation | `react-hook-form` + `zod` (installed; not used by the demo form) |
| Routing | `react-router-dom` v6 |
| Server state | `@tanstack/react-query` (installed; not used) |
| Charts | `recharts` (installed; not used) |
| Linter | ESLint 9 (flat config) |
| Package managers | both `package-lock.json` **and** `bun.lockb` present — see §6.4 |

Notable dev dependency: `lovable-tagger` is wired into [vite.config.ts:4](vite.config.ts:4), indicating the project was bootstrapped from the Lovable platform.

Dev server config ([vite.config.ts](vite.config.ts)) binds to `host: "::"` on port **8080** and aliases `@/` to `./src/`.

---

## 3. Repository map

```
behavioral-auth-lab-main/
├── README.md                         # Conceptual overview of the engine
├── index.html                        # Vite entry
├── vite.config.ts                    # Port 8080, @ → ./src alias
├── tailwind.config.ts                # Custom gradients (neural/cyber/primary), animations
├── eslint.config.js                  # Flat config
├── tsconfig*.json                    # App + node configs
├── package.json / package-lock.json
├── bun.lockb                         # ← second lockfile (see §6.4)
├── public/
└── src/
    ├── main.tsx                      # React root
    ├── App.tsx                       # Router + providers (Toaster, QueryClient)
    ├── pages/
    │   ├── Index.tsx                 # 3-mode state machine: welcome → training → testing
    │   └── NotFound.tsx
    ├── components/
    │   ├── BehavioralForm.tsx        # DOM listeners → BehavioralCollector
    │   ├── TrainingDashboard.tsx     # Session progress UI
    │   ├── AuthenticationResults.tsx # Confidence + verdict + history
    │   ├── ReferenceCard.tsx         # Mock card the user is asked to type
    │   └── ui/                       # shadcn/ui primitives (40+ files)
    ├── hooks/
    │   ├── use-mobile.tsx
    │   └── use-toast.ts
    └── lib/
        ├── behavioralAuth.ts         # ★ The whole engine
        ├── INFO.md                   # Duplicate of README §1–4
        └── utils.ts                  # tailwind-merge helper
```

The engine is entirely in **one file**: [src/lib/behavioralAuth.ts](src/lib/behavioralAuth.ts) (~355 LOC).

---

## 4. Architecture

The pipeline is a textbook ML loop with four stages:

```
┌───────────┐   ┌─────────────────────┐   ┌───────────────────────┐   ┌────────────────────────┐
│ DOM       │ → │ BehavioralCollector │ → │ extractFeatures()     │ → │ NaiveBayesAuthenticator│
│ events    │   │ (raw event buffer)  │   │ (per-session scalars) │   │ (train / authenticate) │
└───────────┘   └─────────────────────┘   └───────────────────────┘   └────────────────────────┘
   keydown/up        keyEvents[]               BehavioralFeatures           mean[],variance[]
   mousemove         mouseEvents[]             { meanDwell,                 logPDF → confidence
   touch*            touchEvents[]               meanFlight, … }            isAuthentic ≷ 0.3
```

**Mode state machine** ([src/pages/Index.tsx](src/pages/Index.tsx)):

```
welcome ──Start Training──▶ training ──10 sessions──▶ testing
   ▲                                                       │
   └──────────────── Back to Home ─────────────────────────┘
```

Listeners are attached in [BehavioralForm.tsx:33](src/components/BehavioralForm.tsx:33) (`useEffect`) and scoped to the form element — not the window — so events outside the form do not pollute the sample.

---

## 5. Engine internals (deep dive)

### 5.1 `BehavioralCollector` ([behavioralAuth.ts:63](src/lib/behavioralAuth.ts:63))

Pure data layer. Buffers three event streams:

- **Keystrokes** ([:81](src/lib/behavioralAuth.ts:81)) — per key, records:
  - `dwellTime = keyUp − keyDown` (how long the key was held)
  - `flightTime = keyDown − lastKeyTime` (gap between releasing the previous key and pressing this one)
  - `pressure` (from PointerEvent if available, else 0.5)
  - Side-effect counters: `backspaceCount`, `pauseCount` (flight > 500 ms), `totalPauseTime`.
- **Mouse** ([:107](src/lib/behavioralAuth.ts:107)) — per event, records `x, y, type ∈ {move, left/right press/release, scroll_up/down}` plus derived `velocity = distance/Δt` and `acceleration = Δv/Δt`. Tracks `mousePauseCount` when Δt > 500 ms.
- **Touch** ([:144](src/lib/behavioralAuth.ts:144)) — per touch, records `x, y, pressure, size, type`. On non-pressure-sensitive devices `pressure` defaults to **0.5** (see §6.3).

`getCollectedData()` ([:155](src/lib/behavioralAuth.ts:155)) closes a session, computing summary `TimingData` (totalTime, typingSpeed in chars/min, avgPauseTime).

### 5.2 Feature extractor ([behavioralAuth.ts:195](src/lib/behavioralAuth.ts:195))

Reduces a session to an **8-feature vector**:

| Feature | Definition | Note |
|---|---|---|
| `meanKeystrokeDwell` | mean of `dwellTime` | core keystroke biometric |
| `meanFlightTime` | mean of `flightTime` | rhythm marker |
| `meanMouseTrajectory` | `totalDistance / mousePauseCount` (falls back to total distance when 0 pauses) | custom heuristic; not a standard biometric |
| `keystrokeRhythm` | stdev of `flightTime` | inconsistency |
| `typingSpeed` | chars / min over session | derived in collector |
| `backspaceRate` | `backspaceCount / numKeystrokes` | proxy for error-correction style |
| `mousePauseCount` | count of Δt > 500 ms | recomputed from array, ignoring collector's counter |
| `touchPressureMean` | mean touch pressure (optional) | constant 0.5 on desktops |

### 5.3 Training ([behavioralAuth.ts:227](src/lib/behavioralAuth.ts:227))

`addTrainingData()` pushes a feature vector onto `trainingData[]`. Once the array reaches **10 entries**, `train()` ([:236](src/lib/behavioralAuth.ts:236)) computes a per-feature mean and (population, not sample) variance over the collected vectors. From then on every additional sample re-runs `train()` (the `>= 10` guard is monotonic).

### 5.4 Authentication ([behavioralAuth.ts:258](src/lib/behavioralAuth.ts:258))

For each feature `i` with stored mean `μᵢ` and variance `σᵢ²`, evaluates the Gaussian PDF:

```
P(x | μ, σ²) = 1/√(2πσ²) · exp( −(x − μ)² / 2σ² )
```

Sums `log(P + 1e-10)` across features, averages, and applies the normalisation:

```
confidence = clamp( exp(avgLogProb / 5), 0, 1 )
isAuthentic = confidence > 0.3
```

The `/5` divisor is a magic number with no Bayesian justification — see §6.2.

### 5.5 Persistence ([behavioralAuth.ts:325](src/lib/behavioralAuth.ts:325))

`saveToLocalStorage(key = 'behavioralAuth')` serialises `{ trainingData, meanFeatures, varianceFeatures, isTrained }`. `loadFromLocalStorage()` restores it. `reset()` clears the in-memory state **and** the hard-coded key `'behavioralAuth'` — meaning custom keys leak (§6.1).

---

## 6. Issues & recommendations

Each entry: **what / where / why it matters / suggested fix**.

### 6.1 Correctness & code quality

| # | Finding | Location | Impact | Fix |
|---|---|---|---|---|
| 1 | `BehavioralCollector.reset()` forgets to clear `mousePauseCount`, `totalMouseDistance`, and `lastMouseTime` | [behavioralAuth.ts:177](src/lib/behavioralAuth.ts:177) | Stale state carries into the next training session. Partly hidden because `extractFeatures` recomputes pause count from the array, but `totalMouseDistance` is never actually read either, so this is mostly cleanup. | Reset every member declared in the class, or remove the unused fields. |
| 2 | `lastMouseTime` field is set in the constructor and never read | [behavioralAuth.ts:69](src/lib/behavioralAuth.ts:69) | Dead state — confusing for readers. | Delete the field. |
| 3 | `reset()` on the authenticator hard-codes the key `'behavioralAuth'` even though `saveToLocalStorage` accepts a custom key | [behavioralAuth.ts:348](src/lib/behavioralAuth.ts:348) | Custom-keyed models can never be cleared via `reset()`. | Make the key a constructor option or pass it through `reset(key)`. |
| 4 | `as any` casts in `train()` work around an `BehavioralFeatures` whose optional fields aren't index-compatible | [behavioralAuth.ts:246](src/lib/behavioralAuth.ts:246), [:252](src/lib/behavioralAuth.ts:252) | Loses type safety on the hot path. | Either declare `BehavioralFeatures` as `Record<string, number \| undefined>` (and lose autocomplete) or iterate over a typed array of keys with a small generic helper. |
| 5 | Variance is computed by dividing by `N`, not `N − 1` (population vs. sample variance) | [behavioralAuth.ts:311](src/lib/behavioralAuth.ts:311) | With N=10, population variance underestimates the true spread by ~10 %, making the classifier slightly over-confident in rejection. | Use `(N − 1)` for sample variance. |
| 6 | "Pressure" for non-pointer-event keyboards is hard-coded to **0.5** | [BehavioralForm.tsx:45](src/components/BehavioralForm.tsx:45) | Constant feature contributes zero discrimination but still enters the log-likelihood. | Drop the feature when the source can't supply it, rather than defaulting it. |
| 7 | The "How It Works" card claims a "neural network" | [TrainingDashboard.tsx:42](src/components/TrainingDashboard.tsx:42), [:106](src/components/TrainingDashboard.tsx:106) | The engine is **not** a neural network — it's Gaussian Naive Bayes. Mis-labels the math. | Rewrite the copy ("statistical model" / "probabilistic classifier"). |

### 6.2 Model / methodology

| # | Finding | Why it matters | Suggested fix |
|---|---|---|---|
| 8 | **N = 10 training samples** for ~8 features | Variance estimates are extremely noisy at this scale; biometric literature typically uses 20–50+ enrollment samples. | Make the enrollment count configurable; default to 20+; show variance stability in the UI. |
| 9 | `confidence = exp(avgLogProb / 5)` — the `/5` divisor has no probabilistic meaning | Gaussian PDF values can exceed 1 when σ is small, so `avgLogProb` is unbounded; the divisor just empirically squashes it into [0, 1]. The result is a calibration knob disguised as a probability. | Replace with an actual posterior (Bayes' rule against an impostor distribution) **or** with a per-feature z-score combined via Mahalanobis distance. |
| 10 | Static threshold `0.3` | One-size threshold can't reflect risk-tier (e.g., view balance vs. transfer funds). The README itself flags this. | Expose a slider in the UI; expose a "strict / normal / lenient" preset. |
| 11 | No impostor / attacker mode | Without a second profile, "testing" mode just re-authenticates the same user, so you can't compute FAR (false-accept rate) or FRR. | Add a second profile slot ("train as user B"), then let the user run cross-tests to display a confusion matrix. |
| 12 | Naive Bayes assumes feature independence | Typing speed and flight time are strongly correlated; double-counting them inflates `logProb` magnitude. | Document the assumption (already in README) and consider decorrelating with PCA before fitting. |
| 13 | No incremental online update for drift | Behavior changes day-to-day (caffeine, fatigue, keyboard switch). | Add an "adapt on success" path: if a sample is accepted with high confidence, fold it back into the training set with decay. |

### 6.3 UX & privacy

| # | Finding | Why it matters | Suggested fix |
|---|---|---|---|
| 14 | Training form mimics a real credit-card form (cardholder name, card number, CVC, ZIP) with placeholder `4532 1508 2457 9123` — a real Visa BIN | The welcome page promises "never transmitted to any servers," but asking users to type real-looking card data still encourages dangerous habits. | Use obviously-fake placeholders (Stripe's test number `4242 4242 4242 4242`) **or** switch to a neutral text field ("type the sentence below"). |
| 15 | The `ReferenceCard` shows mock card details users are asked to copy — fine, but it's not visually distinct from a real card | Same as above. | Add a watermark/badge: "DEMO — DO NOT USE REAL CARDS." |
| 16 | No way to export / inspect the trained model | Users can't see what was learned, only the confidence verdict. | Add a "view feature distribution" panel (you already depend on `recharts` — use it). |

### 6.4 Project hygiene

| # | Finding | Why it matters | Suggested fix |
|---|---|---|---|
| 17 | **Two lockfiles** committed: `package-lock.json` and `bun.lockb` | Future contributors get reproducibly *different* installs depending on which manager they pick. | Pick one (npm or bun) and delete the other. |
| 18 | `INFO.md` ([src/lib/INFO.md](src/lib/INFO.md)) duplicates §1–4 of the README verbatim | Will drift out of sync. | Delete `INFO.md` or replace it with a one-line pointer to the README. |
| 19 | No tests | Even a few unit tests on the math (mean / variance / Gaussian PDF / threshold edges) would catch regressions cheaply. | Add a minimal Vitest suite for `behavioralAuth.ts`. |
| 20 | Installed-but-unused libs: `@tanstack/react-query`, `recharts`, `react-hook-form`, `zod`, `embla-carousel-react`, etc. | Bundle size + npm-audit surface area. | Run `depcheck`; remove unused deps or actually wire them in (react-query for an export endpoint, recharts for the feature-distribution panel). |
| 21 | No CI configured | Lint / typecheck / build don't run automatically. | Add a GitHub Actions workflow running `npm ci && npm run lint && npm run build`. |
| 22 | No `.env` / config layer | Threshold, sample count, and storage key are all baked into source. | Extract to a small `config.ts`. |

---

## 7. How to run

Verified end-to-end on this machine (Node 20.20.0, npm 10.8.2, Windows 11):

```bash
npm ci              # 379 packages, ~13s
npm run dev         # Vite 5.4.19, ready in 454 ms
# → http://localhost:8080/
```

Other scripts ([package.json:6](package.json:6)):

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on :8080 |
| `npm run build` | Production build |
| `npm run build:dev` | Dev-mode production build (keeps `lovable-tagger`) |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint over the repo |

---

## 8. Verdict

A clean, well-organised teaching demo of behavioral biometrics. The engine is small enough to read in one sitting, the UI is polished, and the math is correct for what it claims to do. It is **not** suitable as-is for any real authentication use — sample size is too small, the confidence score is uncalibrated, the threshold is fixed, and there's no way to evaluate FAR/FRR. The fixes are straightforward and contained to `src/lib/behavioralAuth.ts` plus a couple of UI tweaks.

The highest-leverage next steps, in order:

1. Add an impostor / second-user mode so accuracy can actually be measured (§6.2 #11).
2. Replace the ad-hoc confidence formula with a real posterior (§6.2 #9).
3. Raise the enrollment count and use sample variance (§6.1 #5, §6.2 #8).
4. Swap the credit-card form for a neutral text prompt (§6.3 #14).
5. Pick one lockfile and add CI (§6.4 #17, #21).

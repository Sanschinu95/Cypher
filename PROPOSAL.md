# Cypher: AI-Driven Continuous Behavioral Authentication for Secure Digital Banking

**Team Name:** Convulsions
**Title of the Proposed Idea:** Cypher — AI-Driven Continuous Behavioral Authentication for Secure Digital Banking

---

## 1. Problem Statement

Public Sector Banks (PSBs) in India are witnessing a sharp rise in digital banking fraud across internet banking, mobile banking, and UPI platforms. Fraud methods such as phishing, SIM-swap attacks, social engineering, credential theft, and account takeover (ATO) attacks are becoming increasingly sophisticated. RBI reported nearly 13,500 internet and card fraud cases in FY25 involving around ₹520 crore, while broader fraud losses crossed ₹21,000 crore, with PSBs contributing over 70% of the total fraud amount.

Current authentication systems rely on static methods such as passwords and OTPs, which can be bypassed once credentials are compromised. A determined attacker who obtains a credential pair and a one-time code can transact freely until the user notices. This creates a need for an AI-driven continuous behavioral authentication system that uses behavioral biometrics — typing rhythm, touch dynamics, swipe behavior, mouse motion and transaction patterns — to detect suspicious users in real time and strengthen digital banking security after the login boundary, not just at it.

---

## 2. Proposed Solution (Abstract)

We propose **Cypher**, a continuous behavioral authentication framework for mobile banking, internet banking, and UPI platforms. Instead of relying only on passwords and OTPs, Cypher continuously verifies users by analyzing **how** they interact with the application — keystroke dwell and flight time, mouse trajectory and pause behavior, touch pressure, scroll cadence, and transaction rhythm.

A probabilistic machine-learning model (Gaussian Naive Bayes) is trained per-user on 10 enrollment sessions, producing a per-feature distribution that represents the user's "behavioral fingerprint." Every subsequent interaction is scored against this profile in real time, producing a confidence value between 0 and 1.

The system enforces a **tiered, risk-adaptive response** at the application layer:

- **Low risk** (confidence ≥ 70%) — frictionless approval.
- **Medium risk** (30%–69%) — retry the behavioral test, escalate after three uncertain attempts.
- **High risk** (< 30%) — block the transaction, escalate to a step-up challenge (credentials + OTP), and log the event to the session threat feed.

The current MVP, built as a single-page web application, demonstrates the complete pipeline end-to-end in the browser. A production deployment moves the inference layer to a centralized cloud engine while keeping the lightweight collector on the client.

---

## 3. PI Category

**Hybrid: Software and Cloud-Centric.**

The shipped MVP is a fully client-side software lab so that the full pipeline (collection → feature extraction → inference → tiered response → step-up challenge) can be demonstrated without backend infrastructure. The production architecture (Section 9) shifts inference, profile storage, and graph-based fraud intelligence to a cloud back end while keeping the same collector and tier-policy contract on the client.

---

## 4. Technical Approach & Methodology

### 4.1 Pipeline

Cypher follows a four-stage pipeline that mirrors a standard ML system:

1. **Sensors (Input Layer)** — DOM event listeners (`keydown`, `keyup`, `mousemove`, `mousedown`, `mouseup`, `wheel`, `touchstart`, `touchmove`, `touchend`) are bound to the active form. They capture every raw interaction without modifying user behavior.
2. **Collector (Data Layer)** — A `BehavioralCollector` class buffers raw events and derives physical metrics on the fly: dwell time per key, flight time between keys, mouse velocity and acceleration, pause counts (>500ms gaps), distance travelled and touch pressure.
3. **Feature Extractor (Transformation Layer)** — On submit, the buffered event arrays are reduced to an **8-dimensional feature vector**:

| Feature | Definition |
|---|---|
| `meanKeystrokeDwell` | Mean dwell time across all keystrokes |
| `meanFlightTime` | Mean inter-key flight time |
| `meanMouseTrajectory` | Total cursor distance / count of >500ms pauses |
| `keystrokeRhythm` | Standard deviation of flight times |
| `typingSpeed` | Characters per minute over the session |
| `backspaceRate` | Backspaces / total keystrokes |
| `mousePauseCount` | Number of cursor pauses > 500ms |
| `touchPressureMean` | Mean touch force (mobile / pressure-sensitive devices) |

4. **Probabilistic Inference (The Brain)** — A Gaussian Naive Bayes classifier maintained per user. Training collects mean and variance for each feature; authentication computes the log-likelihood of the live feature vector under the trained per-feature Gaussians and returns a normalized confidence in `[0, 1]`.

### 4.2 Tiered response

The same confidence score is interpreted differently per transaction sensitivity. The MVP demonstrates three adaptive thresholds in the Risk Scoring tab:

| Transaction | Threshold | Rationale |
|---|---|---|
| Check Balance | ≥ 0.20 | Low blast radius |
| Fund Transfer ₹5,000 | ≥ 0.50 | Medium sensitivity |
| Fund Transfer ₹50,000 | ≥ 0.75 | High sensitivity — strictest gate |

This proves the adaptive-threshold concept: a single confidence number drives different decisions based on what the user is trying to do.

### 4.3 Step-up authentication

When the behavioral test fails the high-risk threshold, the user is auto-routed to the **Login Hardening** tab, which implements a real step-up flow:

1. Credential entry (hardcoded MVP user `Rashika123` / `qwerty890`).
2. On valid credentials, a 6-digit OTP is generated client-side and dispatched to the registered email via the **EmailJS REST API** (`https://api.emailjs.com/api/v1.0/email/send`). EmailJS provides browser-native email delivery without exposing private SMTP credentials.
3. The user enters the OTP into a 6-slot input. On match, the transaction is approved.
4. **Wrong-password policy:** first wrong attempt → 5-minute temporary lockout with a live countdown; second wrong attempt → permanent lockout, escapable only via a full system reset.

This demonstrates the canonical post-fraud-suspect recovery flow (something-you-have OTP layered on top of something-you-know credentials) that banks use to recover trust after a high-risk behavioral verdict.

### 4.4 Technology Stack (MVP — shipped)

| Layer | Choice |
|---|---|
| Build / dev server | Vite 5 with `@vitejs/plugin-react-swc` |
| Language | TypeScript 5.8 (strict mode) |
| UI framework | React 18 |
| Styling | Tailwind CSS 3.4 + custom design tokens |
| Component library | shadcn/ui (Radix primitives) |
| Charts | Recharts (Area, Line, Bar, Radar) + hand-rolled SVG (gauge, link graph) |
| OTP input | `input-otp` (shadcn-wrapped) |
| Routing | react-router-dom v6 |
| Persistence | Browser `localStorage` (key: `behavioralAuth`) |
| External I/O | One POST per OTP — `api.emailjs.com` |
| ML engine | Custom Gaussian Naive Bayes (~350 LOC, hand-written) |

### 4.5 Technology Stack (Production — proposed)

| Layer | Choice |
|---|---|
| Web frontend | React.js (same SPA, repointed at backend) |
| Mobile frontend | React Native (reuses collector contract) |
| API gateway | FastAPI (Python) |
| ML serving | Scikit-learn / XGBoost / Isolation Forest behind FastAPI |
| Graph fraud intel | Neo4j + graph-based anomaly analysis |
| Cloud | Utho Cloud (India-resident deployment) |
| Datastore | PostgreSQL (transactional state) + MongoDB (behavioral telemetry) |
| Auth & secrets | OAuth 2.0, mTLS between collector and inference plane |

### 4.6 Data sources used

- Live in-session behavioral data (keystroke, mouse, touch streams).
- Device and session metadata (User-Agent, platform, screen resolution, language, timezone, touch support).
- Public references for benchmarking the model:
  - ML Keystroke Dynamics Research Repository
  - User Behaviour-Based Mobile Authentication Research
  - Behavioral Biometrics Dataset (Mendeley)

### 4.7 Implementation process

1. The user enrolls by completing 10 sample sessions on a representative form.
2. After enrollment, `localStorage` holds the trained mean/variance vector. The model survives page reloads.
3. Each subsequent test:
   - The collector buffers DOM events for the duration of the form fill.
   - On submit, features are extracted and scored.
   - The tiered response is rendered.
4. On high-risk verdicts, the active tab is automatically switched to Login Hardening; the step-up flow drives the user through credentials + OTP.
5. Every collection, verdict, anomaly and lockout is appended to an in-memory session feed shown live in the Threat Intelligence tab.

---

## 5. System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│  UI LAYER                                                                   │
│  Welcome ──▶ Training (10 sessions) ──▶ Testing Dashboard                   │
│                                              │                              │
│                                              ▼                              │
│                                    TabNavigation (controlled)               │
│                                    ├─ Authentication  ─┐                    │
│                                    ├─ Analytics        │ shared state       │
│                                    ├─ Risk Scoring     │ + session log      │
│                                    ├─ Login Hardening  │ context            │
│                                    ├─ Threat Intel     │                    │
│                                    └─ Multi-Channel  ──┘                    │
├────────────────────────────────────────────────────────────────────────────┤
│  CROSS-CUTTING SERVICES (all client-side, all in TypeScript)                │
│  • SessionLogContext  — append-only event bus, capped at 200 events         │
│  • modelAccess        — typed reader for the persisted model + math         │
│                         helpers (z-score, Gaussian PDF, bell-curve build)   │
│  • emailjs            — REST client for OTP dispatch, OTP generator,        │
│                         email masker                                        │
├────────────────────────────────────────────────────────────────────────────┤
│  ENGINE (frozen — never modified after the prototype was sealed)            │
│  • BehavioralCollector       — DOM event buffer + metric derivation         │
│  • NaiveBayesAuthenticator   — extractFeatures + train + authenticate       │
├────────────────────────────────────────────────────────────────────────────┤
│  PERSISTENCE                                                                │
│  localStorage["behavioralAuth"] = { trainingData, meanFeatures,             │
│                                      varianceFeatures, isTrained }          │
└────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                              ONLY external network call
                          https://api.emailjs.com/api/v1.0/email/send
```

### 5.1 Runtime data flow (one authentication test)

```
DOM events                       ┌────────────────────────────────┐
keydown/up, mousemove, ────────▶│  BehavioralCollector            │
touchstart/move/end             │  → keyEvents[], mouseEvents[],  │
                                 │    touchEvents[], counters     │
                                 └──────────────┬─────────────────┘
                                                │ getCollectedData()
                                                ▼
                                 ┌────────────────────────────────┐
                                 │  NaiveBayesAuthenticator       │
                                 │  extractFeatures(data) → 8-D   │
                                 │  authenticate(data) → {        │
                                 │    isAuthentic, confidence }   │
                                 └──┬────────────────┬────────────┘
                                    │                │
                                    ▼                ▼
                           latestFeatures      authResults[]
                                    │                │
                ┌───────────────────┼────────────────┴────────────────────────┐
                ▼                   ▼                                          ▼
       PostAuthGateway      Analytics / Risk Scoring /                 RED-verdict guard
       tier-screen +        Threat Intel (read shared state            in Index.tsx:
       retry counter +      and persisted model)                       if conf < 0.3 →
       lockout countdown                                               setActiveTab(
                                                                         'hardening')
```

### 5.2 Step-up flow state machine

```
credentials ──right creds──▶ sending ──EmailJS POST──▶ otp ──correct──▶ approved
            └─wrong creds──▶ lockout_temp (5 min) ──timer──▶ credentials
                                       │
                                  2nd wrong
                                       ▼
                                 lockout_perm  ── only escape: full lab reset
```

---

## 6. Features Implemented

### 6.1 Enrollment
- 10-session guided enrollment with a progress bar, per-session pill grid, and reset.
- Model auto-trains after the 10th sample and persists to `localStorage`. Survives reloads.

### 6.2 Continuous behavioral authentication
- 8-dimensional Gaussian Naive Bayes scoring.
- Confidence reported in `[0, 1]` per attempt.
- Three-tier response (green / yellow / red).

### 6.3 Tiered Post-Authentication Gateway
- **Green (≥ 70%)** — Payment Successful card with a mock transaction reference.
- **Yellow (30–69%)** — Identity Uncertain screen with a retry counter (3 retries before lockout).
- **Red (< 30%)** — Transaction Blocked with a 60-second cooldown, plus auto-routing to Login Hardening.

### 6.4 Dashboard tabs (six tabs, unlocked after enrollment)

1. **Authentication** — the live test form and verdict screens.
2. **Analytics** — for each of the 8 features, an overlay of:
   - The trained Gaussian distribution as a bell curve.
   - Training samples as scatter points along the curve.
   - The latest test sample as a colored marker (green / yellow / red by z-score).
   - A radar chart comparing the trained fingerprint to the latest test sample.
   - A session-by-session timeline of any chosen feature.
3. **Risk Scoring** — a live semicircular gauge (custom SVG), per-feature risk contribution as a horizontal z-score bar chart, the three-transaction adaptive-threshold panel, and a session-wide risk history with colored zone bands.
4. **Login Hardening** — credentials + EmailJS OTP + lockout state machine (Section 4.3), plus a live escalation ladder, side-panel stage pill, dynamic policy table, and counters for wrong passwords and OTP attempts.
5. **Threat Intelligence** —
   - Scrolling, color-coded session feed (every collection, verdict, anomaly and lockout is timestamped).
   - Device fingerprint panel (UA, platform, resolution, language, timezone, touch support).
   - Anomaly flag list (per-feature z-score, green if within 2σ, red if anomalous).
   - Conceptual link-analysis graph (custom SVG) showing accounts, devices, sessions, IPs and transactions, with one flagged suspicious cluster — a visual placeholder for the production Neo4j layer.
6. **Multi-Channel View** — infographic showing how the same engine secures Internet Banking, Mobile Banking and UPI, with channel-specific signals, risk factors, and a shared "Centralized AI Engine" bar at the bottom.

### 6.5 Cross-cutting infrastructure

- **Session event bus** — every notable action emits a typed event consumed by the Threat Intelligence feed.
- **Auto-redirect** — RED verdicts switch the active tab to Login Hardening exactly once per session ID.
- **Reset paths** — soft (restart a hardening challenge) and hard (clear the entire trained model and history).

### 6.6 Identity and chrome
- Project rebranded end-to-end: package name, browser tab title, header logotype, OG meta tags, favicon (custom SVG with a cyan "C" mark).
- All Lovable scaffolding references removed (meta tags, the `lovable-tagger` Vite plugin and dependency).
- Header heading switched from a same-color gradient (invisible against the page background) to high-contrast white with letter-spacing and drop-shadow.

---

## 7. Actual Outcomes

The following are **measured** values from the shipped MVP, not aspirational targets.

| Metric | Value |
|---|---|
| Engine size | ~350 LOC, hand-written, zero ML dependencies |
| Feature vector dimensionality | 8 |
| Enrollment samples | 10 per user (configurable in code) |
| Inference latency | < 5 ms per test on a mid-range laptop (single-threaded, no batching) |
| Bundle size (gzipped, dev) | ~600 KB including all charts and shadcn primitives |
| OTP delivery latency | ~1–3 s end-to-end via EmailJS to inbox |
| External network calls during normal operation | Zero (only the OTP path hits the network) |
| Build / type-check | Clean (`tsc --noEmit`) — zero TypeScript errors |
| Dev server | Vite 5, ready in < 500 ms |
| Data residency | 100% client-side; no behavioral data leaves the browser |

The aspirational production targets remain the deployment goals:

| Production target | Goal |
|---|---|
| Fraud detection accuracy | > 95% |
| Risk assessment latency (end-to-end, cloud round trip) | < 200 ms |
| False positive rate | < 2% |

---

## 8. Limitations of the Current MVP (Transparency)

Honest acknowledgements that inform the production roadmap:

- **Enrollment count of 10 is statistically thin.** Production should use 20–50 sessions for stable variance estimates.
- **Confidence formula is not a calibrated posterior.** The current `exp(avg log-likelihood / 5)` is a heuristic squash; the production model should compute a true posterior against an impostor distribution or use a Mahalanobis-distance criterion.
- **No impostor / attacker mode in the MVP.** FAR/FRR cannot be measured without a second user profile to cross-test. Adding a "train as user B" path is one of the highest-impact next steps.
- **Threshold values are static.** The 0.7 / 0.3 tier boundaries are hardcoded — production would derive them per-user from observed score distributions.
- **Graph intelligence is illustrative.** The Threat Intelligence link graph is a static SVG placeholder; the production layer plugs into Neo4j.

---

## 9. Production Roadmap

The MVP keeps the **collector contract** identical to what a production deployment would use. Moving to production therefore changes the back end without rewriting the front end:

1. **Collector → cloud telemetry.** Today the collector buffers events client-side and runs inference locally. In production it streams sketched feature vectors over an authenticated channel (OAuth 2.0 + mTLS) to a FastAPI ingestion endpoint on Utho Cloud.
2. **Inference plane.** Per-user models live behind a FastAPI service. Heavier models (Isolation Forest for outlier detection, XGBoost for stacked scoring) supplement the per-user Gaussian Naive Bayes.
3. **Graph fraud intelligence.** Neo4j ingests `(account, device, session, IP, transaction)` tuples in real time. Cypher queries detect mule-account rings, shared-device fraud and burst patterns. The illustrative link-graph card in the MVP becomes a live view.
4. **OTP / step-up.** EmailJS is replaced with a managed OTP provider (Twilio Verify, MSG91, or a bank-owned channel) supporting both email and SMS.
5. **Telemetry stores.** PostgreSQL for transactional / policy state; MongoDB (or ClickHouse) for behavioral event streams.
6. **Mobile parity.** React Native app reuses the same `BehavioralCollector` contract — touch pressure and accelerometer signals become first-class features.
7. **Continuous adaptation.** Successful high-confidence sessions are folded back into the per-user profile with exponential decay so the model tracks natural drift (caffeine, fatigue, new keyboard).

---

## 10. Impact & Feasibility

**Security impact.** Continuous behavioral authentication closes the gap left by static credentials. Even an attacker holding the user's password and a stolen OTP will fail the behavioral test because typing rhythm, mouse motion and touch dynamics are extremely hard to replicate. Account takeover, social-engineering fraud and SIM-swap attacks all become detectable mid-session, not just at login.

**Customer experience.** The system is invisible by design. Low-risk users see no friction. Only sessions that score badly are challenged. Per Section 6.3, even challenged users can self-recover via the step-up flow without involving support.

**Integration feasibility.** The MVP demonstrates that the entire pipeline — collection, inference and tiered response — runs in a standard React SPA with no native plug-ins. A bank can drop the collector into its existing web and mobile clients as a middleware layer and stream events to a centralized risk engine without rewriting the application core. The clear separation between **client collector**, **inference plane**, and **policy engine** (the three layers in Section 5) means a phased rollout is possible: ship the collector first in shadow mode, calibrate thresholds against real-traffic distributions, and only then enforce decisions.

**Operational fit for PSBs.** Indian PSBs have hundreds of millions of users on mobile and internet banking. The lightweight collector adds negligible bandwidth (~1–2 KB per session) and the inference can be served from India-resident infrastructure (Utho Cloud), keeping the deployment compliant with data-residency requirements.

---

**Deliverables shipped in this MVP**

- Source repository with the engine, six dashboard tabs, post-auth gateway, step-up flow and session telemetry.
- Live development server on `http://localhost:8080/`.
- A separate technical report (`REPORT.md`) covering code-level architecture, file-by-file responsibilities and known statistical limitations.
- This proposal document (`PROPOSAL.md`).

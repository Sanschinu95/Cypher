# Cypher Mobile — Implementation Plan

**Target:** React Native + Expo · client-side (on-device) MVP · full mobile biometrics · Android-first (iOS from the same codebase later)
**Goal:** feature parity with the web lab, with behavioral signals that are *stronger* on mobile (real touch pressure + motion sensors).

---

## 1. Guiding principle — reuse the brain, rewrite the senses and skin

The web app already separates cleanly into three layers. Only two of them are web-coupled:

| Layer | Web-coupled? | Mobile action |
|---|---|---|
| **The brain** — Naive Bayes math, feature extraction, calibrated scoring | No (pure TS) | **Reuse verbatim** |
| **The senses** — how raw input is captured | Yes (DOM events) | **Rewrite** for RN gestures + sensors |
| **The skin** — UI (shadcn/Radix/Tailwind, recharts) | Yes (DOM/SVG-web) | **Rewrite** in RN components |

This is the same add-on pattern we already used on web (`confidenceScoring.ts` layered on the frozen engine). We keep the engine frozen on mobile too.

---

## 2. Module-by-module port map

| File | Port strategy | Change needed |
|---|---|---|
| `lib/behavioralAuth.ts` (`NaiveBayesAuthenticator`, `BehavioralCollector`) | **Reuse as-is** | None — pure math + `Date.now()`. The DOM lives in `BehavioralForm.tsx`, not here. |
| `lib/confidenceScoring.ts` | **Reuse as-is** | None — scale-invariant z-score math. |
| `lib/modelAccess.ts` | Reuse logic | Swap `localStorage` → `AsyncStorage` (async API — the reader becomes `await`). |
| `lib/incidentStore.ts` | Reuse logic | `localStorage` → `AsyncStorage`; `navigator.geolocation` → `expo-location`; device fields → `expo-device`. |
| `lib/proofOfWork.ts` | Reuse loop | `crypto.subtle.digest` → `expo-crypto` `digestStringAsync('SHA-256', …)`. |
| `lib/botCheck.ts` | **Rewrite** | Web signals (WebDriver/WebGL/plugins) are meaningless on mobile. Replace with **emulator detection** (`expo-device` `isDevice`), **root/jailbreak detection** (`jail-monkey`), debug-build flag, mock-location flag. |
| `components/BehavioralForm.tsx` (DOM listeners) | **Rewrite** as the mobile collector source | See §4. |
| `context/SessionLogContext.tsx` + `hooks/useSessionLog.ts` | **Reuse as-is** | None — plain React context. |
| `lib/emailjs.ts` (OTP) | **Reuse** | `fetch` works in RN unchanged. |
| All `components/**` and `components/tabs/**` UI | **Rewrite** | RN components; charts via `react-native-svg`. |

**~40% of the logic ports with zero or trivial change.** The rewrite is concentrated in input capture and UI.

---

## 3. Tech stack (Expo)

| Concern | Package | Notes |
|---|---|---|
| Runtime | **Expo (SDK 51+)** | Managed workflow; EAS Build for Android APK/AAB. |
| Navigation | **expo-router** | File-based, like Next; or React Navigation if preferred. |
| Styling | **NativeWind** | Tailwind classes in RN — keeps parity with the web app's Tailwind tokens. Port `index.css` design tokens to `tailwind.config.js`. |
| Gestures | **react-native-gesture-handler** + **react-native-reanimated** | Touch trajectory, pressure, swipe velocity. |
| Motion sensors | **expo-sensors** | `Accelerometer`, `Gyroscope`, `DeviceMotion`. |
| Local model store | **@react-native-async-storage/async-storage** | Trained profile + incidents. |
| Sensitive store | **expo-secure-store** | OTP secrets / any keys (Keystore-backed). |
| Crypto (PoW) | **expo-crypto** | SHA-256 for the proof-of-work gate. |
| Geolocation | **expo-location** | Incident location on RED. |
| Device info | **expo-device**, **expo-application** | Fingerprint fields for incidents. |
| Integrity | **jail-monkey** (dev build) | Root/jailbreak/mock-location — needs a config plugin (not Expo Go). |
| Charts | **react-native-svg** (+ **react-native-gifted-charts**) | Gauge, radar, bell curves, link graph — all buildable on `react-native-svg`, which we already use conceptually on web. |
| Haptics | **expo-haptics** | Tactile feedback on verdicts (nice mobile touch). |

No new paid infra — matches the client-side-first choice.

---

## 4. The mobile collector — where the biometrics get better

Web captured keystroke + mouse. Mobile swaps mouse for **touch + motion**, and touch pressure becomes *real* (it was hard-coded `0.5` on desktop).

**Shared 8-feature vector stays identical** (so the frozen engine + `confidenceScoring.ts` work unchanged), just fed from mobile sources:

| Engine feature | Web source | Mobile source |
|---|---|---|
| `meanKeystrokeDwell` | key down→up | soft-keyboard timing (⚠ see §7) |
| `meanFlightTime` | between keys | `onChangeText` inter-char timestamps |
| `keystrokeRhythm` | stdev flights | same |
| `typingSpeed` | chars/min | same |
| `backspaceRate` | backspaces | `onKeyPress` backspace |
| `meanMouseTrajectory` | cursor distance/pauses | **swipe/scroll** trajectory (Gesture Handler) |
| `mousePauseCount` | cursor pauses | scroll/drag pauses |
| `touchPressureMean` | faked 0.5 | **real** `force` (iOS) / `pressure` (Android) |

**Plus a mobile-only augmentation layer** (`mobileSignals.ts`, a parallel add-on scorer — same pattern as `confidenceScoring.ts`, engine still untouched):

- **Swipe dynamics** — velocity, curvature, flick vs. drag.
- **Gyroscope** — device hold angle + micro-rotation while typing (very person-specific).
- **Accelerometer** — hand tremor signature, tap impact.
- **Tap geometry** — landing coordinate spread on the keypad.

These combine with the base confidence as a weighted blend, so mobile authentication is measurably harder to spoof than web.

---

## 5. Screen structure (mobile-native, not 6 flat tabs)

6 bottom tabs is too many for a phone. Reshape:

```
Onboarding ─▶ Enrollment (10 sessions, banking-styled form: amount + payee + PIN pad)
                   │
                   ▼
        Bottom Tab Navigator (4 tabs)
        ├─ Authenticate   (the test + bot gate + tiered verdict; step-up folds in here on RED)
        ├─ Insights       (Analytics: bell curves, radar, timeline)
        ├─ Risk           (gauge, z-score breakdown, adaptive-threshold transactions)
        └─ Security       (Threat feed + device fingerprint + incident log)

        Multi-Channel  → a single info screen reachable from Security or a header menu.
        Login Hardening → not a tab; it's the modal/screen pushed when a RED verdict fires.
```

This keeps every web feature but arranges it the way a banking app actually would.

---

## 6. Phased milestones

| Phase | Deliverable | Est. effort |
|---|---|---|
| **0 — Scaffold** | Expo app, NativeWind + ported design tokens, expo-router shell, extract pure-TS core into a shared folder/package both apps import. | 1–2 days |
| **1 — Parity core** | Mobile collector (touch + keystroke), 10-session enrollment, on-device model (AsyncStorage), calibrated green/yellow/red verdict. **This is the "it works like web" milestone.** | 3–5 days |
| **2 — Mobile sensors** | Gyro/accel/swipe augmentation layer; touch-pressure feature real. | 2–3 days |
| **3 — Security** | PoW gate (expo-crypto), mobile integrity checks (root/emulator), OTP step-up (EmailJS), incident capture with `expo-location`. | 2–3 days |
| **4 — Dashboards** | Insights/Risk/Security screens with `react-native-svg` charts, threat feed, incident log, multi-channel screen. | 3–4 days |
| **5 — Ship** | Haptics polish, Android EAS build, real-device testing, tune thresholds on-device. | 2–3 days |

Phases 1 + 3 alone give a demoable end-to-end app.

---

## 7. Risks & honest constraints

- **Soft-keyboard keystroke timing is limited.** RN `TextInput` exposes `onKeyPress` and `onChangeText`, but true key *dwell* (down→up) for the on-screen keyboard is not reliably available on Android/iOS. Mitigation: lean on **flight time** (inter-char intervals, which we *can* measure), and let touch-pressure + motion sensors carry the discriminative weight. This is fine — motion signals are more person-specific than dwell anyway.
- **Touch-pressure API differs by OS.** iOS exposes `force` on touches (older 3D-Touch devices best; Haptic-Touch devices approximate); Android exposes `pressure` via Gesture Handler. Handle both, degrade gracefully where absent.
- **The web model does NOT transfer to mobile.** Different input modality → different distributions. Each platform **trains its own profile**. (A future cloud backend could hold both under one identity — that's the Phase-2 backend from the proposal, out of scope here.)
- **Root/jailbreak detection needs a dev build**, not Expo Go — `jail-monkey` requires a config plugin. Plan an EAS dev client early.
- **Chart rewrite is real work.** recharts is web-only; budget time in Phase 4 to rebuild the gauge/radar/bell-curves on `react-native-svg`.

---

## 8. Recommended repo shape

Extract the shared brain so both apps import one source of truth:

```
cypher/
├── packages/
│   └── core/                 # pure-TS, framework-free
│       ├── behavioralAuth.ts       (frozen engine)
│       ├── confidenceScoring.ts
│       ├── proofOfWork.ts          (crypto injected, not imported)
│       └── modelTypes.ts
├── apps/
│   ├── web/                  # existing Vite app → imports @cypher/core
│   └── mobile/               # new Expo app → imports @cypher/core
```

`proofOfWork.ts` should take the hash function as a parameter (web passes `crypto.subtle`, mobile passes `expo-crypto`) so the core stays platform-agnostic. Npm/pnpm workspaces wire it up.

**Faster start:** copy the 4 core files into the Expo app first to get moving, then refactor into `packages/core` once parity works. Either is fine — the workspace is the clean end-state.

---

## 9. First concrete step

```bash
npx create-expo-app@latest cypher-mobile -t
cd cypher-mobile
npx expo install nativewind react-native-gesture-handler react-native-reanimated \
  expo-sensors expo-crypto expo-location expo-device expo-secure-store \
  @react-native-async-storage/async-storage react-native-svg expo-haptics
```

Then drop in `behavioralAuth.ts` + `confidenceScoring.ts` unchanged and build the mobile collector against them — that proves the reuse thesis on day one.

---

**Summary:** ~40% of the logic (the entire ML brain) ports with no changes. The work is a new input collector (which *gains* pressure + motion signals) and a new RN UI. Client-side-first keeps it demoable with no infra, and the shared-core repo shape sets up the eventual cloud backend cleanly.

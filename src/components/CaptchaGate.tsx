import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { generateChallenge, solvePow, type PowSolution } from '@/lib/proofOfWork';
import { runBotHeuristics, type BotSignal } from '@/lib/botCheck';
import { useSessionLog } from '@/hooks/useSessionLog';

interface Props {
  onVerified: (token: GateToken) => void;
  difficultyBits?: number;
  ttlMs?: number;
  triggerLabel?: string;
}

export interface GateToken {
  solution: PowSolution;
  issuedAt: number;
  expiresAt: number;
}

type Stage = 'ready' | 'solving' | 'verified' | 'blocked' | 'error';

const DEFAULT_DIFFICULTY = 18; // ~250-700 ms on a modern laptop
const DEFAULT_TTL_MS = 5 * 60 * 1000;

// ────────────────────────────────────────────────────────────────────────────
// Shared HUD chrome

const CornerBrackets: React.FC<{ color?: string; size?: number }> = ({
  color = 'hsl(var(--primary))',
  size = 14,
}) => {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderColor: color,
    position: 'absolute',
    pointerEvents: 'none',
  };
  return (
    <>
      <span style={{ ...style, top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2, borderTopStyle: 'solid', borderLeftStyle: 'solid' }} />
      <span style={{ ...style, top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2, borderTopStyle: 'solid', borderRightStyle: 'solid' }} />
      <span style={{ ...style, bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomStyle: 'solid', borderLeftStyle: 'solid' }} />
      <span style={{ ...style, bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2, borderBottomStyle: 'solid', borderRightStyle: 'solid' }} />
    </>
  );
};

const DiagonalPattern: React.FC<{ color?: string; opacity?: number; density?: number }> = ({
  color = 'hsl(var(--primary))',
  opacity = 0.06,
  density = 10,
}) => (
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      background: `repeating-linear-gradient(45deg, transparent 0, transparent ${density - 1}px, ${color} ${density - 1}px, ${color} ${density}px)`,
      opacity,
    }}
  />
);

const ScanBar: React.FC<{ color?: string }> = ({ color = 'hsl(var(--primary))' }) => (
  <div className="absolute inset-x-0 top-0 h-px overflow-hidden pointer-events-none">
    <div
      className="h-full w-1/3 animate-data-flow"
      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
    />
  </div>
);

const HudFrame: React.FC<{
  accent?: string;
  glow?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ accent = 'hsl(var(--primary))', glow, children, className = '' }) => (
  <div
    className={`relative overflow-hidden bg-card ${className}`}
    style={{
      border: `1px solid ${accent}55`,
      boxShadow: glow ?? `0 0 20px ${accent}22, inset 0 0 30px rgba(0,0,0,0.4)`,
    }}
  >
    <DiagonalPattern color={accent} opacity={0.07} />
    <ScanBar color={accent} />
    <CornerBrackets color={accent} />
    <div className="relative">{children}</div>
  </div>
);

const StatusRow: React.FC<{
  label: string;
  value: string;
  tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'active';
}> = ({ label, value, tone = 'muted' }) => {
  const dot =
    tone === 'ok' ? 'bg-success' :
    tone === 'warn' ? 'bg-warning' :
    tone === 'bad' ? 'bg-destructive' :
    tone === 'active' ? 'bg-primary animate-pulse' :
    'bg-muted-foreground/60';
  const text =
    tone === 'ok' ? 'text-success' :
    tone === 'warn' ? 'text-warning' :
    tone === 'bad' ? 'text-destructive' :
    tone === 'active' ? 'text-primary' :
    'text-muted-foreground';
  return (
    <div className="flex items-center justify-between font-mono text-[11px] tracking-wider uppercase">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className={text}>{value}</span>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Main component

export const CaptchaGate: React.FC<Props> = ({
  onVerified,
  difficultyBits = DEFAULT_DIFFICULTY,
  ttlMs = DEFAULT_TTL_MS,
  triggerLabel = 'INITIATE HANDSHAKE',
}) => {
  const { addEvent } = useSessionLog();
  const heuristics = useMemo(() => runBotHeuristics(), []);
  const [stage, setStage] = useState<Stage>(heuristics.passed ? 'ready' : 'blocked');
  const [progress, setProgress] = useState(0);
  const [nonceProbed, setNonceProbed] = useState(0);
  const [liveHash, setLiveHash] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<GateToken | null>(null);

  useEffect(() => {
    if (!heuristics.passed) {
      const list = heuristics.signals.map((s) => s.id).join(', ');
      addEvent('anomaly', `Bot check failed at gate mount — signals: ${list}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth progress ticker and cycling fake-hash preview while solver runs.
  useEffect(() => {
    if (stage !== 'solving') return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      setProgress(Math.min(96, (elapsed / 800) * 100));
      const bytes = new Uint8Array(6);
      crypto.getRandomValues(bytes);
      setLiveHash(
        Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  const handleSolve = async () => {
    setError(null);
    setStage('solving');
    setProgress(0);
    setLiveHash('');
    const challenge = generateChallenge();
    addEvent('info', `Bot gate — solving proof-of-work (difficulty ${difficultyBits} bits)`);

    try {
      const solution = await solvePow(challenge, difficultyBits, setNonceProbed);
      const issuedAt = Date.now();
      const t: GateToken = { solution, issuedAt, expiresAt: issuedAt + ttlMs };
      setToken(t);
      setStage('verified');
      setProgress(100);
      setLiveHash(solution.hashHex.slice(0, 12).toUpperCase());
      addEvent(
        'auth_pass',
        `Bot gate solved in ${Math.round(solution.durationMs)} ms (nonce=${solution.nonce})`
      );
      onVerified(t);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStage('error');
      addEvent('anomaly', `Bot gate solver failed: ${message}`);
    }
  };

  if (stage === 'blocked') {
    return <BlockedFrame signals={heuristics.signals} />;
  }

  if (stage === 'verified' && token) {
    return <VerifiedFrame token={token} />;
  }

  const accent = 'hsl(var(--primary))';

  return (
    <HudFrame accent={accent}>
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-primary/20">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>SYS//BIOMETRIC.CHK</span>
        </div>
        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">
          v2.0 · SHA-256 · {difficultyBits}-BIT
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        <div className="space-y-1">
          <div className="font-mono text-[10px] tracking-[0.3em] text-primary/70 uppercase">
            &gt; challenge
          </div>
          <div className="text-lg font-bold tracking-wide text-foreground">
            HUMAN VERIFICATION REQUIRED
          </div>
          <p className="text-xs text-muted-foreground">
            Client-side proof-of-work &amp; browser integrity check. Bypasses no server. No data
            leaves this device.
          </p>
        </div>

        {/* Status readout */}
        <div className="rounded-sm border border-primary/20 bg-background/40 p-3 space-y-1.5">
          <StatusRow label="Browser integrity" value="PASS" tone="ok" />
          <StatusRow
            label="Proof of work"
            value={
              stage === 'ready' ? 'READY' :
              stage === 'solving' ? 'RUNNING' :
              stage === 'error' ? 'FAILED' : 'PENDING'
            }
            tone={
              stage === 'ready' ? 'muted' :
              stage === 'solving' ? 'active' :
              stage === 'error' ? 'bad' : 'muted'
            }
          />
          <StatusRow
            label="Token"
            value={stage === 'verified' ? 'ISSUED' : 'NONE'}
            tone={stage === 'verified' ? 'ok' : 'muted'}
          />
        </div>

        {stage === 'ready' && (
          <>
            <button
              onClick={handleSolve}
              className="group relative w-full overflow-hidden bg-primary/5 border border-primary/60 hover:border-primary hover:bg-primary/10 transition-all py-3 font-mono text-sm tracking-[0.3em] text-primary uppercase"
              style={{
                boxShadow: 'inset 0 0 20px hsl(var(--primary) / 0.15)',
              }}
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-primary" />
              <span className="absolute inset-y-0 right-0 w-1 bg-primary" />
              <span className="relative">▸ {triggerLabel} ◂</span>
            </button>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest text-center">
              expected solve: 250–700 ms
            </p>
          </>
        )}

        {stage === 'solving' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest">
              <div className="flex items-center gap-2 text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Handshake in progress</span>
              </div>
              <span className="text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
              <div className="absolute inset-0 opacity-30">
                <div
                  className="h-full w-1/3 animate-data-flow"
                  style={{
                    background: 'linear-gradient(90deg, transparent, white, transparent)',
                  }}
                />
              </div>
            </div>
            <div className="rounded-sm border border-primary/20 bg-black/40 p-3 space-y-1 font-mono text-[11px]">
              <div className="flex justify-between text-muted-foreground uppercase tracking-widest">
                <span>hash trial</span>
                <span>{nonceProbed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-primary uppercase tracking-widest">
                <span>sha-256 prefix</span>
                <span className="text-accent">{liveHash || '—'}</span>
              </div>
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-destructive font-mono text-xs uppercase tracking-wider">
              <AlertTriangle className="h-4 w-4" />
              <span>solver fault · {error}</span>
            </div>
            <button
              onClick={handleSolve}
              className="mt-3 w-full border border-destructive/60 hover:bg-destructive/10 py-2 font-mono text-xs tracking-[0.3em] text-destructive uppercase"
            >
              ▸ retry handshake ◂
            </button>
          </div>
        )}
      </div>

      {/* Footer strip */}
      <div className="px-4 py-2 border-t border-primary/20 flex justify-between font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
        <span>CYPHER.SEC ▪ ONLINE</span>
        <span>ZERO-TRUST HANDSHAKE</span>
      </div>
    </HudFrame>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Blocked frame — red diagonal caution stripes + hard-lock read-out

const BlockedFrame: React.FC<{ signals: BotSignal[] }> = ({ signals }) => {
  const accent = 'hsl(var(--destructive))';
  return (
    <HudFrame
      accent={accent}
      glow={`0 0 25px ${accent}44, inset 0 0 30px rgba(0,0,0,0.5)`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-destructive/30">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-destructive uppercase">
          <ShieldX className="h-3.5 w-3.5" />
          <span>SYS//ACCESS.DENIED</span>
        </div>
        <div className="font-mono text-[10px] tracking-widest text-destructive/80 animate-pulse">
          ▪ ▪ ▪
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div className="space-y-1">
          <div className="font-mono text-[10px] tracking-[0.3em] text-destructive/80 uppercase">
            &gt; verdict
          </div>
          <div className="text-lg font-bold tracking-wide text-foreground">
            AUTOMATED ENVIRONMENT DETECTED
          </div>
          <p className="text-xs text-muted-foreground">
            The browser-integrity check flagged this session. Authentication tests are disabled to
            prevent behavioral-profile harvesting.
          </p>
        </div>

        <div
          className="rounded-sm border border-destructive/40 p-3 relative overflow-hidden"
          style={{
            background: `repeating-linear-gradient(45deg, hsl(var(--destructive) / 0.06) 0, hsl(var(--destructive) / 0.06) 12px, transparent 12px, transparent 24px)`,
          }}
        >
          <div className="font-mono text-[10px] tracking-[0.3em] text-destructive uppercase mb-2">
            &gt; signals
          </div>
          <ul className="space-y-1.5">
            {signals.map((s) => (
              <li key={s.id} className="flex justify-between gap-3 font-mono text-[11px]">
                <span className="text-foreground uppercase tracking-wider">
                  ▸ {s.label}
                </span>
                <span className="text-destructive/90 text-right">{s.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          resolution: reload without webdriver / automation harness &amp; retry
        </p>
      </div>

      <div className="px-4 py-2 border-t border-destructive/30 flex justify-between font-mono text-[10px] tracking-[0.3em] uppercase text-destructive/70">
        <span>CYPHER.SEC ▪ HARD-LOCK</span>
        <span>RETRY DISABLED</span>
      </div>
    </HudFrame>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Verified frame — green HUD with live token countdown

const VerifiedFrame: React.FC<{ token: GateToken }> = ({ token }) => {
  const accent = 'hsl(var(--success))';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = Math.max(0, Math.floor((token.expiresAt - now) / 1000));
  const m = Math.floor(remaining / 60).toString().padStart(2, '0');
  const s = (remaining % 60).toString().padStart(2, '0');
  const ttlPct = Math.max(
    0,
    Math.min(100, ((token.expiresAt - now) / (token.expiresAt - token.issuedAt)) * 100)
  );

  return (
    <HudFrame
      accent={accent}
      glow={`0 0 25px ${accent}33, inset 0 0 30px rgba(0,0,0,0.4)`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-success/30">
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.3em] text-success uppercase">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>SYS//AUTHORIZED</span>
        </div>
        <div className="font-mono text-[10px] tracking-widest text-success">
          TTL {m}:{s}
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="font-mono text-[10px] tracking-[0.3em] text-success/80 uppercase">
              &gt; handshake
            </div>
            <div className="text-base font-bold tracking-wide text-foreground">
              VERIFIED · PROCEED WITH TEST
            </div>
          </div>
          <div className="text-right font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            <div>solve · {Math.round(token.solution.durationMs)} ms</div>
            <div>nonce · {token.solution.nonce.toLocaleString()}</div>
          </div>
        </div>

        <div className="rounded-sm border border-success/25 bg-black/30 p-2 font-mono text-[10px] flex justify-between uppercase tracking-widest">
          <span className="text-muted-foreground">token hash</span>
          <span className="text-success">{token.solution.hashHex.slice(0, 24).toUpperCase()}…</span>
        </div>

        <div className="h-1 rounded-full bg-success/10 overflow-hidden">
          <div
            className="h-full bg-success transition-[width] duration-1000"
            style={{ width: `${ttlPct}%` }}
          />
        </div>
      </div>

      <div className="px-4 py-2 border-t border-success/30 flex justify-between font-mono text-[10px] tracking-[0.3em] uppercase text-success/70">
        <span>CYPHER.SEC ▪ ONLINE</span>
        <span>ONE-SHOT · CONSUMED ON SUBMIT</span>
      </div>
    </HudFrame>
  );
};

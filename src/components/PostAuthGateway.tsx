import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, Lock, RotateCcw, ShieldAlert } from 'lucide-react';
import { AuthenticationResults } from '@/components/AuthenticationResults';
import { useSessionLog } from '@/hooks/useSessionLog';
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  readStoredModel,
  zScore,
} from '@/lib/modelAccess';
import type { BehavioralFeatures } from '@/lib/behavioralAuth';

export type RiskTier = 'low' | 'medium' | 'high';

export const tierFromConfidence = (confidence: number): RiskTier => {
  if (confidence >= 0.7) return 'low';
  if (confidence >= 0.3) return 'medium';
  return 'high';
};

interface AuthResult {
  isAuthentic: boolean;
  confidence: number;
  timestamp: number;
  sessionId: string;
}

interface PostAuthGatewayProps {
  results: AuthResult[];
  latestFeatures: BehavioralFeatures | null;
  onRetry: () => void;
  onReset: () => void;
}

const MAX_MEDIUM_RETRIES = 3;
const LOCKOUT_SECONDS = 60;

export const PostAuthGateway: React.FC<PostAuthGatewayProps> = ({
  results,
  latestFeatures,
  onRetry,
  onReset,
}) => {
  const { addEvent } = useSessionLog();
  const latest = results[results.length - 1];
  const [mediumRetries, setMediumRetries] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastProcessedId = useRef<string | null>(null);

  const tier = useMemo<RiskTier | null>(
    () => (latest ? tierFromConfidence(latest.confidence) : null),
    [latest]
  );

  const anomalies = useMemo(() => {
    if (!latestFeatures) return [];
    const model = readStoredModel();
    if (!model?.meanFeatures || !model?.varianceFeatures) return [];
    return FEATURE_KEYS.map((key) => {
      const z = zScore(
        latestFeatures[key] as number | undefined,
        model.meanFeatures![key] as number | undefined,
        model.varianceFeatures![key] as number | undefined
      );
      return { key, label: FEATURE_LABELS[key], z };
    }).filter((row) => row.z !== null && row.z > 2);
  }, [latestFeatures]);

  // React to a brand-new result: update retry counter, log events, set lockout.
  useEffect(() => {
    if (!latest || latest.sessionId === lastProcessedId.current) return;
    lastProcessedId.current = latest.sessionId;
    const currentTier = tierFromConfidence(latest.confidence);
    const confidencePct = (latest.confidence * 100).toFixed(1);

    if (currentTier === 'low') {
      setMediumRetries(0);
      setLockedUntil(null);
      addEvent('auth_pass', `Authentication attempt — Confidence: ${confidencePct}% — PASSED`);
    } else if (currentTier === 'medium') {
      const nextRetries = mediumRetries + 1;
      setMediumRetries(nextRetries);
      addEvent(
        'auth_warn',
        `Authentication attempt — Confidence: ${confidencePct}% — UNCERTAIN (retry ${nextRetries}/${MAX_MEDIUM_RETRIES})`
      );
      if (nextRetries >= MAX_MEDIUM_RETRIES) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockedUntil(until);
        addEvent('lockout', `Retries exhausted — account locked for ${LOCKOUT_SECONDS}s`);
      }
    } else {
      setMediumRetries(0);
      const until = Date.now() + LOCKOUT_SECONDS * 1000;
      setLockedUntil(until);
      addEvent('auth_block', `Authentication attempt — Confidence: ${confidencePct}% — BLOCKED`);
      addEvent('lockout', `High-risk verdict — account locked for ${LOCKOUT_SECONDS}s`);
    }

    anomalies.forEach((row) => {
      addEvent(
        'anomaly',
        `Anomaly detected: ${row.label} deviation +${row.z!.toFixed(1)}σ`
      );
    });
    // We intentionally exclude `mediumRetries`/`anomalies` from deps — we want to act
    // only when the latest result changes, not on counter ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.sessionId]);

  // Tick a 1s timer while locked so the countdown updates.
  useEffect(() => {
    if (lockedUntil === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && now < lockedUntil;
  const cooldownSeconds = isLocked
    ? Math.max(0, Math.ceil((lockedUntil! - now) / 1000))
    : 0;

  // Auto-clear lockout once timer hits zero.
  useEffect(() => {
    if (lockedUntil !== null && !isLocked) {
      setLockedUntil(null);
      setMediumRetries(0);
      addEvent('system', 'Lockout cleared. User may retry authentication.');
    }
  }, [isLocked, lockedUntil, addEvent]);

  const handleRetry = () => {
    if (isLocked) return;
    onRetry();
  };

  if (!latest || !tier) {
    return null;
  }

  return (
    <div className="space-y-6">
      {tier === 'low' && <LowRiskCard confidence={latest.confidence} onContinue={handleRetry} />}
      {tier === 'medium' && !isLocked && (
        <MediumRiskCard
          confidence={latest.confidence}
          retriesUsed={mediumRetries}
          maxRetries={MAX_MEDIUM_RETRIES}
          onRetry={handleRetry}
        />
      )}
      {(tier === 'high' || isLocked) && (
        <HighRiskCard
          confidence={latest.confidence}
          cooldownSeconds={cooldownSeconds}
          totalSeconds={LOCKOUT_SECONDS}
          isLocked={isLocked}
          onTryAgain={handleRetry}
          anomalies={anomalies}
        />
      )}

      <AuthenticationResults results={results} onNewTest={handleRetry} onReset={onReset} />
    </div>
  );
};

interface LowProps {
  confidence: number;
  onContinue: () => void;
}

const LowRiskCard: React.FC<LowProps> = ({ confidence, onContinue }) => (
  <Card className="border-success/40 bg-success/5 shadow-neural">
    <CardHeader>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-success/20 p-3 animate-pulse-glow">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <div>
            <CardTitle className="text-2xl text-foreground">Payment Successful</CardTitle>
            <CardDescription className="text-muted-foreground">
              Behavioral fingerprint matched the trained profile.
            </CardDescription>
          </div>
        </div>
        <Badge className="bg-success text-success-foreground text-base px-4 py-2">
          LOW RISK · {(confidence * 100).toFixed(1)}%
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="rounded-lg border border-success/30 bg-card/60 p-4 font-mono text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Merchant</span><span>CYPHER Demo Merchant</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>₹4,250.00</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>TXN-{Date.now().toString().slice(-8)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="text-success">APPROVED</span></div>
      </div>
      <Button onClick={onContinue} className="w-full bg-gradient-primary text-primary-foreground shadow-glow">
        Run Another Test
      </Button>
    </CardContent>
  </Card>
);

interface MediumProps {
  confidence: number;
  retriesUsed: number;
  maxRetries: number;
  onRetry: () => void;
}

const MediumRiskCard: React.FC<MediumProps> = ({ confidence, retriesUsed, maxRetries, onRetry }) => (
  <Card className="border-warning/40 bg-warning/5 shadow-neural">
    <CardHeader>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-warning/20 p-3">
            <ShieldAlert className="h-8 w-8 text-warning" />
          </div>
          <div>
            <CardTitle className="text-2xl text-foreground">Identity Uncertain</CardTitle>
            <CardDescription className="text-muted-foreground">
              Behavioral signal deviates from your trained profile. Please retry.
            </CardDescription>
          </div>
        </div>
        <Badge variant="secondary" className="bg-warning/20 text-warning border border-warning/40 text-base px-4 py-2">
          MEDIUM RISK · {(confidence * 100).toFixed(1)}%
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Retry attempt</span>
        <span className="font-semibold text-foreground">{retriesUsed} / {maxRetries}</span>
      </div>
      <Progress value={(retriesUsed / maxRetries) * 100} className="h-2" />
      <p className="text-sm text-muted-foreground">
        After {maxRetries} consecutive uncertain attempts the session is locked for {LOCKOUT_SECONDS} seconds.
      </p>
      <Button onClick={onRetry} className="w-full bg-gradient-cyber text-primary-foreground">
        Retry Authentication
      </Button>
    </CardContent>
  </Card>
);

interface HighProps {
  confidence: number;
  cooldownSeconds: number;
  totalSeconds: number;
  isLocked: boolean;
  onTryAgain: () => void;
  anomalies: Array<{ key: string; label: string; z: number | null }>;
}

const HighRiskCard: React.FC<HighProps> = ({
  confidence,
  cooldownSeconds,
  totalSeconds,
  isLocked,
  onTryAgain,
  anomalies,
}) => {
  const progress = isLocked
    ? ((totalSeconds - cooldownSeconds) / totalSeconds) * 100
    : 100;
  const mins = Math.floor(cooldownSeconds / 60).toString().padStart(2, '0');
  const secs = (cooldownSeconds % 60).toString().padStart(2, '0');

  return (
    <Card className="border-destructive/50 bg-destructive/5 shadow-neural">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-destructive/20 p-3">
              <Lock className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-2xl text-foreground">Transaction Blocked</CardTitle>
              <CardDescription className="text-muted-foreground">
                Suspicious activity detected. The session is temporarily locked.
              </CardDescription>
            </div>
          </div>
          <Badge variant="destructive" className="text-base px-4 py-2">
            HIGH RISK · {(confidence * 100).toFixed(1)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-destructive/30 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cooldown</span>
            <span className="font-mono text-2xl text-destructive">
              {isLocked ? `${mins}:${secs}` : '00:00'}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            For security, retry is unavailable until the cooldown ends.
          </p>
        </div>

        {anomalies.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold text-foreground">Anomalous behavioral features</span>
            </div>
            <ul className="space-y-1 text-sm">
              {anomalies.map((row) => (
                <li key={row.key} className="flex justify-between text-muted-foreground">
                  <span>{row.label}</span>
                  <span className="font-mono text-destructive">+{row.z!.toFixed(2)}σ</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Button
          onClick={onTryAgain}
          disabled={isLocked}
          className="w-full"
          variant={isLocked ? 'secondary' : 'default'}
        >
          {isLocked ? (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Locked — wait {cooldownSeconds}s
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Authentication Again
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};


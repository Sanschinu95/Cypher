import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Banknote, CheckCircle2, IndianRupee, Wallet, XCircle } from 'lucide-react';
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  readStoredModel,
  zScore,
} from '@/lib/modelAccess';
import type { BehavioralFeatures } from '@/lib/behavioralAuth';

interface AuthResult {
  isAuthentic: boolean;
  confidence: number;
  timestamp: number;
  sessionId: string;
}

interface Props {
  latestConfidence: number | null;
  latestFeatures: BehavioralFeatures | null;
  history: AuthResult[];
}

const PRIMARY = 'hsl(var(--primary))';
const SUCCESS = 'hsl(var(--success))';
const WARNING = 'hsl(var(--warning))';
const DESTRUCTIVE = 'hsl(var(--destructive))';
const MUTED = 'hsl(var(--muted-foreground))';

export const RiskScoringDashboard: React.FC<Props> = ({ latestConfidence, latestFeatures, history }) => {
  const score = latestConfidence === null ? 0 : Math.round(latestConfidence * 100);
  const tierLabel =
    latestConfidence === null
      ? 'No test yet'
      : latestConfidence >= 0.7
      ? 'LOW RISK'
      : latestConfidence >= 0.3
      ? 'MEDIUM RISK'
      : 'HIGH RISK';
  const tierColor =
    latestConfidence === null
      ? MUTED
      : latestConfidence >= 0.7
      ? SUCCESS
      : latestConfidence >= 0.3
      ? WARNING
      : DESTRUCTIVE;

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-cyber bg-clip-text text-transparent">
            Risk Scoring Engine
          </CardTitle>
          <CardDescription>Real-time confidence, anomaly contribution and adaptive transaction thresholds.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border shadow-neural">
          <CardHeader>
            <CardTitle>Live risk gauge</CardTitle>
            <CardDescription>Confidence score · {tierLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <Gauge value={score} tierColor={tierColor} />
          </CardContent>
        </Card>

        <RiskFactors latestFeatures={latestFeatures} />
      </div>

      <TransactionPanel confidence={latestConfidence} />

      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <CardTitle>Risk history</CardTitle>
          <CardDescription>Confidence across recent attempts in this session.</CardDescription>
        </CardHeader>
        <CardContent style={{ height: 260 }}>
          <RiskHistoryChart history={history} />
        </CardContent>
      </Card>
    </div>
  );
};

const Gauge: React.FC<{ value: number; tierColor: string }> = ({ value, tierColor }) => {
  const clamped = Math.max(0, Math.min(100, value));
  const cx = 100;
  const cy = 100;
  const r = 80;
  const thickness = 18;

  const polar = (angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };

  const arcPath = (a1: number, a2: number) => {
    const p1 = polar(a1);
    const p2 = polar(a2);
    // SVG sweep-flag=1 is "positive angle direction" which in screen coords (y-down)
    // is visually clockwise. From the leftmost point (math angle 180°), clockwise
    // traces the top semicircle. For decreasing math angles (180 → 0), we want
    // sweep=1; for increasing math angles, sweep=0.
    const sweep = a1 > a2 ? 1 : 0;
    const large = Math.abs(a1 - a2) > 180 ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} ${sweep} ${p2.x} ${p2.y}`;
  };

  const needleAngle = 180 - (clamped / 100) * 180;
  const needleRad = (needleAngle * Math.PI) / 180;
  const needleLen = r * 0.78;
  const tipX = cx + needleLen * Math.cos(needleRad);
  const tipY = cy - needleLen * Math.sin(needleRad);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 340 }}>
      <svg viewBox="0 0 200 115" className="block w-full h-auto">
        <path d={arcPath(180, 126)} stroke={DESTRUCTIVE} strokeOpacity={0.55} strokeWidth={thickness} fill="none" strokeLinecap="butt" />
        <path d={arcPath(126, 54)}  stroke={WARNING}     strokeOpacity={0.55} strokeWidth={thickness} fill="none" strokeLinecap="butt" />
        <path d={arcPath(54, 0)}    stroke={SUCCESS}     strokeOpacity={0.55} strokeWidth={thickness} fill="none" strokeLinecap="butt" />
        <line x1={cx} y1={cy} x2={tipX} y2={tipY} stroke={tierColor} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill={tierColor} />
      </svg>
      <div className="text-center -mt-2">
        <div className="text-4xl font-bold font-mono leading-none" style={{ color: tierColor }}>{clamped}</div>
        <div className="text-xs text-muted-foreground mt-1">Confidence score (0–100)</div>
      </div>
    </div>
  );
};

const RiskFactors: React.FC<{ latestFeatures: BehavioralFeatures | null }> = ({ latestFeatures }) => {
  const data = useMemo(() => {
    const model = readStoredModel();
    if (!latestFeatures || !model?.meanFeatures || !model?.varianceFeatures) return [];
    return FEATURE_KEYS.map((key) => {
      const z = zScore(
        latestFeatures[key] as number | undefined,
        model.meanFeatures![key] as number | undefined,
        model.varianceFeatures![key] as number | undefined
      );
      return { feature: FEATURE_LABELS[key], z: z ?? 0 };
    })
      .filter((row) => row.z > 0)
      .sort((a, b) => b.z - a.z);
  }, [latestFeatures]);

  return (
    <Card className="bg-card border-border shadow-neural">
      <CardHeader>
        <CardTitle>Risk factor breakdown</CardTitle>
        <CardDescription>Per-feature z-score: higher = more anomalous.</CardDescription>
      </CardHeader>
      <CardContent style={{ height: 240 }}>
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Run a test in the Authentication tab to see contributions.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 6, right: 16, left: 80, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke={MUTED} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="feature" stroke={MUTED} tick={{ fontSize: 11 }} width={110} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                formatter={(value: number) => `${value.toFixed(2)}σ`}
              />
              <Bar dataKey="z" radius={[0, 4, 4, 0]}>
                {data.map((row, i) => (
                  <Cell
                    key={i}
                    fill={row.z > 2 ? DESTRUCTIVE : row.z > 1 ? WARNING : SUCCESS}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

const TRANSACTIONS = [
  { id: 'balance', label: 'Check Balance', icon: Wallet, amount: null, threshold: 0.2, sensitivity: 'Low sensitivity' },
  { id: 'tx5k', label: 'Fund Transfer', icon: Banknote, amount: '₹5,000', threshold: 0.5, sensitivity: 'Medium sensitivity' },
  { id: 'tx50k', label: 'Fund Transfer', icon: IndianRupee, amount: '₹50,000', threshold: 0.75, sensitivity: 'High sensitivity' },
] as const;

const TransactionPanel: React.FC<{ confidence: number | null }> = ({ confidence }) => {
  return (
    <Card className="bg-card border-border shadow-neural">
      <CardHeader>
        <CardTitle>Adaptive transaction thresholds</CardTitle>
        <CardDescription>The same confidence is judged differently per transaction risk level.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-3 gap-4">
          {TRANSACTIONS.map((t) => {
            const passes = confidence !== null && confidence >= t.threshold;
            const Icon = t.icon;
            return (
              <div
                key={t.id}
                className={`rounded-lg border p-4 space-y-3 transition-colors ${
                  confidence === null
                    ? 'border-border bg-muted/30'
                    : passes
                    ? 'border-success/40 bg-success/5'
                    : 'border-destructive/40 bg-destructive/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`h-6 w-6 ${confidence === null ? 'text-muted-foreground' : passes ? 'text-success' : 'text-destructive'}`} />
                  <Badge variant="outline" className="text-[10px]">{t.sensitivity}</Badge>
                </div>
                <div>
                  <div className="font-semibold text-foreground">{t.label}</div>
                  {t.amount && <div className="text-sm text-muted-foreground">{t.amount}</div>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Threshold ≥ {(t.threshold * 100).toFixed(0)}%
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {confidence === null ? (
                    <span className="text-muted-foreground">— pending —</span>
                  ) : passes ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-success">PASS · {(confidence * 100).toFixed(0)}%</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">FAIL · {(confidence * 100).toFixed(0)}%</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

const RiskHistoryChart: React.FC<{ history: AuthResult[] }> = ({ history }) => {
  const data = history.map((r, i) => ({ attempt: i + 1, confidence: Math.round(r.confidence * 100) }));
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Run at least one test to populate history.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <ReferenceArea y1={0} y2={30} fill={DESTRUCTIVE} fillOpacity={0.08} />
        <ReferenceArea y1={30} y2={70} fill={WARNING} fillOpacity={0.08} />
        <ReferenceArea y1={70} y2={100} fill={SUCCESS} fillOpacity={0.08} />
        <XAxis dataKey="attempt" stroke={MUTED} tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} stroke={MUTED} tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
          formatter={(value: number) => `${value}%`}
        />
        <Line type="monotone" dataKey="confidence" stroke={PRIMARY} strokeWidth={2.5} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

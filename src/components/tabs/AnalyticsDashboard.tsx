import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURE_UNITS,
  buildGaussianCurve,
  readStoredModel,
  zScore,
} from '@/lib/modelAccess';
import type { BehavioralFeatures } from '@/lib/behavioralAuth';

interface Props {
  latestFeatures: BehavioralFeatures | null;
}

const PRIMARY = 'hsl(var(--primary))';
const ACCENT = 'hsl(var(--accent))';
const SUCCESS = 'hsl(var(--success))';
const WARNING = 'hsl(var(--warning))';
const DESTRUCTIVE = 'hsl(var(--destructive))';
const MUTED = 'hsl(var(--muted-foreground))';

const formatValue = (v: number, key: keyof BehavioralFeatures) => {
  const unit = FEATURE_UNITS[key];
  return `${v.toFixed(2)}${unit ? ' ' + unit : ''}`;
};

export const AnalyticsDashboard: React.FC<Props> = ({ latestFeatures }) => {
  const model = readStoredModel();
  const [timelineFeature, setTimelineFeature] = useState<keyof BehavioralFeatures>('meanKeystrokeDwell');

  if (!model?.isTrained || !model.meanFeatures || !model.varianceFeatures) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Analytics unavailable</CardTitle>
          <CardDescription>Complete training to see the behavioral fingerprint.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const mean = model.meanFeatures;
  const variance = model.varianceFeatures;
  const trainingData = model.trainingData;

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-cyber bg-clip-text text-transparent">
            Behavioral Fingerprint
          </CardTitle>
          <CardDescription>
            What the engine learned about your typing rhythm, mouse motion and touch behavior.
          </CardDescription>
        </CardHeader>
      </Card>

      <RadarSection mean={mean} latest={latestFeatures} />

      <div className="grid lg:grid-cols-2 gap-6">
        {FEATURE_KEYS.map((key) => {
          const m = mean[key] as number | undefined;
          const v = variance[key] as number | undefined;
          if (m === undefined || v === undefined || !Number.isFinite(m) || v <= 0) return null;
          return (
            <FeatureDistribution
              key={key}
              featureKey={key}
              mean={m}
              variance={v}
              training={trainingData.map((row) => row[key] as number | undefined)}
              latest={(latestFeatures?.[key] as number | undefined) ?? null}
            />
          );
        })}
      </div>

      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Training session timeline</CardTitle>
              <CardDescription>How a feature evolved across enrollment sessions.</CardDescription>
            </div>
            <Select
              value={timelineFeature}
              onValueChange={(v) => setTimelineFeature(v as keyof BehavioralFeatures)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {FEATURE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <TimelineChart feature={timelineFeature} training={trainingData} mean={mean[timelineFeature] as number | undefined} />
        </CardContent>
      </Card>
    </div>
  );
};

const RadarSection: React.FC<{ mean: BehavioralFeatures; latest: BehavioralFeatures | null }> = ({ mean, latest }) => {
  const data = useMemo(() => {
    return FEATURE_KEYS.map((key) => {
      const trainedVal = mean[key] as number | undefined;
      const latestVal = latest?.[key] as number | undefined;
      // Normalize each axis to [0, 1] by max(trained, latest, 1e-6)
      const maxRef = Math.max(Math.abs(trainedVal ?? 0), Math.abs(latestVal ?? 0), 1e-6);
      return {
        feature: FEATURE_LABELS[key],
        trained: trainedVal !== undefined ? Math.min(1, Math.abs(trainedVal) / maxRef) : 0,
        latest: latestVal !== undefined ? Math.min(1, Math.abs(latestVal) / maxRef) : 0,
      };
    });
  }, [mean, latest]);

  return (
    <Card className="bg-card border-border shadow-neural">
      <CardHeader>
        <CardTitle>Profile shape</CardTitle>
        <CardDescription>Normalized fingerprint vs. latest test sample.</CardDescription>
      </CardHeader>
      <CardContent style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="75%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="feature" stroke={MUTED} tick={{ fontSize: 11 }} />
            <PolarRadiusAxis stroke={MUTED} tick={{ fontSize: 10 }} angle={30} domain={[0, 1]} />
            <Radar name="Trained profile" dataKey="trained" stroke={PRIMARY} fill={PRIMARY} fillOpacity={0.35} />
            {latest && (
              <Radar name="Latest test" dataKey="latest" stroke={ACCENT} fill={ACCENT} fillOpacity={0.25} />
            )}
            <Legend wrapperStyle={{ color: MUTED }} />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

interface FeatureDistProps {
  featureKey: keyof BehavioralFeatures;
  mean: number;
  variance: number;
  training: Array<number | undefined>;
  latest: number | null;
}

const FeatureDistribution: React.FC<FeatureDistProps> = ({
  featureKey,
  mean,
  variance,
  training,
  latest,
}) => {
  const sigma = Math.sqrt(variance);
  const curve = useMemo(() => buildGaussianCurve(mean, variance, 60), [mean, variance]);
  const peakY = curve.reduce((acc, p) => Math.max(acc, p.y), 0) || 1;

  // Place training points on the curve at their PDF height for visual scatter.
  const trainingDots = useMemo(
    () =>
      training
        .filter((v): v is number => v !== undefined && Number.isFinite(v))
        .map((v) => {
          const y =
            (1 / Math.sqrt(2 * Math.PI * variance)) *
            Math.exp(-Math.pow(v - mean, 2) / (2 * variance));
          return { x: v, y };
        }),
    [training, mean, variance]
  );

  const z = latest !== null ? zScore(latest, mean, variance) : null;
  const tier = z === null ? 'unknown' : z <= 1 ? 'ok' : z <= 2 ? 'warn' : 'bad';
  const tierBadge =
    tier === 'ok'
      ? { className: 'bg-success/15 text-success border-success/40', label: 'within 1σ' }
      : tier === 'warn'
      ? { className: 'bg-warning/15 text-warning border-warning/40', label: 'within 2σ' }
      : tier === 'bad'
      ? { className: 'bg-destructive/15 text-destructive border-destructive/40', label: 'outlier' }
      : { className: 'bg-muted text-muted-foreground border-border', label: 'no sample' };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{FEATURE_LABELS[featureKey]}</CardTitle>
            <CardDescription className="text-xs font-mono">
              μ = {formatValue(mean, featureKey)} · σ = {formatValue(sigma, featureKey)}
            </CardDescription>
          </div>
          <Badge variant="outline" className={tierBadge.className}>
            {tierBadge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${featureKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.5} />
                <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} stroke={MUTED} tick={{ fontSize: 10 }} tickFormatter={(v) => Number(v).toFixed(1)} />
            <YAxis hide domain={[0, peakY * 1.1]} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              formatter={(value: number) => value.toFixed(4)}
              labelFormatter={(label) => `x = ${Number(label).toFixed(2)}`}
            />
            <Area type="monotone" dataKey="y" stroke={PRIMARY} fill={`url(#grad-${featureKey})`} strokeWidth={2} />
            <ReferenceLine x={mean} stroke={PRIMARY} strokeDasharray="4 4" />
            {trainingDots.map((dot, i) => (
              <ReferenceDot key={`t-${i}`} x={dot.x} y={dot.y} r={3} fill={ACCENT} stroke="none" ifOverflow="extendDomain" />
            ))}
            {latest !== null && Number.isFinite(latest) && (
              <ReferenceDot
                x={latest}
                y={peakY * 0.05}
                r={6}
                fill={tier === 'ok' ? SUCCESS : tier === 'warn' ? WARNING : DESTRUCTIVE}
                stroke="hsl(var(--background))"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const TimelineChart: React.FC<{
  feature: keyof BehavioralFeatures;
  training: BehavioralFeatures[];
  mean: number | undefined;
}> = ({ feature, training, mean }) => {
  const data = training.map((row, idx) => ({
    session: idx + 1,
    value: (row[feature] as number | undefined) ?? null,
  }));
  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis dataKey="session" stroke={MUTED} tick={{ fontSize: 11 }} />
          <YAxis stroke={MUTED} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
            formatter={(value: number) => formatValue(value, feature)}
          />
          <Line type="monotone" dataKey="value" stroke={PRIMARY} strokeWidth={2.5} dot={{ r: 4, fill: ACCENT }} />
          {mean !== undefined && (
            <ReferenceLine y={mean} stroke={ACCENT} strokeDasharray="4 4" label={{ value: 'μ', fill: ACCENT, position: 'insideTopRight' }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

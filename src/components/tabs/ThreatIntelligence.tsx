import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Globe,
  Monitor,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { useSessionLog } from '@/hooks/useSessionLog';
import type { SessionEvent, SessionEventType } from '@/context/SessionLogContext';
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  readStoredModel,
  zScore,
} from '@/lib/modelAccess';
import type { BehavioralFeatures } from '@/lib/behavioralAuth';

interface Props {
  latestFeatures: BehavioralFeatures | null;
}

export const ThreatIntelligence: React.FC<Props> = ({ latestFeatures }) => {
  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-cyber bg-clip-text text-transparent">
            Threat Intelligence · Session Monitor
          </CardTitle>
          <CardDescription>
            Live session feed, device fingerprint, anomaly flags and a graph view of related entities.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SessionFeed />
          <GraphView />
        </div>
        <div className="space-y-6">
          <DeviceFingerprint />
          <AnomalyFlags latestFeatures={latestFeatures} />
        </div>
      </div>
    </div>
  );
};

const TYPE_META: Record<SessionEventType, { color: string; label: string }> = {
  info:       { color: 'text-muted-foreground', label: 'INFO' },
  training:   { color: 'text-primary',          label: 'TRAIN' },
  auth_pass:  { color: 'text-success',          label: 'PASS' },
  auth_warn:  { color: 'text-warning',          label: 'WARN' },
  auth_block: { color: 'text-destructive',      label: 'BLOCK' },
  anomaly:    { color: 'text-destructive',      label: 'ANOM' },
  lockout:    { color: 'text-destructive',      label: 'LOCK' },
  system:     { color: 'text-accent',           label: 'SYS' },
};

const SessionFeed: React.FC = () => {
  const { events } = useSessionLog();
  const reversed = useMemo(() => [...events].reverse(), [events]);

  return (
    <Card className="bg-card border-border shadow-neural">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Live session feed
            </CardTitle>
            <CardDescription>{events.length} events captured this session.</CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] tracking-wider">LIVE</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 rounded-md border border-border bg-background/60 p-2">
          <ul className="space-y-1 font-mono text-xs">
            {reversed.map((evt: SessionEvent) => {
              const meta = TYPE_META[evt.type];
              return (
                <li key={evt.id} className="flex gap-2 items-start py-1 border-b border-border/40 last:border-0">
                  <span className="text-muted-foreground shrink-0 w-20">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`shrink-0 w-14 font-semibold ${meta.color}`}>[{meta.label}]</span>
                  <span className="text-foreground">{evt.message}</span>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const DeviceFingerprint: React.FC = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const platform = typeof navigator !== 'undefined' ? navigator.platform : 'unknown';
  const language = typeof navigator !== 'undefined' ? navigator.language : 'unknown';
  const resolution = typeof window !== 'undefined' ? `${window.screen.width} × ${window.screen.height}` : 'unknown';
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'unknown';
  const touch = typeof window !== 'undefined' && 'ontouchstart' in window;

  const rows: Array<[React.ReactNode, string, React.ReactNode]> = [
    [<Monitor className="h-4 w-4 text-primary" key="m" />, 'User-Agent', ua],
    [<Cpu className="h-4 w-4 text-primary" key="c" />, 'Platform', platform],
    [<Smartphone className="h-4 w-4 text-primary" key="s" />, 'Touch', touch ? 'Supported' : 'Not detected'],
    [<Globe className="h-4 w-4 text-primary" key="g" />, 'Language', language],
    [<Globe className="h-4 w-4 text-primary" key="g2" />, 'Timezone', tz],
    [<Monitor className="h-4 w-4 text-primary" key="m2" />, 'Resolution', resolution],
  ];

  return (
    <Card className="bg-card border-border shadow-neural">
      <CardHeader>
        <CardTitle>Device fingerprint</CardTitle>
        <CardDescription>Passive signals collected from the browser.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-xs">
          {rows.map(([icon, label, value], i) => (
            <li key={i} className="flex items-start gap-2">
              {icon}
              <div className="flex-1 min-w-0">
                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</div>
                <div className="text-foreground font-mono break-all">{value}</div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

const AnomalyFlags: React.FC<{ latestFeatures: BehavioralFeatures | null }> = ({ latestFeatures }) => {
  const rows = useMemo(() => {
    const model = readStoredModel();
    if (!latestFeatures || !model?.meanFeatures || !model?.varianceFeatures) return [];
    return FEATURE_KEYS.map((key) => {
      const z = zScore(
        latestFeatures[key] as number | undefined,
        model.meanFeatures![key] as number | undefined,
        model.varianceFeatures![key] as number | undefined
      );
      return { key, label: FEATURE_LABELS[key], z };
    });
  }, [latestFeatures]);

  return (
    <Card className="bg-card border-border shadow-neural">
      <CardHeader>
        <CardTitle>Anomaly flags</CardTitle>
        <CardDescription>Per-feature deviation from the trained profile.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Run a test to populate anomaly flags.</div>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const anomalous = r.z !== null && r.z > 2;
              return (
                <li
                  key={r.key}
                  className={`flex items-center justify-between text-sm rounded-md px-3 py-2 border ${
                    r.z === null
                      ? 'border-border bg-muted/20 text-muted-foreground'
                      : anomalous
                      ? 'border-destructive/40 bg-destructive/5'
                      : 'border-success/30 bg-success/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {r.z === null ? (
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    ) : anomalous ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    )}
                    <span className="text-foreground">{r.label}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.z === null ? 'n/a' : `${r.z.toFixed(2)}σ`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

// Mock entity-relationship graph illustrating the Neo4j-style view.
const GraphView: React.FC = () => {
  const nodes = [
    { id: 'user',     label: 'User account',  x: 50,  y: 50,  color: 'hsl(var(--primary))',     fill: 'hsl(var(--primary) / 0.2)' },
    { id: 'devA',     label: 'Device A',      x: 200, y: 30,  color: 'hsl(var(--accent))',      fill: 'hsl(var(--accent) / 0.2)' },
    { id: 'devB',     label: 'Device B (new)', x: 200, y: 120, color: 'hsl(var(--destructive))', fill: 'hsl(var(--destructive) / 0.2)' },
    { id: 'sess1',    label: 'Session 1',     x: 360, y: 30,  color: 'hsl(var(--success))',     fill: 'hsl(var(--success) / 0.15)' },
    { id: 'sess2',    label: 'Session 2',     x: 360, y: 120, color: 'hsl(var(--destructive))', fill: 'hsl(var(--destructive) / 0.2)' },
    { id: 'ip',       label: 'IP 198.51.x',   x: 520, y: 80,  color: 'hsl(var(--warning))',     fill: 'hsl(var(--warning) / 0.15)' },
    { id: 'tx',       label: 'Txn ₹50,000',   x: 660, y: 120, color: 'hsl(var(--destructive))', fill: 'hsl(var(--destructive) / 0.25)' },
    { id: 'merchant', label: 'Merchant',      x: 660, y: 30,  color: 'hsl(var(--primary))',     fill: 'hsl(var(--primary) / 0.2)' },
  ];
  const edges = [
    ['user', 'devA', false],
    ['user', 'devB', true],
    ['devA', 'sess1', false],
    ['devB', 'sess2', true],
    ['sess1', 'ip', false],
    ['sess2', 'ip', true],
    ['ip', 'tx', true],
    ['ip', 'merchant', false],
  ] as Array<[string, string, boolean]>;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <Card className="bg-card border-border shadow-neural">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Entity graph</CardTitle>
            <CardDescription>Conceptual Neo4j-style view of related accounts, devices, sessions and transactions.</CardDescription>
          </div>
          <Badge variant="destructive">Suspicious cluster</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <svg viewBox="0 0 740 170" className="w-full" preserveAspectRatio="xMidYMid meet" style={{ minWidth: 600 }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L10,5 L0,10 Z" fill="hsl(var(--muted-foreground))" />
              </marker>
              <marker id="arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L10,5 L0,10 Z" fill="hsl(var(--destructive))" />
              </marker>
            </defs>
            {edges.map(([from, to, bad], i) => {
              const a = byId[from];
              const b = byId[to];
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={bad ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))'}
                  strokeOpacity={bad ? 0.8 : 0.45}
                  strokeWidth={bad ? 2 : 1}
                  strokeDasharray={bad ? '0' : '4 4'}
                  markerEnd={bad ? 'url(#arrow-bad)' : 'url(#arrow)'}
                />
              );
            })}
            {nodes.map((n) => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={18} fill={n.fill} stroke={n.color} strokeWidth={1.5} />
                <text x={n.x} y={n.y + 32} textAnchor="middle" fontSize={10} fill="hsl(var(--foreground))">{n.label}</text>
              </g>
            ))}
          </svg>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Dashed lines = known/trusted relationships. Solid red = links flagged by the heuristic engine. The cluster around
          "Device B (new) → Session 2 → ₹50,000" is the suspicious pattern.
        </p>
      </CardContent>
    </Card>
  );
};

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  AlertTriangle,
  Brain,
  Fingerprint,
  Monitor,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';

interface ChannelSpec {
  id: 'web' | 'mobile' | 'upi';
  title: string;
  subtitle: string;
  icon: typeof Monitor;
  accent: string;
  signals: string[];
  risks: string[];
  metric: { label: string; value: string };
}

const CHANNELS: ChannelSpec[] = [
  {
    id: 'web',
    title: 'Internet Banking',
    subtitle: 'Desktop & laptop browsers',
    icon: Monitor,
    accent: 'from-primary/40 to-primary/5',
    signals: [
      'Mouse movement & velocity',
      'Keystroke dynamics (dwell + flight)',
      'Scroll patterns',
      'Session navigation flow',
    ],
    risks: [
      'IP geolocation change',
      'Browser fingerprint mismatch',
      'Unusual login time',
    ],
    metric: { label: 'Sessions analysed', value: '12,847' },
  },
  {
    id: 'mobile',
    title: 'Mobile Banking',
    subtitle: 'iOS & Android apps',
    icon: Smartphone,
    accent: 'from-accent/40 to-accent/5',
    signals: [
      'Touch pressure & contact size',
      'Swipe dynamics',
      'Device orientation (gyroscope)',
      'Virtual-keyboard typing rhythm',
    ],
    risks: [
      'SIM change detected',
      'New device enrolment',
      'Jailbroken / rooted device',
    ],
    metric: { label: 'Threats blocked (30d)', value: '23' },
  },
  {
    id: 'upi',
    title: 'UPI Platform',
    subtitle: 'Real-time payments',
    icon: Wallet,
    accent: 'from-success/40 to-success/5',
    signals: [
      'Transaction amount patterns',
      'Payee frequency',
      'Time-of-day patterns',
      'PIN entry rhythm',
    ],
    risks: [
      'Unusual payee account',
      'High-value outbound transfer',
      'Rapid successive transactions',
    ],
    metric: { label: 'Median response', value: '180 ms' },
  },
];

export const MultiChannelView: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-cyber bg-clip-text text-transparent">
            Multi-channel coverage
          </CardTitle>
          <CardDescription>
            The same behavioral analysis engine secures web, mobile and UPI rails — distinct signals, shared brain.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {CHANNELS.map((ch) => (
          <ChannelCard key={ch.id} channel={ch} />
        ))}
      </div>

      <CentralizedEngine />
    </div>
  );
};

const ChannelCard: React.FC<{ channel: ChannelSpec }> = ({ channel }) => {
  const Icon = channel.icon;
  return (
    <Card className="bg-card border-border shadow-neural overflow-hidden">
      <div className={`h-1 bg-gradient-to-r ${channel.accent}`} />
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{channel.title}</CardTitle>
              <CardDescription className="text-xs">{channel.subtitle}</CardDescription>
            </div>
          </div>
          <Badge className="bg-success/20 text-success border border-success/40">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Protected
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignalList title="Behavioral signals collected" items={channel.signals} icon={Fingerprint} tone="primary" />
        <SignalList title="Risk factors monitored" items={channel.risks} icon={AlertTriangle} tone="destructive" />
        <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{channel.metric.label}</span>
          <span className="font-mono text-lg text-foreground">{channel.metric.value}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const SignalList: React.FC<{
  title: string;
  items: string[];
  icon: typeof Monitor;
  tone: 'primary' | 'destructive';
}> = ({ title, items, icon: Icon, tone }) => {
  const dot = tone === 'primary' ? 'bg-primary' : 'bg-destructive';
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${tone === 'primary' ? 'text-primary' : 'text-destructive'}`} />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2 text-sm text-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
};

const CentralizedEngine: React.FC = () => (
  <Card className="bg-card border-border shadow-neural overflow-hidden">
    <div className="bg-gradient-neural p-6 relative">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute inset-y-0 left-0 w-1/3 animate-data-flow bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>
      <div className="relative flex items-center gap-4">
        <div className="rounded-full bg-white/15 p-3">
          <Brain className="h-8 w-8 text-white" />
        </div>
        <div className="text-white">
          <div className="text-xs uppercase tracking-widest opacity-80">Centralized AI engine</div>
          <div className="text-xl font-semibold">CYPHER behavioral inference layer</div>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-2 text-white/90 text-sm">
          <Activity className="h-4 w-4" />
          <span>Online · serving all three channels</span>
        </div>
      </div>
    </div>
    <CardContent className="pt-4">
      <p className="text-sm text-muted-foreground">
        Each channel emits its own behavioral telemetry, but inference, scoring and policy decisions converge in a single
        engine. This means a high-risk verdict on UPI can lock the user's web session in the same breath, and a trusted
        web fingerprint can lower friction inside the mobile app.
      </p>
    </CardContent>
  </Card>
);

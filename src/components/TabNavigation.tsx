import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnalyticsDashboard } from '@/components/tabs/AnalyticsDashboard';
import { RiskScoringDashboard } from '@/components/tabs/RiskScoringDashboard';
import { LoginHardeningSimulator } from '@/components/tabs/LoginHardeningSimulator';
import { ThreatIntelligence } from '@/components/tabs/ThreatIntelligence';
import { MultiChannelView } from '@/components/tabs/MultiChannelView';
import { Activity, Layers, LineChart, ShieldAlert, Shuffle, Lock } from 'lucide-react';
import type { BehavioralFeatures } from '@/lib/behavioralAuth';

interface AuthResult {
  isAuthentic: boolean;
  confidence: number;
  timestamp: number;
  sessionId: string;
}

interface Props {
  authenticationContent: React.ReactNode;
  latestFeatures: BehavioralFeatures | null;
  history: AuthResult[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSystemReset: () => void;
}

export const TabNavigation: React.FC<Props> = ({
  authenticationContent,
  latestFeatures,
  history,
  activeTab,
  onTabChange,
  onSystemReset,
}) => {
  const latestConfidence = history.length > 0 ? history[history.length - 1].confidence : null;
  const hardeningTrigger =
    latestConfidence !== null && latestConfidence < 0.3 ? latestConfidence : null;

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <div className="overflow-x-auto -mx-1 px-1">
        <TabsList className="h-auto p-1 inline-flex gap-1 bg-muted/60 border border-border">
          <TabsTrigger value="auth" className="gap-2 px-4 py-2">
            <Lock className="h-4 w-4" />
            Authentication
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 px-4 py-2">
            <LineChart className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="risk" className="gap-2 px-4 py-2">
            <Activity className="h-4 w-4" />
            Risk Scoring
          </TabsTrigger>
          <TabsTrigger value="hardening" className="gap-2 px-4 py-2">
            <ShieldAlert className="h-4 w-4" />
            Login Hardening
          </TabsTrigger>
          <TabsTrigger value="threat" className="gap-2 px-4 py-2">
            <Layers className="h-4 w-4" />
            Threat Intel
          </TabsTrigger>
          <TabsTrigger value="channel" className="gap-2 px-4 py-2">
            <Shuffle className="h-4 w-4" />
            Multi-Channel
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="auth" className="mt-6 space-y-6">
        {authenticationContent}
      </TabsContent>
      <TabsContent value="analytics" className="mt-6">
        <AnalyticsDashboard latestFeatures={latestFeatures} />
      </TabsContent>
      <TabsContent value="risk" className="mt-6">
        <RiskScoringDashboard
          latestConfidence={latestConfidence}
          latestFeatures={latestFeatures}
          history={history}
        />
      </TabsContent>
      <TabsContent value="hardening" className="mt-6">
        <LoginHardeningSimulator
          triggeredByConfidence={hardeningTrigger}
          onSystemReset={onSystemReset}
        />
      </TabsContent>
      <TabsContent value="threat" className="mt-6">
        <ThreatIntelligence latestFeatures={latestFeatures} />
      </TabsContent>
      <TabsContent value="channel" className="mt-6">
        <MultiChannelView />
      </TabsContent>
    </Tabs>
  );
};

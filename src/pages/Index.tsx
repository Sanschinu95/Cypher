import React, { useEffect, useRef, useState } from 'react';
import {
  BehavioralCollector,
  BehavioralFeatures,
  NaiveBayesAuthenticator,
} from '@/lib/behavioralAuth';
import { BehavioralForm } from '@/components/BehavioralForm';
import { ReferenceCard } from '@/components/ReferenceCard';
import { TrainingDashboard } from '@/components/TrainingDashboard';
import { PostAuthGateway } from '@/components/PostAuthGateway';
import { TabNavigation } from '@/components/TabNavigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { Brain, Shield, Zap, Info } from 'lucide-react';
import { useSessionLog } from '@/hooks/useSessionLog';

type AppMode = 'welcome' | 'training' | 'testing';

interface AuthenticationResult {
  isAuthentic: boolean;
  confidence: number;
  timestamp: number;
  sessionId: string;
}

const Index = () => {
  const [mode, setMode] = useState<AppMode>('welcome');
  const [currentSession, setCurrentSession] = useState(1);
  const [collector] = useState(() => new BehavioralCollector());
  const [authenticator] = useState(() => new NaiveBayesAuthenticator());
  const [authResults, setAuthResults] = useState<AuthenticationResult[]>([]);
  const [latestFeatures, setLatestFeatures] = useState<BehavioralFeatures | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('auth');
  const lastRedirectedFor = useRef<string | null>(null);
  const { addEvent } = useSessionLog();

  // Auto-route to the Login Hardening tab whenever a fresh test scores high-risk.
  useEffect(() => {
    const latest = authResults[authResults.length - 1];
    if (!latest) return;
    if (latest.confidence < 0.3 && lastRedirectedFor.current !== latest.sessionId) {
      lastRedirectedFor.current = latest.sessionId;
      setActiveTab('hardening');
      addEvent('system', 'High-risk verdict — escalated to step-up authentication.');
    }
  }, [authResults, addEvent]);

  useEffect(() => {
    // Load existing data on component mount
    const loaded = authenticator.loadFromLocalStorage();
    if (loaded && authenticator.isReadyForTesting()) {
      setCurrentSession(11); // Training complete
      addEvent('system', 'Existing trained model restored from local storage.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticator]);

  const generateSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const handleTrainingSubmit = (_formData: unknown) => {
    const sessionId = generateSessionId();
    const behavioralData = collector.getCollectedData(sessionId);

    authenticator.addTrainingData(behavioralData);
    authenticator.saveToLocalStorage();
    addEvent('training', `Training sample ${currentSession}/10 collected.`);

    toast({
      title: 'Training Session Complete',
      description: `Session ${currentSession}/10 data recorded successfully.`,
    });

    if (currentSession < 10) {
      setCurrentSession((prev) => prev + 1);
      collector.reset();
      setIsFormVisible(false);
      setTimeout(() => setIsFormVisible(true), 1000);
    } else {
      setCurrentSession(11);
      setIsFormVisible(false);
      addEvent('system', 'Training complete — model is ready for authentication tests.');
      toast({
        title: 'Training Complete!',
        description: 'The behavioral authentication system is now ready for testing.',
      });
    }
  };

  const handleAuthenticationTest = (_formData: unknown) => {
    const sessionId = generateSessionId();
    const behavioralData = collector.getCollectedData(sessionId);

    const result = authenticator.authenticate(behavioralData);
    const features = authenticator.extractFeatures(behavioralData);
    setLatestFeatures(features);

    const authResult: AuthenticationResult = {
      isAuthentic: result.isAuthentic,
      confidence: result.confidence,
      timestamp: Date.now(),
      sessionId,
    };

    setAuthResults((prev) => [...prev, authResult]);
    collector.reset();
    setIsFormVisible(false);

    toast({
      title: result.isAuthentic ? 'Authentication Successful' : 'Authentication Failed',
      description: `Confidence: ${(result.confidence * 100).toFixed(1)}%`,
      variant: result.isAuthentic ? 'default' : 'destructive',
    });
  };

  const handleStartTraining = () => {
    setMode('training');
    setCurrentSession(1);
    collector.reset();
    authenticator.reset();
    setAuthResults([]);
    setLatestFeatures(null);
    setIsFormVisible(true);
    addEvent('system', 'Training mode started.');
  };

  const handleStartTesting = () => {
    setMode('testing');
    collector.reset();
    setIsFormVisible(true);
    addEvent('system', 'Testing mode started.');
  };

  const handleNewTest = () => {
    collector.reset();
    setIsFormVisible(true);
  };

  const handleReset = () => {
    setMode('welcome');
    setCurrentSession(1);
    collector.reset();
    authenticator.reset();
    setAuthResults([]);
    setLatestFeatures(null);
    setIsFormVisible(false);
    addEvent('system', 'System reset — all training and history cleared.');
    toast({
      title: 'System Reset',
      description: 'All training data and results have been cleared.',
    });
  };

  // Authentication tab content (the existing test UI). Used both as the standalone
  // testing view and as the default tab once the dashboard is unlocked.
  const authenticationTabContent = (
    <>
      {authResults.length > 0 && (
        <PostAuthGateway
          results={authResults}
          latestFeatures={latestFeatures}
          onRetry={handleNewTest}
          onReset={handleReset}
        />
      )}

      {isFormVisible && (
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          <div className="lg:order-2">
            <ReferenceCard />
          </div>
          <div className="lg:col-span-2 lg:order-1">
            <BehavioralForm
              collector={collector}
              onSubmit={handleAuthenticationTest}
              isTraining={false}
            />
          </div>
        </div>
      )}
    </>
  );

  const dashboardUnlocked = authenticator.isReadyForTesting();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-neural border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-lg backdrop-blur-sm">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-[0.2em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
                  CYPHER
                </h1>
                <p className="text-white/80 text-sm">
                  Behavioral biometrics authentication lab
                </p>
              </div>
            </div>
            {mode !== 'welcome' && (
              <Button
                variant="outline"
                onClick={() => setMode('welcome')}
                className="border-border hover:bg-secondary"
              >
                Back to Home
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {mode === 'welcome' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold text-foreground">
                Next-Generation Authentication
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Experience cutting-edge behavioral biometrics that learns your unique typing patterns,
                mouse movements, and touch gestures to provide seamless, secure authentication.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-card border-border shadow-neural hover:shadow-glow transition-all duration-300">
                <CardHeader>
                  <Zap className="h-8 w-8 text-primary mb-2" />
                  <CardTitle className="text-foreground">Keystroke Dynamics</CardTitle>
                  <CardDescription>
                    Analyzes typing rhythm, dwell time, and flight time between keystrokes
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-card border-border shadow-neural hover:shadow-glow transition-all duration-300">
                <CardHeader>
                  <Shield className="h-8 w-8 text-accent mb-2" />
                  <CardTitle className="text-foreground">Mouse Biometrics</CardTitle>
                  <CardDescription>
                    Tracks mouse movement patterns, velocity, and clicking behavior
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="bg-card border-border shadow-neural hover:shadow-glow transition-all duration-300">
                <CardHeader>
                  <Brain className="h-8 w-8 text-primary-glow mb-2" />
                  <CardTitle className="text-foreground">AI Recognition</CardTitle>
                  <CardDescription>
                    Uses Naive Bayes machine learning for pattern recognition and authentication
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            <Alert className="bg-muted/50 border-border">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-muted-foreground">
                This demonstration runs entirely in your browser. All behavioral data is stored locally
                and never transmitted to any servers. Your privacy is completely protected.
              </AlertDescription>
            </Alert>

            <div className="flex justify-center gap-4">
              <Button
                onClick={handleStartTraining}
                className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow px-8 py-6 text-lg"
              >
                Start Training (10 Sessions)
              </Button>
              {authenticator.isReadyForTesting() && (
                <Button
                  onClick={handleStartTesting}
                  variant="outline"
                  className="border-border hover:bg-secondary px-8 py-6 text-lg"
                >
                  Test Authentication
                </Button>
              )}
            </div>
          </div>
        )}

        {mode === 'training' && (
          <div className="max-w-6xl mx-auto space-y-8">
            <TrainingDashboard
              currentSession={currentSession}
              totalSessions={10}
              progress={authenticator.getTrainingProgress()}
              isTrainingComplete={currentSession > 10}
              onReset={handleReset}
              onStartTesting={handleStartTesting}
            />

            {isFormVisible && currentSession <= 10 && (
              <div className="grid lg:grid-cols-3 gap-8 items-start">
                <div className="lg:order-2">
                  <ReferenceCard />
                </div>
                <div className="lg:col-span-2 lg:order-1">
                  <BehavioralForm
                    collector={collector}
                    onSubmit={handleTrainingSubmit}
                    sessionNumber={currentSession}
                    isTraining={true}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'testing' && (
          <div className="max-w-6xl mx-auto space-y-8">
            {dashboardUnlocked ? (
              <TabNavigation
                authenticationContent={authenticationTabContent}
                latestFeatures={latestFeatures}
                history={authResults}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onSystemReset={handleReset}
              />
            ) : (
              authenticationTabContent
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;

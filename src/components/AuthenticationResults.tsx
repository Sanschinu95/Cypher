import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Shield, ShieldCheck, ShieldX, AlertTriangle, RotateCcw } from 'lucide-react';

interface AuthenticationResult {
  isAuthentic: boolean;
  confidence: number;
  timestamp: number;
  sessionId: string;
}

interface AuthenticationResultsProps {
  results: AuthenticationResult[];
  onNewTest: () => void;
  onReset: () => void;
}

export const AuthenticationResults: React.FC<AuthenticationResultsProps> = ({
  results,
  onNewTest,
  onReset
}) => {
  const latestResult = results[results.length - 1];
  const successRate = results.length > 0 ? 
    (results.filter(r => r.isAuthentic).length / results.length) * 100 : 0;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-success';
    if (confidence >= 0.4) return 'text-warning';
    return 'text-destructive';
  };

  const getConfidenceBadge = (confidence: number, isAuthentic: boolean) => {
    if (isAuthentic && confidence >= 0.7) return 'default';
    if (isAuthentic && confidence >= 0.4) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {latestResult && (
        <Card className="bg-card border-border shadow-neural">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {latestResult.isAuthentic ? (
                  <ShieldCheck className="h-8 w-8 text-success" />
                ) : (
                  <ShieldX className="h-8 w-8 text-destructive" />
                )}
                <div>
                  <CardTitle className="text-2xl text-foreground">
                    {latestResult.isAuthentic ? 'Authentication Successful' : 'Authentication Failed'}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Latest behavioral analysis result
                  </CardDescription>
                </div>
              </div>
              <Badge 
                variant={getConfidenceBadge(latestResult.confidence, latestResult.isAuthentic)}
                className="text-lg px-4 py-2"
              >
                {(latestResult.confidence * 100).toFixed(1)}% Confidence
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Confidence Score</span>
                <span className={`text-sm font-bold ${getConfidenceColor(latestResult.confidence)}`}>
                  {(latestResult.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={latestResult.confidence * 100} 
                className="h-3"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="space-y-2">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Analysis Details
                </h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <span className={latestResult.isAuthentic ? 'text-success' : 'text-destructive'}>
                      {latestResult.isAuthentic ? 'Legitimate User' : 'Suspicious Activity'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Timestamp:</span>
                    <span>{new Date(latestResult.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Session ID:</span>
                    <span className="font-mono text-xs">{latestResult.sessionId.slice(0, 8)}...</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Risk Assessment
                </h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Risk Level:</span>
                    <span className={
                      latestResult.confidence >= 0.7 ? 'text-success' :
                      latestResult.confidence >= 0.4 ? 'text-warning' : 'text-destructive'
                    }>
                      {latestResult.confidence >= 0.7 ? 'Low' :
                       latestResult.confidence >= 0.4 ? 'Medium' : 'High'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Recommendation:</span>
                    <span className={latestResult.isAuthentic ? 'text-success' : 'text-destructive'}>
                      {latestResult.isAuthentic ? 'Allow Access' : 'Deny Access'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={onNewTest}
                className="flex-1 bg-gradient-primary hover:opacity-90 text-primary-foreground"
              >
                Run New Test
              </Button>
              <Button
                variant="outline"
                onClick={onReset}
                className="border-border hover:bg-secondary"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset System
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 1 && (
        <Card className="bg-card border-border shadow-neural">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Test History</CardTitle>
            <CardDescription className="text-muted-foreground">
              Overall success rate: {successRate.toFixed(1)}% ({results.filter(r => r.isAuthentic).length}/{results.length} tests)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.slice(-5).reverse().map((result, index) => (
                <div
                  key={result.sessionId}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    {result.isAuthentic ? (
                      <ShieldCheck className="h-5 w-5 text-success" />
                    ) : (
                      <ShieldX className="h-5 w-5 text-destructive" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Test #{results.length - index}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(result.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${getConfidenceColor(result.confidence)}`}>
                      {(result.confidence * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {result.isAuthentic ? 'Authentic' : 'Rejected'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Circle, RotateCcw, Brain } from 'lucide-react';

interface TrainingDashboardProps {
  currentSession: number;
  totalSessions: number;
  progress: number;
  isTrainingComplete: boolean;
  onReset: () => void;
  onStartTesting: () => void;
}

export const TrainingDashboard: React.FC<TrainingDashboardProps> = ({
  currentSession,
  totalSessions,
  progress,
  isTrainingComplete,
  onReset,
  onStartTesting
}) => {
  const getSessionStatus = (sessionNum: number) => {
    if (sessionNum < currentSession) return 'completed';
    if (sessionNum === currentSession) return 'current';
    return 'pending';
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl bg-gradient-cyber bg-clip-text text-transparent flex items-center gap-2">
                <Brain className="h-6 w-6 text-primary" />
                Training Progress
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Neural network learning your behavioral patterns
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="border-border hover:bg-secondary"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Training
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-foreground">
                Session {currentSession}/{totalSessions}
              </span>
              <Badge 
                variant={isTrainingComplete ? "default" : "secondary"}
                className={isTrainingComplete ? "bg-success text-success-foreground" : ""}
              >
                {progress.toFixed(0)}% Complete
              </Badge>
            </div>
            <Progress 
              value={progress} 
              className="h-3 bg-secondary"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Array.from({ length: totalSessions }, (_, i) => i + 1).map((sessionNum) => {
              const status = getSessionStatus(sessionNum);
              return (
                <div
                  key={sessionNum}
                  className={`
                    flex items-center justify-center p-3 rounded-lg border transition-all duration-300
                    ${status === 'completed' 
                      ? 'bg-success/20 border-success text-success' 
                      : status === 'current'
                        ? 'bg-primary/20 border-primary text-primary animate-pulse-glow'
                        : 'bg-muted border-border text-muted-foreground'
                    }
                  `}
                >
                  {status === 'completed' ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                  <span className="ml-2 font-medium">{sessionNum}</span>
                </div>
              );
            })}
          </div>

          {isTrainingComplete && (
            <div className="bg-gradient-neural p-4 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Training Complete!</h3>
                  <p className="text-sm text-muted-foreground">
                    The neural network has learned your behavioral patterns and is ready for authentication testing.
                  </p>
                </div>
                <Button
                  onClick={onStartTesting}
                  className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow"
                >
                  Start Testing
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="h-2 bg-gradient-primary rounded-full"></div>
              <h4 className="font-semibold text-foreground">Keystroke Dynamics</h4>
              <p className="text-sm text-muted-foreground">
                Measures typing rhythm, dwell time, and flight time between keystrokes
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-2 bg-gradient-cyber rounded-full"></div>
              <h4 className="font-semibold text-foreground">Mouse Patterns</h4>
              <p className="text-sm text-muted-foreground">
                Tracks mouse movement velocity, acceleration, and clicking patterns
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-2 bg-gradient-neural rounded-full"></div>
              <h4 className="font-semibold text-foreground">Touch Biometrics</h4>
              <p className="text-sm text-muted-foreground">
                Analyzes touch pressure, size, and gesture patterns on mobile devices
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
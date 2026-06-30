import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TimerReset,
} from 'lucide-react';
import {
  DEMO_CREDENTIALS,
  EMAILJS_CONFIG,
  generateOtp,
  maskEmail,
  sendOtpEmail,
} from '@/lib/emailjs';
import { useSessionLog } from '@/hooks/useSessionLog';
import { toast } from '@/hooks/use-toast';

type Stage = 'credentials' | 'sending' | 'otp' | 'approved' | 'lockout_temp' | 'lockout_perm';

interface Props {
  // Sticky context: the most recent test verdict (if it triggered this challenge).
  triggeredByConfidence: number | null;
  // Full-system reset (only escape hatch from permanent lockout).
  onSystemReset: () => void;
}

const TEMP_LOCKOUT_SECONDS = 300; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;

const LADDER: Array<{ stage: Stage; label: string; icon: typeof ShieldCheck; color: string; bg: string }> = [
  { stage: 'credentials',  label: 'Step-up',  icon: KeyRound,    color: 'text-warning',     bg: 'bg-warning/15 border-warning/40' },
  { stage: 'sending',      label: 'Verifying', icon: Mail,       color: 'text-primary',     bg: 'bg-primary/15 border-primary/40' },
  { stage: 'otp',          label: 'OTP',       icon: ShieldAlert, color: 'text-primary',    bg: 'bg-primary/15 border-primary/40' },
  { stage: 'approved',     label: 'Approved', icon: Sparkles,    color: 'text-success',     bg: 'bg-success/15 border-success/40' },
  { stage: 'lockout_temp', label: 'Locked',   icon: Lock,        color: 'text-warning',     bg: 'bg-warning/15 border-warning/40' },
  { stage: 'lockout_perm', label: 'Disabled', icon: ShieldX,     color: 'text-destructive', bg: 'bg-destructive/15 border-destructive/40' },
];

export const LoginHardeningSimulator: React.FC<Props> = ({ triggeredByConfidence, onSystemReset }) => {
  const { addEvent } = useSessionLog();
  const [stage, setStage] = useState<Stage>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [wrongPasswordCount, setWrongPasswordCount] = useState(0);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sendError, setSendError] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);

  // 1-second tick while a temporary lockout is active.
  useEffect(() => {
    if (stage !== 'lockout_temp') return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  // Auto-release the temporary lockout when the timer hits zero.
  useEffect(() => {
    if (stage !== 'lockout_temp' || lockedUntil === null) return;
    if (now >= lockedUntil) {
      setStage('credentials');
      setLockedUntil(null);
      setCredentialError(null);
      addEvent('system', 'Temporary lockout cleared. One attempt remaining before permanent disable.');
    }
  }, [stage, lockedUntil, now, addEvent]);

  const tempCooldownSeconds = useMemo(
    () => (stage === 'lockout_temp' && lockedUntil !== null ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0),
    [stage, lockedUntil, now]
  );

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredentialError(null);

    const credsOk =
      username.trim() === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password;

    if (!credsOk) {
      const next = wrongPasswordCount + 1;
      setWrongPasswordCount(next);
      setPassword('');
      if (next >= 2) {
        setStage('lockout_perm');
        addEvent('lockout', 'Step-up authentication failed twice. Account permanently disabled.');
        toast({
          title: 'Account permanently locked',
          description: 'Two failed step-up attempts. Reset the lab to restore access.',
          variant: 'destructive',
        });
      } else {
        const until = Date.now() + TEMP_LOCKOUT_SECONDS * 1000;
        setLockedUntil(until);
        setStage('lockout_temp');
        addEvent('lockout', `Wrong password — temporary lockout for ${TEMP_LOCKOUT_SECONDS / 60} minutes.`);
        toast({
          title: 'Temporary lockout',
          description: `Locked for ${TEMP_LOCKOUT_SECONDS / 60} minutes. Next failure permanently disables the account.`,
          variant: 'destructive',
        });
      }
      return;
    }

    // Correct credentials — issue an OTP and send via EmailJS.
    const otp = generateOtp();
    setGeneratedOtp(otp);
    setOtpValue('');
    setOtpAttempts(0);
    setSendError(null);
    setStage('sending');
    addEvent('info', `Credentials accepted for ${username}. Dispatching one-time passcode.`);

    try {
      await sendOtpEmail(otp, EMAILJS_CONFIG.registeredEmail);
      setStage('otp');
      addEvent('info', `OTP delivered to ${maskEmail(EMAILJS_CONFIG.registeredEmail)} via EmailJS.`);
      toast({
        title: 'OTP sent',
        description: `Check ${maskEmail(EMAILJS_CONFIG.registeredEmail)} for the verification code.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSendError(message);
      // Roll back to the credentials screen but keep the wrongPasswordCount at zero — this wasn't the user's fault.
      setStage('credentials');
      addEvent('system', `EmailJS delivery failed: ${message}`);
      toast({
        title: 'OTP delivery failed',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleOtpVerify = () => {
    if (!generatedOtp) return;
    if (otpValue.length !== 6) return;
    if (otpValue === generatedOtp) {
      setStage('approved');
      addEvent('auth_pass', 'Step-up verification succeeded. Transaction approved.');
      toast({
        title: 'Transaction approved',
        description: 'Step-up authentication passed.',
      });
    } else {
      const next = otpAttempts + 1;
      setOtpAttempts(next);
      setOtpValue('');
      if (next >= MAX_OTP_ATTEMPTS) {
        // Treat exhausted OTP attempts as a wrong-password event for the lockout state machine.
        const wrongNext = wrongPasswordCount + 1;
        setWrongPasswordCount(wrongNext);
        if (wrongNext >= 2) {
          setStage('lockout_perm');
          addEvent('lockout', 'OTP attempts exhausted. Account permanently disabled.');
        } else {
          setLockedUntil(Date.now() + TEMP_LOCKOUT_SECONDS * 1000);
          setStage('lockout_temp');
          addEvent('lockout', 'OTP attempts exhausted — temporary lockout.');
        }
      } else {
        addEvent('auth_warn', `OTP mismatch (attempt ${next}/${MAX_OTP_ATTEMPTS}).`);
        toast({
          title: 'Incorrect OTP',
          description: `${MAX_OTP_ATTEMPTS - next} attempts remaining.`,
          variant: 'destructive',
        });
      }
    }
  };

  const handleResendOtp = async () => {
    const otp = generateOtp();
    setGeneratedOtp(otp);
    setOtpValue('');
    setOtpAttempts(0);
    setSendError(null);
    setStage('sending');
    try {
      await sendOtpEmail(otp, EMAILJS_CONFIG.registeredEmail);
      setStage('otp');
      addEvent('info', `OTP re-sent to ${maskEmail(EMAILJS_CONFIG.registeredEmail)}.`);
      toast({ title: 'OTP re-sent', description: `Check ${maskEmail(EMAILJS_CONFIG.registeredEmail)}.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSendError(message);
      setStage('otp');
      toast({ title: 'Resend failed', description: message, variant: 'destructive' });
    }
  };

  const handleRestartChallenge = () => {
    setStage('credentials');
    setUsername('');
    setPassword('');
    setOtpValue('');
    setGeneratedOtp(null);
    setOtpAttempts(0);
    setSendError(null);
    setCredentialError(null);
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border shadow-neural">
        <CardHeader>
          <CardTitle className="text-2xl bg-gradient-cyber bg-clip-text text-transparent">
            Step-up Authentication
          </CardTitle>
          <CardDescription>
            When a transaction is flagged high-risk, the user is escalated here for credentials + OTP verification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Ladder current={stage} />
        </CardContent>
      </Card>

      {triggeredByConfidence !== null && stage !== 'approved' && (
        <Alert className="border-warning/40 bg-warning/5">
          <ShieldAlert className="h-4 w-4 text-warning" />
          <AlertTitle className="text-warning">Triggered by a high-risk verdict</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            The most recent behavioral test scored {Math.round(triggeredByConfidence * 100)}% confidence. Complete the
            step-up challenge below to continue.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border shadow-neural">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {stage === 'approved' ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : stage === 'lockout_temp' ? (
                <Lock className="h-5 w-5 text-warning" />
              ) : stage === 'lockout_perm' ? (
                <ShieldX className="h-5 w-5 text-destructive" />
              ) : (
                <KeyRound className="h-5 w-5 text-primary" />
              )}
              {stageTitle(stage)}
            </CardTitle>
            <CardDescription>{stageDescription(stage)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stage === 'credentials' && (
              <CredentialsForm
                username={username}
                password={password}
                onUsernameChange={setUsername}
                onPasswordChange={setPassword}
                onSubmit={handleCredentialsSubmit}
                attemptsUsed={wrongPasswordCount}
                error={credentialError ?? sendError}
              />
            )}

            {stage === 'sending' && (
              <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
                <Mail className="h-5 w-5 text-primary animate-pulse" />
                <span className="text-sm text-foreground">Sending OTP to {maskEmail(EMAILJS_CONFIG.registeredEmail)}…</span>
              </div>
            )}

            {stage === 'otp' && (
              <OtpForm
                value={otpValue}
                onChange={setOtpValue}
                onVerify={handleOtpVerify}
                onResend={handleResendOtp}
                attemptsUsed={otpAttempts}
                maxAttempts={MAX_OTP_ATTEMPTS}
                maskedEmail={maskEmail(EMAILJS_CONFIG.registeredEmail)}
              />
            )}

            {stage === 'approved' && (
              <ApprovedView onRestart={handleRestartChallenge} />
            )}

            {stage === 'lockout_temp' && (
              <TempLockoutView cooldownSeconds={tempCooldownSeconds} total={TEMP_LOCKOUT_SECONDS} />
            )}

            {stage === 'lockout_perm' && (
              <PermanentLockoutView onSystemReset={onSystemReset} />
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-neural">
          <CardHeader>
            <CardTitle>Security state</CardTitle>
            <CardDescription>Current escalation level and policy in effect.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <StagePill stage={stage} />
            <PolicyTable stage={stage} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Wrong password</div>
                <div className="font-mono text-lg text-foreground">{wrongPasswordCount} / 2</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">OTP attempts</div>
                <div className="font-mono text-lg text-foreground">{otpAttempts} / {MAX_OTP_ATTEMPTS}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Demo credentials: <span className="font-mono">{DEMO_CREDENTIALS.username}</span> ·
              {' '}<span className="font-mono">{DEMO_CREDENTIALS.password}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Sub-components

const stageTitle = (stage: Stage): string => {
  switch (stage) {
    case 'credentials':  return 'Sign in to verify identity';
    case 'sending':      return 'Dispatching one-time passcode';
    case 'otp':          return 'Enter verification code';
    case 'approved':     return 'Transaction approved';
    case 'lockout_temp': return 'Temporary lockout';
    case 'lockout_perm': return 'Account permanently disabled';
  }
};

const stageDescription = (stage: Stage): string => {
  switch (stage) {
    case 'credentials':  return 'Provide the account credentials to receive a verification code.';
    case 'sending':      return 'Contacting EmailJS to deliver the OTP to the registered email.';
    case 'otp':          return 'Enter the 6-digit code that was just emailed.';
    case 'approved':     return 'Identity verified. The transaction can proceed.';
    case 'lockout_temp': return 'The account is temporarily disabled. One more failure will lock it permanently.';
    case 'lockout_perm': return 'This account is disabled. Only a full system reset can restore it (demo only).';
  }
};

interface CredentialsFormProps {
  username: string;
  password: string;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  attemptsUsed: number;
  error: string | null;
}

const CredentialsForm: React.FC<CredentialsFormProps> = ({
  username,
  password,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  attemptsUsed,
  error,
}) => (
  <form onSubmit={onSubmit} className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="harden-user">Username</Label>
      <Input
        id="harden-user"
        autoComplete="username"
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        placeholder="Rashika123"
        required
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="harden-pass">Password</Label>
      <Input
        id="harden-pass"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        placeholder="••••••••"
        required
      />
    </div>
    {error && (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
        <span className="text-destructive">{error}</span>
      </div>
    )}
    {attemptsUsed > 0 && (
      <div className="text-xs text-warning">
        Last attempt failed. One more wrong password will permanently disable the account.
      </div>
    )}
    <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground">
      Sign in &amp; send OTP
    </Button>
  </form>
);

interface OtpFormProps {
  value: string;
  onChange: (v: string) => void;
  onVerify: () => void;
  onResend: () => void;
  attemptsUsed: number;
  maxAttempts: number;
  maskedEmail: string;
}

const OtpForm: React.FC<OtpFormProps> = ({ value, onChange, onVerify, onResend, attemptsUsed, maxAttempts, maskedEmail }) => (
  <div className="space-y-4">
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground/90">
      A 6-digit code was sent to <span className="font-mono">{maskedEmail}</span>.
    </div>
    <div className="flex justify-center">
      <InputOTP
        maxLength={6}
        value={value}
        onChange={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>Attempts used: {attemptsUsed} / {maxAttempts}</span>
      <button type="button" onClick={onResend} className="text-primary hover:underline">
        Resend code
      </button>
    </div>
    <Button onClick={onVerify} disabled={value.length !== 6} className="w-full bg-gradient-primary text-primary-foreground">
      Verify &amp; approve transaction
    </Button>
  </div>
);

const ApprovedView: React.FC<{ onRestart: () => void }> = ({ onRestart }) => (
  <div className="space-y-4">
    <div className="rounded-lg border border-success/40 bg-success/5 p-4 text-center">
      <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
      <div className="text-lg font-semibold text-foreground">Step-up authentication passed</div>
      <div className="text-sm text-muted-foreground">Transaction approved and audited in the session feed.</div>
    </div>
    <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm font-mono space-y-1">
      <div className="flex justify-between"><span className="text-muted-foreground">Merchant</span><span>CYPHER Demo Merchant</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span>₹4,250.00</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>TXN-{Date.now().toString().slice(-8)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="text-success">APPROVED</span></div>
    </div>
    <Button variant="outline" onClick={onRestart} className="w-full">
      <RotateCcw className="h-4 w-4 mr-2" />
      Restart challenge
    </Button>
  </div>
);

const TempLockoutView: React.FC<{ cooldownSeconds: number; total: number }> = ({ cooldownSeconds, total }) => {
  const m = Math.floor(cooldownSeconds / 60).toString().padStart(2, '0');
  const s = (cooldownSeconds % 60).toString().padStart(2, '0');
  const progress = ((total - cooldownSeconds) / total) * 100;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-center">
        <TimerReset className="h-8 w-8 text-warning mx-auto mb-2" />
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Cooldown</div>
        <div className="text-4xl font-mono text-warning">{m}:{s}</div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-warning transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        After cooldown, you get one more attempt before the account is permanently disabled.
      </p>
    </div>
  );
};

const PermanentLockoutView: React.FC<{ onSystemReset: () => void }> = ({ onSystemReset }) => (
  <div className="space-y-3">
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center">
      <ShieldX className="h-10 w-10 text-destructive mx-auto mb-2" />
      <div className="text-lg font-semibold text-foreground">Account permanently disabled</div>
      <div className="text-sm text-muted-foreground">
        Two wrong-password incidents reached the hard limit. In production this would route the user to a
        manual support flow; in this lab the only way out is a full reset.
      </div>
    </div>
    <Button variant="destructive" onClick={onSystemReset} className="w-full">
      <RotateCcw className="h-4 w-4 mr-2" />
      Reset entire lab (clears training data)
    </Button>
  </div>
);

const Ladder: React.FC<{ current: Stage }> = ({ current }) => {
  // Conceptual order: credentials → sending → otp → approved. Lockouts sit at the same level as credentials.
  const ORDER: Stage[] = ['credentials', 'sending', 'otp', 'approved'];
  const idx = ORDER.indexOf(current);
  const visualIdx =
    current === 'lockout_temp' ? -1 : current === 'lockout_perm' ? -2 : idx;

  return (
    <div className="flex items-stretch gap-2">
      {LADDER.filter((l) => ORDER.includes(l.stage)).map((step, i) => {
        const Icon = step.icon;
        const active = visualIdx === i;
        const passed = visualIdx > i;
        return (
          <React.Fragment key={step.stage}>
            <div className={`flex-1 rounded-lg border p-3 transition-colors ${active ? step.bg : 'border-border bg-muted/20 opacity-60'}`}>
              <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${active || passed ? step.color : 'text-muted-foreground'}`} />
                <span className={`text-sm font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
              </div>
            </div>
            {i < ORDER.length - 1 && (
              <div className={`self-center h-px w-3 ${i < visualIdx ? 'bg-primary' : 'bg-border'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const StagePill: React.FC<{ stage: Stage }> = ({ stage }) => {
  const meta = LADDER.find((l) => l.stage === stage)!;
  const Icon = meta.icon;
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 ${meta.bg}`}>
      <Icon className={`h-7 w-7 ${meta.color}`} />
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Current stage</div>
        <div className="text-xl font-semibold text-foreground">{meta.label}</div>
      </div>
    </div>
  );
};

const POLICIES: Record<Stage, Array<[string, string]>> = {
  credentials:  [['MFA', 'Required'], ['Device trust', 'No bypass'], ['Velocity check', 'Tightened']],
  sending:      [['OTP delivery', 'EmailJS (registered email)'], ['Channel', 'Email'], ['TTL', '5 minutes']],
  otp:          [['OTP attempts', 'Up to 5'], ['Resend', 'Allowed'], ['Approval', 'On match']],
  approved:     [['Transaction', 'Approved'], ['Risk score', 'Reset for this session'], ['Audit', 'Logged']],
  lockout_temp: [['Login', 'Blocked'], ['Cooldown', '5 minutes'], ['Next failure', 'Permanent lockout']],
  lockout_perm: [['Login', 'Disabled'], ['Recovery', 'Out-of-band only'], ['Demo escape', 'Full lab reset']],
};

const PolicyTable: React.FC<{ stage: Stage }> = ({ stage }) => (
  <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Active policy</div>
    <table className="w-full">
      <tbody>
        {POLICIES[stage].map(([k, v]) => (
          <tr key={k} className="border-b border-border/40 last:border-0">
            <td className="py-1.5 text-muted-foreground">{k}</td>
            <td className="py-1.5 text-right text-foreground">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

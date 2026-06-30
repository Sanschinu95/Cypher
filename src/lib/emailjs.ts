// EmailJS REST integration for the Login Hardening OTP flow.
// Public key is intentionally client-side — that is how EmailJS is meant to be used.

export const EMAILJS_CONFIG = {
  serviceId: 'service_hjcgfg9',
  templateId: 'template_w0lvk1t',
  publicKey: 'Ppk6jw7QFNuyn3jpG',
  registeredEmail: 'debyerexy@gmail.com',
} as const;

// Hardcoded demo credentials. Anyone reading the bundle can see these — that's expected for a lab demo.
export const DEMO_CREDENTIALS = {
  username: 'Rashika123',
  password: 'qwerty890',
} as const;

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

export const generateOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const sendOtpEmail = async (otp: string, toEmail: string): Promise<void> => {
  const res = await fetch(EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_CONFIG.serviceId,
      template_id: EMAILJS_CONFIG.templateId,
      user_id: EMAILJS_CONFIG.publicKey,
      template_params: {
        to_email: toEmail,
        email: toEmail,
        otp,
        passcode: otp,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`EmailJS responded ${res.status}: ${body || res.statusText}`);
  }
};

export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] ?? ''}***@${domain}`;
  return `${local[0]}${'•'.repeat(Math.max(3, local.length - 2))}${local[local.length - 1]}@${domain}`;
};

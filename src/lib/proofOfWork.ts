// Hashcash-style proof of work. The verifier gives the solver a random
// challenge string and a difficulty (leading zero bits required). The solver
// increments a nonce until SHA-256(challenge || ":" || nonce) satisfies the
// difficulty. Verification is a single hash comparison.
//
// A bot batching thousands of authentication attempts must pay this CPU cost
// every time, which meaningfully slows scripted enumeration.

export interface PowSolution {
  challenge: string;
  nonce: number;
  hashHex: string;
  difficultyBits: number;
  durationMs: number;
}

const BATCH_SIZE = 500; // hashes per iteration before yielding to the event loop

const bufToHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

const hasLeadingZeroBits = (hashHex: string, bits: number): boolean => {
  const fullBytes = Math.floor(bits / 8);
  const remBits = bits % 8;
  for (let i = 0; i < fullBytes; i++) {
    if (hashHex[i * 2] !== '0' || hashHex[i * 2 + 1] !== '0') return false;
  }
  if (remBits === 0) return true;
  const byte = parseInt(hashHex.slice(fullBytes * 2, fullBytes * 2 + 2), 16);
  const mask = 0xff << (8 - remBits);
  return (byte & mask) === 0;
};

const sha256 = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(digest);
};

export const generateChallenge = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bufToHex(bytes.buffer);
};

export const solvePow = async (
  challenge: string,
  difficultyBits: number,
  onProgress?: (nonce: number) => void
): Promise<PowSolution> => {
  const start = performance.now();
  let nonce = 0;
  while (true) {
    for (let i = 0; i < BATCH_SIZE; i++, nonce++) {
      const hash = await sha256(`${challenge}:${nonce}`);
      if (hasLeadingZeroBits(hash, difficultyBits)) {
        return {
          challenge,
          nonce,
          hashHex: hash,
          difficultyBits,
          durationMs: performance.now() - start,
        };
      }
    }
    if (onProgress) onProgress(nonce);
    // Yield to the event loop so the UI stays responsive.
    await new Promise((r) => setTimeout(r, 0));
  }
};

export const verifyPow = async (solution: PowSolution): Promise<boolean> => {
  const hash = await sha256(`${solution.challenge}:${solution.nonce}`);
  return hash === solution.hashHex && hasLeadingZeroBits(hash, solution.difficultyBits);
};

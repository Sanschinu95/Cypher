// Passive browser-integrity checks — designed to catch default headless setups
// (Puppeteer, Playwright, Selenium, PhantomJS) without any network round-trip.
// A determined adversary can spoof each signal individually, but stacking them
// raises the effort needed to run at scale.

export interface BotSignal {
  id: string;
  label: string;
  detail: string;
}

export interface BotCheckResult {
  passed: boolean;
  signals: BotSignal[];
}

const flag = (id: string, label: string, detail: string): BotSignal => ({ id, label, detail });

export const runBotHeuristics = (): BotCheckResult => {
  const signals: BotSignal[] = [];

  // 1) navigator.webdriver — WebDriver spec exposes this on automated browsers.
  if (typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver === true) {
    signals.push(flag('webdriver', 'WebDriver flag', 'navigator.webdriver === true'));
  }

  // 2) Headless UA strings.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const uaLower = ua.toLowerCase();
  const uaMarkers = ['headlesschrome', 'phantomjs', 'selenium', 'slimerjs'];
  for (const marker of uaMarkers) {
    if (uaLower.includes(marker)) {
      signals.push(flag('ua', 'Suspicious User-Agent', `contains "${marker}"`));
      break;
    }
  }

  // 3) Empty plugin list on a UA claiming to be Chrome/Edge/Firefox.
  //    Real desktop browsers ship at least the PDF plugin family.
  if (typeof navigator !== 'undefined') {
    const plugins = navigator.plugins;
    const desktopUA = /Chrome|Firefox|Safari|Edg/i.test(ua) && !/Mobile|Android|iPhone|iPad/i.test(ua);
    if (desktopUA && (!plugins || plugins.length === 0)) {
      signals.push(flag('plugins', 'No plugins on desktop UA', 'navigator.plugins is empty'));
    }
  }

  // 4) WebGL vendor/renderer — headless Chrome and CI containers surface
  //    "SwiftShader" or "llvmpipe" software renderers that a real GPU never returns.
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const rendererStr = String(renderer || '').toLowerCase();
      if (rendererStr.includes('swiftshader') || rendererStr.includes('llvmpipe') || rendererStr.includes('mesa offscreen')) {
        signals.push(flag('webgl', 'Software WebGL renderer', `renderer="${renderer}"`));
      }
    } else {
      signals.push(flag('webgl', 'WebGL missing', 'no WebGL context available'));
    }
  } catch {
    // WebGL access failed — don't flag; some private modes disable it.
  }

  // 5) Zero-sized viewport or screen — default in some headless setups.
  if (typeof window !== 'undefined') {
    if (window.outerWidth === 0 || window.outerHeight === 0) {
      signals.push(flag('outer', 'Zero window size', `outerWidth=${window.outerWidth} outerHeight=${window.outerHeight}`));
    }
    if (window.screen && (window.screen.width < 200 || window.screen.height < 200)) {
      signals.push(flag('screen', 'Tiny screen', `${window.screen.width}x${window.screen.height}`));
    }
  }

  // 6) Language list should be non-empty in real browsers.
  if (typeof navigator !== 'undefined' && (!navigator.languages || navigator.languages.length === 0)) {
    signals.push(flag('languages', 'Empty languages list', 'navigator.languages is empty'));
  }

  // 7) Notification.permission oddity — some headless drivers return "denied" without ever prompting.
  //    We only flag if the API is completely missing on a UA that claims Chrome.
  if (typeof window !== 'undefined' && /Chrome/i.test(ua) && !('Notification' in window)) {
    signals.push(flag('notification', 'Notification API missing', 'Chrome-UA without Notification API'));
  }

  // 8) Chrome runtime object — real Chrome exposes window.chrome; headless Chrome usually strips it.
  if (typeof window !== 'undefined' && /Chrome/i.test(ua) && !/Edg|OPR/i.test(ua)) {
    const w = window as { chrome?: unknown };
    if (typeof w.chrome === 'undefined') {
      signals.push(flag('chrome', 'Missing window.chrome', 'Chrome UA but no window.chrome object'));
    }
  }

  return { passed: signals.length === 0, signals };
};

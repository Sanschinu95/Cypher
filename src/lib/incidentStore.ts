// Security-incident recorder. When a test lands in the RED tier, we snapshot
// the device context (plus geolocation, if the user grants it) and persist it
// locally. When an online reporting service exists, `persistIncident` is the
// single seam to swap localStorage for a POST.

export interface IncidentLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export interface SecurityIncident {
  id: string;
  timestamp: number;
  confidence: number;
  meanZ: number;
  anomalousFeatures: string[];
  device: {
    userAgent: string;
    platform: string;
    screen: string;
    language: string;
    timezone: string;
    touchSupport: boolean;
  };
  location: IncidentLocation | 'permission-denied' | 'unavailable' | 'timeout';
}

const STORAGE_KEY = 'cypherIncidents';
const MAX_INCIDENTS = 50;
const GEO_TIMEOUT_MS = 6000;

const captureDevice = (): SecurityIncident['device'] => ({
  userAgent: navigator.userAgent,
  platform: navigator.platform || 'unknown',
  screen: `${window.screen.width}x${window.screen.height}`,
  language: navigator.language || 'unknown',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
  touchSupport: 'ontouchstart' in window,
});

const captureLocation = (): Promise<SecurityIncident['location']> =>
  new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
        }),
      (err) => resolve(err.code === err.PERMISSION_DENIED ? 'permission-denied' : 'unavailable'),
      { timeout: GEO_TIMEOUT_MS, maximumAge: 60_000, enableHighAccuracy: false }
    );
    // Safety net: some browsers never fire either callback when the permission
    // prompt is dismissed without a choice.
    setTimeout(() => resolve('timeout'), GEO_TIMEOUT_MS + 1000);
  });

export const readIncidents = (): SecurityIncident[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistIncident = (incident: SecurityIncident): void => {
  // TODO(online-service): replace with POST to the central reporting endpoint.
  const existing = readIncidents();
  const next = [...existing, incident].slice(-MAX_INCIDENTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const clearIncidents = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const recordIncident = async (params: {
  confidence: number;
  meanZ: number;
  anomalousFeatures: string[];
}): Promise<SecurityIncident> => {
  const incident: SecurityIncident = {
    id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    confidence: params.confidence,
    meanZ: params.meanZ,
    anomalousFeatures: params.anomalousFeatures,
    device: captureDevice(),
    location: await captureLocation(),
  };
  persistIncident(incident);
  return incident;
};

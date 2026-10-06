export interface JobLocation {
  latitude: number;
  longitude: number;
}

export interface ProviderJob {
  id: string;
  startTime: number; // timestamp
  endTime: number;   // timestamp
  location: JobLocation;
}

export type FeasibilityStatus = 'SAFE' | 'TIGHT' | 'RISKY' | 'NOT_FEASIBLE';

export interface FeasibilityResult {
  feasible: boolean;
  score: number; // gap in minutes
  status: FeasibilityStatus;
  reason: string;
  nearestJobId?: string;
  travelTime?: number;
}

export interface ProviderSettings {
  minGapMinutes: number;
}

export const calculateDistance = (loc1: JobLocation, loc2: JobLocation): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (loc2.latitude - loc1.latitude) * Math.PI / 180;
  const dLon = (loc2.longitude - loc1.longitude) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(loc1.latitude * Math.PI / 180) * Math.cos(loc2.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// calculateDistance stays in km internally — miles are purely for display,
// since Dodorez launches in the US where customers/providers expect miles.
export const kmToMiles = (km: number): number => km * 0.621371;
export const milesToKm = (miles: number): number => miles / 0.621371;

// The ONE drive-time model — used both for what providers see ("~25 min
// drive") and for the booking-clash check below, so the two can never
// disagree. Straight-line distance understates real roads (~1.35x in a city
// grid), and average city driving including traffic is ~22 km/h.
const ROAD_DISTANCE_FACTOR = 1.35;
const CITY_DRIVING_SPEED_KMH = 22;

export const estimateDriveMinutes = (distanceKm: number): number =>
  Math.max(1, Math.round((distanceKm * ROAD_DISTANCE_FACTOR) / CITY_DRIVING_SPEED_KMH * 60));

export const calculateTravelTime = (loc1: JobLocation, loc2: JobLocation): number =>
  estimateDriveMinutes(calculateDistance(loc1, loc2));

export const formatDriveTime = (minutes: number): string =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}`;

export const checkFeasibility = (
  newJob: { startTime: number; endTime: number; location: JobLocation },
  existingJobs: ProviderJob[],
  settings: ProviderSettings = { minGapMinutes: 15 }
): FeasibilityResult => {
  const PLATFORM_BUFFER = 10;
  const requiredBuffer = Math.max(PLATFORM_BUFFER, settings.minGapMinutes);

  let minGap = Infinity;
  let nearestJob: ProviderJob | null = null;
  let problematicJob: ProviderJob | null = null;

  for (const job of existingJobs) {
    const travelTo = calculateTravelTime(job.location, newJob.location);

    // Check if new job is after existing job
    if (newJob.startTime < job.endTime + (travelTo + requiredBuffer) * 60000 &&
      newJob.endTime > job.startTime - (travelTo + requiredBuffer) * 60000) {
      return {
        feasible: false,
        score: -1,
        status: 'NOT_FEASIBLE',
        reason: 'Overlaps with another booking (including travel)',
        nearestJobId: job.id
      };
    }

    // Calculate gap for scoring
    let gap = Infinity;
    if (newJob.startTime >= job.endTime) {
      gap = (newJob.startTime - job.endTime) / 60000 - travelTo - requiredBuffer;
    } else if (newJob.endTime <= job.startTime) {
      gap = (job.startTime - newJob.endTime) / 60000 - travelTo - requiredBuffer;
    }

    if (gap < minGap) {
      minGap = gap;
      nearestJob = job;
    }
  }

  // Scoring
  let status: FeasibilityStatus = 'SAFE';
  if (minGap > 15) status = 'SAFE';
  else if (minGap > 5) status = 'TIGHT';
  else if (minGap >= 0) status = 'RISKY';
  else status = 'NOT_FEASIBLE';

  return {
    feasible: status !== 'NOT_FEASIBLE',
    score: Math.round(minGap),
    status,
    reason: status === 'SAFE' ? 'Sufficient gap' : (status === 'TIGHT' ? 'Tight window' : 'Very risky gap'),
    nearestJobId: nearestJob?.id,
    travelTime: nearestJob ? calculateTravelTime(nearestJob.location, newJob.location) : 0
  };
};

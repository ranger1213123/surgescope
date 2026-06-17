// ======================== Shared types for SurgeScope ========================

// OD Flow types (existing)
export type OdNode = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  totalIn: number;
  totalOut: number;
};

export type OdLink = {
  id: string;
  source: string;
  target: string;
  value: number;
  avgDistance: number;
  avgPrice: number | null;
  avgSurge: number | null;
  avgTemp: number | null;
  avgPrecip: number | null;
  avgVisibility: number | null;
  avgWind: number | null;
  topWeather: { weather: string; count: number }[];
  vehicleTypes: VehicleType[];
};

export type OdFlowData = {
  generatedAt: string;
  nodes: OdNode[];
  links: OdLink[];
  byMonth?: Record<string, { label: string; nodes: OdNode[]; links: OdLink[] }>;
};

export type OdFocusState = {
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  hoveredLinkId: string | null;
  selectedLinkId: string | null;
};

export type VehicleType = { type: string; count: number; pct: number };

// Weather & Surge types
export type PlatformData = {
  avg_surge: number;
  avg_price: number | null;
  order_count: number;
};

export type HourlyRecord = {
  datetime: string;
  date: Date;
  precipIntensity: number;
  temperature: number;
  visibility: number;
  humidity: number;
  precipProbability: number;
  cloudCover: number;
  windSpeed: number;
  shortSummary: string;
  uber: PlatformData | null;
  lyft: PlatformData | null;
};

export type HourlySeriesData = Record<string, {
  uber?: PlatformData;
  lyft?: PlatformData;
  temperature?: number;
  precipIntensity?: number;
  visibility?: number;
  humidity?: number;
  precipProbability?: number;
  cloudCover?: number;
  windSpeed?: number;
  short_summary?: string;
}>;

export type WeatherEventWindow = {
  eventId: string;
  eventType: string;
  eventTime: string;
  eventReason: string;
  precipChange: number | null;
  temperatureChange: number | null;
  visibilityChange: number | null;
  relativeHour: number;
  datetime: string;
  cabType: string;
  avgSurge: number;
  avgPrice: number | null;
  orderCount: number;
  precipIntensity: number;
  temperature: number;
  visibility: number;
  shortSummary: string;
};

export type HourlyPlatformRecord = {
  datetime: string;
  platform: string;
  avgSurge: number;
  orderCount: number;
  temperature: number | null;
  precipIntensity: number;
  visibility: number | null;
  humidity: number | null;
  shortSummary: string;
};

export type EventCurvePoint = {
  eventType: string;
  cabType: string;
  relativeHour: number;
  sampleSize: number;
  mean: number;
  lower: number | null;
  upper: number | null;
};

export type WeatherBucketStats = Record<string, Record<string, {
  surge_min?: number; surge_q1?: number; surge_median?: number;
  surge_q3?: number; surge_max?: number;
  order_count?: number; outliers?: number[];
}>>;

// Demand types
export type DemandBlock = {
  day: number;
  hour: number;
  block: string;
  platform: string;
  orderCount: number;
  avgPrice: number;
  x: number;
  y: number;
};

export type Platform = 'uber' | 'lyft';

export const WEATHER_BUCKETS = [
  { id: 'clear', label: '晴 / Clear', shortLabel: '晴' },
  { id: 'partly_cloudy', label: '多云 / Partly Cloudy', shortLabel: '多云' },
  { id: 'cloudy', label: '阴 / Cloudy', shortLabel: '阴' },
  { id: 'light_rain', label: '小雨 / Drizzle', shortLabel: '小雨' },
  { id: 'rain', label: '大雨 / Rain', shortLabel: '大雨' },
  { id: 'snow', label: '雪 / Snow', shortLabel: '雪' },
  { id: 'fog', label: '雾 / Low Visibility', shortLabel: '雾' },
  { id: 'other', label: '其他 / Other', shortLabel: '其他' },
] as const;

export type WeatherBucketId = typeof WEATHER_BUCKETS[number]['id'];

const BUCKET_BY_ID = new Map(WEATHER_BUCKETS.map((b) => [b.id, b]));
const LEGACY_BUCKET_IDS: Record<string, WeatherBucketId> = {
  '晴': 'clear', '多云': 'partly_cloudy', '阴': 'cloudy',
  '小雨': 'light_rain', '大雨': 'rain', '雪': 'snow', '雾': 'fog', '其他': 'other',
};

export function getWeatherBucket(bucketId: string) {
  return BUCKET_BY_ID.get(bucketId as WeatherBucketId) ?? BUCKET_BY_ID.get('other')!;
}

export function normalizeWeatherBucketId(value: string): WeatherBucketId {
  if (!value) return 'other';
  if (value in LEGACY_BUCKET_IDS) return LEGACY_BUCKET_IDS[value];
  return BUCKET_BY_ID.has(value as WeatherBucketId) ? (value as WeatherBucketId) : 'other';
}

function toNumber(value: unknown, fallback: number | null = null): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function classifyWeatherBucket(record: Record<string, unknown> = {}): WeatherBucketId {
  const summary = String(record.shortSummary ?? record.short_summary ?? record.weather ?? '').toLowerCase();
  const visibility = toNumber(record.visibility);
  const precipIntensity = toNumber(record.precipIntensity ?? record.precip_intensity, 0) ?? 0;

  // English keywords
  if (summary.includes('snow') || summary.includes('flurr') || summary.includes('雪')) return 'snow';
  if (summary.includes('heavy rain') || summary.includes('暴雨') || precipIntensity >= 0.1) return 'rain';
  if (summary.includes('rain') || summary.includes('drizzle') || summary.includes('雨') || summary.includes('阵雨')) return 'light_rain';
  if (summary.includes('fog') || summary.includes('雾') || (visibility !== null && visibility < 5)) return 'fog';
  if (summary.includes('partly cloudy') || summary.includes('多云')) return 'partly_cloudy';
  if (summary.includes('overcast') || summary.includes('cloudy') || summary.includes('阴')) return 'cloudy';
  if (summary.includes('clear') || summary.includes('晴')) return 'clear';
  return 'other';
}

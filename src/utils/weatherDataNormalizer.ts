import type { HourlyPlatformRecord, HourlyRecord } from '../types';

const PLATFORMS = ['uber', 'lyft'] as const;

function firstDefined<T>(...values: (T | undefined | null | '')[]): T | undefined {
  return values.find((v) => v !== undefined && v !== null && v !== '') as T | undefined;
}

function toNumber(value: unknown, fallback: number | null = null): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readWeather(record: Record<string, unknown> = {}) {
  return (record.weather as Record<string, unknown>) ?? record;
}

export function normalizeWeatherPlatformRecord(
  record: Record<string, unknown> = {},
  fallback: Record<string, unknown> = {}
): HourlyPlatformRecord {
  const weather = readWeather(record);
  const datetime = String(firstDefined(record.datetime, record.time, record.timestamp, fallback.datetime) ?? '');
  const platform = String(firstDefined(record.platform, record.cabType, record.cab_type, fallback.platform, '')).toLowerCase();

  return {
    datetime,
    platform,
    avgSurge: toNumber(firstDefined(record.avgSurge, record.avg_surge, record.surge_multiplier, record.surgeMultiplier), 1) ?? 1,
    orderCount: toNumber(firstDefined(record.orderCount, record.order_count, record.count), 0) ?? 0,
    temperature: toNumber(firstDefined(weather.temperature, record.temperature)),
    precipIntensity: toNumber(firstDefined(weather.precipIntensity, weather.precip_intensity, record.precipIntensity, record.precip_intensity), 0) ?? 0,
    visibility: toNumber(firstDefined(weather.visibility, record.visibility)),
    humidity: toNumber(firstDefined(weather.humidity, record.humidity)),
    shortSummary: String(firstDefined(
      weather.shortSummary, weather.short_summary, record.shortSummary, record.short_summary,
      typeof record.weather === 'string' ? record.weather : null
    ) ?? 'unknown'),
  };
}

function flattenHour(datetime: string, record: Record<string, unknown> = {}): HourlyPlatformRecord[] {
  const weather = readWeather(record);
  const nestedRecords = PLATFORMS.flatMap((platform) => {
    const pr = record[platform] as Record<string, unknown> | undefined;
    if (!pr) return [];
    return [normalizeWeatherPlatformRecord({ ...weather, ...pr }, { datetime, platform })];
  });
  if (nestedRecords.length > 0) return nestedRecords;

  const normalized = normalizeWeatherPlatformRecord(record, { datetime });
  return normalized.platform ? [normalized] : [];
}

export function normalizeHourlyPlatformRecords(hourlySeries: HourlyRecord[] | Record<string, unknown>): HourlyPlatformRecord[] {
  const entries = Array.isArray(hourlySeries)
    ? hourlySeries.map((r) => [firstDefined(r.datetime, (r as Record<string, unknown>).time, (r as Record<string, unknown>).timestamp), r] as [string, unknown])
    : Object.entries(hourlySeries);

  return entries
    .flatMap(([datetime, record]) => flattenHour(String(datetime), record as Record<string, unknown>))
    .filter((r) => r.datetime && PLATFORMS.includes(r.platform as typeof PLATFORMS[number]))
    .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
}

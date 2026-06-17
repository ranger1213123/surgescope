import type { HourlyRecord, HourlySeriesData, WeatherEventWindow, EventCurvePoint, PlatformData } from '../types';

const PRECIP_CHANGE_THRESHOLD = 0.05;
const VISIBILITY_LOW_THRESHOLD = 5;
const VISIBILITY_DROP_THRESHOLD = 3;
const VISIBILITY_DROP_TARGET = 6;
const TEMPERATURE_CHANGE_THRESHOLD = 5;
const DEFAULT_WINDOW_HOURS = 3;
const PLATFORMS = ['uber', 'lyft'] as const;

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseDatetime(value: string): Date {
  return new Date(value.replace(' ', 'T'));
}

function formatHourlyKey(date: Date): string {
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:00`;
}

function getWeather(record: Record<string, unknown> = {}) {
  return (record.weather as Record<string, unknown>) ?? record;
}

function containsAny(summary: string, keywords: string[]): boolean {
  const n = summary.toLowerCase();
  return keywords.some((k) => n.includes(k));
}

export function normalizeHourlySeries(hourlySeries: HourlySeriesData | HourlyRecord[]): HourlyRecord[] {
  const entries = Array.isArray(hourlySeries)
    ? hourlySeries.map((item) => [item.datetime, item] as [string, unknown])
    : Object.entries(hourlySeries);

  return entries
    .map(([datetime, record]) => {
      const r = record as Record<string, unknown>;
      const weather = getWeather(r);
      return {
        datetime,
        date: parseDatetime(datetime),
        precipIntensity: toNumber(weather.precipIntensity),
        temperature: toNumber(weather.temperature),
        visibility: toNumber(weather.visibility),
        humidity: toNumber(weather.humidity),
        precipProbability: toNumber(weather.precipProbability),
        cloudCover: toNumber(weather.cloudCover),
        windSpeed: toNumber(weather.windSpeed),
        shortSummary: String(weather.short_summary ?? weather.shortSummary ?? 'Unknown'),
        uber: (r.uber as PlatformData) ?? null,
        lyft: (r.lyft as PlatformData) ?? null,
      };
    })
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

type CandidateEvent = {
  eventType: string;
  eventTime: string;
  reasons: string[];
  precipChange: number | null;
  temperatureChange: number | null;
  visibilityChange: number | null;
};

function addEvent(
  candidateEvents: Map<string, CandidateEvent>,
  eventTime: string, eventType: string, reason: string,
  previous: HourlyRecord | null, current: HourlyRecord
) {
  const key = `${eventTime}|${eventType}`;
  if (!candidateEvents.has(key)) {
    candidateEvents.set(key, {
      eventType, eventTime, reasons: [],
      precipChange: previous ? Math.abs(current.precipIntensity - previous.precipIntensity) : null,
      temperatureChange: previous ? current.temperature - previous.temperature : null,
      visibilityChange: previous ? current.visibility - previous.visibility : null,
    });
  }
  const event = candidateEvents.get(key)!;
  if (!event.reasons.includes(reason)) event.reasons.push(reason);
}

function detectWeatherEventCandidates(points: HourlyRecord[]): CandidateEvent[] {
  const candidates = new Map<string, CandidateEvent>();

  points.forEach((current, index) => {
    const previous = index > 0 ? points[index - 1] : null;
    const prevSummary = previous?.shortSummary ?? '';

    if (previous) {
      const precipChange = Math.abs(current.precipIntensity - previous.precipIntensity);
      if (precipChange > PRECIP_CHANGE_THRESHOLD) {
        addEvent(candidates, current.datetime, 'rain', 'precip_intensity_change', previous, current);
      }
      const tempChange = Math.abs(current.temperature - previous.temperature);
      if (tempChange > TEMPERATURE_CHANGE_THRESHOLD) {
        addEvent(candidates, current.datetime, 'temperature_shift', 'temperature_change', previous, current);
      }
      const visDrop = previous.visibility - current.visibility;
      if (
        (current.visibility < VISIBILITY_LOW_THRESHOLD && previous.visibility >= VISIBILITY_LOW_THRESHOLD) ||
        (visDrop >= VISIBILITY_DROP_THRESHOLD && current.visibility < VISIBILITY_DROP_TARGET)
      ) {
        addEvent(candidates, current.datetime, 'low_visibility', 'visibility_drop', previous, current);
      }
    }
    if (containsAny(current.shortSummary, ['rain', 'drizzle']) && (!previous || !containsAny(prevSummary, ['rain', 'drizzle']))) {
      addEvent(candidates, current.datetime, 'rain', 'rain_or_drizzle_onset', previous, current);
    }
    if (containsAny(current.shortSummary, ['snow', 'flurr']) && (!previous || !containsAny(prevSummary, ['snow', 'flurr']))) {
      addEvent(candidates, current.datetime, 'snow', 'snow_onset', previous, current);
    }
    if (current.shortSummary.toLowerCase().includes('fog') && (!previous || !prevSummary.toLowerCase().includes('fog'))) {
      addEvent(candidates, current.datetime, 'low_visibility', 'fog_onset', previous, current);
    }
    if (!previous && current.visibility < VISIBILITY_LOW_THRESHOLD) {
      addEvent(candidates, current.datetime, 'low_visibility', 'starts_below_visibility_threshold', null, current);
    }
  });

  return [...candidates.values()].sort((a, b) => a.eventTime.localeCompare(b.eventTime) || a.eventType.localeCompare(b.eventType));
}

function createWindowRow(
  event: CandidateEvent & { eventId: string },
  point: HourlyRecord, platform: string, relativeHour: number
): WeatherEventWindow | null {
  const cab = point[platform as keyof Pick<HourlyRecord, 'uber' | 'lyft'>];
  if (!cab) return null;

  return {
    eventId: event.eventId,
    eventType: event.eventType,
    eventTime: event.eventTime,
    eventReason: event.reasons.join(','),
    precipChange: event.precipChange,
    temperatureChange: event.temperatureChange,
    visibilityChange: event.visibilityChange,
    relativeHour,
    datetime: point.datetime,
    cabType: platform,
    avgSurge: toNumber(cab.avg_surge, 1),
    avgPrice: toNumber(cab.avg_price),
    orderCount: toNumber(cab.order_count),
    precipIntensity: point.precipIntensity,
    temperature: point.temperature,
    visibility: point.visibility,
    shortSummary: point.shortSummary,
  };
}

export function detectWeatherEvents(
  hourlySeries: HourlySeriesData,
  { windowHours = DEFAULT_WINDOW_HOURS } = {}
): WeatherEventWindow[] {
  const points = normalizeHourlySeries(hourlySeries);
  const pointByTime = new Map(points.map((p) => [p.datetime, p]));
  const events = detectWeatherEventCandidates(points).map((e, i) => ({ ...e, eventId: `weather-event-${i + 1}` }));
  const windows: WeatherEventWindow[] = [];

  for (const event of events) {
    const current = pointByTime.get(event.eventTime);
    if (!current) continue;
    for (let rh = -windowHours; rh <= windowHours; rh += 1) {
      const date = new Date(current.date);
      date.setHours(date.getHours() + rh);
      const datetime = formatHourlyKey(date);
      const point = pointByTime.get(datetime);
      if (!point) continue;
      for (const platform of PLATFORMS) {
        const row = createWindowRow(event, point, platform, rh);
        if (row) windows.push(row);
      }
    }
  }
  return windows;
}

export function normalizeEventWindows(eventWindows: Record<string, unknown>[]): WeatherEventWindow[] {
  return eventWindows
    .filter((row) => row && (row.relativeHour !== undefined || row.relative_hour !== undefined) && (row.cabType || row.cab_type))
    .map((row) => ({
      ...row as unknown as WeatherEventWindow,
      cabType: String(row.cabType ?? row.cab_type),
      eventReason: String(row.eventReason ?? row.event_reason ?? ''),
      relativeHour: toNumber(row.relativeHour ?? row.relative_hour),
      avgSurge: toNumber(row.avgSurge ?? row.avg_surge, 1),
      avgPrice: toNumber(row.avgPrice ?? row.avg_price),
      orderCount: toNumber(row.orderCount ?? row.order_count),
      precipIntensity: toNumber(row.precipIntensity),
      temperature: toNumber(row.temperature),
      visibility: toNumber(row.visibility),
    }));
}

function summarize(values: number[]): { mean: number; lower: number | null; upper: number | null } {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length < 2) return { mean, lower: null, upper: null };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return { mean, lower: mean - margin, upper: mean + margin };
}

export function aggregateEventResponses(eventWindows: WeatherEventWindow[]): EventCurvePoint[] {
  const groups = new Map<string, number[]>();

  for (const row of normalizeEventWindows(eventWindows as unknown as Record<string, unknown>[])) {
    const key = `${row.eventType}|${row.cabType}|${row.relativeHour}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row.avgSurge);
  }

  return Array.from(groups, ([key, values]) => {
    const [eventType, cabType, relativeHour] = key.split('|');
    return { eventType, cabType, relativeHour: Number(relativeHour), sampleSize: values.length, ...summarize(values) };
  }).sort((a, b) => a.eventType.localeCompare(b.eventType) || a.relativeHour - b.relativeHour);
}

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import type { HourlySeriesData, WeatherEventWindow, WeatherBucketStats, HourlyRecord, HourlyPlatformRecord, EventCurvePoint } from '../../types';
import { loadAllWeatherData } from '../../utils/dataLoader';
import { detectWeatherEvents, normalizeEventWindows, normalizeHourlySeries, aggregateEventResponses } from '../../utils/weatherEventDetector';
import { normalizeHourlyPlatformRecords } from '../../utils/weatherDataNormalizer';
import { useTimeRange } from '../../context/TimeRangeContext';

type WeatherSurgeState = {
  hourlyData: HourlySeriesData | null;
  weatherData: WeatherBucketStats | null;
  eventData: WeatherEventWindow[] | null;
  isLoading: boolean;
  error: string | null;
  // Derived
  hourlySeries: HourlyRecord[];
  eventWindows: WeatherEventWindow[];
  // Selection
  selectedRange: [Date, Date] | [];
};

type WeatherSurgeContextValue = WeatherSurgeState & {
  setSelectedRange: (range: [Date, Date] | []) => void;
  getVisibleSeries: () => HourlyRecord[];
  getVisibleEventWindows: () => WeatherEventWindow[];
  getVisiblePlatformSeries: () => HourlyPlatformRecord[];
  getVisibleEventCurves: () => EventCurvePoint[];
};

const WeatherSurgeContext = createContext<WeatherSurgeContextValue | null>(null);

export function WeatherSurgeProvider({ children }: { children: ReactNode }) {
  const { timeRange, setTimeRange } = useTimeRange();
  const [hourlyData, setHourlyData] = useState<HourlySeriesData | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherBucketStats | null>(null);
  const [eventData, setEventData] = useState<WeatherEventWindow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<[Date, Date] | []>(timeRange ?? []);

  // Sync global → local
  useEffect(() => {
    if (timeRange) setSelectedRange(timeRange);
  }, [timeRange]);

  // Wrapper to sync local → global
  const handleSetSelectedRange = (range: [Date, Date] | []) => {
    setSelectedRange(range);
    setTimeRange(range.length === 2 ? range : null);
  };

  useEffect(() => {
    loadAllWeatherData()
      .then(({ hourly, weather, events }) => {
        setHourlyData(hourly);
        setWeatherData(weather);
        setEventData(events);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '数据加载失败'))
      .finally(() => setIsLoading(false));
  }, []);

  const hourlySeries = useMemo(() => {
    if (!hourlyData) return [];
    return normalizeHourlySeries(hourlyData);
  }, [hourlyData]);

  const eventWindows = useMemo(() => {
    if (!hourlyData) return [];
    const prepared = eventData ? normalizeEventWindows(eventData as unknown as Record<string, unknown>[]) : [];
    return prepared.length > 0 ? prepared : detectWeatherEvents(hourlyData);
  }, [hourlyData, eventData]);

  const value = useMemo<WeatherSurgeContextValue>(() => ({
    hourlyData, weatherData, eventData, isLoading, error,
    hourlySeries, eventWindows, selectedRange, setSelectedRange: handleSetSelectedRange,
    getVisibleSeries() {
      if (selectedRange.length !== 2) return hourlySeries;
      const [start, end] = selectedRange;
      return hourlySeries.filter((d) => d.date >= start && d.date <= end);
    },
    getVisibleEventWindows() {
      if (selectedRange.length !== 2) return eventWindows;
      const [start, end] = selectedRange;
      return eventWindows.filter((w) => {
        const d = new Date(w.eventTime.replace(' ', 'T'));
        return d >= start && d <= end;
      });
    },
    getVisiblePlatformSeries() {
      const visible = selectedRange.length === 2
        ? hourlySeries.filter((d) => d.date >= selectedRange[0] && d.date <= selectedRange[1])
        : hourlySeries;
      return normalizeHourlyPlatformRecords(visible);
    },
    getVisibleEventCurves() {
      const visible = selectedRange.length === 2
        ? eventWindows.filter((w) => {
            const d = new Date(w.eventTime.replace(' ', 'T'));
            return d >= selectedRange[0] && d <= selectedRange[1];
          })
        : eventWindows;
      return aggregateEventResponses(visible);
    },
  }), [hourlyData, weatherData, eventData, isLoading, error, hourlySeries, eventWindows, selectedRange, setTimeRange]);

  return <WeatherSurgeContext.Provider value={value}>{children}</WeatherSurgeContext.Provider>;
}

export function useWeatherSurge() {
  const ctx = useContext(WeatherSurgeContext);
  if (!ctx) throw new Error('useWeatherSurge must be inside WeatherSurgeProvider');
  return ctx;
}

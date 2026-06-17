import type { HourlySeriesData, WeatherEventWindow, WeatherBucketStats } from '../types';

export async function loadHourlySeries(): Promise<HourlySeriesData> {
  const res = await fetch('/data/hourly_series.json');
  if (!res.ok) throw new Error('加载小时数据失败');
  return res.json();
}

export async function loadWeatherStats(): Promise<WeatherBucketStats> {
  const res = await fetch('/data/weather_bucket_stats.json');
  if (!res.ok) throw new Error('加载天气统计失败');
  return res.json();
}

export async function loadEventWindows(): Promise<WeatherEventWindow[]> {
  const res = await fetch('/data/event_windows.json');
  if (!res.ok) throw new Error('加载事件数据失败');
  return res.json();
}

export async function loadAllWeatherData() {
  const [hourly, weather, events] = await Promise.all([
    loadHourlySeries(),
    loadWeatherStats(),
    loadEventWindows(),
  ]);
  return { hourly, weather, events };
}

export async function loadDemandBlocks() {
  const res = await fetch('/data/demand_blocks.json');
  if (!res.ok) throw new Error('加载时空需求数据失败');
  return res.json();
}

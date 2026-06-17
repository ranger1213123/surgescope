export const WEATHER_LABELS: Record<string, string> = {
  clear: '晴',
  partly_cloudy: '多云',
  'partly cloudy': '多云',
  mostly_cloudy: '多云',
  'mostly cloudy': '多云',
  overcast: '阴',
  cloudy: '阴',
  drizzle: '毛毛雨',
  light_rain: '小雨',
  'light rain': '小雨',
  rain: '雨',
  heavy_rain: '大雨',
  'heavy rain': '大雨',
  snow: '雪',
  fog: '雾',
  foggy: '雾',
  sleet: '雨夹雪',
  unknown: '未知',
};

export function getWeatherLabel(key: string): string {
  return WEATHER_LABELS[key] ?? key;
}

"""
Generate enhanced synthetic data for SurgeScope research.
The original rideshare_kaggle dataset (693K records, Nov-Dec 2018, Boston)
has mild surge values (max ~1.06x) and limited extreme weather events.

This script generates enhanced hourly data with:
  1. Dramatic snowstorm surge peaks (2.8-3.5x)
  2. Clear weather→surge gradient: clear 1.0x → overcast 1.05x → rain 1.4x → snow 2.5x+
  3. Platform-specific pricing (Lyft more aggressive in snow, Uber in rush hour)
  4. Delayed surge response (surge ramps 1-2h after snow onset)
  5. Full Nov-Dec 2018 coverage with 6 snowstorm events
"""

import json
import math
import random
from collections import defaultdict
from datetime import datetime, timedelta

random.seed(42)

# ---- Configuration ----
START_DATE = datetime(2018, 11, 1)
END_DATE = datetime(2018, 12, 31, 23, 0)

WEATHER_TYPES = [
    ('clear', 0.20), ('partly cloudy', 0.22), ('mostly cloudy', 0.18),
    ('overcast', 0.16), ('light rain', 0.08), ('rain', 0.06),
    ('heavy rain', 0.03), ('drizzle', 0.03), ('foggy', 0.03), ('snow', 0.01),
]

# 6 snowstorm events — more data for event-aligned analysis
SNOW_STORM_DAYS = {
    'snowstorm_1': [(12, 5), (12, 6), (12, 7)],    # Major Dec blizzard (3 days)
    'snowstorm_2': [(12, 15), (12, 16)],             # Dec mid-month storm
    'snowstorm_3': [(11, 15), (11, 16)],             # Nov storm
    'snowstorm_4': [(11, 28), (11, 29)],             # Thanksgiving weekend storm
    'snowstorm_5': [(12, 21), (12, 22)],             # Pre-Christmas storm
    'snowstorm_6': [(12, 28)],                        # End-of-year snow
}

# ---- Helpers ----
def pick_weather(temp_range):
    low, high = temp_range
    weights = {}
    for w, base_w in WEATHER_TYPES:
        if w == 'snow' and low < 32:
            weights[w] = base_w * 8.0
        elif w == 'snow' and low < 40:
            weights[w] = base_w * 2.0
        elif w == 'snow':
            weights[w] = 0.0
        elif w == 'heavy rain' and high > 45:
            weights[w] = base_w * 1.5
        elif w in ('foggy', 'drizzle') and (high - low) < 8:
            weights[w] = base_w * 2.0
        else:
            weights[w] = base_w

    total = sum(weights.values())
    r = random.random() * total
    cumulative = 0
    for w, weight in weights.items():
        cumulative += weight
        if r <= cumulative:
            return w
    return 'partly cloudy'


def weather_to_features(summary, temperature):
    base = dict(
        precipIntensity=0, visibility=10, humidity=0.55 + random.uniform(-0.1, 0.1),
        precipProbability=0, cloudCover=0.3, windSpeed=5 + random.uniform(-3, 5),
    )

    if summary == 'clear':
        base['cloudCover'] = random.uniform(0, 0.15)
        base['visibility'] = 10.0
    elif summary == 'partly cloudy':
        base['cloudCover'] = random.uniform(0.2, 0.45)
        base['visibility'] = random.uniform(8, 10)
    elif summary == 'mostly cloudy':
        base['cloudCover'] = random.uniform(0.5, 0.75)
        base['visibility'] = random.uniform(7, 10)
    elif summary == 'overcast':
        base['cloudCover'] = random.uniform(0.8, 1.0)
        base['visibility'] = random.uniform(5, 9)
    elif summary in ('drizzle', 'light rain'):
        base['precipIntensity'] = random.uniform(0.005, 0.04)
        base['precipProbability'] = random.uniform(0.5, 0.9)
        base['cloudCover'] = random.uniform(0.7, 1.0)
        base['visibility'] = random.uniform(4, 8)
        base['humidity'] = random.uniform(0.7, 0.95)
        base['windSpeed'] = random.uniform(6, 15)
    elif summary == 'rain':
        base['precipIntensity'] = random.uniform(0.04, 0.12)
        base['precipProbability'] = random.uniform(0.8, 1.0)
        base['cloudCover'] = 1.0
        base['visibility'] = random.uniform(2, 6)
        base['humidity'] = random.uniform(0.8, 1.0)
        base['windSpeed'] = random.uniform(8, 20)
    elif summary == 'heavy rain':
        base['precipIntensity'] = random.uniform(0.12, 0.35)
        base['precipProbability'] = 1.0
        base['cloudCover'] = 1.0
        base['visibility'] = random.uniform(0.5, 3)
        base['humidity'] = random.uniform(0.9, 1.0)
        base['windSpeed'] = random.uniform(12, 28)
    elif summary == 'foggy':
        base['precipIntensity'] = random.uniform(0, 0.01)
        base['visibility'] = random.uniform(0.2, 3)
        base['humidity'] = random.uniform(0.85, 1.0)
        base['cloudCover'] = random.uniform(0.6, 1.0)
        base['windSpeed'] = random.uniform(2, 8)
    elif summary == 'snow':
        base['precipIntensity'] = random.uniform(0.03, 0.18)
        base['precipProbability'] = random.uniform(0.8, 1.0)
        base['cloudCover'] = 1.0
        base['visibility'] = random.uniform(0.1, 2.0)
        base['humidity'] = random.uniform(0.75, 0.95)
        base['windSpeed'] = random.uniform(10, 28)

    return base


def compute_surge(weather_summary, hour, platform, temp, precip, visibility, hours_into_storm):
    """
    Model surge multiplier with dramatic weather responses.
    - Clear gradient: clear 1.0x → cloudy 1.03x → light rain 1.1x → rain 1.4x → snow 2.5x+
    - Delayed snow response: surge ramps up over first 3 hours of snow
    - Platform differences: Lyft more aggressive in snow, Uber in rush hour
    """
    base_surge = 1.0

    # ---- Weather factor (clear gradient) ----
    weather_factor = 0
    if weather_summary == 'snow':
        # Snow: 1.5-2.5x additive = 2.5-3.5x total
        weather_factor = random.uniform(1.2, 2.4)
        # Delayed response: ramp up over first 3 hours
        if hours_into_storm is not None and hours_into_storm < 3:
            ramp = hours_into_storm / 3.0  # 0→1 over 3 hours
            weather_factor *= 0.3 + 0.7 * ramp
    elif weather_summary == 'heavy rain':
        weather_factor = random.uniform(0.35, 0.65)  # ≈1.35-1.65x
    elif weather_summary == 'rain':
        weather_factor = random.uniform(0.15, 0.40)  # ≈1.15-1.40x
    elif weather_summary in ('drizzle', 'light rain'):
        weather_factor = random.uniform(0.05, 0.18)  # ≈1.05-1.18x
    elif weather_summary == 'foggy':
        weather_factor = random.uniform(0.10, 0.30)  # ≈1.10-1.30x
    elif weather_summary == 'overcast':
        weather_factor = random.uniform(0.01, 0.06)  # ≈1.01-1.06x
    elif weather_summary == 'mostly cloudy':
        weather_factor = random.uniform(0, 0.03)     # ≈1.00-1.03x

    # Temperature extreme
    temp_factor = 0
    if temp < 20:
        temp_factor = random.uniform(0.08, 0.20)
    elif temp < 28:
        temp_factor = random.uniform(0.04, 0.12)
    elif temp < 32:
        temp_factor = random.uniform(0.01, 0.06)

    # Visibility impact
    vis_factor = 0
    if visibility < 2:
        vis_factor = random.uniform(0.08, 0.20)
    elif visibility < 4:
        vis_factor = random.uniform(0.03, 0.10)

    # Rush hour
    rush_factor = 0
    if hour in (7, 8, 9, 17, 18, 19):
        rush_factor = random.uniform(0.06, 0.22)
    elif hour in (10, 16, 20, 21):
        rush_factor = random.uniform(0.02, 0.10)

    # Weekend late-night
    weekend_factor = 0
    if hour >= 22 or hour <= 3:
        weekend_factor = random.uniform(0.04, 0.12)

    # Platform-specific bias
    platform_bias = 0
    if platform == 'lyft':
        # Lyft surges more aggressively in bad weather
        platform_bias += weather_factor * random.uniform(0.08, 0.18)
        # Lyft less aggressive in rush hour
        platform_bias -= rush_factor * random.uniform(0.03, 0.08)
    else:  # uber
        # Uber surges more in rush hour
        platform_bias += rush_factor * random.uniform(0.08, 0.15)
        # Uber slightly more conservative in snow
        platform_bias -= weather_factor * random.uniform(0.02, 0.06)

    surge = base_surge + weather_factor + temp_factor + vis_factor + rush_factor + weekend_factor + platform_bias
    surge += random.uniform(-0.04, 0.04)
    surge = round(max(1.0, min(3.8, surge)), 4)

    # Price
    base_price = random.uniform(8, 22)
    price = round(base_price * surge + random.uniform(-1.5, 1.5), 2)
    price = max(5, price)

    # Order count
    if weather_summary == 'snow':
        base_orders = random.randint(3, 25)
    elif weather_summary == 'heavy rain':
        base_orders = random.randint(8, 35)
    elif hour in (7, 8, 9, 17, 18, 19):
        base_orders = random.randint(45, 130)
    else:
        base_orders = random.randint(15, 80)

    distance = round(random.uniform(0.8, 5.5), 2)

    return surge, price, base_orders, distance


# ---- Main Generation ----
def generate_all():
    print("Generating enhanced SurgeScope data...")

    hourly_series = {}
    current = START_DATE

    snowstorm_dates = set()
    storm_day_map = {}
    for name, days in SNOW_STORM_DAYS.items():
        for m, d in days:
            snowstorm_dates.add((m, d))
            if (m, d) not in storm_day_map:
                storm_day_map[(m, d)] = []

    # Pre-compute daily temperature ranges
    daily_temps = {}
    for m in range(11, 13):
        for d in range(1, 32):
            try:
                datetime(2018, m, d)
            except ValueError:
                continue
            day_of_winter = (m - 11) * 30 + d
            base_temp = 42 - day_of_winter * 0.3 + math.sin(day_of_winter / 5) * 5
            daily_temps[(m, d)] = (base_temp - 5, base_temp + 5)

    # Track storm start times for delayed response
    storm_start_times = {}
    for name, days in SNOW_STORM_DAYS.items():
        for m, d in days:
            storm_start_times[(m, d)] = datetime(2018, m, d, 6)  # storms start at 6am

    weather_event_tracker = defaultdict(list)

    while current <= END_DATE:
        dt_str = current.strftime('%Y-%m-%d %H:00')
        hour = current.hour
        md = (current.month, current.day)
        low, high = daily_temps[md]

        # Temperature varies by hour
        hour_phase = math.sin((hour - 4) * math.pi / 12)
        temperature = round((low + high) / 2 + hour_phase * (high - low) / 2 + random.uniform(-1.5, 1.5), 2)

        # Weather selection
        if md in snowstorm_dates:
            # Force snow/stormy weather on storm days
            r = random.random()
            if r < 0.65:
                weather_summary = 'snow'
            elif r < 0.85:
                weather_summary = 'heavy rain'
            else:
                weather_summary = 'overcast'
        else:
            weather_summary = pick_weather((low, high))

        # Compute hours_into_storm for delayed surge response
        hours_into_storm = None
        if md in storm_start_times:
            storm_start = storm_start_times[md]
            if current >= storm_start:
                hours_into_storm = (current - storm_start).total_seconds() / 3600

        # Weather features
        weather_features = weather_to_features(weather_summary, temperature)
        weather_features['temperature'] = temperature
        weather_features['short_summary'] = weather_summary

        for k in ('precipIntensity', 'visibility', 'humidity', 'precipProbability', 'cloudCover', 'windSpeed'):
            weather_features[k] = round(weather_features[k], 4)

        # Platform data
        uber_surge, uber_price, uber_orders, uber_dist = compute_surge(
            weather_summary, hour, 'uber', temperature,
            weather_features['precipIntensity'], weather_features['visibility'],
            hours_into_storm,
        )
        lyft_surge, lyft_price, lyft_orders, lyft_dist = compute_surge(
            weather_summary, hour, 'lyft', temperature,
            weather_features['precipIntensity'], weather_features['visibility'],
            hours_into_storm,
        )

        hourly_series[dt_str] = {
            'weather': weather_features,
            'uber': {
                'avg_surge': uber_surge,
                'avg_price': uber_price,
                'avg_distance': uber_dist,
                'order_count': uber_orders,
            },
            'lyft': {
                'avg_surge': lyft_surge,
                'avg_price': lyft_price,
                'avg_distance': lyft_dist,
                'order_count': lyft_orders,
            },
        }

        # Track weather change events
        if current > START_DATE:
            prev = current - timedelta(hours=1)
            prev_str = prev.strftime('%Y-%m-%d %H:00')
            if prev_str in hourly_series:
                prev_data = hourly_series[prev_str]
                prev_weather = prev_data['weather']['short_summary']
                prev_precip = prev_data['weather']['precipIntensity']
                curr_precip = weather_features['precipIntensity']
                prev_vis = prev_data['weather']['visibility']
                prev_temp = prev_data['weather']['temperature']

                if weather_summary == 'snow' and prev_weather != 'snow':
                    weather_event_tracker['snow'].append(dt_str)
                elif weather_summary in ('heavy rain', 'rain') and prev_weather not in ('heavy rain', 'rain'):
                    weather_event_tracker['rain'].append(dt_str)
                elif curr_precip - prev_precip > 0.05:
                    weather_event_tracker['rain'].append(dt_str)
                elif weather_summary == 'foggy' and prev_weather != 'foggy':
                    weather_event_tracker['low_visibility'].append(dt_str)
                elif prev_vis - weather_features['visibility'] >= 3 and weather_features['visibility'] < 6:
                    weather_event_tracker['low_visibility'].append(dt_str)
                elif abs(temperature - prev_temp) > 5:
                    weather_event_tracker['temperature_shift'].append(dt_str)

        current += timedelta(hours=1)

    print(f"  Generated {len(hourly_series)} hourly records")

    # Event windows
    event_windows = []
    event_id = 0
    for event_type, event_times in weather_event_tracker.items():
        for et in event_times:
            event_id += 1
            event_dt = datetime.strptime(et, '%Y-%m-%d %H:00')
            precip_change = None
            temp_change = None
            vis_change = None

            prev_dt = event_dt - timedelta(hours=1)
            prev_str = prev_dt.strftime('%Y-%m-%d %H:00')
            if prev_str in hourly_series:
                prev = hourly_series[prev_str]
                curr = hourly_series[et]
                precip_change = round(abs(curr['weather']['precipIntensity'] - prev['weather']['precipIntensity']), 4)
                temp_change = round(curr['weather']['temperature'] - prev['weather']['temperature'], 2)
                vis_change = round(curr['weather']['visibility'] - prev['weather']['visibility'], 2)

            for rh in range(-3, 4):
                target_dt = event_dt + timedelta(hours=rh)
                target_str = target_dt.strftime('%Y-%m-%d %H:00')
                if target_str not in hourly_series:
                    continue
                record = hourly_series[target_str]
                for platform in ('uber', 'lyft'):
                    cab = record[platform]
                    event_windows.append({
                        'eventId': f'weather-event-{event_id}',
                        'eventType': event_type,
                        'eventTime': et,
                        'eventReason': f'{event_type}_onset',
                        'precipChange': precip_change,
                        'temperatureChange': temp_change,
                        'visibilityChange': vis_change,
                        'relativeHour': rh,
                        'datetime': target_str,
                        'cabType': platform,
                        'avgSurge': cab['avg_surge'],
                        'avgPrice': cab['avg_price'],
                        'orderCount': cab['order_count'],
                        'precipIntensity': record['weather']['precipIntensity'],
                        'temperature': record['weather']['temperature'],
                        'visibility': record['weather']['visibility'],
                        'shortSummary': record['weather']['short_summary'],
                    })

    print(f"  Generated {len(event_windows)} event window records ({event_id} events)")

    # Weather bucket stats
    bucket_categories = {
        'clear': ('clear',),
        'partly_cloudy': ('partly cloudy',),
        'cloudy': ('mostly cloudy', 'overcast'),
        'light_rain': ('drizzle', 'light rain'),
        'rain': ('rain', 'heavy rain'),
        'snow': ('snow',),
        'fog': ('foggy',),
    }

    weather_bucket_stats = {}
    for bucket_id, summaries in bucket_categories.items():
        weather_bucket_stats[bucket_id] = {}
        for platform in ('uber', 'lyft'):
            surge_vals = []
            price_vals = []
            order_counts = []
            for dt_str, record in hourly_series.items():
                if record['weather']['short_summary'] in summaries:
                    cab = record[platform]
                    surge_vals.append(cab['avg_surge'])
                    price_vals.append(cab['avg_price'])
                    order_counts.append(cab['order_count'])

            if not surge_vals:
                continue

            surge_vals.sort()
            price_vals.sort()

            def q(arr, p):
                idx = int((len(arr) - 1) * p)
                return round(arr[idx], 4)

            def outlier_bounds(arr):
                q1_val = q(arr, 0.25)
                q3_val = q(arr, 0.75)
                iqr = q3_val - q1_val
                lo = q1_val - 1.5 * iqr
                hi = q3_val + 1.5 * iqr
                return lo, hi

            lo, hi = outlier_bounds(surge_vals)
            outliers = [round(v, 4) for v in surge_vals if v < lo or v > hi]

            weather_bucket_stats[bucket_id][platform] = {
                'surge_min': round(min(surge_vals), 4),
                'surge_q1': q(surge_vals, 0.25),
                'surge_median': q(surge_vals, 0.5),
                'surge_q3': q(surge_vals, 0.75),
                'surge_max': round(max(surge_vals), 4),
                'price_min': round(min(price_vals), 2),
                'price_median': q(price_vals, 0.5),
                'price_max': round(max(price_vals), 2),
                'order_count': sum(order_counts),
                'sample_size': len(surge_vals),
                'outliers': outliers,
            }

    print(f"  Generated {len(weather_bucket_stats)} weather buckets with stats")

    # Save
    output_dir = 'public/data'
    import os
    os.makedirs(output_dir, exist_ok=True)

    with open(f'{output_dir}/hourly_series.json', 'w') as f:
        json.dump(hourly_series, f, ensure_ascii=False)
    print(f"  Saved hourly_series.json")

    with open(f'{output_dir}/event_windows.json', 'w') as f:
        json.dump(event_windows, f, ensure_ascii=False)
    print(f"  Saved event_windows.json")

    with open(f'{output_dir}/weather_bucket_stats.json', 'w') as f:
        json.dump(weather_bucket_stats, f, ensure_ascii=False)
    print(f"  Saved weather_bucket_stats.json")

    # Summary
    print("\n=== Enhanced Data Summary ===")
    print(f"Period: {START_DATE.strftime('%Y-%m-%d')} to {END_DATE.strftime('%Y-%m-%d')}")
    print(f"Total hours: {len(hourly_series)}")
    print(f"Weather events: {event_id}")

    all_surges = []
    uber_surges = []
    lyft_surges = []
    for r in hourly_series.values():
        all_surges.append(r['uber']['avg_surge'])
        all_surges.append(r['lyft']['avg_surge'])
        uber_surges.append(r['uber']['avg_surge'])
        lyft_surges.append(r['lyft']['avg_surge'])
    all_surges.sort()
    uber_surges.sort()
    lyft_surges.sort()

    print(f"Overall surge range: {min(all_surges):.4f} - {max(all_surges):.4f}")
    print(f"Mean surge: {sum(all_surges)/len(all_surges):.4f}")
    print(f"Uber range: {min(uber_surges):.4f} - {max(uber_surges):.4f} (mean: {sum(uber_surges)/len(uber_surges):.4f})")
    print(f"Lyft range: {min(lyft_surges):.4f} - {max(lyft_surges):.4f} (mean: {sum(lyft_surges)/len(lyft_surges):.4f})")
    print(f"Surge > 1.5: {sum(1 for s in all_surges if s > 1.5)}")
    print(f"Surge > 2.0: {sum(1 for s in all_surges if s > 2.0)}")
    print(f"Surge > 2.5: {sum(1 for s in all_surges if s > 2.5)}")
    print(f"Surge > 3.0: {sum(1 for s in all_surges if s > 3.0)}")

    # Lyft vs Uber in snow
    snow_uber = [r['uber']['avg_surge'] for r in hourly_series.values() if r['weather']['short_summary'] == 'snow']
    snow_lyft = [r['lyft']['avg_surge'] for r in hourly_series.values() if r['weather']['short_summary'] == 'snow']
    if snow_uber:
        print(f"\nSnowstorm Uber avg surge: {sum(snow_uber)/len(snow_uber):.4f} (n={len(snow_uber)})")
        print(f"Snowstorm Lyft avg surge: {sum(snow_lyft)/len(snow_lyft):.4f} (n={len(snow_lyft)})")

    # Weather distribution
    wc = defaultdict(int)
    for r in hourly_series.values():
        wc[r['weather']['short_summary']] += 1
    print("\nWeather distribution:")
    for w, c in sorted(wc.items(), key=lambda x: -x[1]):
        print(f"  {w}: {c} ({c/len(hourly_series)*100:.1f}%)")

    # Weather→surge gradient summary
    print("\nWeather→Surge gradient:")
    for bucket_id, summaries in bucket_categories.items():
        vals = [r['uber']['avg_surge'] for r in hourly_series.values() if r['weather']['short_summary'] in summaries]
        vals += [r['lyft']['avg_surge'] for r in hourly_series.values() if r['weather']['short_summary'] in summaries]
        if vals:
            print(f"  {bucket_id:15s}: {min(vals):.3f}x - {max(vals):.3f}x (mean: {sum(vals)/len(vals):.3f}x, n={len(vals)})")


if __name__ == '__main__':
    generate_all()

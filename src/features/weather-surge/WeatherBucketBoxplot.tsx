import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import type { HourlyPlatformRecord, WeatherBucketStats } from '../../types';
import { WEATHER_BUCKETS, classifyWeatherBucket, getWeatherBucket, normalizeWeatherBucketId } from '../../utils/weatherBucket';

const PLATFORM_STYLE: Record<string, { label: string; color: string }> = {
  uber: { label: 'Uber', color: '#3B71F3' },
  lyft: { label: 'Lyft', color: '#E8613C' },
};

function toNumber(v: unknown, fallback: number | null = null): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function quantile(sorted: number[], q: number): number {
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const frac = idx - lo;
  return sorted[lo + 1] === undefined ? sorted[lo] : sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]);
}

type BoxSummary = {
  bucketId: string; platform: string; sampleSize: number;
  min: number; q1: number; median: number; q3: number; max: number;
  outliers: number[];
};

function summarizeValues(values: number[], bucketId: string, platform: string): BoxSummary | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const q1 = quantile(sorted, 0.25), med = quantile(sorted, 0.5), q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  return {
    bucketId, platform, sampleSize: sorted.length,
    min: sorted[0], q1, median: med, q3, max: sorted[sorted.length - 1],
    outliers: sorted.filter((v) => v < lo || v > hi),
  };
}

function summarizeHourly(data: HourlyPlatformRecord[]): BoxSummary[] {
  const groups = new Map<string, number[]>();
  for (const row of data) {
    if (!Number.isFinite(row.avgSurge) || !PLATFORM_STYLE[row.platform]) continue;
    const bid = classifyWeatherBucket(row as unknown as Record<string, unknown>);
    const key = `${bid}|${row.platform}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row.avgSurge);
  }
  return WEATHER_BUCKETS.flatMap((b) =>
    Object.keys(PLATFORM_STYLE).flatMap((p) => {
      const s = summarizeValues(groups.get(`${b.id}|${p}`) ?? [], b.id, p);
      return s ? [s] : [];
    })
  );
}

function summarizePrecomputed(stats: WeatherBucketStats): BoxSummary[] {
  return Object.entries(stats).flatMap(([rawBucket, platforms]) => {
    const bid = normalizeWeatherBucketId(rawBucket);
    return Object.entries(platforms ?? {}).flatMap(([platform, v]) => {
      if (!PLATFORM_STYLE[platform]) return [];
      const min = toNumber((v as Record<string, unknown>).surge_min ?? (v as Record<string, unknown>).min);
      const q1 = toNumber((v as Record<string, unknown>).surge_q1 ?? (v as Record<string, unknown>).q1);
      const median = toNumber((v as Record<string, unknown>).surge_median ?? (v as Record<string, unknown>).median);
      const q3 = toNumber((v as Record<string, unknown>).surge_q3 ?? (v as Record<string, unknown>).q3);
      const max = toNumber((v as Record<string, unknown>).surge_max ?? (v as Record<string, unknown>).max);
      if ([min, q1, median, q3, max].some((x) => x === null)) return [];
      return [{
        bucketId: bid, platform,
        sampleSize: (toNumber((v as Record<string, unknown>).order_count ?? (v as Record<string, unknown>).sample_size ?? (v as Record<string, unknown>).count, 0) ?? 0),
        min: min!, q1: q1!, median: median!, q3: q3!, max: max!,
        outliers: ((v as Record<string, unknown>).outliers as number[]) ?? [],
      }];
    });
  });
}

export function WeatherBucketBoxplot({ data, precomputedStats }: {
  data: HourlyPlatformRecord[];
  precomputedStats: WeatherBucketStats | Record<string, unknown>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const groups = useMemo(() => {
    const h = summarizeHourly(data);
    return h.length > 0 ? h : summarizePrecomputed(precomputedStats as WeatherBucketStats);
  }, [data, precomputedStats]);

  const render = useCallback(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl || groups.length === 0) return;

    const width = Math.max(container.clientWidth, 600);
    const margin = { top: 24, right: 20, bottom: 80, left: 52 };
    const innerW = width - margin.left - margin.right;
    const height = 420;
    const innerH = height - margin.top - margin.bottom;
    const catW = innerW / groups.length;

    const allVals = groups.flatMap((g) => [g.min, g.q1, g.median, g.q3, g.max, ...g.outliers]);
    const yMin = Math.min(0.98, d3.min(allVals) ?? 0.98);
    const yMax = Math.max(1.15, d3.max(allVals) ?? 1.15);
    const yScale = d3.scaleLinear().domain([yMin, yMax]).nice().range([margin.top + innerH, margin.top]);

    const svg = d3.select(svgEl)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', 'transparent');
    svg.selectAll('*').remove();

    const root = svg.append('g').attr('transform', `translate(${margin.left},0)`);

    // Grid lines
    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat((v) => `${(v as number).toFixed(2)}x`).tickSize(-innerW);
    const yAxisG = root.append('g').call(yAxis);
    yAxisG.selectAll('line').attr('stroke', 'rgba(0,0,0,0.06)');
    yAxisG.selectAll('.tick text').attr('fill', '#8E887E').attr('font-size', 10);

    // Boxplots
    groups.forEach((g, i) => {
      const cx = i * catW + catW / 2;
      const bw = Math.min(36, catW * 0.55);
      const color = PLATFORM_STYLE[g.platform]?.color ?? '#8E887E';
      const opacity = g.platform === 'uber' ? 0.82 : 0.7;

      // Whisker line
      root.append('line')
        .attr('x1', cx).attr('x2', cx)
        .attr('y1', yScale(g.min)).attr('y2', yScale(g.max))
        .attr('stroke', color).attr('stroke-width', 1.5).attr('opacity', opacity);

      // IQR box
      root.append('rect')
        .attr('x', cx - bw / 2).attr('width', bw)
        .attr('y', yScale(g.q3)).attr('height', Math.max(1, yScale(g.q1) - yScale(g.q3)))
        .attr('fill', color).attr('opacity', opacity).attr('rx', 3);

      // Median line
      root.append('line')
        .attr('x1', cx - bw / 2).attr('x2', cx + bw / 2)
        .attr('y1', yScale(g.median)).attr('y2', yScale(g.median))
        .attr('stroke', '#fff').attr('stroke-width', 2);

      // Outliers
      root.selectAll(`.outlier-${i}`).data(g.outliers).join('circle')
        .attr('cx', cx).attr('cy', (d) => yScale(d)).attr('r', 3.5)
        .attr('fill', '#F59E0B').attr('opacity', 0.7);

      // Category label
      const bucket = getWeatherBucket(g.bucketId);
      root.append('text')
        .attr('x', cx).attr('y', margin.top + innerH + 16)
        .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#8E887E')
        .text(bucket.shortLabel);

      root.append('text')
        .attr('x', cx).attr('y', margin.top + innerH + 30)
        .attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#5C564E')
        .text(PLATFORM_STYLE[g.platform]?.label ?? g.platform);
    });

    // Y axis label
    root.append('text').attr('transform', 'rotate(-90)').attr('x', -(margin.top + innerH / 2)).attr('y', -40)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5C564E').text('平均溢价倍数');
  }, [groups]);

  useEffect(() => {
    const obs = new ResizeObserver(() => requestAnimationFrame(render));
    if (containerRef.current) obs.observe(containerRef.current);
    requestAnimationFrame(render);
    return () => obs.disconnect();
  }, [render]);

  if (groups.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#8E887E' }}>当前时间范围内没有可用于天气分桶比较的数据。</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} role="img" aria-label="天气分桶箱线图" />
    </div>
  );
}

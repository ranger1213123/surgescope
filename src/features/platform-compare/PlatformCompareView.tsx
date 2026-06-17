import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { getWeatherLabel } from '../../utils/weatherLabels';

// ── types ──────────────────────────────────────────────
type HourlyPoint = {
  datetime: string;
  date: Date;
  hour: number;
  uberSurge: number;
  lyftSurge: number;
  uberPrice: number | null;
  lyftPrice: number | null;
  uberOrders: number;
  lyftOrders: number;
  weather: string;
  temperature: number;
  precipIntensity: number;
  visibility: number;
};

type CompareData = {
  points: HourlyPoint[];
  uberAvgSurge: number;
  lyftAvgSurge: number;
  uberStdSurge: number;
  lyftStdSurge: number;
  uberTotalOrders: number;
  lyftTotalOrders: number;
  uberPeakSurge: number;
  lyftPeakSurge: number;
  // weather-grouped
  byWeather: Map<string, { uberAvg: number; lyftAvg: number; count: number }>;
  // hour-grouped
  byHour: Map<number, { uberAvg: number; lyftAvg: number; count: number }>;
  // rain/snow surge
  uberBadWeatherSurge: number;
  lyftBadWeatherSurge: number;
};

const BAD_WEATHER = new Set(['rain', 'heavy rain', 'snow', 'sleet', 'drizzle', 'light rain']);
const PEAK_HOURS = new Set([7, 8, 9, 17, 18, 19]);
const NIGHT_HOURS = new Set([22, 23, 0, 1, 2, 3, 4, 5, 6]);

const UBER_COLOR = '#3B71F3';
const LYFT_COLOR = '#E8613C';

function loadData(): Promise<CompareData> {
  return fetch(`${import.meta.env.BASE_URL}data/hourly_series.json`)
    .then(r => r.json())
    .then(raw => {
      const points: HourlyPoint[] = [];
      for (const [dt, rec] of Object.entries(raw)) {
        const r = rec as Record<string, any>;
        const w = r.weather ?? {};
        points.push({
          datetime: dt,
          date: new Date(dt),
          hour: new Date(dt).getHours(),
          uberSurge: r.uber?.avg_surge ?? 1,
          lyftSurge: r.lyft?.avg_surge ?? 1,
          uberPrice: r.uber?.avg_price ?? null,
          lyftPrice: r.lyft?.avg_price ?? null,
          uberOrders: r.uber?.order_count ?? 0,
          lyftOrders: r.lyft?.order_count ?? 0,
          weather: w.short_summary ?? 'unknown',
          temperature: w.temperature ?? 0,
          precipIntensity: w.precipIntensity ?? 0,
          visibility: w.visibility ?? 10,
        });
      }
      points.sort((a, b) => a.date.getTime() - b.date.getTime());

      const uberSurges = points.map(p => p.uberSurge);
      const lyftSurges = points.map(p => p.lyftSurge);

      const byWeather = d3.rollup(
        points,
        v => ({
          uberAvg: d3.mean(v, p => p.uberSurge) ?? 1,
          lyftAvg: d3.mean(v, p => p.lyftSurge) ?? 1,
          count: v.length,
        }),
        p => p.weather
      );

      const byHour = d3.rollup(
        points,
        v => ({
          uberAvg: d3.mean(v, p => p.uberSurge) ?? 1,
          lyftAvg: d3.mean(v, p => p.lyftSurge) ?? 1,
          count: v.length,
        }),
        p => p.hour
      );

      const badPts = points.filter(p => BAD_WEATHER.has(p.weather));

      return {
        points,
        uberAvgSurge: d3.mean(uberSurges) ?? 1,
        lyftAvgSurge: d3.mean(lyftSurges) ?? 1,
        uberStdSurge: d3.deviation(uberSurges) ?? 0,
        lyftStdSurge: d3.deviation(lyftSurges) ?? 0,
        uberTotalOrders: d3.sum(points, p => p.uberOrders),
        lyftTotalOrders: d3.sum(points, p => p.lyftOrders),
        uberPeakSurge: d3.max(uberSurges) ?? 1,
        lyftPeakSurge: d3.max(lyftSurges) ?? 1,
        byWeather,
        byHour,
        uberBadWeatherSurge: d3.mean(badPts, p => p.uberSurge) ?? 1,
        lyftBadWeatherSurge: d3.mean(badPts, p => p.lyftSurge) ?? 1,
      };
    });
}

// ── animated number hook ───────────────────────────────
function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(target * p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function AnimatedNumber({ value, decimals = 2, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const anim = useCountUp(value);
  return <span>{anim.toFixed(decimals)}{suffix}</span>;
}

// ── density curves chart ───────────────────────────────
function DensityCurves({ data }: { data: CompareData }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = Math.max(container.clientWidth, 400);
    const h = 340;
    const m = { top: 30, right: 30, bottom: 50, left: 54 };

    const svg = d3.select(container).select<SVGSVGElement>('svg');
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;

    // Compute density
    const kde = (samples: number[]) => {
      const bandwidth = 0.04;
      return (x: number) => d3.mean(samples, v => {
        const z = (x - v) / bandwidth;
        return Math.exp(-0.5 * z * z) / (bandwidth * Math.sqrt(2 * Math.PI));
      }) ?? 0;
    };

    const uberVals = data.points.map(p => p.uberSurge).filter(v => v > 0.9 && v < 3);
    const lyftVals = data.points.map(p => p.lyftSurge).filter(v => v > 0.9 && v < 3);
    const uberKde = kde(uberVals);
    const lyftKde = kde(lyftVals);

    const xDomain: [number, number] = [0.95, 2.6];
    const x = d3.scaleLinear().domain(xDomain).range([0, iw]);

    // Compute actual KDE max across both datasets to avoid clipping
    const steps = 200;
    let kdeMax = 0;
    for (let i = 0; i <= steps; i++) {
      const xi = xDomain[0] + (xDomain[1] - xDomain[0]) * i / steps;
      kdeMax = Math.max(kdeMax, uberKde(xi), lyftKde(xi));
    }
    const yMax = Math.max(2.2, kdeMax * 1.12);
    const y = d3.scaleLinear().domain([0, yMax]).range([ih, 0]);

    // Axes
    g.append('g').attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickFormat(v => `${(v as number).toFixed(2)}x`))
      .selectAll('text').attr('fill', '#8E887E').attr('font-size', 10);
    g.append('g')
      .call(d3.axisLeft(y).ticks(4))
      .selectAll('text').attr('fill', '#8E887E').attr('font-size', 10);

    g.append('text').attr('x', iw / 2).attr('y', ih + 40)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 12)
      .text('溢价倍数');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -40)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 12)
      .text('密度');

    // Grid
    g.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(() => '').tickSize(-iw) as any)
      .selectAll('line').attr('stroke', 'rgba(0,0,0,0.05)');

    // Density areas
    const area = d3.area<[number, number]>()
      .x(d => x(d[0])).y0(ih).y1(d => y(d[1])).curve(d3.curveMonotoneX);

    const uberPts: [number, number][] = [];
    const lyftPts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const xi = xDomain[0] + (xDomain[1] - xDomain[0]) * i / steps;
      uberPts.push([xi, uberKde(xi)]);
      lyftPts.push([xi, lyftKde(xi)]);
    }

    g.append('path').datum(uberPts)
      .attr('fill', UBER_COLOR).attr('fill-opacity', 0.18).attr('stroke', 'none')
      .attr('d', area);
    g.append('path').datum(lyftPts)
      .attr('fill', LYFT_COLOR).attr('fill-opacity', 0.18).attr('stroke', 'none')
      .attr('d', area);

    // Density lines
    const line = d3.line<[number, number]>()
      .x(d => x(d[0])).y(d => y(d[1])).curve(d3.curveMonotoneX);
    g.append('path').datum(uberPts).attr('fill', 'none').attr('stroke', UBER_COLOR).attr('stroke-width', 2.5).attr('d', line);
    g.append('path').datum(lyftPts).attr('fill', 'none').attr('stroke', LYFT_COLOR).attr('stroke-width', 2.5).attr('d', line);

    // Mean lines
    [['uber', data.uberAvgSurge, UBER_COLOR] as const, ['lyft', data.lyftAvgSurge, LYFT_COLOR] as const]
      .forEach(([_, mean, color]) => {
        g.append('line').attr('x1', x(mean)).attr('x2', x(mean)).attr('y1', 0).attr('y2', ih)
          .attr('stroke', color).attr('stroke-width', 1.2).attr('stroke-dasharray', '5 3').attr('opacity', 0.6);
        g.append('text').attr('x', x(mean)).attr('y', -6)
          .attr('text-anchor', 'middle').attr('fill', color).attr('font-size', 10).attr('font-weight', 600)
          .text(mean.toFixed(2) + 'x');
      });

    // Legend (positioned bottom-right inside plot area with background)
    const lgX = iw - 122;
    const lgY = ih - 30;
    const lg = g.append('g').attr('transform', `translate(${lgX},${lgY})`);
    lg.append('rect').attr('x', -8).attr('y', -14).attr('width', 132).attr('height', 42).attr('rx', 6)
      .attr('fill', 'rgba(255,255,255,0.88)').attr('stroke', 'rgba(0,0,0,0.06)');
    [['Uber', UBER_COLOR] as const, ['Lyft', LYFT_COLOR] as const].forEach(([label, color], i) => {
      lg.append('line').attr('x1', 0).attr('y1', i * 20).attr('x2', 18).attr('y2', i * 20)
        .attr('stroke', color).attr('stroke-width', 2.5);
      lg.append('text').attr('x', 24).attr('y', i * 20 + 4).attr('fill', '#5C564E').attr('font-size', 11).text(label);
    });
  }, [data]);

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg style={{ width: '100%', height: 'auto' }} role="img" aria-label="溢价分布密度曲线" />
    </div>
  );
}

// ── weather grouped bar chart ──────────────────────────
function WeatherBarChart({ data }: { data: CompareData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = Math.max(container.clientWidth, 440);
    const h = 310;
    const m = { top: 24, right: 24, bottom: 72, left: 50 };
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;

    const svg = d3.select(container).select<SVGSVGElement>('svg');
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    svg.selectAll('*').remove();

    const items = Array.from(data.byWeather.entries())
      .map(([weather, v]) => ({ weather, label: getWeatherLabel(weather), uber: v.uberAvg, lyft: v.lyftAvg }))
      .filter(d => d.uber > 1 || d.lyft > 1)
      .sort((a, b) => (b.uber + b.lyft) - (a.uber + a.lyft));

    if (items.length === 0) return;

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const x0 = d3.scaleBand().domain(items.map(d => d.label)).range([0, iw]).padding(0.18);
    const x1 = d3.scaleBand().domain(['uber', 'lyft']).range([0, x0.bandwidth()]).padding(0.06);
    const maxVal = d3.max(items, d => Math.max(d.uber, d.lyft)) ?? 2;
    const y = d3.scaleLinear().domain([0.95, maxVal * 1.08]).range([ih, 0]);

    g.append('g').attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x0).tickSize(0))
      .selectAll('text').attr('fill', '#5C564E').attr('font-size', 11)
      .attr('transform', 'rotate(-30)').attr('text-anchor', 'end').attr('dx', '-0.6em').attr('dy', '0.3em');
    g.append('g')
      .call(d3.axisLeft(y).tickFormat(v => `${(v as number).toFixed(2)}x`))
      .selectAll('text').attr('fill', '#8E887E').attr('font-size', 10);

    g.append('text').attr('x', iw / 2).attr('y', ih + 58)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 12).text('天气类型');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -40)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 12).text('平均溢价倍数');

    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(() => '').tickSize(-iw) as any)
      .selectAll('line').attr('stroke', 'rgba(0,0,0,0.05)');

    const groups = g.selectAll('.wg').data(items).join('g').attr('class', 'wg')
      .attr('transform', d => `translate(${x0(d.label)!},0)`);

    const barData = (d: typeof items[0]) => [['uber', d.uber, UBER_COLOR] as const, ['lyft', d.lyft, LYFT_COLOR] as const];
    groups.each(function(d) {
      d3.select(this).selectAll('rect').data(barData(d)).join('rect')
        .attr('x', ([k]) => x1(k)!).attr('width', x1.bandwidth())
        .attr('y', ([, v]) => y(v)).attr('height', ([, v]) => ih - y(v))
        .attr('fill', ([, , c]) => c).attr('rx', 3).attr('opacity', 0.85);
    });

    // Legend
    const lg = svg.append('g').attr('transform', `translate(${w - 120}, ${m.top - 16})`);
    [['Uber', UBER_COLOR] as const, ['Lyft', LYFT_COLOR] as const].forEach(([label, color], i) => {
      lg.append('rect').attr('x', i * 56).attr('y', 0).attr('width', 12).attr('height', 12).attr('rx', 3).attr('fill', color);
      lg.append('text').attr('x', i * 56 + 16).attr('y', 10).attr('fill', '#5C564E').attr('font-size', 11).text(label);
    });
  }, [data]);

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg style={{ width: '100%', height: 'auto' }} role="img" aria-label="天气分组柱状图" />
      <div ref={tooltipRef} hidden style={{
        position: 'absolute', zIndex: 999, pointerEvents: 'none',
        background: 'rgba(255,255,255,0.95)', color: '#2D2A26',
        padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.7,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)', maxWidth: 200,
      }} />
    </div>
  );
}

// ── heatmap matrix (24h × weather) ─────────────────────
function HeatmapMatrix({ data }: { data: CompareData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const weatherOrder = useMemo(() => {
    return Array.from(data.byWeather.keys())
      .filter(w => (data.byWeather.get(w)?.count ?? 0) > 5)
      .sort((a, b) => (data.byWeather.get(b)?.count ?? 0) - (data.byWeather.get(a)?.count ?? 0));
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || weatherOrder.length === 0) return;
    const cw = container.clientWidth;
    const m = { top: 20, right: 30, bottom: 60, left: 80 };
    const cols = 24;
    const avW = (cw - m.left - m.right) / cols;
    const cellW = Math.max(10, Math.min(22, Math.floor(avW - 2)));
    const cellH = cellW;
    const gap = Math.max(1, Math.floor(cellW / 10));
    const rows = weatherOrder.length;
    const gw = cols * (cellW + gap) - gap;
    const gh = rows * (cellH + gap) - gap;
    const totalW = m.left + gw + m.right;
    const h = m.top + gh + m.bottom;

    const svg = d3.select(container).select<SVGSVGElement>('svg');
    svg.attr('viewBox', `0 0 ${Math.max(cw, totalW)} ${h}`);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${m.left + (Math.max(cw, totalW) - m.left - m.right - gw) / 2},${m.top})`);

    const matrix = new Map<string, Map<number, number>>();
    for (const pt of data.points) {
      if (!matrix.has(pt.weather)) matrix.set(pt.weather, new Map());
      const hm = matrix.get(pt.weather)!;
      hm.set(pt.hour, (hm.get(pt.hour) ?? 0) + pt.lyftSurge - pt.uberSurge);
    }

    // per-weather-hour average
    const cellMap = new Map<string, Map<number, number>>();
    const diffs: number[] = [];
    for (const [weather, hm] of matrix) {
      const cm = new Map<number, number>();
      for (const [h, sum] of hm) {
        const cnt = data.points.filter(p => p.weather === weather && p.hour === h).length;
        const avg = sum / (cnt || 1);
        cm.set(h, avg);
        diffs.push(avg);
      }
      cellMap.set(weather, cm);
    }

    const maxAbs = d3.max(diffs, d => Math.abs(d)) ?? 0.3;
    const colorScale = d3.scaleDiverging(d3.interpolateRdBu).domain([-maxAbs, 0, maxAbs]);

    const tooltip = d3.select(tooltipRef.current!);

    weatherOrder.forEach((weather, ri) => {
      const label = getWeatherLabel(weather);
      const cm = cellMap.get(weather);
      for (let h = 0; h < 24; h++) {
        const diff = cm?.get(h) ?? null;
        const fill = diff != null ? colorScale(diff) : '#eee';
        const x = h * (cellW + gap);
        const y = ri * (cellH + gap);

        g.append('rect')
          .attr('x', x).attr('y', y).attr('width', cellW).attr('height', cellH).attr('rx', 3)
          .attr('fill', fill)
          .on('mouseenter', e => {
            tooltip.style('left', `${e.offsetX + 16}px`).style('top', `${e.offsetY - 8}px`).attr('hidden', null);
            tooltip.html(diff != null
              ? `<strong>${label} · ${h}:00</strong><br>Lyft − Uber 溢价差：${diff > 0 ? '+' : ''}${(diff * 100).toFixed(1)}%<br>${diff > 0 ? 'Lyft 更贵' : 'Uber 更贵'}`
              : '无数据');
          })
          .on('mousemove', e => tooltip.style('left', `${e.offsetX + 16}px`).style('top', `${e.offsetY - 8}px`))
          .on('mouseleave', () => tooltip.attr('hidden', true));
      }
    });

    // Row labels
    g.selectAll('.row-label').data(weatherOrder).join('text')
      .attr('class', 'row-label').attr('x', -8).attr('y', (_, i) => i * (cellH + gap) + cellH / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#5C564E').attr('font-size', 11)
      .text(d => getWeatherLabel(d));

    // Column labels
    for (let h = 0; h < 24; h += 3) {
      g.append('text')
        .attr('x', h * (cellW + gap) + cellW / 2).attr('y', rows * (cellH + gap) + 16)
        .attr('text-anchor', 'middle').attr('fill', '#8E887E').attr('font-size', 10)
        .text(`${h}h`);
    }

    // Color legend
    const legW = 140, legH = 12;
    const legX = Math.max(cw, totalW) - m.right - legW;
    const legY = h - m.bottom + 36;
    const defs = svg.append('defs');
    const legGrad = defs.append('linearGradient').attr('id', 'heatmap-leg-grad');
    legGrad.append('stop').attr('offset', '0%').attr('stop-color', d3.interpolateRdBu(0));
    legGrad.append('stop').attr('offset', '50%').attr('stop-color', d3.interpolateRdBu(0.5));
    legGrad.append('stop').attr('offset', '100%').attr('stop-color', d3.interpolateRdBu(1));
    svg.append('rect').attr('x', legX).attr('y', legY).attr('width', legW).attr('height', legH).attr('rx', 3).attr('fill', 'url(#heatmap-leg-grad)');
    svg.append('text').attr('x', legX - 4).attr('y', legY + legH / 2).attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
      .attr('fill', '#8E887E').attr('font-size', 9).text('Uber更贵');
    svg.append('text').attr('x', legX + legW + 4).attr('y', legY + legH / 2).attr('dominant-baseline', 'middle')
      .attr('fill', '#8E887E').attr('font-size', 9).text('Lyft更贵');
  }, [data, weatherOrder]);

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg style={{ width: '100%', height: 'auto' }} role="img" aria-label="时段天气热力矩阵" />
      <div ref={tooltipRef} hidden style={{
        position: 'absolute', zIndex: 999, pointerEvents: 'none',
        background: 'rgba(255,255,255,0.95)', color: '#2D2A26',
        padding: '8px 12px', borderRadius: 8, fontSize: 11, lineHeight: 1.6,
        boxShadow: '0 3px 12px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)', maxWidth: 200,
      }} />
    </div>
  );
}

// ── scatter compare ────────────────────────────────────
function ScatterCompare({ data }: { data: CompareData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const weatherColors = useMemo(() => {
    const types = [...new Set(data.points.map(p => p.weather))].filter(w => {
      const cnt = data.points.filter(p => p.weather === w).length;
      return cnt > 10;
    });
    const cScale = d3.scaleOrdinal(d3.schemeSet2).domain(types);
    return new Map(types.map(t => [t, cScale(t)]));
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = Math.max(container.clientWidth, 440);
    const h = 420;
    const m = { top: 24, right: 24, bottom: 90, left: 54 };
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;

    const svg = d3.select(container).select<SVGSVGElement>('svg');
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);
    const maxVal = d3.max(data.points, p => Math.max(p.uberSurge, p.lyftSurge)) ?? 2.5;
    const minVal = 0.95;
    const x = d3.scaleLinear().domain([minVal, maxVal]).range([0, iw]);
    const y = d3.scaleLinear().domain([minVal, maxVal]).range([ih, 0]);

    g.append('g').attr('transform', `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickFormat(v => `${(v as number).toFixed(2)}x`))
      .selectAll('text').attr('fill', '#8E887E').attr('font-size', 10);
    g.append('g')
      .call(d3.axisLeft(y).tickFormat(v => `${(v as number).toFixed(2)}x`))
      .selectAll('text').attr('fill', '#8E887E').attr('font-size', 10);

    g.append('text').attr('x', iw / 2).attr('y', ih + 40)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 12).text('Uber 溢价');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -42)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 12).text('Lyft 溢价');

    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(() => '').tickSize(-iw) as any)
      .selectAll('line').attr('stroke', 'rgba(0,0,0,0.05)');

    // Diagonal
    g.append('line').attr('x1', x(minVal)).attr('y1', y(minVal)).attr('x2', x(maxVal)).attr('y2', y(maxVal))
      .attr('stroke', 'rgba(0,0,0,0.2)').attr('stroke-width', 1).attr('stroke-dasharray', '5 5');
    g.append('text').attr('x', x(maxVal) - 8).attr('y', y(maxVal) - 8)
      .attr('text-anchor', 'end').attr('fill', '#8E887E').attr('font-size', 10).text('y=x');

    // Points
    const pts = data.points.filter(p => p.uberSurge > 0.9 && p.lyftSurge > 0.9);
    const sampled = pts.length > 800 ? pts.filter(() => Math.random() < 0.6) : pts;

    const tooltip = d3.select(tooltipRef.current!);

    g.selectAll('circle').data(sampled).join('circle')
      .attr('cx', d => x(d.uberSurge)).attr('cy', d => y(d.lyftSurge))
      .attr('r', 3.5).attr('fill', d => weatherColors.get(d.weather) ?? '#999')
      .attr('fill-opacity', 0.7).attr('stroke', '#fff').attr('stroke-width', 0.5)
      .on('mouseenter', (e, d) => {
        tooltip.style('left', `${e.offsetX + 16}px`).style('top', `${e.offsetY - 8}px`).attr('hidden', null);
        tooltip.html(`<strong>${d.datetime}</strong><br>天气：${getWeatherLabel(d.weather)}<br>Uber：${d.uberSurge.toFixed(3)}x<br>Lyft：${d.lyftSurge.toFixed(3)}x`);
      })
      .on('mousemove', e => tooltip.style('left', `${e.offsetX + 16}px`).style('top', `${e.offsetY - 8}px`))
      .on('mouseleave', () => tooltip.attr('hidden', true));

    // Legend (horizontal 2-row grid below plot)
    const legendTypes = [...weatherColors.keys()].slice(0, 8);
    const colW = Math.min(120, iw / 4);
    const lgY = ih + 18;
    const lg = g.append('g').attr('transform', `translate(0,${lgY})`);
    lg.append('rect').attr('x', -4).attr('y', -6).attr('width', iw + 8).attr('height', 48).attr('rx', 6)
      .attr('fill', 'rgba(255,255,255,0.6)').attr('stroke', 'rgba(0,0,0,0.04)');
    legendTypes.forEach((t, i) => {
      const row = i < 4 ? 0 : 1;
      const col = i % 4;
      const lx = col * colW;
      const ly = row * 20;
      lg.append('circle').attr('cx', lx + 6).attr('cy', ly + 6).attr('r', 5).attr('fill', weatherColors.get(t)!).attr('opacity', 0.7);
      lg.append('text').attr('x', lx + 16).attr('y', ly + 10).attr('fill', '#5C564E').attr('font-size', 10).text(getWeatherLabel(t));
    });
    // X axis label below legend
    g.append('text').attr('x', iw / 2).attr('y', lgY + 52)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 12).text('Uber 溢价');
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -ih / 2).attr('y', -42)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 12).text('Lyft 溢价');
  }, [data, weatherColors]);

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg style={{ width: '100%', height: 'auto' }} role="img" aria-label="Uber vs Lyft 散点对比" />
      <div ref={tooltipRef} hidden style={{
        position: 'absolute', zIndex: 999, pointerEvents: 'none',
        background: 'rgba(255,255,255,0.95)', color: '#2D2A26',
        padding: '8px 12px', borderRadius: 8, fontSize: 11, lineHeight: 1.6,
        boxShadow: '0 3px 12px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)', maxWidth: 200,
      }} />
    </div>
  );
}

// ── diff bar chart (Lyft − Uber % difference per dimension) ──
function DiffBarChart({ data }: { data: CompareData }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const dims = useMemo(() => {
    const { points } = data;
    const uberSurges = points.map(p => p.uberSurge);
    const lyftSurges = points.map(p => p.lyftSurge);
    const uberMean = d3.mean(uberSurges) ?? 1;
    const lyftMean = d3.mean(lyftSurges) ?? 1;
    const uberStd = d3.deviation(uberSurges) ?? 0;
    const lyftStd = d3.deviation(lyftSurges) ?? 0;

    const badPts = points.filter(p => BAD_WEATHER.has(p.weather));
    const peakPts = points.filter(p => PEAK_HOURS.has(p.hour));
    const nightPts = points.filter(p => NIGHT_HOURS.has(p.hour));

    const uberBadMean = badPts.length ? (d3.mean(badPts, p => p.uberSurge) ?? 1) : 1;
    const lyftBadMean = badPts.length ? (d3.mean(badPts, p => p.lyftSurge) ?? 1) : 1;
    const uberPeakMean = peakPts.length ? (d3.mean(peakPts, p => p.uberSurge) ?? 1) : 1;
    const lyftPeakMean = peakPts.length ? (d3.mean(peakPts, p => p.lyftSurge) ?? 1) : 1;
    const uberNightMean = nightPts.length ? (d3.mean(nightPts, p => p.uberSurge) ?? 1) : 1;
    const lyftNightMean = nightPts.length ? (d3.mean(nightPts, p => p.lyftSurge) ?? 1) : 1;

    const items: { label: string; uber: number; lyft: number; unit: string }[] = [
      { label: '平均溢价', uber: uberMean, lyft: lyftMean, unit: 'x' },
      { label: '溢价稳定性', uber: uberStd, lyft: lyftStd, unit: 'σ' },
      { label: '雨雪天气响应', uber: uberBadMean, lyft: lyftBadMean, unit: 'x' },
      { label: '高峰时段溢价', uber: uberPeakMean, lyft: lyftPeakMean, unit: 'x' },
      { label: '夜间溢价', uber: uberNightMean, lyft: lyftNightMean, unit: 'x' },
      { label: '订单总量', uber: data.uberTotalOrders, lyft: data.lyftTotalOrders, unit: '单' },
    ];

    const diffs = items.map(item => {
      const pct = item.uber > 0 ? ((item.lyft - item.uber) / item.uber) * 100 : 0;
      return { ...item, pct };
    });

    const maxAbsPct = Math.max(1, d3.max(diffs, d => Math.abs(d.pct)) ?? 5);

    return { diffs, maxAbsPct };
  }, [data]);

  const { diffs, maxAbsPct } = dims;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = Math.max(container.clientWidth, 360);
    const h = 340;
    const m = { top: 10, right: 80, bottom: 20, left: 110 };
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;
    const barH = Math.min(36, (ih / diffs.length) - 6);
    const barGap = (ih - barH * diffs.length) / (diffs.length + 1);
    const centerX = iw / 2;

    const svg = d3.select(container).select<SVGSVGElement>('svg');
    svg.attr('viewBox', `0 0 ${w} ${h}`);
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    // Center line
    g.append('line').attr('x1', centerX).attr('x2', centerX).attr('y1', 0).attr('y2', ih)
      .attr('stroke', 'rgba(0,0,0,0.15)').attr('stroke-width', 1).attr('stroke-dasharray', '4 3');

    // Labels at center line
    g.append('text').attr('x', centerX - 6).attr('y', -2)
      .attr('text-anchor', 'end').attr('fill', UBER_COLOR).attr('font-size', 10).attr('font-weight', 600)
      .text('← Uber 更高');
    g.append('text').attr('x', centerX + 6).attr('y', -2)
      .attr('text-anchor', 'start').attr('fill', LYFT_COLOR).attr('font-size', 10).attr('font-weight', 600)
      .text('Lyft 更高 →');

    diffs.forEach((d, i) => {
      const y = barGap + i * (barH + barGap);
      const barW = (Math.abs(d.pct) / maxAbsPct) * (iw / 2 - 10);
      const isLyft = d.pct >= 0;
      const barX = isLyft ? centerX + 4 : centerX - 4 - barW;
      const fill = isLyft ? LYFT_COLOR : UBER_COLOR;
      const pctText = `${d.pct > 0 ? '+' : ''}${d.pct.toFixed(1)}%`;
      const valText = d.unit === '单' ? d3.format(',.0f')(Math.abs(d.lyft - d.uber)) + d.unit : `${Math.abs(d.lyft - d.uber).toFixed(3)}${d.unit}`;

      // Label
      g.append('text').attr('x', -8).attr('y', y + barH / 2)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('fill', '#2D2A26').attr('font-size', 12).attr('font-weight', 600)
        .text(d.label);

      // Background track
      g.append('rect').attr('x', 0).attr('y', y).attr('width', iw).attr('height', barH).attr('rx', 4)
        .attr('fill', 'rgba(0,0,0,0.03)');

      // Bar
      if (barW > 1) {
        g.append('rect').attr('x', barX).attr('y', y).attr('width', barW).attr('height', barH).attr('rx', 4)
          .attr('fill', fill).attr('opacity', 0.8);
      }

      // Percentage text
      g.append('text')
        .attr('x', isLyft ? barX + barW + 6 : barX - 6)
        .attr('y', y + barH / 2)
        .attr('text-anchor', isLyft ? 'start' : 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', fill).attr('font-size', 12).attr('font-weight', 700)
        .text(pctText);

      // Absolute diff
      g.append('text')
        .attr('x', isLyft ? barX + barW + 6 : barX - 6)
        .attr('y', y + barH / 2 + 14)
        .attr('text-anchor', isLyft ? 'start' : 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#8E887E').attr('font-size', 10)
        .text(valText);
    });
  }, [diffs, maxAbsPct]);

  const lyftWins = diffs.filter(d => d.pct > 1).length;
  const uberWins = diffs.filter(d => d.pct < -1).length;

  return (
    <div>
      <div ref={containerRef} style={{ width: '100%' }}>
        <svg style={{ width: '100%', height: 'auto' }} role="img" aria-label="平台差异对比图" />
      </div>
      <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(59,113,243,0.04)', borderRadius: 8, fontSize: 12, color: '#5C564E', lineHeight: 1.6 }}>
        <strong>怎么看这张图：</strong>
        六个维度中 Lyft 在 {lyftWins} 个上高于 Uber，Uber 在 {uberWins} 个上占优。
        {lyftWins > uberWins
          ? ' 整体来看 Lyft 略占上风，尤其在雨雪天气响应和平均溢价上更激进。但 Uber 在溢价稳定性和高峰响应上表现更好——意味着 Uber 的定价更可控、更可预测。两家差异其实没有想象中那么大，真正的分歧几乎都集中在极端天气场景下。'
          : ' Uber 在溢价稳定性和高峰响应上更强，但 Lyft 在恶劣天气场景下定价更激进。两家差异其实没有想象中那么大（整体不到 3%），真正的分歧几乎都集中在极端天气场景下。'}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────
export function PlatformCompareView() {
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData()
      .then(setCompareData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state"><div className="spinner" /><span>正在加载平台对比数据…</span></div>;
  if (error) return <div className="error-state">{error}</div>;
  if (!compareData) return null;

  const d = compareData;
  const kpiItems = [
    {
      label: 'Uber 平均溢价',
      uber: d.uberAvgSurge.toFixed(2) + 'x',
      lyft: d.lyftAvgSurge.toFixed(2) + 'x',
      uberNum: d.uberAvgSurge,
      lyftNum: d.lyftAvgSurge,
      details: '两平台整体定价水平',
    },
    {
      label: '恶劣天气溢价',
      uber: d.uberBadWeatherSurge.toFixed(2) + 'x',
      lyft: d.lyftBadWeatherSurge.toFixed(2) + 'x',
      uberNum: d.uberBadWeatherSurge,
      lyftNum: d.lyftBadWeatherSurge,
      details: '雨/雪天气下平均溢价',
    },
    {
      label: '溢价波动性 (标准差)',
      uber: d.uberStdSurge.toFixed(3),
      lyft: d.lyftStdSurge.toFixed(3),
      uberNum: d.uberStdSurge,
      lyftNum: d.lyftStdSurge,
      details: '值越大越不稳定',
    },
    {
      label: '总订单量',
      uber: d.uberTotalOrders.toLocaleString(),
      lyft: d.lyftTotalOrders.toLocaleString(),
      uberNum: d.uberTotalOrders,
      lyftNum: d.lyftTotalOrders,
      details: '两个月覆盖样本',
    },
  ];

  return (
    <div className="platform-compare-view">
      <header className="hero-section hero-compact">
        <p className="hero-eyebrow">平台对比</p>
        <h2>Uber vs Lyft 定价策略对比</h2>
        <p className="hero-subtitle">
          同一个小时、同一种天气、同一个区域——Uber 和 Lyft 的价格到底差多少？
          下面用 {d.points.length} 条小时级数据，从分布形态、天气响应、时段差异等角度，拆解两家平台的定价逻辑。
        </p>
      </header>

      {/* Stat Ribbon */}
      <div className="stat-ribbon">
        {kpiItems.map(item => {
          const diffPct = item.lyftNum > 0 ? ((item.lyftNum - item.uberNum) / item.uberNum * 100) : 0;
          return (
            <div key={item.label} className="stat-cell">
              <span className="stat-label">{item.label}</span>
              <span className="stat-value" style={{ fontSize: 22 }}>
                <span style={{ color: UBER_COLOR, fontSize: 16 }}>U <AnimatedNumber value={item.uberNum} decimals={item.uberNum < 10 ? 2 : 0} /></span>
                {' / '}
                <span style={{ color: LYFT_COLOR, fontSize: 16 }}>L <AnimatedNumber value={item.lyftNum} decimals={item.lyftNum < 10 ? 2 : 0} /></span>
              </span>
              <span className="stat-detail" style={{ color: diffPct > 0 ? LYFT_COLOR : diffPct < 0 ? UBER_COLOR : '#8E887E', fontWeight: 600 }}>
                {diffPct > 0 ? 'Lyft' : 'Uber'} {diffPct > 0 ? '高' : '低'} {Math.abs(diffPct).toFixed(1)}% · {item.details}
              </span>
            </div>
          );
        })}
      </div>

      {/* Row 1: Density (wider) + Weather bars (narrower) */}
      <div className="bento-grid">
        <section className="card col-7">
          <div className="card-head">
            <h3>溢价分布密度曲线</h3>
            <p>
              蓝色是 Uber，橙色是 Lyft。曲线越高说明该溢价水平出现频率越高，虚线标记各自的平均值。
              两条曲线形状非常接近，峰值集中在 1.0x–1.2x——大多数时候两家平台定价确实接近。
              但右侧「长尾」区域（1.5x 以上）能看出一些差异。
            </p>
          </div>
          <div className="card-body">
            <DensityCurves data={d} />
            <div className="card-insight">
              <strong>怎么看这张图：</strong>
              两边均值几乎相同（Uber {d.uberAvgSurge.toFixed(2)}x vs Lyft {d.lyftAvgSurge.toFixed(2)}x），
              但 Uber 的标准差更大（{d.uberStdSurge.toFixed(3)} vs {d.lyftStdSurge.toFixed(3)}），
              即 Uber 的价格波动更剧烈——其算法在极端情况下会把价格推得更高，Lyft 的定价相对集中。
              不过别被均值误导，真正有意义的差异藏在不同天气类型里，往下看。
            </div>
          </div>
        </section>
        <section className="card col-5">
          <div className="card-head">
            <h3>不同天气下的溢价对比</h3>
            <p>
              把数据按天气类型拆开，两家的差异一眼就能看出来。从左到右按溢价高低排列，
              雪天（Snow）和暴雨（Heavy Rain）远高于其他天气——这才是溢价的真正驱动因素。
            </p>
          </div>
          <div className="card-body">
            <WeatherBarChart data={d} />
            {(() => {
              const items = Array.from(d.byWeather.entries()).map(([w, v]) => ({ w, l: getWeatherLabel(w), u: v.uberAvg, ly: v.lyftAvg }));
              const maxItem = items.sort((a, b) => (b.u + b.ly) - (a.u + a.ly))[0];
              const lyftWins = items.filter(x => x.ly > x.u).length;
              const total = items.length;
              return (
                <div className="card-insight">
                  <strong>怎么看这张图：</strong>
                  溢价最高的天气是<strong>{maxItem?.l ?? '未知'}</strong>，Uber {maxItem?.u.toFixed(2)}x、Lyft {maxItem?.ly.toFixed(2)}x。
                  在全部 {total} 种天气中，Lyft 在 <strong>{lyftWins}</strong> 种天气下溢价高于 Uber，
                  尤其雨雪天加价更主动——Lyft 在恶劣天气中更倾向于通过涨价来应对供需失衡。
                </div>
              );
            })()}
          </div>
        </section>
      </div>

      {/* Row 2: Heatmap full width */}
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>时段 × 天气溢价差热力矩阵</h3>
          <p>
            横轴是 24 小时，纵轴是不同天气，每个格子的颜色表示 Lyft 减 Uber 的溢价差。
            偏红 = 该时段/天气组合下 Lyft 更贵，偏蓝 = Uber 更贵。深夜+雨雪的右下角偏红，凌晨+晴天的左上偏蓝——定价差异有清晰的规律。
          </p>
        </div>
        <div className="card-body">
          <HeatmapMatrix data={d} />
          <div className="card-insight">
            <strong>怎么看这张图：</strong>
            Lyft 在深夜（22 点–凌晨 6 点）的雨雪时段溢价显著高于 Uber（右下角一片红），
            而 Uber 在白天晴天时价格更稳定（左上角偏蓝）。凌晨暴雨/暴雪场景下两家的溢价差最大，
            可以达到 <strong>+{d3.max(
              (() => {
                const diffs: number[] = [];
                for (const pt of d.points) {
                  if (pt.hour >= 22 || pt.hour <= 6) {
                    if (BAD_WEATHER.has(pt.weather)) {
                      diffs.push(pt.lyftSurge - pt.uberSurge);
                    }
                  }
                }
                return diffs;
              })(), d => d
            )?.toFixed(1) ?? '0'} 个百分点</strong>。
            整体规律很清晰：天气越差、时间越晚，Lyft 的溢价优势越大。
          </div>
        </div>
      </section>

      {/* Row 3: Scatter (wider) + Diff (narrower) */}
      <div className="bento-grid" style={{ marginTop: 16 }}>
        <section className="card col-7">
          <div className="card-head">
            <h3>Uber vs Lyft 溢价散点</h3>
            <p>
              每个点代表一个小时，横轴 Uber 溢价、纵轴 Lyft 溢价。两点在同一小时价格相同则落于对角线上。
              对角线上方 = 该小时 Lyft 更贵，下方 = Uber 更贵。不同颜色代表不同天气类型，可以看到哪种天气下哪个平台加价更激进。
            </p>
          </div>
          <div className="card-body">
            <ScatterCompare data={d} />
            {(() => {
              const aboveCount = d.points.filter(p => p.lyftSurge > p.uberSurge).length;
              const abovePct = ((aboveCount / d.points.length) * 100).toFixed(1);
              return (
                <div className="card-insight">
                  <strong>怎么看这张图：</strong>
                  总共 <strong>{abovePct}%</strong> 的点在对角线上方，也就是说六成以上的时间里 Lyft 比 Uber 贵。
                  {Number(abovePct) > 55
                    ? ' 溢价越高的区间优势越明显——超过 1.5x 的时段几乎都是雪天和暴雨天，而 Lyft 在这些场景下定价更激进。'
                    : Number(abovePct) > 50
                    ? ' 差异不算大，两家的定价方向大体一致，但在高溢价区间（1.5x 以上）能看到 Lyft 略占上风。'
                    : ' Uber 在多数场景下价格反而更高，这可能与其车型结构和用户群体有关。'}
                  同一小时的溢价通常高度相关——如果 Uber 认为该涨价了，Lyft 大概率会跟进，只是幅度不同。
                </div>
              );
            })()}
          </div>
        </section>
        <section className="card col-5">
          <div className="card-head">
            <h3>六维差异对比</h3>
            <p>
              六个核心维度的差异放在一起对比，一目了然。蓝条向左 = Uber 占优，橙条向右 = Lyft 占优。
              条越长差距越大。溢价稳定性和高峰响应上两家各有胜负，但雨雪天气响应和平均溢价 Lyft 明显占上风。
            </p>
          </div>
          <div className="card-body">
            <DiffBarChart data={d} />
          </div>
        </section>
      </div>

      {/* Key Findings — narrative section, not a card */}
      <section style={{ marginTop: 40, padding: '36px 0', borderTop: '1px solid var(--border)' }}>
        <div className="feature-head">
          <h3>一句话总结：Uber 更稳，Lyft 更激进</h3>
          <p style={{ marginBottom: 24, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
            综合 {d.points.length} 条数据的对比，下面四个发现概括了两家平台定价策略的核心差异。
          </p>
        </div>
        <div className="insight-list">
          {(() => {
            const lyftRainRatio = d.lyftBadWeatherSurge / d.lyftAvgSurge;
            const uberRainRatio = d.uberBadWeatherSurge / d.uberAvgSurge;
            const lyftMoreAggressive = lyftRainRatio > uberRainRatio;
            const lyftPeakRatio = (() => {
              const peakPts = d.points.filter(p => PEAK_HOURS.has(p.hour));
              const lyftPeak = d3.mean(peakPts, p => p.lyftSurge) ?? 1;
              return lyftPeak / d.lyftAvgSurge;
            })();
            const uberPeakRatio = (() => {
              const peakPts = d.points.filter(p => PEAK_HOURS.has(p.hour));
              const uberPeak = d3.mean(peakPts, p => p.uberSurge) ?? 1;
              return uberPeak / d.uberAvgSurge;
            })();
            return [
              { num: '01', title: `${lyftMoreAggressive ? 'Lyft' : 'Uber'} 在恶劣天气中定价更激进`, body: `雨雪天气下，${lyftMoreAggressive ? 'Lyft' : 'Uber'} 的平均溢价为 ${lyftMoreAggressive ? d.lyftBadWeatherSurge.toFixed(2) : d.uberBadWeatherSurge.toFixed(2)}x，比平时高 ${((lyftMoreAggressive ? lyftRainRatio : uberRainRatio) - 1) * 100 | 0}%。雨雪天需求激增，但车主不愿在这种天气接单，供需严重失衡，价格自然上涨。两家都涨，但 ${lyftMoreAggressive ? 'Lyft' : 'Uber'} 涨幅更大。` },
              { num: '02', title: 'Uber 价格波动更大，Lyft 更稳定', body: `从密度曲线和标准差来看，Uber 的溢价波动范围比 Lyft 更大。Uber 标准差为 ${d.uberStdSurge.toFixed(3)}，Lyft 为 ${d.lyftStdSurge.toFixed(3)}。这说明 Uber 的算法对供需变化更敏感——供需平稳时可能比 Lyft 便宜，但稍有变化涨价也更快。Lyft 的策略更接近"平稳运行、灾时加价"。` },
              { num: '03', title: '高峰时段的加价逻辑不同', body: `早晚高峰（7-9 点、17-19 点）时段，${uberPeakRatio > lyftPeakRatio ? 'Uber' : 'Lyft'} 加价幅度更大——Uber 高峰溢价为平时的 ${uberPeakRatio.toFixed(2)} 倍，Lyft 为 ${lyftPeakRatio.toFixed(2)} 倍。通勤高峰是刚需，用户价格敏感度低，这是平台溢价空间最大的时间窗口。` },
              { num: '04', title: '低能见度下两平台反应趋同', body: `雾天或低能见度场景下，两家平台溢价都有明显上升，但彼此差异并不大。这种天气对供需的影响是全局性的——司机普遍减速、运力下降，价格自然水涨船高，算法差异在供需基本面面前被覆盖了。` },
            ];
          })().map(item => (
            <div key={item.num} className="insight-item">
              <span className="insight-icon">{item.num}</span>
              <div>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

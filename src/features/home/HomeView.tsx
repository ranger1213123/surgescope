import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion } from 'framer-motion';
import { useNavigation, type TabId } from '../../context/NavigationContext';
import { useTimeRange } from '../../context/TimeRangeContext';
import { getWeatherLabel } from '../../utils/weatherLabels';

interface HourlyPoint {
  datetime: string;
  date: Date;
  uberSurge: number;
  lyftSurge: number;
  weather: string;
  temperature: number;
}

function loadOverviewData(): Promise<HourlyPoint[]> {
  return fetch('/data/hourly_series.json')
    .then((r) => r.json())
    .then((raw) => {
      const points: HourlyPoint[] = [];
      for (const [dt, record] of Object.entries(raw)) {
        const r = record as Record<string, any>;
        points.push({
          datetime: dt,
          date: new Date(dt),
          uberSurge: r.uber?.avg_surge ?? 1,
          lyftSurge: r.lyft?.avg_surge ?? 1,
          weather: r.weather?.short_summary ?? 'unknown',
          temperature: r.weather?.temperature ?? 0,
        });
      }
      return points.sort((a, b) => a.date.getTime() - b.date.getTime());
    });
}

function MiniTrendChart({ data, onBrush }: { data: HourlyPoint[]; onBrush?: (range: [Date, Date] | null) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container || data.length === 0) return;
    const w = container.clientWidth;
    const h = 280;
    const m = { top: 14, right: 30, bottom: 52, left: 50 };

    const x = d3.scaleTime().domain(d3.extent(data, (d) => d.date) as [Date, Date]).range([m.left, w - m.right]);
    const y = d3.scaleLinear().domain([0.95, d3.max(data, (d) => Math.max(d.uberSurge, d.lyftSurge))! * 1.05]).range([h - m.bottom, m.top]);

    d3.select(svg).attr('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = '';
    const g = d3.select(svg).append('g');

    // Grid
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${(v as number).toFixed(2)}x`).tickSize(-(w - m.left - m.right)))
      .selectAll('line').attr('stroke', 'var(--border)');
    g.selectAll('.tick text').attr('fill', 'var(--text-muted)').attr('font-size', 10);

    // Lines
    const drawLine = (key: 'uberSurge' | 'lyftSurge', color: string) => {
      const line = g.append('path').datum(data)
        .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
        .attr('d', d3.line<HourlyPoint>().x((d) => x(d.date)).y((d) => y(d[key])).curve(d3.curveMonotoneX));
      // Draw-in animation
      const el = line.node() as SVGPathElement | null;
      if (el) {
        const len = el.getTotalLength();
        line
          .attr('stroke-dasharray', `${len} ${len}`)
          .attr('stroke-dashoffset', len)
          .transition().duration(1500).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0)
          .on('end', function() { d3.select(this).attr('stroke-dasharray', null); });
      }
    };
    drawLine('uberSurge', '#3B71F3');
    drawLine('lyftSurge', '#E8613C');

    // X axis
    g.append('g').attr('transform', `translate(0,${h - m.bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%m/%d') as any))
      .selectAll('text').attr('fill', 'var(--text-muted)').attr('font-size', 10);

    // X axis label
    g.append('text').attr('x', w / 2).attr('y', h - 4)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5C564E').text('日期（2018年11月–12月）');

    // Y axis label
    g.append('text').attr('transform', 'rotate(-90)').attr('x', -(h / 2)).attr('y', 12)
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5C564E').text('动态溢价倍数');

    // Legend
    g.append('text').attr('x', w - 120).attr('y', 18).attr('fill', '#3B71F3').attr('font-size', 11).attr('font-weight', 600).text('━ Uber');
    g.append('text').attr('x', w - 64).attr('y', 18).attr('fill', '#E8613C').attr('font-size', 11).attr('font-weight', 600).text('━ Lyft');

    // Brush
    const brush = d3.brushX().extent([[m.left, m.top], [w - m.right, h - m.bottom]])
      .on('end', ({ selection }) => {
        if (onBrush) {
          onBrush(selection ? (selection as [number, number]).map((v) => x.invert(v)) as [Date, Date] : null);
        }
      });
    g.append('g').attr('class', 'brush-layer').call(brush);

    // Hover crosshair
    const hoverLine = g.append('line').attr('class', 'hover-line')
      .attr('y1', m.top).attr('y2', h - m.bottom)
      .attr('stroke', '#8E887E').attr('stroke-width', 1).attr('stroke-dasharray', '3 3').attr('hidden', true);

    const bisect = d3.bisector((d: HourlyPoint) => d.date).center;
    g.append('rect').attr('class', 'hover-overlay').attr('x', m.left).attr('width', w - m.left - m.right)
      .attr('y', m.top).attr('height', h - m.top - m.bottom)
      .attr('fill', 'none').attr('pointer-events', 'all')
      .on('pointermove', (event) => {
        const [mx] = d3.pointer(event);
        const idx = bisect(data, x.invert(mx));
        const point = data[idx];
        if (!point) return;
        hoverLine.attr('hidden', null).attr('x1', x(point.date)).attr('x2', x(point.date));
        const el = tooltipRef.current;
        if (!el) return;
        el.hidden = false;
        el.style.left = `${Math.min(event.offsetX + 14, w - 220)}px`;
        el.style.top = `${Math.max(4, event.offsetY - 38)}px`;
        el.innerHTML = `<strong>${point.datetime}</strong><br>天气：${getWeatherLabel(point.weather)}<br>温度：${point.temperature.toFixed(1)}°F<br>Uber 溢价：${point.uberSurge.toFixed(3)}x<br>Lyft 溢价：${point.lyftSurge.toFixed(3)}x`;
      })
      .on('pointerleave', () => { hoverLine.attr('hidden', true); if (tooltipRef.current) tooltipRef.current.hidden = true; });
  }, [data, onBrush]);

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} />
      <div ref={tooltipRef} hidden style={{
        position: 'absolute', zIndex: 999, pointerEvents: 'none',
        background: 'rgba(255,255,255,0.95)', color: '#2D2A26',
        padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.7,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)', maxWidth: 220,
      }} />
    </div>
  );
}

function WeatherDonut({ data }: { data: HourlyPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const { items, colors } = useMemo(() => {
    const counts = d3.rollup(data, (v) => v.length, (d) => d.weather);
    const sorted = Array.from(counts, ([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value);
    const c = d3.scaleOrdinal(d3.schemeSet2).domain(sorted.map((d) => d.label));
    return { items: sorted, colors: c };
  }, [data]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const w = 200, h = 200, r = 80;
    d3.select(svg).attr('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = '';

    const pie = d3.pie<{ label: string; value: number }>().value((d) => d.value);
    const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number }>>().innerRadius(48).outerRadius(r);
    const g = d3.select(svg).append('g').attr('transform', `translate(${w / 2},${h / 2})`);

    g.selectAll('path').data(pie(items)).join('path')
      .attr('d', arc).attr('fill', (d) => colors(d.data.label)).attr('stroke', '#fff').attr('stroke-width', 1.5);

    g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.3em')
      .attr('font-size', 22).attr('font-weight', 800).attr('fill', 'var(--text-primary)')
      .text(`${items.length}`);
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1em')
      .attr('font-size', 11).attr('fill', 'var(--text-muted)').text('天气类型');
  }, [items, colors]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg ref={svgRef} style={{ width: 200, height: 200 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center', maxWidth: 320 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: colors(item.label), display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: '#5C564E' }}>{getWeatherLabel(item.label)}</span>
            <span style={{ color: '#8E887E', fontSize: 11 }}>{item.value}h</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarHeatmap({ data }: { data: HourlyPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const months = useMemo(() => {
    const byDay = new Map<string, { uberAvg: number; lyftAvg: number; weather: string }>();
    const groups = d3.group(data, p => d3.timeFormat('%Y-%m-%d')(p.date));
    for (const [key, v] of groups) {
      // Most frequent weather
      const weatherCounts = d3.rollup(v, g => g.length, p => p.weather);
      const topWeather = [...weatherCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
      byDay.set(key, {
        uberAvg: d3.mean(v, p => p.uberSurge) ?? 1,
        lyftAvg: d3.mean(v, p => p.lyftSurge) ?? 1,
        weather: topWeather,
      });
    }

    const result: { month: string; days: { date: Date; label: string; uber: number; lyft: number; weather: string }[] }[] = [];

    for (const monthStart of [new Date(2018, 10, 1), new Date(2018, 11, 1)]) {
      const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      const days = [];
      // Pad to start on correct weekday
      const startDay = monthStart.getDay();
      for (let i = 0; i < startDay; i++) {
        days.push({ date: new Date(0), label: '', uber: 0, lyft: 0, weather: '' });
      }
      for (let d = 1; d <= end.getDate(); d++) {
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
        const key = d3.timeFormat('%Y-%m-%d')(date);
        const info = byDay.get(key);
        days.push({
          date,
          label: d.toString(),
          uber: info?.uberAvg ?? 0,
          lyft: info?.lyftAvg ?? 0,
          weather: info?.weather ?? '',
        });
      }
      result.push({
        month: d3.timeFormat('%Y年%-m月')(monthStart),
        days,
      });
    }
    return result;
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cw = container.clientWidth;
    const weeks = 7;
    const cols = 7;
    const monthGap = Math.max(28, Math.floor(cw * 0.05));
    const mTop = 44;
    const mBottom = 56;
    const mLeft = 36;
    // Responsive cell size — cap max width so calendar doesn't spread too thin
    const panelW = Math.min((cw - monthGap) / 2, 420);
    const avCell = (panelW - mLeft * 2) / cols;
    const cellSize = Math.max(14, Math.min(24, Math.floor(avCell - 2)));
    const cellGap = Math.max(2, Math.floor(cellSize / 6));
    const gridW = cols * (cellSize + cellGap) - cellGap;
    const gridH = weeks * (cellSize + cellGap) - cellGap;
    const actualPanelW = gridW + mLeft * 2;
    const totalW = actualPanelW * 2 + monthGap;
    const h = Math.max(320, mTop + gridH + mBottom);
    // Center the two months symmetrically on the page axis
    const centerOffset = Math.max(0, (cw - totalW) / 2);

    const svg = d3.select(container).select<SVGSVGElement>('svg');
    svg.attr('viewBox', `0 0 ${Math.max(cw, totalW)} ${h}`);
    svg.selectAll('*').remove();

    const allVals = months.flatMap(m => m.days.filter(d => d.uber > 0).flatMap(d => [d.uber, d.lyft]));
    const minV = d3.min(allVals) ?? 1;
    const maxV = d3.max(allVals) ?? 2;
    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([minV, maxV]);

    // Use the color scale for legend stops so colors match the cells exactly
    const legendMinColor = colorScale(minV);
    const legendMaxColor = colorScale(maxV);

    const tooltip = d3.select(tooltipRef.current!);

    months.forEach((month, mi) => {
      const panelX = centerOffset + mi * (actualPanelW + monthGap);
      const g = svg.append('g').attr('transform', `translate(${panelX + mLeft},${mTop})`);

      // Day-of-week headers
      const dowLabels = ['日', '一', '二', '三', '四', '五', '六'];
      dowLabels.forEach((label, i) => {
        g.append('text')
          .attr('x', i * (cellSize + cellGap) + cellSize / 2).attr('y', -8)
          .attr('text-anchor', 'middle').attr('fill', '#8E887E').attr('font-size', 10)
          .text(label);
      });

      month.days.forEach((day, idx) => {
        if (day.uber === 0 && day.lyft === 0) return; // padding

        const row = Math.floor(idx / 7);
        const col = idx % 7;
        const x = col * (cellSize + cellGap);
        const y = row * (cellSize + cellGap);

        const uberFill = colorScale(day.uber);
        const lyftFill = colorScale(day.lyft);

        // Uber (top half)
        g.append('rect')
          .attr('x', x).attr('y', y).attr('width', cellSize).attr('height', cellSize / 2 - 1)
          .attr('rx', 2).attr('fill', uberFill)
          .on('mouseenter', e => {
            tooltip.style('left', `${e.offsetX + 14}px`).style('top', `${e.offsetY - 8}px`).attr('hidden', null);
            tooltip.html(`<strong>${d3.timeFormat('%m/%d')(day.date)}</strong> · ${getWeatherLabel(day.weather)}<br>Uber 溢价：${day.uber.toFixed(3)}x<br>Lyft 溢价：${day.lyft.toFixed(3)}x`);
          })
          .on('mousemove', e => tooltip.style('left', `${e.offsetX + 14}px`).style('top', `${e.offsetY - 8}px`))
          .on('mouseleave', () => tooltip.attr('hidden', true));

        // Lyft (bottom half)
        g.append('rect')
          .attr('x', x).attr('y', y + cellSize / 2 + 1).attr('width', cellSize).attr('height', cellSize / 2 - 1)
          .attr('rx', 2).attr('fill', lyftFill)
          .on('mouseenter', e => {
            tooltip.style('left', `${e.offsetX + 14}px`).style('top', `${e.offsetY - 8}px`).attr('hidden', null);
            tooltip.html(`<strong>${d3.timeFormat('%m/%d')(day.date)}</strong> · ${getWeatherLabel(day.weather)}<br>Uber 溢价：${day.uber.toFixed(3)}x<br>Lyft 溢价：${day.lyft.toFixed(3)}x`);
          })
          .on('mousemove', e => tooltip.style('left', `${e.offsetX + 14}px`).style('top', `${e.offsetY - 8}px`))
          .on('mouseleave', () => tooltip.attr('hidden', true));

        // Day label
        g.append('text')
          .attr('x', x + cellSize / 2).attr('y', y + cellSize / 2)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
          .attr('fill', day.uber > 1.5 ? '#fff' : '#2D2A26').attr('font-size', 9).attr('font-weight', 600)
          .text(day.label);
      });

      // Month title — positioned above the grid with clear separation
      svg.append('text')
        .attr('x', panelX + mLeft + gridW / 2).attr('y', mTop - 16)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'auto')
        .attr('fill', '#5C564E').attr('font-size', 14).attr('font-weight', 700)
        .text(month.month);
    });

    // Legend
    const legCenterX = centerOffset + totalW / 2;
    const legX = legCenterX - 80;
    const legY = h - 10;
    const legW = 160;
    const legH = 10;
    const defs = svg.append('defs');
    const lg = defs.append('linearGradient').attr('id', 'cal-leg');
    lg.append('stop').attr('offset', '0%').attr('stop-color', legendMinColor);
    lg.append('stop').attr('offset', '100%').attr('stop-color', legendMaxColor);
    svg.append('rect').attr('x', legX).attr('y', legY).attr('width', legW).attr('height', legH).attr('rx', 3).attr('fill', 'url(#cal-leg)');
    svg.append('text').attr('x', legX - 4).attr('y', legY + legH / 2)
      .attr('text-anchor', 'end').attr('dominant-baseline', 'middle').attr('fill', '#8E887E').attr('font-size', 9).text(`${minV.toFixed(2)}x`);
    svg.append('text').attr('x', legX + legW + 4).attr('y', legY + legH / 2)
      .attr('dominant-baseline', 'middle').attr('fill', '#8E887E').attr('font-size', 9).text(`${maxV.toFixed(2)}x`);
    svg.append('text').attr('x', legCenterX).attr('y', legY - 6)
      .attr('text-anchor', 'middle').attr('fill', '#5C564E').attr('font-size', 10)
      .text('上半 Uber / 下半 Lyft · 颜色 = 日均溢价');
  }, [data, months]);

  return (
    <section style={{ marginTop: 16 }}>
      <div className="feature-head" style={{ marginBottom: 12 }}>
        <h3>日历热力图 · 日均溢价</h3>
        <p>
          11 月和 12 月每一天的平均溢价用颜色深浅来表示，格子越红意味着那天溢价越高。
          每个格子上下两半分别是 Uber（上半）和 Lyft（下半），方便快速对比。悬停可以看到具体数值。
          可以明显看到 12 月中旬有一片深红色区域——那正是暴风雪袭击波士顿的日子。
        </p>
      </div>
      <div ref={containerRef} style={{ width: '100%', position: 'relative', overflowX: 'auto' }}>
        <svg style={{ width: '100%', height: 'auto' }} role="img" aria-label="日历热力图" />
        <div ref={tooltipRef} hidden style={{
          position: 'absolute', zIndex: 999, pointerEvents: 'none',
          background: 'rgba(255,255,255,0.95)', color: '#2D2A26',
          padding: '8px 12px', borderRadius: 8, fontSize: 11, lineHeight: 1.6,
          boxShadow: '0 3px 12px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)', maxWidth: 200,
        }} />
      </div>
    </section>
  );
}

export function HomeView() {
  const { navigateTo } = useNavigation();
  const { setTimeRange } = useTimeRange();
  const [data, setData] = useState<HourlyPoint[] | null>(null);
  const [brushRange, setBrushRange] = useState<[Date, Date] | null>(null);

  useEffect(() => {
    loadOverviewData().then(setData);
  }, []);

  const handleBrush = useCallback((range: [Date, Date] | null) => {
    setBrushRange(range);
    setTimeRange(range);
  }, [setTimeRange]);

  const brushInfo = useMemo(() => {
    if (!brushRange) return null;
    const fmt = d3.timeFormat('%m/%d %H:00');
    return `${fmt(brushRange[0])} – ${fmt(brushRange[1])}`;
  }, [brushRange]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const uberPeak = d3.max(data, (d) => d.uberSurge) ?? 1;
    const lyftPeak = d3.max(data, (d) => d.lyftSurge) ?? 1;
    const uberAvg = d3.mean(data, (d) => d.uberSurge) ?? 1;
    const lyftAvg = d3.mean(data, (d) => d.lyftSurge) ?? 1;
    const snowData = data.filter((d) => d.weather === 'snow');
    const snowUber = snowData.length ? d3.mean(snowData, (d) => d.uberSurge)! : 0;
    const snowLyft = snowData.length ? d3.mean(snowData, (d) => d.lyftSurge)! : 0;
    return {
      total: data.length,
      uberPeak: uberPeak.toFixed(2),
      lyftPeak: lyftPeak.toFixed(2),
      uberAvg: uberAvg.toFixed(2),
      lyftAvg: lyftAvg.toFixed(2),
      snowUber: snowUber.toFixed(2),
      snowLyft: snowLyft.toFixed(2),
      lyftSnowPremium: ((snowLyft - snowUber) / snowUber * 100).toFixed(1),
    };
  }, [data]);

  if (!data) {
    return <div className="loading-state"><div className="spinner" /><span>加载数据中…</span></div>;
  }

  return (
    <div>
      {/* Hero — not a card, just a clean header */}
      <header className="hero-section">
        <p className="hero-eyebrow">总览面板</p>
        <h2>波士顿网约车动态溢价总览</h2>
        <p className="hero-subtitle">
          2018 年 11 月到 12 月，波士顿进入冬季，共有 {data.length} 个小时级数据点，覆盖了从晴天到暴雪的 10 种天气。
          这段时间里，Uber 和 Lyft 的定价算法一直在根据供需变化实时调整——尤其是在雨雪天，溢价可以飙到平时的两三倍。
        </p>
      </header>

      {/* Stat Ribbon — data strip, not cards */}
      <div className="stat-ribbon">
        <div className="stat-cell">
          <span className="stat-value">{kpis?.total ?? 0}</span>
          <span className="stat-label">小时级数据点</span>
          <span className="stat-detail">2018.11.01 – 12.31</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value">{kpis?.lyftPeak ?? '-'}x</span>
          <span className="stat-label">暴雪峰值溢价 (Lyft)</span>
          <span className="stat-detail">Uber 同期峰值 {kpis?.uberPeak ?? '-'}x</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value stat-highlight">+{kpis?.lyftSnowPremium ?? '-'}%</span>
          <span className="stat-label">暴雪天 Lyft 比 Uber 贵</span>
          <span className="stat-detail">极端天气下 Lyft 加价更猛</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value">{kpis?.uberAvg ?? '-'}x</span>
          <span className="stat-label">Uber 全时段均价</span>
          <span className="stat-detail">Lyft {kpis?.lyftAvg ?? '-'}x，整体接近</span>
        </div>
      </div>

      {/* Full-width trend — NOT a card, just a section with a clean header */}
      <section className="feature-block">
        <div className="feature-head">
          <h3>全时段溢价走势</h3>
          <p>
            下面这张图是这两个月里 Uber（蓝线）和 Lyft（橙线）溢价倍数的完整轨迹。
            可以看到，大多数时间溢价在 1.0x–1.2x 之间波动，但 12 月中旬出现了一个非常明显的尖峰——那几天波士顿遭遇了暴风雪。
            拖拽图表下方的滑块可以框选任意时间段，选中后会联动到「天气溢价」分析页面。
            {brushInfo && <strong style={{ color: 'var(--accent)' }}> 当前已框选：{brushInfo}</strong>}
          </p>
        </div>
        <MiniTrendChart data={data} onBrush={handleBrush} />
      </section>

      {/* Bento Grid: calendar + weather sidebar */}
      <div className="bento-grid">
        {/* Calendar — stripped of card wrapper, clean section */}
        {data && (
          <div className="col-8" style={{ minWidth: 0 }}>
            <CalendarHeatmap data={data} />
          </div>
        )}

        <div className="card col-4">
          <div className="card-head">
            <h3>天气类型分布</h3>
            <p>这两个月里波士顿的天气构成。阴天和多云占了大多数，但也有几次明显的雨雪过程。</p>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <WeatherDonut data={data} />
            {(() => {
              const top2 = d3.rollup(data, v => v.length, d => d.weather);
              const sorted = [...top2.entries()].sort((a, b) => b[1] - a[1]);
              const totalH = data.length;
              const snowH = sorted.find(([k]) => k === 'snow')?.[1] ?? 0;
              const rainH = sorted.filter(([k]) => k.includes('rain')).reduce((s, [, v]) => s + v, 0);
              return (
                <div className="card-insight">
                  <strong>怎么看这张图：</strong>
                  最常见的天气是<strong>{getWeatherLabel(sorted[0]?.[0] ?? '')}</strong>（{((sorted[0]?.[1] ?? 0) / totalH * 100).toFixed(0)}%），
                  但真正影响溢价的是那 <strong>{rainH + snowH}</strong> 小时（{((rainH + snowH) / totalH * 100).toFixed(0)}%）的雨雪天——
                  它们虽然占比不高，却贡献了绝大多数的高溢价时段。
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Narrative analysis — not a card, just well-formatted text */}
      {(() => {
        const decPts = data.filter(p => p.date.getMonth() === 11);
        const novPts = data.filter(p => p.date.getMonth() === 10);
        const decUber = d3.mean(decPts, p => p.uberSurge) ?? 1;
        const novUber = d3.mean(novPts, p => p.uberSurge) ?? 1;
        const decLyft = d3.mean(decPts, p => p.lyftSurge) ?? 1;
        const novLyft = d3.mean(novPts, p => p.lyftSurge) ?? 1;
        const snowPts = data.filter(p => p.weather === 'snow');
        const snowUberPeak = snowPts.length ? d3.max(snowPts, p => p.uberSurge) ?? 1 : 1;
        const snowLyftPeak = snowPts.length ? d3.max(snowPts, p => p.lyftSurge) ?? 1 : 1;
        const lyftAbovePct = ((data.filter(p => p.lyftSurge > p.uberSurge).length / data.length) * 100).toFixed(0);
        return (
          <section style={{ marginTop: 28, padding: '36px 0', borderTop: '1px solid var(--border)' }}>
            <div className="feature-head">
              <h3>两个月的故事：平时差不多，暴雪见真章</h3>
              <p style={{ marginBottom: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                分析这 1,464 个小时的数据之后，最核心的发现其实很简单——
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>晴天时两家差不多</h4>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
                  在天气正常的日子里，Uber 和 Lyft 的溢价几乎不相上下。11 月 Uber 平均 {novUber.toFixed(2)}x、Lyft {novLyft.toFixed(2)}x；
                  约 <strong>{lyftAbovePct}%</strong> 的小时里 Lyft 略贵一些，但差距通常只有几个百分点。
                  这个阶段的定价更多受早晚高峰和区域供需影响，而不是天气。
                </p>
              </div>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>暴雪一来差距就拉开了</h4>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
                  12 月进入雪季后，两边的平均溢价都上去了——Uber {decUber.toFixed(2)}x、Lyft {decLyft.toFixed(2)}x。
                  真正拉开差距的是暴雪天：Lyft 峰值冲到 <strong>{snowLyftPeak.toFixed(2)}x</strong>，Uber 峰值 {snowUberPeak.toFixed(2)}x，
                  Lyft 在极端天气时比 Uber 贵了大约 <strong>{kpis?.lyftSnowPremium ?? '?'}%</strong>。
                  这说明 Lyft 的动态定价算法对天气信号更敏感，或者说 Lyft 在恶劣天气时更愿意让价格飞涨来调节供需。
                </p>
              </div>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>溢价的传导需要一两个小时</h4>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
                  从数据的时间序列来看，天气突变（比如突然下大雨或下雪）后，溢价并不会立刻跳升。
                  通常有 1–2 小时的滞后——先是订单量激增，车主供给跟不上，然后算法才逐步抬价。
                  这个滞后窗口在不同平台之间有微妙差异，详情可以看「天气溢价」页的时间河流图和事件对齐曲线。
                </p>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Quick Navigation — asymmetric grid, still with cards but more descriptive */}
      <div className="quick-nav-grid">
        {[
          { tab: 'compare' as TabId, title: '平台对比', desc: '把 Uber 和 Lyft 放在一起比：谁更贵？贵多少？什么时候贵？密度曲线、热力矩阵、六维差异图。', action: '进入 →', icon: '⚖' },
          { tab: 'weather' as TabId, title: '天气溢价', desc: '时间河流图、散点矩阵、事件对齐曲线——看一场暴风雪前后，Uber 和 Lyft 的价格是怎么一步步涨上去的。', action: '进入 →', icon: '🌦' },
          { tab: 'flow' as TabId, title: '流向与车型', desc: '弦图和飞线地图看波士顿 12 个区域之间的 OD 流量，车型分布看 UberX 到 Black SUV 各自占多少。', action: '进入 →', icon: '🗺' },
        ].map((item, i) => (
          <motion.button
            key={item.tab}
            className="quick-nav-card"
            onClick={() => navigateTo(item.tab)}
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 + i * 0.1, duration: 0.4 }}
          >
            <span className="quick-nav-icon">{item.icon}</span>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
            <motion.span
              className="quick-nav-action"
              whileHover={{ x: 4 }}
            >
              {item.action}
            </motion.span>
          </motion.button>
        ))}
      </div>

      <footer style={{ textAlign: 'center', marginTop: 48, padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
        <p>React · TypeScript · D3.js · Leaflet · Framer Motion</p>
      </footer>
    </div>
  );
}

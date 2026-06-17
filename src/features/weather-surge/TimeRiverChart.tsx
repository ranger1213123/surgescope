import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import type { HourlyRecord } from '../../types';
import { getWeatherLabel } from '../../utils/weatherLabels';

type Props = {
  data: HourlyRecord[];
  selectedRange: [Date, Date] | [];
  onBrushChange: (range: [Date, Date] | []) => void;
};

const HEIGHT = 500;
const MAX_SURGE_MARKERS = 160;
const PLATFORM_STYLE: Record<string, { label: string; color: string }> = {
  uber: { label: 'Uber', color: '#3B71F3' },
  lyft: { label: 'Lyft', color: '#E8613C' },
};

function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const step = items.length / limit;
  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * step)]);
}

type DrawableItem = HourlyRecord & { isGap?: boolean };

function addGapBreaks(items: HourlyRecord[]): DrawableItem[] {
  const result: DrawableItem[] = [];
  for (const item of items) {
    const prev = result[result.length - 1] as HourlyRecord | undefined;
    if (prev && item.date.getTime() - prev.date.getTime() > 90 * 60 * 1000) {
      result.push({ date: new Date((prev.date.getTime() + item.date.getTime()) / 2), isGap: true } as DrawableItem);
    }
    result.push(item);
  }
  return result;
}

export function TimeRiverChart({ data, selectedRange, onBrushChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const brushRef = useRef<d3.BrushBehavior<unknown> | null>(null);
  const xScaleRef = useRef<d3.ScaleTime<number, number> | null>(null);
  const suppressRef = useRef(false);
  const onBrushChangeRef = useRef(onBrushChange);
  onBrushChangeRef.current = onBrushChange;

  const render = useCallback(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl || data.length === 0) return;

    const width = Math.max(container.clientWidth, 720);
    const margin = { top: 34, right: 26, bottom: 66, left: 58 };
    const innerWidth = width - margin.left - margin.right;

    const svg = d3.select(svgEl).attr('viewBox', `0 0 ${width} ${HEIGHT}`);
    svg.selectAll('*').remove();
    const root = svg.append('g').attr('class', 'chart-root').attr('transform', `translate(${margin.left},0)`);

    const extent = d3.extent(data, (d) => d.date) as [Date, Date];
    const xScale = d3.scaleTime<number, number>().domain(extent).range([0, innerWidth]);
    xScaleRef.current = xScale;

    const precipScale = d3.scaleLinear().domain([0, d3.max(data, (d) => d.precipIntensity) || 0.1]).range([0, 34]);
    const tempExtent = d3.extent(data, (d) => d.temperature) as [number, number];
    const tempScale = d3.scaleLinear().domain(tempExtent).range([0, 34]);
    const visScale = d3.scaleLinear().domain(d3.extent(data, (d) => d.visibility) as [number, number]).range([34, 0]);
    const surgeMax = Math.max(1.12, d3.max(data, (d) => Math.max(d.uber?.avg_surge ?? 1, d.lyft?.avg_surge ?? 1)) ?? 1.12);
    const surgeScale = d3.scaleLinear().domain([1, surgeMax]).nice().range([370, 230]);

    // Temperature gradient
    svg.append('defs').append('linearGradient').attr('id', 'temp-grad')
      .selectAll('stop').data([{ o: '0%', c: '#ef4444' }, { o: '50%', c: '#e2e8f0' }, { o: '100%', c: '#2563eb' }])
      .join('stop').attr('offset', (d) => d.o).attr('stop-color', (d) => d.c);

    const ribbonSpecs = [
      { id: 'precip', label: '降水强度', baseline: 76, color: '#5BA4CF', value: (d: HourlyRecord) => precipScale(d.precipIntensity) },
      { id: 'temperature', label: '温度', baseline: 124, color: 'url(#temp-grad)', value: (d: HourlyRecord) => tempScale(d.temperature) },
      { id: 'visibility', label: '低能见度', baseline: 172, color: '#B0A99E', value: (d: HourlyRecord) => visScale(d.visibility) },
    ];

    const weatherLayer = root.append('g').attr('class', 'weather-layer');
    const drawableData = addGapBreaks(data);

    weatherLayer.selectAll('.ribbon-guide').data(ribbonSpecs).join('line')
      .attr('x1', 0).attr('x2', innerWidth)
      .attr('y1', (d) => d.baseline).attr('y2', (d) => d.baseline)
      .attr('stroke', 'rgba(0,0,0,0.06)').attr('stroke-width', 0.5);

    weatherLayer.selectAll<SVGPathElement, typeof ribbonSpecs[0]>('.weather-ribbon').data(ribbonSpecs, (d) => d.id).join('path')
      .attr('fill', (d) => d.color)
      .attr('d', (spec) => d3.area<DrawableItem>()
        .defined((d) => !d.isGap)
        .x((d) => xScale(d.date))
        .y0(spec.baseline)
        .y1((d) => spec.baseline - spec.value(d as HourlyRecord))
        .curve(d3.curveMonotoneX)(drawableData) ?? '');

    weatherLayer.selectAll('.ribbon-label').data(ribbonSpecs).join('text')
      .attr('x', -8).attr('y', (d) => d.baseline - 11)
      .attr('text-anchor', 'end').attr('font-size', 11).attr('fill', '#8E887E')
      .text((d) => d.label);

    const platforms = Object.keys(PLATFORM_STYLE);
    const surgeLayer = root.append('g').attr('class', 'surge-layer');

    surgeLayer.selectAll('.surge-line').data(platforms).join('path')
      .attr('fill', 'none')
      .attr('stroke', (p) => PLATFORM_STYLE[p].color).attr('stroke-width', 2)
      .attr('d', (p) => d3.line<DrawableItem>()
        .defined((d) => !d.isGap && !!(d as HourlyRecord)[p as keyof Pick<HourlyRecord, 'uber' | 'lyft'>])
        .x((d) => xScale(d.date))
        .y((d) => surgeScale(((d as HourlyRecord)[p as keyof Pick<HourlyRecord, 'uber' | 'lyft'>] as NonNullable<HourlyRecord['uber']>).avg_surge))
        .curve(d3.curveMonotoneX)(drawableData) ?? '')
      .each(function() {
        const el = this as SVGPathElement;
        const len = el.getTotalLength();
        d3.select(el)
          .attr('stroke-dasharray', `${len} ${len}`)
          .attr('stroke-dashoffset', len)
          .transition().duration(1200).ease(d3.easeCubicInOut)
          .attr('stroke-dashoffset', 0)
          .on('end', function() { d3.select(this).attr('stroke-dasharray', null); });
      });

    const markers: Array<HourlyRecord & { platform: string }> = platforms.flatMap((p) =>
      sampleEvenly(
        data.filter((d) => ((d[p as keyof Pick<HourlyRecord, 'uber' | 'lyft'>] as HourlyRecord['uber'])?.avg_surge ?? 1) > 1)
          .map((d) => ({ ...d, platform: p })),
        MAX_SURGE_MARKERS
      )
    );

    surgeLayer.selectAll<SVGPathElement, typeof markers[0]>('.surge-marker').data(markers, (d) => `${d.platform}-${d.datetime}`).join('path')
      .attr('fill', (d) => PLATFORM_STYLE[d.platform].color)
      .attr('transform', (d) => {
        const cab = d[d.platform as keyof Pick<HourlyRecord, 'uber' | 'lyft'>] as HourlyRecord['uber'];
        const size = Math.min(80, 28 + Math.sqrt(cab?.order_count ?? 0) * 1.8);
        return `translate(${xScale(d.date)},${surgeScale(cab?.avg_surge ?? 1)}) scale(${Math.sqrt(size) / 7})`;
      })
      .attr('d', d3.symbol(d3.symbolTriangle, 48) as unknown as string);

    root.append('g').attr('class', 'surge-axis').attr('transform', 'translate(0,0)')
      .call(d3.axisLeft(surgeScale).ticks(4).tickFormat((v) => `${(v as number).toFixed(2)}x`));

    root.append('g').attr('class', 'time-axis').attr('transform', 'translate(0,382)')
      .call(d3.axisBottom(xScale).ticks(Math.min(8, data.length)).tickFormat(d3.timeFormat('%m/%d %Hh') as (v: Date | { valueOf(): number }) => string));

    root.selectAll('.panel-title').data([{ x: 0, y: 22, l: '气象带' }, { x: 0, y: 214, l: '平台平均溢价' }]).join('text')
      .attr('x', (d) => d.x).attr('y', (d) => d.y).attr('font-size', 11).attr('fill', '#5C564E').attr('font-weight', 600).text((d) => d.l);

    root.selectAll('.legend-item').data(platforms).join('text')
      .attr('x', (_, i) => innerWidth - 126 + i * 66).attr('y', 22)
      .attr('fill', (p) => PLATFORM_STYLE[p].color).attr('font-size', 11)
      .text((p) => `━ ${PLATFORM_STYLE[p].label}`);

    // Hover
    const hoverLayer = root.append('g').attr('class', 'hover-layer');
    const hoverLine = hoverLayer.append('line').attr('class', 'hover-line').attr('y1', 36).attr('y2', 382)
      .attr('stroke', '#8E887E').attr('stroke-width', 1).attr('stroke-dasharray', '3 3').attr('hidden', true);

    const bisect = d3.bisector((d: HourlyRecord) => d.date).center;
    hoverLayer.append('rect').attr('class', 'hover-overlay').attr('width', innerWidth).attr('height', 346).attr('y', 36)
      .attr('fill', 'none').attr('pointer-events', 'all')
      .on('pointermove', (event) => {
        const [mx] = d3.pointer(event);
        const idx = bisect(data, xScale.invert(mx));
        const point = data[idx];
        if (!point) return;
        hoverLine.attr('hidden', null).attr('x1', xScale(point.date)).attr('x2', xScale(point.date));
        const el = tooltipRef.current;
        if (!el) return;
        el.hidden = false;
        el.style.left = `${Math.min(event.offsetX + 16, width - 246)}px`;
        el.style.top = `${Math.max(10, event.offsetY - 42)}px`;
        el.innerHTML = `<strong>${point.datetime}</strong><br>天气：${getWeatherLabel(point.shortSummary)}<br>降水：${point.precipIntensity.toFixed(3)} in/h<br>温度：${point.temperature.toFixed(1)}°F · 能见度：${point.visibility.toFixed(1)} mi<br>Uber：${(point.uber?.avg_surge ?? 1).toFixed(2)}x · ${point.uber?.order_count ?? 0} 条<br>Lyft：${(point.lyft?.avg_surge ?? 1).toFixed(2)}x · ${point.lyft?.order_count ?? 0} 条`;
      })
      .on('pointerleave', () => { hoverLine.attr('hidden', true); if (tooltipRef.current) tooltipRef.current.hidden = true; });

    // Brush
    const brush = d3.brushX().extent([[0, 418], [innerWidth, 448]])
      .on('end', ({ selection }) => {
        if (suppressRef.current) return;
        onBrushChangeRef.current(selection ? (selection as [number, number]).map((v) => xScale.invert(v)) as [Date, Date] : []);
      });
    brushRef.current = brush;

    const brushG = root.append('g').attr('class', 'brush-layer').call(brush);
    root.append('text').attr('class', 'brush-label').attr('x', 0).attr('y', 410)
      .attr('font-size', 10).attr('fill', '#5C564E')
      .text('刷选时间范围：拖拽框选联动窗口，单击空白处清除');
  }, [data]);

  // Full re-render only when data changes
  useEffect(() => {
    const obs = new ResizeObserver(() => requestAnimationFrame(render));
    if (containerRef.current) obs.observe(containerRef.current);
    requestAnimationFrame(render);
    return () => obs.disconnect();
  }, [render]);

  // Lightweight brush sync — does not re-render the chart
  useEffect(() => {
    const brushG = d3.select(svgRef.current).select<SVGGElement>('.brush-layer');
    const brush = brushRef.current;
    const xScale = xScaleRef.current;
    if (brushG.empty() || !brush || !xScale) return;
    suppressRef.current = true;
    if (selectedRange.length === 2) {
      brushG.call(brush.move, selectedRange.map((d) => xScale(d)) as [number, number]);
    } else {
      brushG.call(brush.clear);
    }
    suppressRef.current = false;
  }, [selectedRange]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} role="img" aria-label="天气与溢价时间河流图" />
      <div ref={tooltipRef} hidden style={{
        position: 'absolute', zIndex: 999, pointerEvents: 'none',
        background: 'rgba(255,255,255,0.95)', color: '#2D2A26', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)',
        padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.7,
        backdropFilter: 'blur(8px)', maxWidth: 240,
      }} />
    </div>
  );
}

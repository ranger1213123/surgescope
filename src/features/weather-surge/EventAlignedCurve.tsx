import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import type { EventCurvePoint } from '../../types';

const LABELS: Record<string, string> = {
  rain: '降雨事件', snow: '降雪事件',
  low_visibility: '低能见度事件', temperature_shift: '温度突变事件',
};
const TYPE_ORDER = ['rain', 'snow', 'low_visibility', 'temperature_shift'];
const PLATFORM_STYLE: Record<string, { label: string; color: string }> = {
  uber: { label: 'Uber', color: '#3B71F3' },
  lyft: { label: 'Lyft', color: '#E8613C' },
};

export function EventAlignedCurve({ data }: { data: EventCurvePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const render = useCallback(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl || data.length === 0) return;

    const width = Math.max(container.clientWidth, 720);
    const types = [...new Set(data.map((d) => d.eventType))].sort((a, b) => {
      const ai = TYPE_ORDER.includes(a) ? TYPE_ORDER.indexOf(a) : TYPE_ORDER.length;
      const bi = TYPE_ORDER.includes(b) ? TYPE_ORDER.indexOf(b) : TYPE_ORDER.length;
      return ai - bi || a.localeCompare(b);
    });
    const cols = Math.max(1, Math.min(types.length, 3));
    const rows = Math.ceil(types.length / cols);
    const panelGap = 22;
    const panelH = 320;
    const panelW = (width - panelGap * (cols - 1)) / cols;
    const height = rows * panelH;
    const margin = { top: 42, right: 16, bottom: 52, left: 50 };
    const innerH = panelH - margin.top - margin.bottom;
    const yMax = Math.max(1.1, d3.max(data, (d) => d.upper ?? d.mean) ?? 1.1);

    const svg = d3.select(svgEl).attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();

    const panels = svg.selectAll('.event-panel').data(types).join('g')
      .attr('class', 'event-panel')
      .attr('transform', (_, i) => `translate(${(i % cols) * (panelW + panelGap)},${Math.floor(i / cols) * panelH})`);

    panels.each(function (eventType) {
      const panel = d3.select(this);
      const iw = panelW - margin.left - margin.right;
      const xScale = d3.scaleLinear().domain([-3, 3]).range([margin.left, margin.left + iw]);
      const yScale = d3.scaleLinear().domain([1, yMax]).nice().range([margin.top + innerH, margin.top]);
      const panelData = data.filter((d) => d.eventType === eventType);
      const platforms = Object.keys(PLATFORM_STYLE);

      // Title
      panel.append('text').attr('class', 'event-title').attr('x', margin.left).attr('y', 22)
        .attr('font-size', 14).attr('font-weight', 700).attr('fill', '#2D2A26')
        .text(LABELS[eventType] ?? eventType);

      // Zero line (t=0 → event moment)
      panel.append('line').attr('class', 'event-zero-line')
        .attr('x1', xScale(0)).attr('x2', xScale(0))
        .attr('y1', margin.top).attr('y2', margin.top + innerH)
        .attr('stroke', 'rgba(0,0,0,0.18)').attr('stroke-dasharray', '4 3');

      // "事件时刻" label at t=0
      panel.append('text').attr('x', xScale(0) + 4).attr('y', margin.top + innerH - 4)
        .attr('font-size', 9).attr('fill', '#E8613C').attr('font-weight', 600)
        .text('← 事件时刻');

      // X axis
      panel.append('g').attr('class', 'event-x-axis').attr('transform', `translate(0,${margin.top + innerH})`)
        .call(d3.axisBottom(xScale).ticks(7).tickFormat((h) => `${Number(h) > 0 ? '+' : ''}${h}h`));

      // X axis label
      panel.append('text').attr('x', margin.left + iw / 2).attr('y', margin.top + innerH + 34)
        .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#5C564E')
        .text('相对事件时间（负值 = 事件前，正值 = 事件后）');

      // Y axis
      panel.append('g').attr('class', 'event-y-axis').attr('transform', `translate(${margin.left},0)`)
        .call(d3.axisLeft(yScale).ticks(4).tickFormat((v) => `${(v as number).toFixed(2)}x`));

      // Y axis label
      panel.append('text').attr('transform', 'rotate(-90)').attr('x', -(margin.top + innerH / 2)).attr('y', 12)
        .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#5C564E').text('平均溢价倍数');

      const series = platforms.map((p) => ({
        platform: p,
        values: panelData.filter((d) => d.cabType === p).sort((a, b) => a.relativeHour - b.relativeHour),
      }));

      // Confidence band
      panel.selectAll<SVGPathElement, typeof series[0]>('.confidence-band').data(series, (d) => d.platform).join('path')
        .attr('fill', (d) => PLATFORM_STYLE[d.platform].color).attr('fill-opacity', 0.12)
        .attr('d', (s) => d3.area<EventCurvePoint>()
          .defined((d) => d.lower !== null && d.upper !== null)
          .x((d) => xScale(d.relativeHour)).y0((d) => yScale(d.lower!)).y1((d) => yScale(d.upper!))
          .curve(d3.curveMonotoneX)(s.values) ?? '');

      // Response line
      panel.selectAll<SVGPathElement, typeof series[0]>('.response-line').data(series, (d) => d.platform).join('path')
        .attr('fill', 'none').attr('stroke', (d) => PLATFORM_STYLE[d.platform].color).attr('stroke-width', 2.5)
        .attr('d', (s) => d3.line<EventCurvePoint>()
          .x((d) => xScale(d.relativeHour)).y((d) => yScale(d.mean))
          .curve(d3.curveMonotoneX)(s.values) ?? '');

      // Data points
      panel.selectAll('.response-point').data(series.flatMap((s) => s.values.map((v) => ({ ...v, platform: s.platform })))).join('circle')
        .attr('r', 3).attr('cx', (d) => xScale(d.relativeHour)).attr('cy', (d) => yScale(d.mean))
        .attr('fill', (d) => PLATFORM_STYLE[d.platform].color)
        .append('title').text((d) => `${PLATFORM_STYLE[d.platform].label} ${d.relativeHour > 0 ? '+' : ''}${d.relativeHour}h：${d.mean.toFixed(3)}x，样本 ${d.sampleSize}`);

      // Hover overlay
      panel.append('rect').attr('class', 'hover-overlay')
        .attr('x', margin.left).attr('width', iw)
        .attr('y', margin.top).attr('height', innerH)
        .attr('fill', 'none').attr('pointer-events', 'all')
        .on('pointermove', (event) => {
          const [mx] = d3.pointer(event);
          const h = xScale.invert(mx);
          const clampedH = Math.round(h);
          const uberPt = panelData.find((d) => d.cabType === 'uber' && d.relativeHour === clampedH);
          const lyftPt = panelData.find((d) => d.cabType === 'lyft' && d.relativeHour === clampedH);
          const el = tooltipRef.current;
          if (!el || (!uberPt && !lyftPt)) return;
          const rect = container.getBoundingClientRect();
          el.hidden = false;
          el.style.left = `${event.clientX - rect.left + 14}px`;
          el.style.top = `${event.clientY - rect.top - 16}px`;
          el.innerHTML = `<strong>${LABELS[eventType] ?? eventType}</strong><br>时间：${clampedH > 0 ? '+' : ''}${clampedH}h<br>Uber：${uberPt ? uberPt.mean.toFixed(3) + 'x' : '无数据'}<br>Lyft：${lyftPt ? lyftPt.mean.toFixed(3) + 'x' : '无数据'}`;
        })
        .on('pointerleave', () => { if (tooltipRef.current) tooltipRef.current.hidden = true; });
    });

    // Global legend
    svg.selectAll('.event-legend').data(Object.entries(PLATFORM_STYLE)).join('text')
      .attr('x', (_, i) => width - 122 + i * 62).attr('y', 22)
      .attr('fill', ([, s]) => s.color).attr('font-size', 11).attr('font-weight', 600)
      .text(([, s]) => `━ ${s.label}`);
  }, [data]);

  useEffect(() => {
    const obs = new ResizeObserver(() => requestAnimationFrame(render));
    if (containerRef.current) obs.observe(containerRef.current);
    requestAnimationFrame(render);
    return () => obs.disconnect();
  }, [render]);

  if (data.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#8E887E' }}>当前时间范围内没有可对齐的天气突变事件。</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} role="img" aria-label="天气突变事件对齐响应曲线" />
      <div ref={tooltipRef} hidden style={{
        position: 'absolute', zIndex: 999, pointerEvents: 'none',
        background: 'rgba(255,255,255,0.95)', color: '#2D2A26',
        padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.7,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)', maxWidth: 220,
      }} />
    </div>
  );
}

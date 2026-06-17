import { useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import type { HourlyPlatformRecord } from '../../types';

const MAX_RENDER = 1200;
const PLATFORM_COLORS: Record<string, string> = { uber: '#3B71F3', lyft: '#E8613C' };
const BASE_VARS = [
  { key: 'temperature', label: '温度', unit: '°F' },
  { key: 'precipIntensity', label: '降水', unit: 'in/h' },
  { key: 'visibility', label: '能见度', unit: 'mi' },
];

function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const step = items.length / limit;
  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * step)]);
}

export function WeatherSurgeScatterMatrix({ data }: { data: HourlyPlatformRecord[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const hasHumidity = useMemo(() => data.some((d) => Number.isFinite(d.humidity)), [data]);

  const variables = useMemo(() => [
    ...BASE_VARS,
    ...(hasHumidity ? [{ key: 'humidity' as const, label: '湿度', unit: '' }] : []),
    { key: 'avgSurge' as const, label: '平均溢价', unit: 'x' },
  ], [hasHumidity]);

  const points = useMemo(() =>
    sampleEvenly(
      data.filter((d) => variables.every((v) => Number.isFinite((d as Record<string, unknown>)[v.key]))),
      MAX_RENDER
    ), [data, variables]);

  const render = useCallback(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl || points.length === 0) return;

    const width = Math.max(container.clientWidth, 520);
    const margin = { top: 20, right: 10, bottom: 34, left: 42 };
    const innerW = width - margin.left - margin.right;
    const size = innerW / variables.length;
    const height = margin.top + innerW + margin.bottom;

    const svg = d3.select(svgEl).attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();
    const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const scales = new Map(variables.map((v) => {
      const extent = d3.extent(points, (d) => (d as Record<string, unknown>)[v.key] as number) as [number, number];
      const span = extent[1] - extent[0] || 1;
      return [v.key, d3.scaleLinear().domain([extent[0] - span * 0.04, extent[1] + span * 0.04]).range([8, size - 8])];
    }));

    for (let row = 0; row < variables.length; row++) {
      for (let col = 0; col < variables.length; col++) {
        const xVar = variables[col], yVar = variables[row];
        const xScale = scales.get(xVar.key)!;
        const yScale = scales.get(yVar.key)!.copy().range([size - 8, 8]);
        const cell = root.append('g').attr('transform', `translate(${col * size},${row * size})`);

        cell.append('rect').attr('class', 'matrix-bg').attr('width', size).attr('height', size)
          .attr('fill', (row + col) % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent').attr('rx', 2);

        if (row === col) {
          const bins = d3.bin<number, number>().domain(xScale.domain() as [number, number]).thresholds(8)(points.map((d) => (d as Record<string, unknown>)[xVar.key] as number));
          const histMax = d3.max(bins, (b) => b.length) ?? 1;
          const histScale = d3.scaleLinear().domain([0, histMax]).range([size - 14, 24]);

          cell.selectAll('.hist-bar').data(bins).join('rect')
            .attr('x', (b) => xScale(b.x0!)).attr('y', (b) => histScale(b.length))
            .attr('width', (b) => Math.max(1, xScale(b.x1!) - xScale(b.x0!) - 1))
            .attr('height', (b) => size - 14 - histScale(b.length))
            .attr('fill', '#8B5CF6').attr('opacity', 0.45).attr('rx', 1);

          cell.append('text').attr('x', 8).attr('y', 16)
            .attr('font-size', 11).attr('font-weight', 600).attr('fill', '#8E887E').text(xVar.label);
        } else {
          cell.selectAll('.matrix-point').data(points).join('circle')
            .attr('cx', (d) => xScale((d as Record<string, unknown>)[xVar.key] as number))
            .attr('cy', (d) => yScale((d as Record<string, unknown>)[yVar.key] as number))
            .attr('r', 2).attr('fill', (d) => PLATFORM_COLORS[d.platform] ?? '#8E887E').attr('opacity', 0.55)
            .on('pointerenter', (event, d) => {
              const el = tooltipRef.current;
              if (!el) return;
              const rect = container.getBoundingClientRect();
              el.hidden = false;
              el.style.left = `${Math.min(event.clientX - rect.left + 12, rect.width - 244)}px`;
              el.style.top = `${Math.max(8, event.clientY - rect.top - 34)}px`;
              el.innerHTML = `<strong>${d.datetime}</strong><br>平台：${d.platform === 'uber' ? 'Uber' : 'Lyft'}<br>温度：${d.temperature?.toFixed(1) ?? '无'}°F<br>降水：${d.precipIntensity.toFixed(3)} in/h<br>能见度：${d.visibility?.toFixed(1) ?? '无'} mi<br>${Number.isFinite(d.humidity) ? `湿度：${(d.humidity as number).toFixed(2)}<br>` : ''}平均溢价：${d.avgSurge.toFixed(3)}x<br>记录量：${d.orderCount}`;
            })
            .on('pointerleave', () => { if (tooltipRef.current) tooltipRef.current.hidden = true; });
        }

        if (row === variables.length - 1) {
          cell.append('g').attr('transform', `translate(0,${size})`)
            .call(d3.axisBottom(xScale).ticks(3).tickSize(3))
            .attr('font-size', 8).attr('color', '#8E887E');
        }
        if (col === 0) {
          cell.append('g').call(d3.axisLeft(yScale).ticks(3).tickSize(3))
            .attr('font-size', 8).attr('color', '#8E887E');
        }
      }
    }
  }, [points, variables]);

  useEffect(() => {
    const obs = new ResizeObserver(() => requestAnimationFrame(render));
    if (containerRef.current) obs.observe(containerRef.current);
    requestAnimationFrame(render);
    return () => obs.disconnect();
  }, [render]);

  if (points.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#8E887E' }}>当前时间范围内没有可用于散点矩阵的数据。</div>;
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 'auto' }} role="img" aria-label="气象与溢价散点矩阵" />
      <div ref={tooltipRef} hidden style={{
        position: 'absolute', zIndex: 999, pointerEvents: 'none',
        background: 'rgba(255,255,255,0.95)', color: '#2D2A26', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.08)',
        padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.7,
        backdropFilter: 'blur(8px)', maxWidth: 240,
      }} />
    </div>
  );
}

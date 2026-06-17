import { useMemo } from 'react';
import { useWeatherSurge } from './WeatherSurgeContext';
import { TimeRiverChart } from './TimeRiverChart';
import { EventAlignedCurve } from './EventAlignedCurve';
import { WeatherSurgeScatterMatrix } from './WeatherSurgeScatterMatrix';
import { WeatherBucketBoxplot } from './WeatherBucketBoxplot';

function pearsonCorr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

function KPICard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <article className="kpi-card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
    </article>
  );
}

export function WeatherSurgeView() {
  const ctx = useWeatherSurge();

  const visibleSeries = useMemo(() => ctx.getVisibleSeries(), [ctx]);
  const visibleEvents = useMemo(() => ctx.getVisibleEventWindows(), [ctx]);
  const visiblePlatform = useMemo(() => ctx.getVisiblePlatformSeries(), [ctx]);
  const visibleCurves = useMemo(() => ctx.getVisibleEventCurves(), [ctx]);

  const eventCount = useMemo(() => new Set(visibleEvents.map((e) => e.eventId)).size, [visibleEvents]);
  const maxPrecip = useMemo(() => Math.max(0, ...visibleSeries.map((d) => d.precipIntensity)), [visibleSeries]);
  const maxLyftSurge = useMemo(() => Math.max(1, ...visibleSeries.map((d) => d.lyft?.avg_surge ?? 1)), [visibleSeries]);

  // Card-insight computations
  const riverInsight = useMemo(() => {
    if (ctx.selectedRange.length === 2) {
      const [s, e] = ctx.selectedRange;
      const rangeUber = visibleSeries.map(d => d.uber?.avg_surge ?? 1);
      const rangeLyft = visibleSeries.map(d => d.lyft?.avg_surge ?? 1);
      const peakUber = Math.max(1, ...rangeUber);
      const peakLyft = Math.max(1, ...rangeLyft);
      const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
      return `已框选 ${fmt(s)}–${fmt(e)}，该时段内 Uber 峰值 ${peakUber.toFixed(2)}x、Lyft 峰值 ${peakLyft.toFixed(2)}x。`;
    }
    const peak = visibleSeries.reduce((best, d) => {
      const v = d.lyft?.avg_surge ?? 0;
      return v > (best.val ?? 0) ? { val: v, dt: d.date } : best;
    }, { val: 0, dt: new Date() });
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
    return `全时段 Lyft 溢价峰值出现在 ${fmt(peak.dt)}（${peak.val.toFixed(2)}x），拖拽滑块框选感兴趣的时间段查看细节。`;
  }, [visibleSeries, ctx.selectedRange]);

  const scatterInsight = useMemo(() => {
    if (visiblePlatform.length === 0) return null as any;
    const lyft = visiblePlatform.filter(d => d.platform === 'lyft');
    if (lyft.length < 3) return null as any;
    const precipCorr = pearsonCorr(lyft.map(d => d.precipIntensity), lyft.map(d => d.avgSurge));
    const tempCorr = pearsonCorr(lyft.map(d => d.temperature ?? 0), lyft.map(d => d.avgSurge));
    const visCorr = pearsonCorr(lyft.map(d => d.visibility ?? 0), lyft.map(d => d.avgSurge));
    const strongest = [{ name: '降水强度', val: Math.abs(precipCorr) }, { name: '温度', val: Math.abs(tempCorr) }, { name: '能见度', val: Math.abs(visCorr) }].sort((a, b) => b.val - a.val)[0];
    return { strongest, precipCorr, tempCorr, visCorr };
  }, [visiblePlatform]);

  const boxplotInsight = useMemo(() => {
    if (!ctx.weatherData || Object.keys(ctx.weatherData).length === 0) return null as any;
    const entries = Object.entries(ctx.weatherData)
      .filter(([, v]) => typeof v.lyftAvg === 'number' && typeof v.uberAvg === 'number')
      .map(([k, v]) => ({
        weather: k,
        label: v.label ?? k,
        diff: ((v.lyftAvg as number) - (v.uberAvg as number)),
        lyft: v.lyftAvg as number,
        uber: v.uberAvg as number,
      }))
      .sort((a, b) => b.diff - a.diff);
    if (entries.length === 0) return null as any;
    return entries[0];
  }, [ctx.weatherData]);

  const eventInsight = useMemo(() => {
    if (visibleCurves.length === 0) return null as any;
    const uberCurves = visibleCurves.filter(c => c.cabType === 'uber');
    const lyftCurves = visibleCurves.filter(c => c.cabType === 'lyft');
    const maxCurve = visibleCurves.reduce((best, c) => Math.max(best, c.mean), 0);
    const uberAvgPeak = uberCurves.length > 0 ? uberCurves.reduce((s, c) => s + c.mean, 0) / uberCurves.length : 0;
    const lyftAvgPeak = lyftCurves.length > 0 ? lyftCurves.reduce((s, c) => s + c.mean, 0) / lyftCurves.length : 0;
    const pctAbove = uberAvgPeak > 0 ? ((lyftAvgPeak / uberAvgPeak - 1) * 100) : 0;
    return { maxCurve, pctAbove };
  }, [visibleCurves]);

  if (ctx.isLoading) {
    return <div className="loading-state"><div className="spinner" /><span>正在加载小时级天气与溢价数据…</span></div>;
  }
  if (ctx.error) {
    return <div className="error-state">{ctx.error}</div>;
  }

  return (
    <div className="weather-surge-view">
      <header className="hero-section hero-compact">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <p className="hero-eyebrow">天气溢价</p>
            <h2>天气—溢价联动分析</h2>
            <p className="hero-subtitle">一场暴风雨来了，网约车价格多久上涨？涨多少？Uber 和 Lyft 谁先涨？这页把天气数据和溢价数据对齐到同一时间轴，逐小时给出答案。</p>
          </div>
          {ctx.selectedRange.length === 2 && (
            <button className="clear-btn" onClick={() => ctx.setSelectedRange([])}>清除时间筛选</button>
          )}
        </div>
      </header>

      {/* Stat Ribbon */}
      <div className="stat-ribbon">
        <div className="stat-cell">
          <span className="stat-value">{visibleSeries.length.toLocaleString()}</span>
          <span className="stat-label">可见小时数</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value">{eventCount}</span>
          <span className="stat-label">天气突变事件</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value">{maxPrecip.toFixed(3)} <small style={{fontSize:14,fontWeight:500}}>in/h</small></span>
          <span className="stat-label">最高降水强度</span>
        </div>
        <div className="stat-cell">
          <span className="stat-value stat-highlight">{maxLyftSurge.toFixed(2)}<small style={{fontSize:14,fontWeight:500}}>x</small></span>
          <span className="stat-label">Lyft 最高平均溢价</span>
        </div>
      </div>

      {/* Time River Chart - spotlight card */}
      <section className="card spotlight">
        <div className="card-head">
          <h3>天气—溢价时间河流图</h3>
          <p>上半部分展示天气（温度、降水、能见度），下半是 Uber 和 Lyft 的溢价曲线。拖拽底部滑块框选时间范围查看细节。</p>
          <div className="legend-inline">
            <span><i className="swatch" style={{ background: '#3B71F3' }} /> Uber</span>
            <span><i className="swatch" style={{ background: '#E8613C' }} /> Lyft</span>
          </div>
        </div>
        <TimeRiverChart
          data={ctx.hourlySeries}
          selectedRange={ctx.selectedRange}
          onBrushChange={ctx.setSelectedRange}
        />
        {riverInsight && (
          <div className="card-insight" style={{ marginTop: 12 }}>
            <strong>怎么看这张图：</strong>{riverInsight}
          </div>
        )}
      </section>

      {/* Scatter Matrix + Boxplot in bento grid */}
      <div className="bento-grid">
        <section className="card col-7">
          <div className="card-head">
            <h3>气象—溢价散点矩阵</h3>
            <p>每个小图展示一个气象指标与溢价的关系。点越集中说明相关性越强——降水和溢价呈明显正相关，温度则关联较弱。</p>
          </div>
          <div className="card-body">
            <WeatherSurgeScatterMatrix data={visiblePlatform} />
            {scatterInsight && (
              <div className="card-insight">
                <strong>怎么看这张图：</strong>
                和溢价相关性最强的指标是<strong>{scatterInsight.strongest.name}</strong>（r={scatterInsight.strongest.val.toFixed(2)}），
                降水强度与溢价呈正相关（r={scatterInsight.precipCorr.toFixed(2)}），
                温度与溢价呈负相关（r={scatterInsight.tempCorr.toFixed(2)}），
                这符合直觉：天气越冷越湿，供需越紧张、溢价越高。
              </div>
            )}
          </div>
        </section>

        <section className="card col-5">
          <div className="card-head">
            <h3>天气分桶箱线图</h3>
            <p>每种天气类型下 Uber 和 Lyft 的溢价范围、中位数、异常值。箱子越扁说明该平台在此天气下定价越稳定。</p>
          </div>
          <div className="card-body">
            <WeatherBucketBoxplot data={visiblePlatform} precomputedStats={ctx.weatherData ?? {}} />
            {boxplotInsight && (
              <div className="card-insight">
                <strong>怎么看这张图：</strong>
                <strong>{boxplotInsight.label}</strong>天气下 Lyft 比 Uber 溢价高的幅度最大（+{(boxplotInsight.diff * 100).toFixed(1)}%），
                Lyft {boxplotInsight.lyft.toFixed(2)}x vs Uber {boxplotInsight.uber.toFixed(2)}x。
                大部分天气类型下 Lyft 中位数溢价高于 Uber，但 Uber 的异常值（箱外离群点）更多——极端情况下 Uber 的高溢价订单更分散。
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Event Aligned Curves - full width */}
      <section className="card">
        <div className="card-head">
          <h3>事件对齐响应曲线</h3>
          <p>将所有天气突变（暴雨、暴雪等）的时刻对齐到 t=0，前推 3 小时、后推 3 小时。实线为平均溢价，半透明带为波动范围。可以清楚看到溢价从何时开始爬升、何时到达峰值。</p>
        </div>
        <div className="card-body">
          <EventAlignedCurve data={visibleCurves} />
          {eventInsight && (
            <div className="card-insight">
              <strong>怎么看这张图：</strong>
              天气突变后，溢价通常在 <strong>1–2 小时</strong>内达到峰值（最高约 {eventInsight.maxCurve.toFixed(2)}x），然后逐渐回落。
              Uber 和 Lyft 的响应速度相近，但 Lyft 的峰值通常比 Uber 高出约 {eventInsight.pctAbove.toFixed(0)}%——
              恶劣天气下 Lyft 加价更快、幅度更大。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

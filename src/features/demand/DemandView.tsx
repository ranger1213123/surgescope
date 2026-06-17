import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { DemandBlock } from '../../types';
import { loadDemandBlocks } from '../../utils/dataLoader';

const PLATFORM_COLORS: Record<string, string> = { uber: '#3B71F3', lyft: '#E8613C' };

function DemandOverlay({ blocks, hour, platform }: { blocks: DemandBlock[]; hour: number; platform: string }) {
  const map = useMap();

  const filtered = useMemo(
    () => blocks.filter((b) => b.hour === hour && (platform === 'all' || b.platform === platform)),
    [blocks, hour, platform]
  );

  const maxOrders = useMemo(() => Math.max(1, ...filtered.map((b) => b.orderCount)), [filtered]);

  return (
    <>
      {filtered.map((b, i) => (
        <CircleMarker
          key={`${b.block}-${b.platform}-${i}`}
          center={[b.y, b.x]}
          radius={Math.max(4, Math.sqrt(b.orderCount / maxOrders) * 22)}
          pathOptions={{
            color: PLATFORM_COLORS[b.platform] ?? '#64748b',
            fillColor: PLATFORM_COLORS[b.platform] ?? '#64748b',
            fillOpacity: 0.35,
            weight: 1.5,
          }}
        >
          <Popup>
            <div style={{ fontSize: 12 }}>
              <strong>{b.block}</strong><br />
              平台：{b.platform === 'uber' ? 'Uber' : 'Lyft'}<br />
              订单量：{b.orderCount.toLocaleString()}<br />
              均价：${b.avgPrice.toFixed(2)}<br />
              时段：第 {b.hour} 小时
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

export function DemandView() {
  const [blocks, setBlocks] = useState<DemandBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hour, setHour] = useState(18);
  const [platform, setPlatform] = useState('all');
  const [day, setDay] = useState(1);

  useEffect(() => {
    loadDemandBlocks()
      .then((d) => setBlocks(d.blocks ?? d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => blocks.filter((b) => b.day === day && (platform === 'all' || b.platform === platform)),
    [blocks, day, platform]
  );

  const totalOrders = useMemo(() => filtered.reduce((s, b) => s + b.orderCount, 0), [filtered]);

  if (loading) return <div className="loading-state"><div className="spinner" /><span>正在加载时空需求数据…</span></div>;
  if (error) return <div className="error-state">{error}</div>;

  return (
    <div className="demand-view">
      <header className="view-header">
        <p className="eyebrow">时空需求</p>
        <h2>时空需求热力分布</h2>
        <p className="subtitle">
          基于 693,071 条记录，展示波士顿各区块的分时订单需求量与单价分布。
        </p>
      </header>

      {/* Controls */}
      <div className="demand-controls">
        <div className="control-group">
          <label>选择日期</label>
          <div className="btn-group">
            {[1, 7, 14, 21].map((d) => (
              <button key={d} className={`ctrl-btn ${day === d ? 'active' : ''}`} onClick={() => setDay(d)}>
                第 {d} 天
              </button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <label>选择小时</label>
          <input
            type="range" min={0} max={23} value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            style={{ width: 240 }}
          />
          <span className="hour-label">{hour}:00</span>
        </div>
        <div className="control-group">
          <label>平台筛选</label>
          <div className="btn-group">
            {[{ v: 'all', l: '全部' }, { v: 'uber', l: 'Uber' }, { v: 'lyft', l: 'Lyft' }].map((opt) => (
              <button key={opt.v} className={`ctrl-btn ${platform === opt.v ? 'active' : ''}`} onClick={() => setPlatform(opt.v)}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <span className="total-badge">总订单：{totalOrders.toLocaleString()}</span>
        </div>
      </div>

      {/* Map */}
      <div className="map-wrapper">
        <MapContainer
          center={[42.351, -71.07]}
          zoom={12}
          style={{ width: '100%', height: '100%', minHeight: 560, borderRadius: 16 }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <DemandOverlay blocks={blocks} hour={hour} platform={platform} />
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="legend-bar" style={{ marginTop: 12 }}>
        <span>圆圈大小 ∝ 订单量；颜色：</span>
        <span style={{ background: PLATFORM_COLORS.uber, width: 12, height: 12, borderRadius: '50%', display: 'inline-block', margin: '0 4px' }} />
        <span>Uber</span>
        <span style={{ background: PLATFORM_COLORS.lyft, width: 12, height: 12, borderRadius: '50%', display: 'inline-block', margin: '0 4px 0 12px' }} />
        <span>Lyft</span>
      </div>
    </div>
  );
}

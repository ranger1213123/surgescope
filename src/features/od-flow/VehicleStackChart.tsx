import { useMemo } from "react";
import * as d3 from "d3";
import type { OdLink } from "../../types";
import { useOdFlowInteraction } from "./OdFlowContext";
import { formatNumber } from "./odFlowUtils";

type VehicleStackChartProps = {
  links: OdLink[];
};

const UBER_COLORS: Record<string, string> = {
  "Uber:UberX": "#276ef1",
  "Uber:UberXL": "#0f4bb8",
  "Uber:UberPool": "#6ba2f5",
  "Uber:Black": "#111",
  "Uber:Black SUV": "#333",
  "Uber:WAV": "#555",
  "Uber:Taxi": "#777",
};
const LYFT_COLORS: Record<string, string> = {
  "Lyft:Lyft": "#ff3b7f",
  "Lyft:Lyft XL": "#cc0f55",
  "Lyft:Shared": "#ff7aa8",
  "Lyft:Lux": "#99003d",
  "Lyft:Lux Black": "#660028",
  "Lyft:Lux Black XL": "#44001a",
};

function vehicleColor(type: string): string {
  if (UBER_COLORS[type]) return UBER_COLORS[type];
  if (LYFT_COLORS[type]) return LYFT_COLORS[type];
  // Fallback: Uber shades = blue, Lyft = pink
  return type.startsWith("Uber") ? "#276ef1" : "#ff3b7f";
}

const VEHICLE_LABELS: Record<string, string> = {
  'UberX': '经济型', 'UberXL': '加大型', 'UberPool': '拼车',
  'Black': '豪华型', 'Black SUV': '豪华SUV', 'WAV': '无障碍', 'Taxi': '出租车',
  'Lyft': '标准型', 'Lyft XL': '加大型', 'Shared': '拼车',
  'Lux': '高端型', 'Lux Black': '高端黑色', 'Lux Black XL': '高端黑色XL',
};

function vehicleLabel(type: string): string {
  const key = type.replace(/^(Uber|Lyft):/, '');
  return VEHICLE_LABELS[key] ?? key;
}

export function VehicleStackChart({ links }: VehicleStackChartProps) {
  const { selectedLinkId } = useOdFlowInteraction();

  // Find selected link, or aggregate all
  const chartData = useMemo(() => {
    if (selectedLinkId) {
      const link = links.find((l) => l.id === selectedLinkId);
      if (link && link.vehicleTypes.length > 0) {
        return {
          title: `${link.source} → ${link.target}`,
          subtitle: `${formatNumber(link.value)} 次`,
          vehicles: link.vehicleTypes,
        };
      }
    }
    // Aggregate across all links
    const agg = new Map<string, number>();
    let total = 0;
    for (const link of links) {
      for (const v of link.vehicleTypes) {
        agg.set(v.type, (agg.get(v.type) ?? 0) + v.count);
        total += v.count;
      }
    }
    const vehicles = [...agg.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, pct: Number(((count / total) * 100).toFixed(1)) }));
    return { title: "全部 OD 对", subtitle: `${formatNumber(total)} 次`, vehicles };
  }, [links, selectedLinkId]);

  const width = 560;
  const barHeight = 15;
  const gap = 2;
  const margin = { left: 110, right: 70 };
  const chartHeight = Math.max(100, chartData.vehicles.length * (barHeight + gap) + 28);

  const maxCount = d3.max(chartData.vehicles, (d) => d.count) ?? 1;

  return (
    <section className="viz-card">
      <div className="card-head">
        <p className="eyebrow">车型分布</p>
        <h2>车型产品分布</h2>
        <p className="card-desc">
          {selectedLinkId
            ? `当前选中：${chartData.title}。经济型（UberX/Lyft）占大头，豪华车型只在长距离线路有存在感。`
            : "所有 OD 对汇总。可以看到 UberX 和 Lyft 是绝对主力，拼车和豪华车型占比相对小。点击弦带或飞线看单条线路的车型构成。"}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${chartHeight}`}
        style={{ width: "100%", height: "auto" }}
        role="img"
      >
        <title>车型产品分布 · {chartData.title}</title>

        {chartData.vehicles.map((v, i) => {
          const y = i * (barHeight + gap);
          const barW = Math.max(4, (v.count / maxCount) * (width - margin.left - margin.right));

          return (
            <g key={v.type}>
              {/* Label */}
              <text
                x={margin.left - 8}
                y={y + barHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fill="#2D2A26"
                fontSize="12"
                fontWeight="600"
              >
                {vehicleLabel(v.type)}
              </text>

              {/* Bar */}
              <rect
                x={margin.left}
                y={y}
                width={barW}
                height={barHeight}
                rx="4"
                fill={vehicleColor(v.type)}
              />

              {/* Percentage */}
              <text
                x={margin.left + barW + 8}
                y={y + barHeight / 2}
                dominantBaseline="middle"
                fill="#5C564E"
                fontSize="11"
              >
                {v.pct}%
              </text>

              {/* Count */}
              <text
                x={margin.left + barW + 8 + 48}
                y={y + barHeight / 2}
                dominantBaseline="middle"
                fill="#8E887E"
                fontSize="10"
              >
                {formatNumber(v.count)}
              </text>
            </g>
          );
        })}

        {/* Uber / Lyft divider */}
        {(() => {
          const uberCount = chartData.vehicles
            .filter((v) => v.type.startsWith("Uber"))
            .reduce((s, v) => s + 1, 0);
          if (uberCount === 0 || uberCount === chartData.vehicles.length) return null;
          const y = uberCount * (barHeight + gap) - gap / 2;
          return (
            <line
              x1={margin.left - 8}
              x2={width - margin.right + 20}
              y1={y}
              y2={y}
              stroke="rgba(0,0,0,0.12)"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          );
        })()}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 11, color: "#8E887E", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 40, height: 10, borderRadius: 2, background: "linear-gradient(to right, #6ba2f5, #276ef1, #0f4bb8)", verticalAlign: "middle" }} />
          Uber 系列
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 40, height: 10, borderRadius: 2, background: "linear-gradient(to right, #ff7aa8, #ff3b7f, #cc0f55)", verticalAlign: "middle" }} />
          Lyft 系列
        </span>
        <span style={{ marginLeft: "auto" }}>{chartData.title} · {chartData.subtitle}</span>
      </div>

      {/* Conclusion */}
      {chartData.vehicles.length > 0 && (
        <div className="card-insight">
          <strong>结论：</strong>
          {chartData.vehicles[0].type.startsWith('Uber') ? 'Uber' : 'Lyft'} 系列中
          <strong> {vehicleLabel(chartData.vehicles[0].type)}</strong> 占比最高（{chartData.vehicles[0].pct}%），
          高端车型（Black / Lux 系列）合计占比
          {chartData.vehicles.filter(v => v.type.includes('Black') || v.type.includes('Lux')).reduce((s, v) => s + v.pct, 0).toFixed(1)}%，
          反映波士顿地区以经济/标准车型为主，高端出行需求集中在特定场景。
        </div>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ChordDiagram } from "./ChordDiagram";
import { OdFlowProvider, useOdFlowInteraction } from "./OdFlowContext";
import { OdFlowMap } from "./OdFlowMap";
import { VehicleStackChart } from "./VehicleStackChart";
import type { OdFlowData } from "../../types";
import { formatNumber } from "./odFlowUtils";

function InteractionPanel() {
  const { selectedNodeId, selectedLinkId, clearSelection } = useOdFlowInteraction();

  return (
    <section className="interaction-panel">
      <div className="brushing-icon">↔</div>
      <div className="brushing-info">
        <h3>跨模块联动交互</h3>
        <p>
          弦图、飞线地图、车型分布图订阅同一交互状态。悬停/点击任意元素，所有视图同步响应。
          按 Esc 键清除全部选中。
        </p>
      </div>
      <div className="selection-badge">
        {selectedNodeId ? (
          <span>已选中节点：<strong>{selectedNodeId}</strong></span>
        ) : selectedLinkId ? (
          <span>已选中流向：<strong>{selectedLinkId.replace("__", " → ")}</strong></span>
        ) : (
          <span style={{ color: "#8E887E" }}>点击任意流向查看车型分布</span>
        )}
        {(selectedNodeId || selectedLinkId) && (
          <button className="clear-btn" onClick={clearSelection}>清除</button>
        )}
      </div>
    </section>
  );
}

function OdFlowDashboard({ data }: { data: OdFlowData }) {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: "all", label: "全年" }];
    if (data.byMonth) {
      for (const [m, d] of Object.entries(data.byMonth)) {
        opts.push({ value: m, label: `${d.label}月` });
      }
    }
    return opts;
  }, [data]);

  const viewData = useMemo<OdFlowData>(() => {
    if (selectedMonth === "all" || !data.byMonth?.[selectedMonth]) {
      return data;
    }
    const monthData = data.byMonth[selectedMonth];
    return {
      generatedAt: data.generatedAt,
      nodes: monthData.nodes,
      links: monthData.links,
    };
  }, [data, selectedMonth]);

  const totalTrips = viewData.links.reduce((sum, l) => sum + l.value, 0);

  return (
    <OdFlowProvider>
      <div className="dashboard">
        {/* Header */}
        <header className="hero-section hero-compact">
          <p className="hero-eyebrow">流向分析</p>
          <h2>OD 流向与车型分布</h2>
          <p className="hero-subtitle">
            波士顿 12 个核心区域之间，人和车是怎么流动的？弦图看流向大小、飞线地图看地理分布、车型分布看每条线路上 UberX 到 Black SUV 各占多少。
          </p>

          <div className="month-selector">
            {monthOptions.map((opt) => (
              <button
                key={opt.value}
                className={`month-btn${selectedMonth === opt.value ? " active" : ""}`}
                onClick={() => setSelectedMonth(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="stats-row">
            <div className="stat-item">
              <strong>{viewData.nodes.length}</strong>
              <span>节点</span>
            </div>
            <div className="stat-item">
              <strong>{viewData.links.length}</strong>
              <span>流向</span>
            </div>
            <div className="stat-item">
              <strong>{formatNumber(totalTrips)}</strong>
              <span>订单</span>
            </div>
          </div>
        </header>

        <InteractionPanel />

        {/* Bento grid: chord + flow map (map wider) */}
        <main className="bento-grid">
          <div className="col-5" style={{ minWidth: 0 }}><ChordDiagram data={viewData} /></div>
          <div className="col-7" style={{ minWidth: 0 }}><OdFlowMap data={viewData} /></div>
        </main>

        {/* Vehicle stack chart: constrained width below */}
        <div style={{ maxWidth: 680, margin: '20px auto 0' }}>
          <VehicleStackChart links={viewData.links} />
        </div>
      </div>
    </OdFlowProvider>
  );
}

export function OdFlowModule() {
  const [data, setData] = useState<OdFlowData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/od-flow.json")
      .then((res) => {
        if (!res.ok) throw new Error(`数据加载失败：${res.status}`);
        return res.json() as Promise<OdFlowData>;
      })
      .then(setData)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "数据加载失败");
      });
  }, []);

  if (error) {
    return (
      <div className="empty-state">
        <h1>OD 数据未就绪</h1>
        <p>{error}</p>
        <p>请先执行 npm run aggregate:od 生成数据。</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-state">
        <h1>正在加载 OD 流向数据…</h1>
      </div>
    );
  }

  return <OdFlowDashboard data={data} />;
}

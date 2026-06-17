import { useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { OdFlowData } from "../../types";
import { useOdFlowInteraction } from "./OdFlowContext";
import { buildChordMatrix, formatNumber, linkTouchesNode } from "./odFlowUtils";

type ColorMode = "surge" | "price" | "flow";

const MODE_LABELS: { value: ColorMode; label: string }[] = [
  { value: "surge", label: "溢价倍率" },
  { value: "price", label: "均价" },
  { value: "flow", label: "订单量" },
];

export function ChordDiagram({ data }: { data: OdFlowData }) {
  const {
    hoveredNodeId, selectedNodeId,
    hoveredLinkId, selectedLinkId,
    setHoveredNodeId, setSelectedNodeId,
    setHoveredLinkId, setSelectedLinkId,
  } = useOdFlowInteraction();

  const [colorMode, setColorMode] = useState<ColorMode>("surge");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; html: string } | null>(null);
  const chordContainerRef = useRef<HTMLDivElement>(null);

  const svgSize = 560;
  const outerRadius = svgSize / 2 - 36;
  const innerRadius = outerRadius - 20;
  const activeNodeId = hoveredNodeId ?? selectedNodeId;
  const activeLinkId = hoveredLinkId ?? selectedLinkId;

  const { chords, color, linkByPair, ribbonColor, colorExtent, colorLegend } = useMemo(() => {
    const { matrix } = buildChordMatrix(data);
    const layout = d3.chordDirected()
      .padAngle(0.04).sortSubgroups(d3.descending)(matrix);

    const nodeColor = d3.scaleOrdinal<string>(d3.schemeTableau10)
      .domain(data.nodes.map((n) => n.id));

    const pairMap = new Map(
      data.links.map((link) => [`${link.source}__${link.target}`, link])
    );

    // Build three color modes
    const surgeVals = data.links.map(l => l.avgSurge).filter((s): s is number => s != null);
    const priceVals = data.links.map(l => l.avgPrice).filter((p): p is number => p != null);
    const flowVals = data.links.map(l => l.value);

    const sMin = d3.min(surgeVals) ?? 1, sMax = d3.max(surgeVals) ?? 2;
    const pMin = d3.min(priceVals) ?? 0, pMax = d3.max(priceVals) ?? 30;
    const fMin = d3.min(flowVals) ?? 1, fMax = d3.max(flowVals) ?? 1;

    const scales: Record<ColorMode, { fn: (v: number) => string; extent: [number, number]; legend: string }> = {
      surge: {
        fn: d3.scaleSequential(d3.interpolateRgbBasis(["#2A9D8F", "#E9C46A", "#E76F51"])).domain([sMin, sMax]),
        extent: [sMin, sMax],
        legend: `溢价 ${sMin.toFixed(3)} – ${sMax.toFixed(3)}`,
      },
      price: {
        fn: d3.scaleSequential(d3.interpolateRgbBasis(["#66bb6a", "#fff9c4", "#ef5350"])).domain([pMin, pMax]),
        extent: [pMin, pMax],
        legend: `价格 $${pMin.toFixed(0)} – $${pMax.toFixed(0)}`,
      },
      flow: {
        fn: d3.scaleSequential(d3.interpolateBlues).domain([fMin, fMax]),
        extent: [fMin, fMax],
        legend: `订单 ${formatNumber(fMin)} – ${formatNumber(fMax)}`,
      },
    };

    const getColor = (link: typeof data.links[0] | undefined) => {
      if (colorMode === "surge") return scales.surge.fn(link?.avgSurge ?? 1);
      if (colorMode === "price") return scales.price.fn(link?.avgPrice ?? 10);
      return scales.flow.fn(link?.value ?? 0);
    };

    return {
      chords: layout,
      color: nodeColor,
      linkByPair: pairMap,
      ribbonColor: getColor,
      colorExtent: scales[colorMode].extent,
      colorLegend: scales[colorMode].legend,
    };
  }, [data, colorMode]);

  const arc = useMemo(
    () => d3.arc<d3.ChordGroup>().innerRadius(innerRadius).outerRadius(outerRadius),
    [innerRadius, outerRadius]
  );
  const ribbon = useMemo(
    () => d3.ribbonArrow<d3.Chord, d3.ChordSubgroup>().radius(innerRadius - 2).padAngle(0.01),
    [innerRadius]
  );

  return (
    <section className="viz-card">
      <div className="card-head">
        <p className="eyebrow">弦图</p>
        <h2>弦图 · 流向关系拓扑</h2>
        <p className="card-desc">
          外圈弧段是 12 个区域，弧越长说明进出流量越大。中间的弦带是有向 OD 流——越粗订单越多。
          点击弦带或弧段可以联动地图和车型分布图。
        </p>
      </div>

      {/* Color mode toggle */}
      <div className="legend-bar" style={{ gap: 4 }}>
        {MODE_LABELS.map((m) => (
          <button
            key={m.value}
            className={`month-btn${colorMode === m.value ? " active" : ""}`}
            onClick={() => setColorMode(m.value)}
            style={{ padding: "4px 12px", fontSize: 11 }}
          >
            {m.label}
          </button>
        ))}
        <span style={{ marginLeft: 12, fontSize: 11, color: "#8E887E" }}>
          {colorLegend}
        </span>
      </div>

      {/* Color gradient bar */}
      <div className="legend-bar">
        <span className="legend-label">低</span>
        <div
          className="legend-gradient"
          style={{
            background: colorMode === "surge"
              ? "linear-gradient(to right, #2A9D8F, #E9C46A, #E76F51)"
              : colorMode === "price"
              ? "linear-gradient(to right, #66bb6a, #fff9c4, #ef5350)"
              : "linear-gradient(to right, #deebf7, #3182bd)",
          }}
        />
        <span className="legend-label">高</span>
        <span style={{ marginLeft: 8, color: "#8E887E", fontSize: 11 }}>
          ({colorMode === "price" ? "$" : ""}{colorExtent[0].toFixed(colorMode === "flow" ? 0 : colorMode === "price" ? 0 : 3)} – {colorMode === "price" ? "$" : ""}{colorExtent[1].toFixed(colorMode === "flow" ? 0 : colorMode === "price" ? 0 : 3)})
        </span>
      </div>

      <div className="chord-container" ref={chordContainerRef} style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${svgSize} ${svgSize}`} role="img" aria-label="OD流向弦图">
          <title>OD 流向弦图</title>
          <g transform={`translate(${svgSize / 2},${svgSize / 2})`}>
            {chords.map((chord) => {
              const sourceNode = data.nodes[chord.source.index];
              const targetNode = data.nodes[chord.target.index];
              const linkId = `${sourceNode.id}__${targetNode.id}`;
              const link = linkByPair.get(linkId);
              const isActive =
                activeLinkId === linkId ||
                linkTouchesNode(
                  { id: linkId, source: sourceNode.id, target: targetNode.id,
                    value: chord.source.value, avgDistance: 0, avgPrice: null,
                    avgSurge: null, avgTemp: null, avgPrecip: null,
                    avgVisibility: null, avgWind: null, topWeather: [], vehicleTypes: [] },
                  activeNodeId
                );
              const isMuted = Boolean(activeNodeId || activeLinkId) && !isActive;
              const fill = ribbonColor(link);

              const tooltipLines = [
                `${sourceNode.name} → ${targetNode.name}`,
                `订单量：${formatNumber(link?.value ?? chord.source.value)}`,
                link?.avgPrice != null ? `均价：$${link.avgPrice}` : null,
                link?.avgSurge != null ? `溢价：${link.avgSurge}x` : null,
                link?.avgTemp != null ? `均温：${link.avgTemp}°F` : null,
                link?.avgPrecip != null && link.avgPrecip > 0 ? `降水：${link.avgPrecip} in/h` : null,
              ].filter(Boolean).join('<br>');

              return (
                <path
                  key={linkId}
                  d={ribbon(chord) ?? undefined}
                  className={`chord-ribbon${isMuted ? " is-muted" : ""}${isActive ? " is-active" : ""}`}
                  fill={fill}
                  stroke={d3.color(fill)?.darker(0.5).toString()}
                  onMouseEnter={(e) => { setHoveredLinkId(linkId); setTooltip({ x: e.clientX, y: e.clientY, html: tooltipLines }); }}
                  onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => { setHoveredLinkId(null); setTooltip(null); }}
                  onClick={() => setSelectedLinkId(linkId)}
                />
              );
            })}

            {chords.groups.map((group) => {
              const node = data.nodes[group.index];
              const angle = (group.startAngle + group.endAngle) / 2;
              const labelR = outerRadius + 16;
              const x = Math.sin(angle) * labelR;
              const y = -Math.cos(angle) * labelR;
              const rotate = (angle * 180) / Math.PI - 90;
              const flip = angle > Math.PI;
              const isActive = activeNodeId === node.id;
              const isMuted = Boolean(activeNodeId || activeLinkId) && !isActive;

              const nodeHtml = `${node.name}<br>流入：${formatNumber(node.totalIn)}<br>流出：${formatNumber(node.totalOut)}`;

              return (
                <g
                  key={node.id}
                  className={`chord-group${isMuted ? " is-muted" : ""}${isActive ? " is-active" : ""}`}
                  onMouseEnter={(e) => { setHoveredNodeId(node.id); setTooltip({ x: e.clientX, y: e.clientY, html: nodeHtml }); }}
                  onMouseMove={(e) => setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => { setHoveredNodeId(null); setTooltip(null); }}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  <path d={arc(group) ?? undefined} fill={color(node.id)} />
                  <text
                    transform={`translate(${x},${y}) rotate(${rotate + (flip ? 180 : 0)})`}
                    textAnchor={flip ? "end" : "start"}
                    dominantBaseline="middle"
                    fontSize="11"
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {tooltip && (
          <div style={{
            position: 'fixed', zIndex: 9999, pointerEvents: 'none',
            left: tooltip.x + 14, top: tooltip.y - 10,
            background: 'rgba(255,255,255,0.96)', color: '#2D2A26',
            padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.7,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.08)',
            maxWidth: 220,
          }} dangerouslySetInnerHTML={{ __html: tooltip.html }} />
        )}
      </div>
    </section>
  );
}

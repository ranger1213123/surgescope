import { useEffect, useMemo, useRef, useCallback } from "react";
import * as d3 from "d3";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import type { OdFlowData, OdLink, OdNode } from "../../types";
import { useOdFlowInteraction } from "./OdFlowContext";
import { formatNumber, linkTouchesNode } from "./odFlowUtils";

type OdFlowMapProps = {
  data: OdFlowData;
};

// ---- D3 SVG overlay rendered on top of the Leaflet map ----
function FlowOverlay({ data, links, color, surgeColor, linkWidthScale, nodeRadiusScale }: {
  data: OdFlowData;
  links: OdLink[];
  color: d3.ScaleOrdinal<string, string>;
  surgeColor: (v: number) => string;
  linkWidthScale: d3.ScalePower<number, number>;
  nodeRadiusScale: d3.ScalePower<number, number>;
}) {
  const map = useMap();
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    hoveredNodeId, selectedNodeId,
    setHoveredNodeId, setSelectedNodeId,
    hoveredLinkId, selectedLinkId,
    setHoveredLinkId, setSelectedLinkId,
  } = useOdFlowInteraction();

  const activeNodeId = hoveredNodeId ?? selectedNodeId;
  const activeLinkId = hoveredLinkId ?? selectedLinkId;

  const nodeById = useMemo(
    () => new Map(data.nodes.map(n => [n.id, n])),
    [data.nodes]
  );

  const draw = useCallback(() => {
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    if (!svgRef.current || !gRef.current) return;

    // Ensure Leaflet knows the correct container size before projecting
    map.invalidateSize({ animate: false });
    const size = map.getSize();

    // Position the SVG overlay precisely on top of the Leaflet map pane
    const mapPane = map.getContainer();
    const paneRect = mapPane.getBoundingClientRect();
    const containerEl = containerRef.current;
    if (containerEl) {
      const containerRect = containerEl.getBoundingClientRect();
      // Offset the SVG so its origin (0,0) aligns with Leaflet's container origin
      const offsetX = paneRect.left - containerRect.left;
      const offsetY = paneRect.top - containerRect.top;
      svgRef.current.style.left = `${offsetX}px`;
      svgRef.current.style.top = `${offsetY}px`;
    }

    svg.attr("width", size.x).attr("height", size.y);

    function project(lng: number, lat: number): [number, number] {
      const pt = map.latLngToContainerPoint([lat, lng]);
      return [pt.x, pt.y];
    }

    function isActive(d: OdLink) {
      return activeLinkId === d.id || linkTouchesNode(d, activeNodeId);
    }
    function isNodeActive(id: string) {
      return activeNodeId === id;
    }
    const hasFocus = Boolean(activeNodeId || activeLinkId);

    // ---- Flow lines ----
    const lineSel = g.selectAll<SVGPathElement, OdLink>(".flight-line")
      .data(links, d => d.id)
      .join("path")
      .attr("class", "flight-line");

    // Remove stale titles then re-append
    lineSel.selectAll("title").remove();
    lineSel
      .attr("d", d => {
        const s = nodeById.get(d.source);
        const t = nodeById.get(d.target);
        if (!s || !t) return "";
        const [x1, y1] = project(s.longitude, s.latitude);
        const [x2, y2] = project(t.longitude, t.latitude);
        const dx = x2 - x1, dy = y2 - y1;
        const mx = (x1 + x2) / 2 - dy * 0.22;
        const my = (y1 + y2) / 2 + dx * 0.22;
        return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
      })
      .attr("stroke", d => surgeColor(d.avgSurge ?? 1))
      .attr("stroke-width", d => linkWidthScale(d.value))
      .attr("stroke-opacity", d => {
        const active = isActive(d);
        return hasFocus && !active ? 0.08 : active ? 0.92 : 0.55;
      })
      .attr("fill", "none")
      .attr("stroke-linecap", "round")
      .style("pointer-events", "stroke")
      .on("mouseenter", (_, d) => setHoveredLinkId(d.id))
      .on("mouseleave", () => setHoveredLinkId(null))
      .on("click", (_, d) => setSelectedLinkId(d.id));
    lineSel.append("title").text(d => {
      const s = nodeById.get(d.source);
      const t = nodeById.get(d.target);
      return `${s?.name ?? d.source} → ${t?.name ?? d.target}\n订单量：${formatNumber(d.value)}\n均价：$${d.avgPrice ?? '无'}\n溢价：${d.avgSurge ?? '无'}x\n均距：${d.avgDistance} km`;
    });

    // ---- Node circles ----
    const nodeSel = g.selectAll<SVGCircleElement, OdNode>(".map-node-circle")
      .data(data.nodes, d => d.id)
      .join("circle")
      .attr("class", "map-node-circle");

    nodeSel.selectAll("title").remove();
    nodeSel
      .attr("cx", d => project(d.longitude, d.latitude)[0])
      .attr("cy", d => project(d.longitude, d.latitude)[1])
      .attr("r", d => nodeRadiusScale(d.totalIn + d.totalOut))
      .attr("fill", d => color(d.id))
      .attr("stroke", "#fff")
      .attr("stroke-width", d => (isNodeActive(d.id) ? 3.5 : 1.5))
      .attr("fill-opacity", d => {
        const active = isNodeActive(d.id);
        return hasFocus && !active ? 0.18 : active ? 1 : 0.88;
      })
      .style("cursor", "pointer")
      .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.3))")
      .on("mouseenter", (_, d) => setHoveredNodeId(d.id))
      .on("mouseleave", () => setHoveredNodeId(null))
      .on("click", (_, d) => setSelectedNodeId(d.id));
    nodeSel.append("title").text(d => `${d.name}\n流入：${formatNumber(d.totalIn)}\n流出：${formatNumber(d.totalOut)}`);

    // ---- Node labels ----
    g.selectAll<SVGTextElement, OdNode>(".map-node-label")
      .data(data.nodes, d => d.id)
      .join("text")
      .attr("class", "map-node-label")
      .attr("x", d => project(d.longitude, d.latitude)[0])
      .attr("y", d => project(d.longitude, d.latitude)[1] - nodeRadiusScale(d.totalIn + d.totalOut) - 10)
      .attr("text-anchor", "middle")
      .attr("fill", "#2D2A26")
      .attr("font-size", "11")
      .attr("font-weight", "700")
      .style("paint-order", "stroke")
      .style("stroke", "rgba(255,255,255,0.8)")
      .style("stroke-width", "3px")
      .style("pointer-events", "none")
      .text(d => d.name);
  }, [map, links, data.nodes, nodeById, color, surgeColor, linkWidthScale, nodeRadiusScale, activeNodeId, activeLinkId, setHoveredNodeId, setHoveredLinkId, setSelectedNodeId, setSelectedLinkId]);

  useEffect(() => {
    // Initial draw after a microtask — lets the map finish initializing its panes
    const t = setTimeout(() => { draw(); }, 50);
    map.on("moveend zoomend", draw);
    return () => {
      clearTimeout(t);
      map.off("moveend zoomend", draw);
    };
  }, [draw, map]);

  // ResizeObserver: keep the SVG aligned when the map container changes size
  useEffect(() => {
    const mapContainer = map.getContainer();
    if (!mapContainer) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      draw();
    });
    ro.observe(mapContainer);
    // Also observe our wrapper container
    if (containerRef.current) ro.observe(containerRef.current);
    // Window resize fallback
    const onResize = () => { map.invalidateSize({ animate: false }); draw(); };
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [map, draw]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg ref={svgRef as any} style={{ position: "absolute", top: 0, left: 0, zIndex: 400, pointerEvents: "none" }}>
        <g ref={gRef as any} />
      </svg>
    </div>
  );
}

// ---- Main flow map component ----
export function OdFlowMap({ data }: OdFlowMapProps) {
  const { color, surgeColor, linkWidthScale, nodeRadiusScale, surgeExtent } = useMemo(() => {
    const cScale = d3.scaleOrdinal<string>(d3.schemeTableau10)
      .domain(data.nodes.map(n => n.id));

    const surges = data.links.map(l => l.avgSurge).filter((s): s is number => s != null);
    const sMin = d3.min(surges) ?? 1;
    const sMax = d3.max(surges) ?? 2;
    const sScale = d3.scaleSequential(
      d3.interpolateRgbBasis(["#2A9D8F", "#E9C46A", "#E76F51"])
    ).domain([sMin, sMax]);

    const maxLink = d3.max(data.links, l => l.value) ?? 1;
    // Node scale: use actual min/max range for meaningful size differentiation
    const nodeTotals = data.nodes.map(n => n.totalIn + n.totalOut);
    const minNodeTotal = d3.min(nodeTotals) ?? 1;
    const maxNodeTotal = d3.max(nodeTotals) ?? 1;

    return {
      color: cScale,
      surgeColor: sScale,
      linkWidthScale: d3.scaleSqrt().domain([1, maxLink]).range([1.2, 7]),
      nodeRadiusScale: d3.scaleSqrt().domain([minNodeTotal, maxNodeTotal]).range([6, 17]),
      surgeExtent: [sMin, sMax] as [number, number],
    };
  }, [data]);

  // Boston center
  const center: [number, number] = [42.351, -71.07];

  return (
    <section className="viz-card">
      <div className="card-head">
        <p className="eyebrow">飞线地图</p>
        <h2>飞线地图 · 真实地理底图</h2>
        <p className="card-desc">
          在波士顿真实地图上查看 OD 流向。圆圈越大 = 区域订单越多，曲线越粗 = OD 流量越大，
          颜色从绿到橙表示溢价从低到高。可拖拽和缩放地图。
        </p>
      </div>

      {/* Surge + width legend */}
      <div className="legend-bar">
        <span className="legend-label">低溢价</span>
        <div className="legend-gradient" style={{ background: `linear-gradient(to right, #2A9D8F, #E9C46A, #E76F51)` }} />
        <span className="legend-label">高溢价</span>
        <span style={{ marginLeft: 8, color: '#5C564E', fontSize: 11 }}>
          ({surgeExtent[0].toFixed(3)} – {surgeExtent[1].toFixed(3)})
        </span>
        <span style={{ margin: '0 6px', color: '#5C564E' }}>|</span>
        <svg width="40" height="12"><line x1="0" y1="6" x2="40" y2="6" stroke="#2A9D8F" strokeWidth="1.2" /></svg>
        <span style={{ fontSize: 11, color: '#5C564E' }}>少</span>
        <svg width="40" height="12"><line x1="0" y1="6" x2="40" y2="6" stroke="#E76F51" strokeWidth="5" /></svg>
        <span style={{ fontSize: 11, color: '#5C564E' }}>多</span>
      </div>

      <div className="map-container" style={{ position: "relative", overflow: "hidden", borderRadius: 12 }}>
        <MapContainer
          center={center}
          zoom={13}
          style={{ width: "100%", height: "100%", minHeight: 540 }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlowOverlay
            data={data}
            links={data.links}
            color={color}
            surgeColor={surgeColor}
            linkWidthScale={linkWidthScale}
            nodeRadiusScale={nodeRadiusScale}
          />
        </MapContainer>
      </div>
    </section>
  );
}

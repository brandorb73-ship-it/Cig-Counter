"use client";

import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

/* =========================
   NODE RENDERER
========================= */
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  if (x === undefined || isNaN(x)) return null;
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill="#38bdf8" fillOpacity={0.9} rx={2} />
      <text
        x={isOut ? x - 10 : x + width + 10}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize={10}
        fontWeight={800}
        fill="#fff"
        dominantBaseline="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

/* =========================
   TOOLTIP (FIXED)
========================= */
const AuditTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  if (!d || !d.sourceName) return null;

  const gap = d.exportSticks - d.precursorSticks;
  const taxLoss = gap > 0 ? gap * 0.15 : 0;

  return (
    <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl text-[11px] shadow-2xl">
      <div className="text-emerald-400 font-black mb-2 uppercase italic">Mass Balance Audit</div>
      <div className="font-bold text-white mb-2 border-b border-slate-800 pb-1">
        {d.sourceName} → {d.targetName}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Precursor Capacity:</span>
          <span className="text-emerald-400">
            {Math.round(d.precursorSticks).toLocaleString()} sticks
          </span>
        </div>

        <div className="flex justify-between">
          <span>Exports:</span>
          <span className="text-blue-400">
            {Math.round(d.exportSticks).toLocaleString()} sticks
          </span>
        </div>

        <div className={`mt-3 p-2 rounded text-center font-black ${
          gap > 0 ? "bg-red-500/20 text-red-500" : "bg-emerald-500/20 text-emerald-400"
        }`}>
          {gap > 0
            ? `TAX GAP: $${Math.round(taxLoss).toLocaleString()}`
            : "AUDIT CLEAR"}
        </div>
      </div>
    </div>
  );
};

/* =========================
   MAIN COMPONENT
========================= */
export default function SankeyFlow({ processedData }) {
  const { sankeyData, riskLevel, riskFlags, summary } = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return { sankeyData: { nodes: [], links: [] }, riskLevel: "LOW", riskFlags: [], summary: null };
    }

    /* ========= CLEAN DATA ========= */
    const cleanData = processedData.filter(d => {
      if (!d || Object.values(d).every(v => !v)) return false;

      const origin = d.origin || d.Origin;
      const dest = d.dest || d.Dest || d.Destination;
      const outflow = d.outflow || d.Outflow;

      return origin && dest && outflow && Number(outflow) > 0;
    });

    const nodes = [];
    const nodeMap = new Map();
    const linkMap = new Map();

    const addNode = (name, layer) => {
      const safe = name || "Unknown Entity";
      const key = `${safe}-L${layer}`;
      if (!nodeMap.has(key)) {
        const id = nodes.length;
        nodes.push({ name: safe, layer });
        nodeMap.set(key, id);
        return id;
      }
      return nodeMap.get(key);
    };

    /* ========= CORE LOOP ========= */
    const sankeyData = useMemo(() => {
  const nodes = [];
  const nodeMap = new Map();
  const links = [];

  // 1. Helper to safely add nodes
  const addNode = (name) => {
    if (!nodeMap.has(name)) {
      nodeMap.set(name, nodes.length);
      nodes.push({ name });
    }
    return nodeMap.get(name);
  };

  // 2. Process and Filter
  cleanData.forEach(d => {
    const rawPaths = [
      { s: d.tobaccoOrigin, v: d.tobaccoSticks },
      { s: d.paperOrigin, v: d.paperSticks },
      { s: d.filterOrigin, v: d.filterSticks },
      { s: d.towOrigin, v: d.towSticks }
    ];

    rawPaths.forEach(({ s, v }) => {
      // CRITICAL FILTERS:
      // - v > 0: Sankey crashes on 0 or negative values
      // - s !== d.destination: Sankey crashes on self-loops (A -> A)
      if (s && d.destination && s !== d.destination && v > 0) {
        links.push({
          source: addNode(s),
          target: addNode(d.destination),
          value: v
        });
      }
    });
  });

  // 3. Final safety check: If no valid links exist, return a dummy state 
  // to prevent Recharts from trying to render an empty graph.
  if (nodes.length === 0 || links.length === 0) {
    return { nodes: [{ name: "No Data" }], links: [] };
  }

  return { nodes, links };
}, [cleanData]);

    /* ========= FORENSIC TOTALS ========= */
    const totalPrecursorSticks = links.reduce((a, b) => a + b.precursorSticks, 0) / 2;
    const totalExportSticks = links.reduce((a, b) => a + b.exportSticks, 0) / 2;

    const capacity = totalPrecursorSticks;
    const stampGap = totalExportSticks - capacity;
    const estTaxLoss = stampGap > 0 ? stampGap * 0.15 : 0;

    /* ========= RISK FLAGS ========= */
    const flags = [];
    if (stampGap > 10000) flags.push({ msg: `Critical Stamp Gap: ${Math.round(stampGap).toLocaleString()} undeclared sticks.`, type: "CRITICAL" });
    if (capacity > totalExportSticks * 1.5) flags.push({ msg: "High Stockpiling detected.", type: "HIGH" });

    /* ========= TOP CORRIDOR ========= */
    const topLink = links.reduce((max, l) => {
      const gap = l.exportSticks - l.precursorSticks;
      return gap > (max?.gap || 0) ? { ...l, gap } : max;
    }, null);

    /* ========= RISK TYPE ========= */
    let riskType = "BALANCED";
    if (stampGap > 0 && totalExportSticks > capacity * 1.2) riskType = "UNDER_DECLARATION";
    else if (capacity > totalExportSticks * 1.5) riskType = "STOCKPILING";
    else if (stampGap > 0) riskType = "DIVERSION";

    /* ========= SEVERITY ========= */
    let severity = "LOW";
    if (estTaxLoss > 1000000) severity = "CRITICAL";
    else if (estTaxLoss > 250000) severity = "HIGH";
    else if (estTaxLoss > 50000) severity = "MEDIUM";

    return {
      sankeyData: { nodes, links },
      riskLevel: severity,
      riskFlags: flags,
      summary: {
        hub: cleanData[0]?.entity || "Main Hub",
        destinations: [...new Set(cleanData.map(d => d.dest || d.Dest || d.Destination))],
        totalSticks: totalExportSticks,
        taxLoss: estTaxLoss,
        capacity,
        riskType,
        severity,
        topCorridor: topLink ? `${topLink.sourceName} → ${topLink.targetName}` : null
      },
    };
  }, [processedData]);

  if (!sankeyData.nodes.length) return <div className="p-10 text-slate-500">Mapping Forensic Flow...</div>;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[700px] flex flex-col">

      {/* HEADER */}
      <div className="flex justify-between mb-6">
        <h3 className="text-xs text-slate-400 uppercase font-black tracking-widest">
          Revenue Protection Monitor
        </h3>
        <div className="px-4 py-1 border text-[10px] font-black rounded text-red-500 border-red-500">
          {riskLevel} RISK
        </div>
      </div>

      {/* SANKEY */}
      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={40}
            node={<SankeyNode />}
            link={{ stroke: "#38bdf8", strokeOpacity: 0.25 }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      {/* FLAGS */}
      <div className="mt-6 space-y-2">
        {riskFlags.map((f, i) => (
          <div key={i} className="p-2 bg-black/40 border border-slate-800 rounded text-[11px]">
            <span className="text-red-500 font-bold">[{f.type}]</span> {f.msg}
          </div>
        ))}

        {/* SUMMARY */}
        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded text-[11px] text-slate-400 italic">
          <strong className="text-blue-400 not-italic">AI Forensic Summary:</strong>{" "}
          The hub <strong className="text-white">{summary?.hub}</strong> supplied{" "}
          <strong className="text-white">{summary?.destinations?.slice(0, 3).join(", ")}</strong>, processing{" "}
          <strong className="text-white">{Math.round(summary?.totalSticks).toLocaleString()} sticks</strong>.{" "}

          <span className="text-red-400 font-bold">[{summary?.severity}]</span>{" "}

          {summary?.riskType === "UNDER_DECLARATION" && "Output exceeds feasible capacity — likely under-declaration."}
          {summary?.riskType === "STOCKPILING" && "Excess precursor indicates stockpiling behaviour."}
          {summary?.riskType === "DIVERSION" && "Mismatch suggests diversion to unregulated markets."}
          {summary?.riskType === "BALANCED" && "No material discrepancy detected."}

          {summary?.topCorridor && (
            <> Highest risk corridor: <strong className="text-red-400">{summary.topCorridor}</strong>.</>
          )}

          {summary?.taxLoss > 0 && (
            <> Estimated tax exposure: <strong className="text-red-500">${summary.taxLoss.toLocaleString()}</strong>.</>
          )}
        </div>
      </div>
    </div>
  );
}

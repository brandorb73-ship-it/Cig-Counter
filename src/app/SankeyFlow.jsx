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
   TOOLTIP: FORENSIC MATH
========================= */
const AuditTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  if (!d || !d.sourceName) return null;

  // Conversion: 1kg tobacco = ~1,357 sticks (at 95% yield)
  const precursorCapacity = (d.tobaccoKG * 0.95) / 0.0007;
  const exportSticks = d.actualSticks;
  const gap = Math.round(exportSticks - precursorCapacity);
  const taxLoss = gap > 0 ? gap * 0.15 : 0;

  return (
    <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl text-[11px] shadow-2xl">
      <div className="text-emerald-400 font-black mb-2 uppercase italic">Mass Balance Audit</div>
      <div className="font-bold text-white mb-2 border-b border-slate-800 pb-1">{d.sourceName} → {d.targetName}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4"><span>Precursor (Tobacco):</span><span className="text-white">{Math.round(d.tobaccoKG).toLocaleString()} KG</span></div>
        <div className="flex justify-between gap-4"><span>Converted Capacity:</span><span className="text-emerald-400">{Math.round(precursorCapacity).toLocaleString()} sticks</span></div>
        <div className="flex justify-between gap-4"><span>Actual Exports:</span><span className="text-blue-400">{Math.round(exportSticks).toLocaleString()} sticks</span></div>
        <div className={`mt-3 p-2 rounded text-center font-black ${gap > 0 ? "bg-red-500/20 text-red-500" : "bg-emerald-500/20 text-emerald-400"}`}>
          {gap > 0 ? `TAX GAP: $${taxLoss.toLocaleString()}` : "AUDIT CLEAR"}
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

    const nodes = [];
    const nodeMap = new Map();
    const linkMap = new Map();

    // 1. DATA CLEANING & UNIT CONVERSION
    const addNode = (name, layer) => {
      // Handles case-insensitive column naming
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

    processedData.forEach((d) => {
      // Normalize Column Keys (Supports 'origin' or 'Origin', etc)
      const origin = d.origin || d.Origin || "Unknown";
      const entity = d.entity || d.Entity || "Production Hub";
      const dest = d.dest || d.Dest || d.Destination || "Unknown Market";

      // UNIT CONVERSION
      // If inflow/outflow is in KG, convert to sticks (1kg = 1000 sticks approx)
      const tobaccoKG = Number(d.tobacco) || Number(d.Tobacco) || 0;
      const actualSticks = (Number(d.outflow) || Number(d.Outflow) || 0) * 1000; 

      // Visual scaling for the chart
      const scaledValue = Math.log10(actualSticks + 1) * 1000;

      const s = addNode(origin, 0);
      const e = addNode(entity, 1);
      const t = addNode(dest, 2);

      const update = (src, tgt, sName, tName) => {
        const key = `${src}-${tgt}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, { source: src, target: tgt, sourceName: sName, targetName: tName, value: 0, tobaccoKG: 0, actualSticks: 0 });
        }
        const l = linkMap.get(key);
        l.value += scaledValue;
        l.tobaccoKG += tobaccoKG;
        l.actualSticks += actualSticks;
      };

      update(s, e, origin, entity);
      update(e, t, entity, dest);
    });

    let links = Array.from(linkMap.values()).filter(l => l.value > 0);

    /* ========= FORENSIC ANALYTICS ========= */
    const totalTobacco = links.reduce((a, b) => a + b.tobaccoKG, 0) / 2;
    const totalActualSticks = links.reduce((a, b) => a + b.actualSticks, 0) / 2;
    const capacity = (totalTobacco * 0.95) / 0.0007;
    const stampGap = totalActualSticks - capacity;
    const estTaxLoss = stampGap > 0 ? stampGap * 0.15 : 0;

    const flags = [];
    if (stampGap > 10000) flags.push({ msg: `Critical Stamp Gap: ${Math.round(stampGap).toLocaleString()} undeclared sticks.`, type: "CRITICAL" });
    if (capacity > totalActualSticks * 1.5) flags.push({ msg: "High Stockpiling: Precursors exceed output by 50%.", type: "HIGH" });

    return {
      sankeyData: { nodes, links },
      riskLevel: flags.length > 0 ? flags[0].type : "LOW",
      riskFlags: flags,
      summary: {
        hub: processedData[0]?.entity || processedData[0]?.Entity || "Main Hub",
        totalSticks: totalActualSticks,
        taxLoss: estTotalTaxLoss,
        capacity: capacity
      },
    };
  }, [processedData]);

  if (!sankeyData.nodes.length) return <div className="p-10 text-slate-500">Mapping Forensic Flow...</div>;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[700px] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xs text-slate-400 uppercase font-black tracking-widest">Revenue Protection Monitor</h3>
        <div className={`px-4 py-1 border text-[10px] font-black rounded ${riskLevel === 'CRITICAL' ? 'text-red-500 border-red-500 bg-red-500/10' : 'text-emerald-500 border-emerald-500'}`}>
          {riskLevel} RISK
        </div>
      </div>

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={40}
            node={<SankeyNode />}
            link={{ stroke: "#38bdf8", strokeOpacity: 0.2 }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 space-y-2">
        {riskFlags.map((f, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-black/40 border border-slate-800 rounded text-[11px]">
            <span className="text-red-500 font-bold underline">[{f.type}]</span>
            <span className="text-slate-200">{f.msg}</span>
          </div>
        ))}
        <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded text-[11px] text-slate-400 italic">
          <strong className="text-blue-400 not-italic">AI Forensic Summary:</strong> The hub <strong className="text-white">{summary?.hub}</strong> processed <strong className="text-white">{Math.round(summary?.totalSticks).toLocaleString()} sticks</strong>. 
          {summary?.taxLoss > 0 
            ? ` Mass-balance reveals a stamp gap against precursor capacity (${Math.round(summary?.capacity).toLocaleString()} sticks), indicating a potential tax leakage of $${summary?.taxLoss.toLocaleString()}.` 
            : " No significant volume discrepancies detected."}
        </div>
      </div>
    </div>
  );
}

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
        fontSize={11}
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
   TOOLTIP: STICKS & TAX LOSS
========================= */
const AuditTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const d = payload[0].payload;
  if (!d || !d.sourceName) return null;

  const efficiency = 0.95;
  // Forensic Calculation: 0.7g tobacco per stick (0.0007 KG)
  const capacitySticks = (d.tobacco * efficiency) / 0.0007;
  const exportSticks = d.actualOutflow; 
  const gap = Math.round(exportSticks - capacitySticks);
  const taxLoss = gap > 0 ? gap * 0.15 : 0; // Est $0.15 excise per stick

  return (
    <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl text-[11px] shadow-2xl min-w-[220px]">
      <div className="text-emerald-400 font-black mb-2 uppercase tracking-tighter">Mass Balance Audit</div>
      <div className="font-bold text-white mb-3 border-b border-slate-800 pb-1">{d.sourceName} → {d.targetName}</div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-slate-400">
          <span>Raw Precursor:</span>
          <span className="text-white font-mono">{Math.round(d.tobacco).toLocaleString()} kg</span>
        </div>
        <div className="flex justify-between text-slate-400 italic">
          <span>Model Capacity:</span>
          <span className="text-emerald-400">{Math.round(capacitySticks).toLocaleString()} sticks</span>
        </div>
        <div className="flex justify-between text-slate-400 italic">
          <span>Actual Exports:</span>
          <span className="text-blue-400">{Math.round(exportSticks).toLocaleString()} sticks</span>
        </div>
        
        <div className={`mt-3 p-2 rounded text-center font-black ${gap > 0 ? "bg-red-500/20 text-red-500" : "bg-emerald-500/20 text-emerald-400"}`}>
          {gap > 0 ? `TAX LOSS: $${taxLoss.toLocaleString()}` : "COMPLIANT"}
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
    const CLUSTER_THRESHOLD = 0.03; 

    const addNode = (name, layer) => {
      const safe = name || "Unknown";
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
      // Logic: Convert KG sticks or direct stick count to outflow
      const actualOutflow = Number(d.outflow) || 0;
      const valueRaw = Math.max(1, actualOutflow);
      
      // Scaled value for visual Sankey thickness
      const scaled = Math.log10(valueRaw + 1) * 1000;

      const s = addNode(d.origin, 0);
      const e = addNode(d.entity, 1);
      const t = addNode(d.dest, 2);

      const update = (src, tgt, sName, tName) => {
        const key = `${src}-${tgt}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, { source: src, target: tgt, sourceName: sName, targetName: tName, value: 0, tobacco: 0, actualOutflow: 0 });
        }
        const l = linkMap.get(key);
        l.value += scaled;
        l.actualOutflow += actualOutflow;
        l.tobacco += Number(d.tobacco) || 0;
      };

      update(s, e, d.origin, d.entity);
      update(e, t, d.entity, d.dest);
    });

    let links = Array.from(linkMap.values()).filter(l => l.value > 0);

    // Clustering Logic
    const totalVisValue = links.reduce((a, b) => a + b.value, 0);
    links = links.map((l) => (l.value / totalVisValue < CLUSTER_THRESHOLD ? { ...l, targetName: "OTHER" } : l));

    /* ========= FORENSIC ANALYTICS ========= */
    const totalTobacco = links.reduce((a, b) => a + b.tobacco, 0) / 2;
    const totalActualOutflow = links.reduce((a, b) => a + b.actualOutflow, 0) / 2;
    const capacity = (totalTobacco * 0.95) / 0.0007;
    
    let score = 0;
    const flags = [];

    // Tax Loss Calculation for AI Summary
    const totalGap = Math.max(0, totalActualOutflow - capacity);
    const estTotalTaxLoss = totalGap * 0.15;

    if (totalActualOutflow > capacity * 1.05) {
      flags.push({ msg: `Stamp Gap: Exports exceed capacity by ${Math.round(totalGap).toLocaleString()} sticks`, type: "CRITICAL" });
      score += 4;
    }

    if (capacity > totalActualOutflow * 1.3) {
      flags.push({ msg: "Stockpiling: Inventory accumulation exceeds 30%", type: "HIGH" });
      score += 2;
    }

    const level = score >= 4 ? "CRITICAL" : score >= 2 ? "HIGH" : "LOW";
    const topRoute = links.length > 0 ? links.reduce((p, c) => (p.value > c.value ? p : c)) : null;

    return {
      sankeyData: { nodes, links },
      riskLevel: level,
      riskFlags: flags,
      summary: {
        topRoute: topRoute ? `${topRoute.sourceName} → ${topRoute.targetName}` : "N/A",
        totalVolume: totalActualOutflow,
        taxLoss: estTotalTaxLoss,
        hub: processedData[0]?.entity || "Unknown",
      },
    };
  }, [processedData]);

  if (!sankeyData.nodes.length) return <div className="text-slate-500 p-6">Analyzing trade data...</div>;

  const styles = {
    CRITICAL: "text-red-500 border-red-500 bg-red-500/10",
    HIGH: "text-orange-500 border-orange-500 bg-orange-500/10",
    LOW: "text-emerald-500 border-emerald-500 bg-emerald-500/10",
  };

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[750px] flex flex-col shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xs text-slate-400 uppercase font-black tracking-widest">Trade Flow Intelligence</h3>
          <p className="text-[10px] text-slate-500 mt-1 uppercase">Automated Mass-Balance Audit</p>
        </div>
        <div className={`px-4 py-1.5 border-2 text-[10px] font-black rounded-full ${styles[riskLevel]}`}>
          {riskLevel} RISK ALERT
        </div>
      </div>

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={40}
            linkCurvature={0.5}
            node={<SankeyNode />}
            link={{ stroke: "#38bdf8", strokeOpacity: 0.3 }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      {/* AI INSIGHTS & ALERTS */}
      <div className="mt-6 space-y-3">
        {riskFlags.map((f, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 border rounded-xl ${f.type === 'CRITICAL' ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${f.type === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>{f.type}</span>
            <p className="text-[11px] text-slate-200">{f.msg}</p>
          </div>
        ))}

        <div className="p-4 bg-black/40 rounded-xl border border-slate-800/50">
          <p className="text-[11px] text-slate-400 leading-relaxed italic">
            <strong className="text-emerald-400 not-italic">AI Summary:</strong> Audit of <strong className="text-white">{summary?.hub}</strong> confirms a throughput of <strong className="text-white">{Math.round(summary?.totalVolume).toLocaleString()} sticks</strong>. 
            {summary?.taxLoss > 0 
              ? ` Discrepancies between tobacco input and export output suggest a potential tax leakage of $${summary?.taxLoss.toLocaleString()}.` 
              : " Material inputs align with declared production volumes."}
            Primary flow follows the <strong className="text-white">{summary?.topRoute}</strong> corridor.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// -------------------------
// NODE RENDERER
// -------------------------
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  if (x === undefined || isNaN(x)) return null;
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#38bdf8"
        fillOpacity={0.9}
        rx={2}
      />
      <text
        x={isOut ? x - 12 : x + width + 12}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize="12px"
        fontWeight="900"
        fill="#ffffff"
        dominantBaseline="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

// -------------------------
// TOOLTIP FOR LINKS
// -------------------------
const AuditTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    // Compute KG → sticks
    const sticks = Math.round(data.value / 0.001 * 0.7); // 1 stick = 1g, 0.7g tobacco
    const capacitySticks = Math.round(data.tobacco / 0.0007);

    return (
      <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[280px] pointer-events-none z-50">
        <div className="border-b border-slate-800 pb-2 mb-2 text-[10px] text-emerald-400 font-black uppercase tracking-widest">
          Forensic Mass-Balance
        </div>
        <div className="text-white text-sm font-bold mb-3">
          {data.sourceName} → {data.targetName}
        </div>
        <div className="space-y-3 text-[11px]">
          <div className="flex justify-between text-slate-400">
            <span>Tobacco Weight:</span>
            <span className="text-white font-mono">{data.tobacco.toLocaleString()} KG</span>
          </div>
          <div className="bg-black/50 p-2 rounded border border-slate-800 space-y-2">
            <div className="flex justify-between italic text-slate-400">
              <span>Model Capacity:</span>
              <span className="text-emerald-400 font-bold">{capacitySticks.toLocaleString()} sticks</span>
            </div>
            <div className="flex justify-between italic text-slate-400">
              <span>Actual Exports:</span>
              <span className="text-blue-400 font-bold">{sticks.toLocaleString()} sticks</span>
            </div>
          </div>
          <div className={`p-2 rounded font-black text-center ${
            sticks - capacitySticks > 5000 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            STAMP GAP: {(sticks - capacitySticks).toLocaleString()}
          </div>
        </div>
      </div>
    );
  }
  return null;
};

// -------------------------
// MAIN COMPONENT
// -------------------------
export default function SankeyFlow({ processedData }) {

  const { sankeyData, summary, riskFlags, riskLevel } = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return { sankeyData: { nodes: [], links: [] }, summary: null, riskFlags: [], riskLevel: 'LOW' };
    }

    const nodes = [];
    const nodeMap = new Map(); // key → index
    const linkMap = new Map();

    // HELPER: Add nodes and get index
    const getNodeIndex = (name) => {
      if (!name) name = "Unknown";
      if (!nodeMap.has(name)) {
        const idx = nodes.length;
        nodes.push({ name });
        nodeMap.set(name, idx);
        return idx;
      }
      return nodeMap.get(name);
    };

    // BUILD LINKS
    processedData.forEach(d => {
      const sticks = Math.round((Number(d.outflow) || 0) / 0.001 * 0.7);
      const sId = getNodeIndex(d.origin);
      const eId = getNodeIndex(d.entity);
      const dId = getNodeIndex(d.dest);

      const addLink = (src, tgt, sName, tName) => {
        const key = `${src}-${tgt}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, { source: src, target: tgt, sourceName: sName, targetName: tName, value: 0, tobacco: 0 });
        }
        const l = linkMap.get(key);
        l.value += sticks;
        l.tobacco += Number(d.tobacco) || 0;
      };

      addLink(sId, eId, d.origin, d.entity);
      addLink(eId, dId, d.entity, d.dest);
    });

    let links = Array.from(linkMap.values()).filter(l => l.value > 0);

    const totalVolume = links.reduce((acc, curr) => acc + curr.value, 0);
    const totalTobacco = links.reduce((acc, curr) => acc + curr.tobacco, 0);

    const capacity = Math.round((totalTobacco * 0.95) / 0.0007);

    // -------------------------
    // RISK FLAGS
    // -------------------------
    const flags = [];
    let score = 0;

    if (totalVolume > capacity * 1.1) {
      flags.push({ type: 'CRITICAL', msg: 'STAMP GAP: Exports exceed physical capacity.' });
      score += 4;
    }

    const inputCapacity = processedData.reduce((acc, d) => acc + Number(d.inventoryPool || 0), 0);
    const cumulativeExports = processedData.reduce((acc, d) => acc + Number(d.exports || 0), 0);

    if (inputCapacity > cumulativeExports * 1.3) {
      flags.push({ type: 'STOCKPILE', msg: 'STOCKPILING: Inventory accumulation detected.' });
      score += 2;
    }

    const level = score >= 4 ? 'CRITICAL' : score >= 2 ? 'HIGH' : 'LOW';

    // -------------------------
    // DYNAMIC AI SUMMARY
    // -------------------------
    const topRoute = links.reduce((p, c) => p.value > c.value ? p : c, links[0]);
    const summary = {
      totalVolume,
      topRoute: `${topRoute?.sourceName} → ${topRoute?.targetName}`,
      hub: processedData[0]?.entity,
      riskLevel: level,
      exportVsCapacity: totalVolume > capacity ? 'Potential external sourcing or undeclared inputs.' : 'Aligned production-output behavior.'
    };

    return { sankeyData: { nodes, links }, summary, riskFlags: flags, riskLevel: level };
  }, [processedData]);

  const levelStyles = {
    CRITICAL: "text-red-500 border-red-500 bg-red-500/10",
    HIGH: "text-orange-500 border-orange-500 bg-orange-500/10",
    LOW: "text-emerald-500 border-emerald-500 bg-emerald-500/10"
  };

  if (!sankeyData.nodes.length || !sankeyData.links.length) {
    return <div className="text-slate-400 text-sm p-4">No valid flow data</div>;
  }

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[700px] flex flex-col">
      <div className="flex justify-between items-center mb-10">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Trade Flow Forensic Audit</h3>
        <div className={`px-4 py-1.5 rounded-full border-2 font-black text-[10px] tracking-tighter ${levelStyles[riskLevel]}`}>
          ENTITY RISK: {riskLevel}
        </div>
      </div>

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={50}
            linkCurvature={0.5}
            node={<SankeyNode />}
            link={{ stroke: "#38bdf8", strokeOpacity: 0.4, fill: "#38bdf8", fillOpacity: 0.15 }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div className="mt-8 space-y-3">
        {riskFlags.map((f, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 border rounded-xl ${
            f.type === 'CRITICAL' ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20'
          }`}>
            <span className={`text-[9px] font-black px-2 py-1 rounded uppercase ${
              f.type === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'
            }`}>
              {f.type} FLAG
            </span>
            <p className="text-[11px] text-slate-200">{f.msg}</p>
          </div>
        ))}

        <div className="p-4 bg-black/40 rounded-xl border border-slate-800/50">
          <p className="text-xs text-slate-400 leading-relaxed italic">
            Audit confirms <strong className="text-white">{summary?.hub}</strong> processed <strong className="text-white">{summary?.totalVolume.toLocaleString()} sticks</strong>. 
            The primary corridor is <strong className="text-white">{summary?.topRoute}</strong>. 
            <br/>
            <strong className="text-emerald-300">AI Insight:</strong> {summary?.exportVsCapacity}
          </p>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// 1. High-Contrast Node Renderer
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  if (x === undefined || y === undefined || isNaN(x) || isNaN(y)) return null;
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill="#38bdf8" fillOpacity={0.9} rx={2} />
      <text
        x={isOut ? x - 12 : x + width + 12}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize="12px"
        fontWeight="900"
        fill="#ffffff"
        verticalAnchor="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

// 2. Audit Tooltip with Mass Balance Logic
const AuditTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.sourceName) return null;

    const efficiency = 0.95; 
    const capacitySticks = (data.tobacco * efficiency) / 0.0007;
    const exportSticks = data.value; 
    const stampGap = Math.round(exportSticks - capacitySticks);
    
    return (
      <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[280px] pointer-events-none z-50">
        <div className="border-b border-slate-800 pb-2 mb-2">
          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Forensic Inspection</p>
          <p className="text-white text-sm font-bold">{data.sourceName} → {data.targetName}</p>
        </div>
        <div className="space-y-3 text-[11px]">
          <div className="flex justify-between"><span className="text-slate-400">Tobacco:</span><span className="text-white">{data.tobacco.toLocaleString()} KG</span></div>
          <div className="bg-black/50 p-2 rounded border border-slate-800 space-y-1">
            <div className="flex justify-between"><span className="text-slate-400 font-italic">Capacity:</span><span className="text-emerald-400 font-mono">{Math.round(capacitySticks).toLocaleString()} sticks</span></div>
            <div className="flex justify-between"><span className="text-slate-400 font-italic">Exports:</span><span className="text-blue-400 font-mono">{Math.round(exportSticks).toLocaleString()} sticks</span></div>
          </div>
          <div className={`p-2 rounded font-black text-center ${stampGap > 0 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-400'}`}>
            GAP: {stampGap > 0 ? `+${stampGap.toLocaleString()}` : stampGap.toLocaleString()}
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function SankeyFlow({ processedData }) {
  const { sankeyData, summary, riskFlags, riskLevel } = useMemo(() => {
    if (!processedData || processedData.length === 0) return { sankeyData: { nodes: [], links: [] }, summary: null, riskFlags: [], riskLevel: 'LOW' };

    const nodes = [];
    const nodeMap = new Map();
    const linkMap = {};

    const getOrCreateNode = (name) => {
      if (!nodeMap.has(name)) {
        const id = nodes.length;
        nodes.push({ name });
        nodeMap.set(name, id);
        return id;
      }
      return nodeMap.get(name);
    };

    processedData.forEach((d) => {
      const origin = d.origin || "Unknown";
      const entity = d.entity || "Unknown";
      const dest = d.dest || "Unknown";
      const stickVol = (Number(d.outflow) || 0) * 1000;

      const sId = getOrCreateNode(origin);
      const eId = getOrCreateNode(entity);
      const dId = getOrCreateNode(dest);

      // CRITICAL FIX: Prevent Circular Depth Error (A cannot target A)
      if (sId === eId || eId === dId) return;

      const update = (srcId, tgtId, sName, tName) => {
        const key = `${srcId}-${tgtId}`;
        if (!linkMap[key]) linkMap[key] = { source: srcId, target: tgtId, sourceName: sName, targetName: tName, value: 0, tobacco: 0, tow: 0 };
        linkMap[key].value += stickVol;
        linkMap[key].tobacco += Number(d.tobacco) || 0;
        linkMap[key].tow += Number(d.tow) || 0;
      };

      update(sId, eId, origin, entity);
      update(eId, dId, entity, dest);
    });

    const links = Object.values(linkMap).filter(l => l.value > 0);
    const totalVolume = links.reduce((acc, curr) => acc + curr.value, 0) / 2;
    const topRoute = links.reduce((p, c) => (p.value > c.value ? p : c), links[0]);

    // Risk Engine
    const flags = [];
    let severityScore = 0;

    if (totalVolume > 0 && (topRoute?.value / totalVolume > 0.5)) {
      flags.push({ type: 'CRITICAL', msg: `CONCENTRATION: 50%+ volume on single route.` });
      severityScore += 3;
    }

    const totalTobacco = links.reduce((acc, curr) => acc + curr.tobacco, 0) / 2;
    const totalCapacity = (totalTobacco * 0.95) / 0.0007;
    if (totalCapacity > totalVolume * 1.25) {
      flags.push({ type: 'STOCKPILE', msg: `STOCKPILING: Input capacity 25% > Output sticks.` });
      severityScore += 2;
    }
    if (totalVolume > totalCapacity * 1.1) {
      flags.push({ type: 'GAP', msg: `STAMP GAP: Output exceeds material capacity.` });
      severityScore += 4;
    }

    const level = severityScore > 5 ? 'CRITICAL' : severityScore > 3 ? 'HIGH' : severityScore > 1 ? 'MEDIUM' : 'LOW';

    return { 
      sankeyData: { nodes, links }, 
      summary: { totalVolume, topRouteName: `${topRoute?.sourceName} → ${topRoute?.targetName}`, hub: nodes[1]?.name },
      riskFlags: flags,
      riskLevel: level
    };
  }, [processedData]);

  const riskStyles = {
    CRITICAL: "text-red-500 border-red-500 bg-red-500/10",
    HIGH: "text-orange-500 border-orange-500 bg-orange-500/10",
    MEDIUM: "text-yellow-500 border-yellow-500 bg-yellow-500/10",
    LOW: "text-emerald-500 border-emerald-500 bg-emerald-500/10"
  };

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[750px] flex flex-col">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Trade Flow Intelligence</h3>
          <p className="text-[10px] text-slate-500 uppercase mt-1">Automated Mass-Balance Audit</p>
        </div>
        <div className={`px-4 py-2 rounded-lg border-2 font-black text-xs tracking-tighter ${riskStyles[riskLevel]}`}>
          RISK LEVEL: {riskLevel}
        </div>
      </div>

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={50}
            linkCurvature={0.5}
            node={<SankeyNode />}
            link={{ stroke: "#38bdf8", strokeOpacity: 0.3, fill: "#38bdf8", fillOpacity: 0.15 }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 space-y-2">
        {riskFlags.map((flag, i) => (
          <div key={i} className="flex items-center gap-3 p-2 bg-black/40 border border-slate-800 rounded-lg">
            <span className="text-[9px] font-black px-2 py-0.5 rounded bg-slate-700 text-white uppercase">{flag.type}</span>
            <p className="text-[11px] text-slate-300 font-medium">{flag.msg}</p>
          </div>
        ))}
        <div className="p-4 bg-black/60 rounded-xl border border-slate-800/50">
          <p className="text-xs text-slate-400 leading-relaxed">
            Forensic analysis of <strong className="text-white">{summary?.hub}</strong> detects a total volume of <strong className="text-white">{summary?.totalVolume.toLocaleString()} sticks</strong>. 
            Primary vector identified as <strong className="text-white">{summary?.topRouteName}</strong>. 
            
          </p>
        </div>
      </div>
    </div>
  );
}

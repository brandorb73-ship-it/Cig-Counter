"use client";

import React, { useMemo, useState } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// 1. NODE RENDERER (Hardened for layout shifts)
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  if (x === undefined || isNaN(x)) return null;
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill="#38bdf8" fillOpacity={0.9} rx={2} />
      <text
        x={isOut ? x - 12 : x + width + 12}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize="11px"
        fontWeight="900"
        fill="#ffffff"
        dominantBaseline="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

// 2. REVENUE PROTECTION TOOLTIP
const AuditTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.sourceName) return null;

    const efficiency = 0.95;
    const modelCapacitySticks = Math.round((data.tobacco * efficiency) / 0.0007);
    const actualExportSticks = data.value; 
    const stampGap = actualExportSticks - modelCapacitySticks;
    const estTaxLoss = stampGap > 0 ? (stampGap * 0.15) : 0;
    
    return (
      <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[280px] z-50">
        <div className="border-b border-slate-800 pb-2 mb-2 text-[10px] text-emerald-400 font-black uppercase tracking-widest">Revenue Audit</div>
        <div className="text-white text-xs font-bold mb-3">{data.sourceName} → {data.targetName}</div>
        <div className="space-y-2 text-[11px]">
          <div className="flex justify-between text-slate-400"><span>Model Capacity:</span><span className="text-emerald-400">{modelCapacitySticks.toLocaleString()}</span></div>
          <div className="flex justify-between text-slate-400"><span>Actual Exports:</span><span className="text-blue-400">{actualExportSticks.toLocaleString()}</span></div>
          <div className={`p-2 rounded font-black text-center ${stampGap > 0 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-400'}`}>
            TAX GAP: ${estTaxLoss.toLocaleString()}
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function SankeyFlow({ processedData }) {
  const [timeIndex, setTimeIndex] = useState(0);

  // Extract unique Month-Year combos for the slider
  const timeSlots = useMemo(() => {
    if (!processedData) return [];
    return [...new Set(processedData.map(d => `${d.Month || d.month} ${d.Year || d.year}`))].sort();
  }, [processedData]);

  const { sankeyData, riskLevel, totalLoss } = useMemo(() => {
    if (!processedData || processedData.length === 0) 
      return { sankeyData: { nodes: [], links: [] }, riskLevel: 'LOW', totalLoss: 0 };

    // Filter by selected time
    const currentSlot = timeSlots[timeIndex];
    const filtered = processedData.filter(d => `${d.Month || d.month} ${d.Year || d.year}` === currentSlot);

    const nodes = [];
    const nodeIds = new Map();
    const linkMap = new Map();

    // CRITICAL: Append -L{layer} to names. 
    // This stops the "depth" error by ensuring Origin-China is different from Dest-China.
    const addNode = (name, layer) => {
      const key = `${name}-Layer${layer}`;
      if (!nodeIds.has(key)) {
        const id = nodes.length;
        nodes.push({ name, layer });
        nodeIds.set(key, id);
        return id;
      }
      return nodeIds.get(key);
    };

    let periodLoss = 0;

    filtered.forEach((d) => {
      const sticks = Math.round((Number(d.outflow) || 0) * 1000); 
      const tobacco = Number(d.tobacco) || 0;
      
      const sId = addNode(d.origin || "Unknown", 0);
      const eId = addNode(d.entity || "Hub", 1);
      const dId = addNode(d.dest || "Market", 2);

      const update = (src, tgt, sName, tName) => {
        const key = `${src}-${tgt}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, { source: src, target: tgt, sourceName: sName, targetName: tName, value: 0, tobacco: 0 });
        }
        const l = linkMap.get(key);
        l.value += sticks;
        l.tobacco += tobacco;
      };

      update(sId, eId, d.origin, d.entity);
      update(eId, dId, d.entity, d.dest);

      // Simple loss calc for the badge
      const capacity = (tobacco * 0.95) / 0.0007;
      if (sticks > capacity) periodLoss += (sticks - capacity) * 0.15;
    });

    return { 
      sankeyData: { nodes, links: Array.from(linkMap.values()).filter(l => l.value > 0) },
      riskLevel: periodLoss > 10000 ? 'CRITICAL' : 'LOW',
      totalLoss: periodLoss
    };
  }, [processedData, timeIndex, timeSlots]);

  if (!timeSlots.length) return null;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[800px] flex flex-col shadow-2xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-white font-bold">Forensic Trade Flow</h3>
          <p className="text-slate-500 text-xs">Period: {timeSlots[timeIndex]}</p>
        </div>
        <div className={`px-4 py-1 rounded text-[10px] font-black border ${riskLevel === 'CRITICAL' ? 'border-red-500 text-red-500' : 'border-emerald-500 text-emerald-400'}`}>
          TAX LOSS: ${totalLoss.toLocaleString()}
        </div>
      </div>

      <input 
        type="range" min="0" max={timeSlots.length - 1} value={timeIndex} 
        onChange={(e) => setTimeIndex(parseInt(e.target.value))}
        className="w-full mb-10 accent-blue-500 cursor-pointer"
      />

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={50}
            node={<SankeyNode />}
            link={{ stroke: "#38bdf8", strokeOpacity: 0.2, fill: "#38bdf8", fillOpacity: 0.1 }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

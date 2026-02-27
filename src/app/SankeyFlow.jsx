"use client";

import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// 1. NODE RENDERER: High visibility for dark mode
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

// 2. AUDIT TOOLTIP: Mass Balance & Tax Loss Logic
const AuditTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.sourceName) return null;

    // Forensic Constants
    const efficiency = 0.95;
    const modelCapacitySticks = Math.round((data.tobacco * efficiency) / 0.0007);
    const actualExportSticks = data.value; 
    const stampGap = actualExportSticks - modelCapacitySticks;
    
    // Tax Estimation: Assuming $0.15 excise per stick (Adjustable based on jurisdiction)
    const estTaxLoss = stampGap > 0 ? (stampGap * 0.15) : 0;
    
    return (
      <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[300px] pointer-events-none z-50">
        <div className="border-b border-slate-800 pb-2 mb-2 text-[10px] text-emerald-400 font-black uppercase tracking-widest">Revenue Protection Audit</div>
        <div className="text-white text-sm font-bold mb-3">{data.sourceName} → {data.targetName}</div>
        <div className="space-y-3 text-[11px]">
          <div className="bg-black/50 p-2 rounded border border-slate-800 space-y-2">
            <div className="flex justify-between text-slate-400"><span>Tobacco Weight:</span><span className="text-white">{data.tobacco.toLocaleString()} KG</span></div>
            <div className="flex justify-between italic text-slate-400"><span>Model Capacity:</span><span className="text-emerald-400 font-bold">{modelCapacitySticks.toLocaleString()} sticks</span></div>
            <div className="flex justify-between italic text-slate-400"><span>Actual Exports:</span><span className="text-blue-400 font-bold">{actualExportSticks.toLocaleString()} sticks</span></div>
          </div>
          
          <div className={`p-2 rounded font-black text-center ${stampGap > 1000 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-400'}`}>
            STAMP GAP: {stampGap > 0 ? `+${stampGap.toLocaleString()}` : stampGap.toLocaleString()}
          </div>

          {stampGap > 0 && (
            <div className="p-2 rounded bg-orange-500/10 border border-orange-500/30">
              <div className="flex justify-between items-center font-black">
                <span className="text-orange-400 uppercase text-[9px]">Est. Tax Leakage:</span>
                <span className="text-white text-xs">${estTaxLoss.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export default function SankeyFlow({ processedData }) {
  const { sankeyData, summary, riskFlags, riskLevel } = useMemo(() => {
    if (!processedData || processedData.length === 0) 
      return { sankeyData: { nodes: [], links: [] }, summary: null, riskFlags: [], riskLevel: 'LOW' };

    const nodes = [];
    const nodeIds = new Map();
    const linkMap = new Map();

    const addNode = (name, layer) => {
      const key = `${name}-L${layer}`;
      if (!nodeIds.has(key)) {
        const id = nodes.length;
        nodes.push({ name, layer });
        nodeIds.set(key, id);
        return id;
      }
      return nodeIds.get(key);
    };

    processedData.forEach((d) => {
      const stickVolume = Math.round((Number(d.outflow) || 0) * 1000); 
      const sId = addNode(d.origin || "Unknown", 0);
      const eId = addNode(d.entity || "Unknown", 1);
      const dId = addNode(d.dest || "Unknown", 2);

      const update = (src, tgt, sName, tName) => {
        const key = `${src}-${tgt}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, { source: src, target: tgt, sourceName: sName, targetName: tName, value: 0, tobacco: 0, tow: 0 });
        }
        const l = linkMap.get(key);
        l.value += stickVolume;
        l.tobacco += Number(d.tobacco) || 0;
        l.tow += Number(d.tow) || 0;
      };

      update(sId, eId, d.origin, d.entity);
      update(eId, dId, d.entity, d.dest);
    });

    const links = Array.from(linkMap.values()).filter(l => l.value > 0);
    const totalVolume = links.reduce((acc, curr) => acc + curr.value, 0) / 2;
    const totalTobacco = links.reduce((acc, curr) => acc + curr.tobacco, 0) / 2;
    const capacity = Math.round((totalTobacco * 0.95) / 0.0007);
    const totalGap = totalVolume - capacity;

    const flags = [];
    let score = 0;

    // Feature: Stamp Gap & Tax Loss Flag
    if (totalGap > 1000) {
      const totalTaxLoss = totalGap * 0.15;
      flags.push({ type: 'CRITICAL', msg: `TAX LEAKAGE: Unaccounted production detected. Est. Loss: $${totalTaxLoss.toLocaleString()}.` });
      score += 5;
    }

    // Feature: Stockpiling Flag
    if (capacity > totalVolume * 1.3) {
      flags.push({ type: 'STOCKPILE', msg: 'INVENTORY RISK: Input materials exceed output by 30%.' });
      score += 2;
    }

    // Feature: Precursor Ratio Audit (Tow vs Tobacco)
    const towRatio = (links.reduce((acc, l) => acc + l.tow, 0) / 2) / totalTobacco;
    if (totalTobacco > 0 && (towRatio < 0.05 || towRatio > 0.15)) {
      flags.push({ type: 'RECIPE', msg: 'RECIPE ANOMALY: Filter tow ratio is inconsistent with standard production.' });
      score += 1;
    }

    const level = score >= 5 ? 'CRITICAL' : score >= 3 ? 'HIGH' : score >= 1 ? 'MEDIUM' : 'LOW';
    const topRoute = links.reduce((p, c) => (p.value > c.value ? p : c), links[0]);

    return { 
      sankeyData: { nodes, links }, 
      summary: { totalVolume, totalGap, topRoute: `${topRoute?.sourceName} → ${topRoute?.targetName}`, hub: processedData[0]?.entity },
      riskFlags: flags,
      riskLevel: level
    };
  }, [processedData]);

  const levelStyles = {
    CRITICAL: "text-red-500 border-red-500 bg-red-500/10",
    HIGH: "text-orange-500 border-orange-500 bg-orange-500/10",
    MEDIUM: "text-yellow-500 border-yellow-500 bg-yellow-500/10",
    LOW: "text-emerald-500 border-emerald-500 bg-emerald-500/10"
  };

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[750px] flex flex-col">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Trade Flow Intelligence</h3>
          <p className="text-[10px] text-slate-500 uppercase mt-1 tracking-tighter">Mass-Balance Revenue Protection Model</p>
        </div>
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
          <div key={i} className={`flex items-center gap-3 p-3 border rounded-xl ${f.type === 'CRITICAL' ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
            <span className={`text-[9px] font-black px-2 py-1 rounded uppercase ${f.type === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>{f.type}</span>
            <p className="text-[11px] text-slate-200 font-medium">{f.msg}</p>
          </div>
        ))}
        
        <div className="p-4 bg-black/40 rounded-xl border border-slate-800/50">
          <p className="text-xs text-slate-400 leading-relaxed italic">
            Audit confirms <strong className="text-white">{summary?.hub}</strong> processed <strong className="text-white">{summary?.totalVolume.toLocaleString()} sticks</strong>. 
            Primary Corridor: <strong className="text-white">{summary?.topRoute}</strong>. 
            <br/>
            <strong className="text-emerald-300">AI Summary:</strong> {summary?.totalGap > 0 
              ? `Production exceeds material capacity by ${summary?.totalGap.toLocaleString()} sticks, suggesting undeclared inputs or external sourcing.` 
              : `Material consumption aligns with declared output volume.`}
          </p>
        </div>
      </div>
    </div>
  );
}

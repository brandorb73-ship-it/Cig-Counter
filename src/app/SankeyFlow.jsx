import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// 1. High-Contrast Node Renderer (Restored Visibility)
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  if (x === undefined || y === undefined || isNaN(x)) return null;
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

// 2. Audit Tooltip with Mass Balance Logic (Hover Restored)
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
          <div className="flex justify-between text-slate-400">
            <span>Tobacco Input:</span>
            <span className="text-white font-mono">{data.tobacco.toLocaleString()} KG</span>
          </div>
          <div className="bg-black/50 p-2 rounded border border-slate-800 space-y-1">
            <div className="flex justify-between italic text-slate-400">
              <span>Modeled Capacity:</span>
              <span className="text-emerald-400 font-bold">{Math.round(capacitySticks).toLocaleString()} sticks</span>
            </div>
            <div className="flex justify-between italic text-slate-400">
              <span>Actual Exports:</span>
              <span className="text-blue-400 font-bold">{Math.round(exportSticks).toLocaleString()} sticks</span>
            </div>
          </div>
          <div className={`p-2 rounded font-black text-center ${stampGap > 1000 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-400'}`}>
            STAMP GAP: {stampGap > 0 ? `+${stampGap.toLocaleString()}` : stampGap.toLocaleString()}
          </div>
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

    // STRICT LAYERED NODE MAP to prevent 'depth' errors
    const nodes = [];
    const nodeIds = new Map();
    const linkMap = new Map();

    const addNode = (name, layer) => {
      const key = `${name}-${layer}`; // Layer-specific key prevents circular loops
      if (!nodeIds.has(key)) {
        const id = nodes.length;
        nodes.push({ name, layer });
        nodeIds.set(key, id);
        return id;
      }
      return nodeIds.get(key);
    };

    processedData.forEach((d) => {
      const origin = d.origin || "Unknown Origin";
      const entity = d.entity || "Unknown Entity";
      const dest = d.dest || "Unknown Destination";
      const sticks = (Number(d.outflow) || 0) * 1000;

      // Layer 0: Origins | Layer 1: Entities | Layer 2: Destinations
      const sId = addNode(origin, 0);
      const eId = addNode(entity, 1);
      const dId = addNode(dest, 2);

      const buildLink = (src, tgt, sName, tName) => {
        const key = `${src}->${tgt}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, { source: src, target: tgt, sourceName: sName, targetName: tName, value: 0, tobacco: 0, tow: 0 });
        }
        const l = linkMap.get(key);
        l.value += sticks;
        l.tobacco += Number(d.tobacco) || 0;
        l.tow += Number(d.tow) || 0;
      };

      buildLink(sId, eId, origin, entity);
      buildLink(eId, dId, entity, dest);
    });

    const links = Array.from(linkMap.values()).filter(l => l.value > 0);
    const totalVolume = links.reduce((acc, curr) => acc + curr.value, 0) / 2;
    const topRoute = links.reduce((p, c) => (p.value > c.value ? p : c), links[0]);

    // Risk & Stockpiling Engine
    const flags = [];
    let score = 0;

    const totalTobacco = links.reduce((acc, curr) => acc + curr.tobacco, 0) / 2;
    const totalCapacity = (totalTobacco * 0.95) / 0.0007;

    if (totalCapacity > totalVolume * 1.25) {
      flags.push({ type: 'STOCKPILE', msg: `Stockpiling Alert: Material capacity is 25%+ higher than output.` });
      score += 2;
    }
    if (totalVolume > totalCapacity * 1.05) {
      flags.push({ type: 'CRITICAL', msg: `Stamp Gap: Declared exports exceed physical material capacity.` });
      score += 4;
    }
    if (topRoute && (topRoute.value / totalVolume > 0.6)) {
      flags.push({ type: 'RISK', msg: `Concentration: ${Math.round((topRoute.value / totalVolume) * 100)}% of volume on one route.` });
      score += 1;
    }

    const level = score >= 5 ? 'CRITICAL' : score >= 3 ? 'HIGH' : score >= 1 ? 'MEDIUM' : 'LOW';

    return { 
      sankeyData: { nodes, links }, 
      summary: { totalVolume, topRoute: `${topRoute?.sourceName} → ${topRoute?.targetName}`, hub: processedData[0]?.entity },
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
      <div className="flex justify-between items-center mb-10">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Trade Flow Intelligence</h3>
        <div className={`px-4 py-1.5 rounded-full border font-black text-[10px] tracking-tighter ${riskStyles[riskLevel]}`}>
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
        {riskFlags.map((flag, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 border rounded-xl ${flag.type === 'CRITICAL' ? 'bg-red-500/10 border-red-500/20 text-red-200' : 'bg-orange-500/10 border-orange-500/20 text-orange-200'}`}>
            <span className="text-[9px] font-black px-2 py-0.5 rounded bg-current/20 uppercase">{flag.type}</span>
            <p className="text-[11px] font-medium">{flag.msg}</p>
          </div>
        ))}
        
        <div className="p-4 bg-black/40 rounded-xl border border-slate-800/50">
          <p className="text-xs text-slate-300 leading-relaxed italic">
            Intelligence confirms <strong className="text-white">{summary?.topRoute}</strong> is the primary corridor. 
            A total of <strong className="text-white">{summary?.totalVolume.toLocaleString()} sticks</strong> are transiting through <strong className="text-white">{summary?.hub}</strong>. 
            
          </p>
        </div>
      </div>
    </div>
  );
}

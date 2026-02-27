import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// 1. HIGH-CONTRAST NODE RENDERER (Restored visibility and padding)
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
        verticalAnchor="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

// 2. AUDIT TOOLTIP: KG TO STICK CALCULATIONS
const AuditTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.sourceName) return null;

    // Standard Industry Recipe constants
    const efficiency = 0.95; 
    const capacitySticks = (data.tobacco * efficiency) / 0.0007; // KG to sticks
    const exportSticks = data.value; // Already processed as sticks
    const stampGap = Math.round(exportSticks - capacitySticks);
    
    return (
      <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[280px] pointer-events-none z-50">
        <div className="border-b border-slate-800 pb-2 mb-2 text-[10px] text-emerald-400 font-black uppercase tracking-widest">
          Forensic Mass-Balance
        </div>
        <div className="text-white text-sm font-bold mb-3">{data.sourceName} → {data.targetName}</div>
        
        <div className="space-y-3 text-[11px]">
          <div className="flex justify-between text-slate-400">
            <span>Tobacco Weight:</span>
            <span className="text-white font-mono">{data.tobacco.toLocaleString()} KG</span>
          </div>
          <div className="bg-black/50 p-2 rounded border border-slate-800 space-y-2">
            <div className="flex justify-between italic text-slate-400">
              <span>Model Capacity:</span>
              <span className="text-emerald-400 font-bold">{Math.round(capacitySticks).toLocaleString()} sticks</span>
            </div>
            <div className="flex justify-between italic text-slate-400">
              <span>Actual Exports:</span>
              <span className="text-blue-400 font-bold">{Math.round(exportSticks).toLocaleString()} sticks</span>
            </div>
          </div>
          <div className={`p-2 rounded font-black text-center ${stampGap > 5000 ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-400'}`}>
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

    const nodes = [];
    const nodeIds = new Map();
    const linkMap = new Map();

    // FORCE DISTINCT NODES BY LAYER (0: Origin, 1: Entity, 2: Dest)
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
      const sticks = (Number(d.outflow) || 0) * 1000;
      const sId = addNode(d.origin || "Unknown", 0);
      const eId = addNode(d.entity || "Unknown", 1);
      const dId = addNode(d.dest || "Unknown", 2);

      const update = (src, tgt, sName, tName) => {
        const key = `${src}-${tgt}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, { source: src, target: tgt, sourceName: sName, targetName: tName, value: 0, tobacco: 0 });
        }
        const l = linkMap.get(key);
        l.value += sticks;
        l.tobacco += Number(d.tobacco) || 0;
      };

      update(sId, eId, d.origin, d.entity);
      update(eId, dId, d.entity, d.dest);
    });

    const links = Array.from(linkMap.values()).filter(l => l.value > 0);
    const totalVolume = links.reduce((acc, curr) => acc + curr.value, 0) / 2;
    const topRoute = links.reduce((p, c) => (p.value > c.value ? p : c), links[0]);

    // Risk Scoring Logic
    let score = 0;
    const flags = [];
    const totalTobacco = links.reduce((acc, curr) => acc + curr.tobacco, 0) / 2;
    const capacity = (totalTobacco * 0.95) / 0.0007;

    if (totalVolume > capacity * 1.1) {
      flags.push({ type: 'CRITICAL', msg: 'STAMP GAP: Declared exports exceed physical capacity.' });
      score += 4;
    }
    if (capacity > totalVolume * 1.3) {
      flags.push({ type: 'STOCKPILE', msg: 'STOCKPILING: Significant inventory accumulation detected.' });
      score += 2;
    }
    
    const level = score >= 4 ? 'CRITICAL' : score >= 2 ? 'HIGH' : 'LOW';

    return { 
      sankeyData: { nodes, links }, 
      summary: { totalVolume, topRoute: `${topRoute?.sourceName} → ${topRoute?.targetName}`, hub: processedData[0]?.entity },
      riskFlags: flags,
      riskLevel: level
    };
  }, [processedData]);

  const levelStyles = {
    CRITICAL: "text-red-500 border-red-500 bg-red-500/10",
    HIGH: "text-orange-500 border-orange-500 bg-orange-500/10",
    LOW: "text-emerald-500 border-emerald-500 bg-emerald-500/10"
  };

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
            // Restored bright lines with visible glow
            link={{ stroke: "#38bdf8", strokeOpacity: 0.4, fill: "#38bdf8", fillOpacity: 0.15 }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div className="mt-8 space-y-3">
        {riskFlags.map((f, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 border rounded-xl ${f.type === 'CRITICAL' ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20'}`}>
            <span className={`text-[9px] font-black px-2 py-1 rounded uppercase ${f.type === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
              {f.type} FLAG
            </span>
            <p className="text-[11px] text-slate-200">{f.msg}</p>
          </div>
        ))}
        
        <div className="p-4 bg-black/40 rounded-xl border border-slate-800/50">
          <p className="text-xs text-slate-400 leading-relaxed italic">
            Audit confirms <strong className="text-white">{summary?.hub}</strong> processed <strong className="text-white">{summary?.totalVolume.toLocaleString()} sticks</strong>. 
            The primary corridor is <strong className="text-white">{summary?.topRoute}</strong>. 
            
          </p>
        </div>
      </div>
    </div>
  );
}

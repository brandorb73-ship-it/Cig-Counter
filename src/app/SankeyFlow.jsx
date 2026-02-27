import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// 1. Custom Node with High Visibility Labels
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  if (x === undefined || y === undefined) return null;
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill="#38bdf8" fillOpacity={0.9} rx={2} />
      <text
        x={isOut ? x - 10 : x + width + 10}
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

// 2. AUDIT TOOLTIP: Detailed Hover Calculations
const AuditTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.sourceName) return null;

    // Forensic Logic
    const efficiency = 0.95; 
    const capacitySticks = (data.tobacco * efficiency) / 0.0007;
    const exportSticks = data.value; // Value is already in sticks
    const stampGap = Math.round(exportSticks - capacitySticks);
    
    return (
      <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[280px] pointer-events-none">
        <div className="border-b border-slate-800 pb-2 mb-2">
          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Audit Inspection</p>
          <p className="text-white text-sm font-bold">{data.sourceName} → {data.targetName}</p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-4 text-[11px]">
            <span className="text-slate-400">Tobacco Input:</span>
            <span className="text-white text-right">{data.tobacco.toLocaleString()} KG</span>
            <span className="text-slate-400">Filter Tow:</span>
            <span className="text-white text-right">{data.tow.toLocaleString()} KG</span>
          </div>

          <div className="bg-black/50 p-2 rounded border border-slate-800 space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Modeled Capacity:</span>
              <span className="text-emerald-400 font-mono">{Math.round(capacitySticks).toLocaleString()} sticks</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Declared Exports:</span>
              <span className="text-blue-400 font-mono">{Math.round(exportSticks).toLocaleString()} sticks</span>
            </div>
          </div>

          <div className={`p-2 rounded ${stampGap > 0 ? 'bg-red-500/10 border border-red-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-300 uppercase">Stamp Gap:</span>
              <span className={`text-sm font-black ${stampGap > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                {stampGap > 0 ? `+${stampGap.toLocaleString()}` : stampGap.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function SankeyFlow({ processedData }) {
  const { sankeyData, summary, riskFlags } = useMemo(() => {
    if (!processedData || processedData.length === 0) return { sankeyData: { nodes: [], links: [] }, summary: null, riskFlags: [] };

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
      const origin = d.origin || "Unknown Origin";
      const entity = d.entity || "Unknown Entity";
      const dest = d.dest || "Unknown Destination";
      
      const stickVolume = (Number(d.outflow) || 0) * 1000;

      const sId = getOrCreateNode(origin);
      const eId = getOrCreateNode(entity);
      const dId = getOrCreateNode(dest);

      const update = (srcId, tgtId, sName, tName) => {
        const key = `${srcId}-${tgtId}`;
        if (!linkMap[key]) linkMap[key] = { source: srcId, target: tgtId, sourceName: sName, targetName: tName, value: 0, tobacco: 0, tow: 0, paper: 0, filter: 0 };
        linkMap[key].value += stickVolume;
        linkMap[key].tobacco += Number(d.tobacco) || 0;
        linkMap[key].tow += Number(d.tow) || 0;
        linkMap[key].paper += Number(d.paper) || 0;
        linkMap[key].filter += Number(d.filter) || 0;
      };

      update(sId, eId, origin, entity);
      update(eId, dId, entity, dest);
    });

    const links = Object.values(linkMap).filter(l => l.value > 0);
    const totalVolume = links.reduce((acc, curr) => acc + curr.value, 0) / 2;
    const topRoute = links.reduce((p, c) => (p.value > c.value ? p : c), links[0]);

    // Risk Alerts & Stockpiling Logic
    const flags = [];
    if (totalVolume > 0 && (topRoute?.value / totalVolume > 0.4)) {
      flags.push({ type: 'CRITICAL', msg: `CRITICAL CONCENTRATION: Route ${topRoute.sourceName} → ${topRoute.targetName} commands ${Math.round((topRoute.value / totalVolume) * 100)}% of total volume.` });
    }

    // Stockpiling Check: If tobacco capacity is 20% > exports
    const totalTobacco = links.reduce((acc, curr) => acc + curr.tobacco, 0) / 2;
    const totalCapacity = (totalTobacco * 0.95) / 0.0007;
    if (totalCapacity > totalVolume * 1.2) {
      flags.push({ type: 'STOCKPILE', msg: `STOCKPILING ALERT: Raw material capacity exceeds exports by ${Math.round(((totalCapacity - totalVolume)/totalCapacity)*100)}%. Check for undeclared inventory accumulation.` });
    }

    return { 
      sankeyData: { nodes, links }, 
      summary: { totalVolume, topRouteName: `${topRoute?.sourceName} → ${topRoute?.targetName}`, hub: processedData[0]?.entity },
      riskFlags: flags
    };
  }, [processedData]);

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[700px] flex flex-col">
      <h3 className="text-xs font-black uppercase text-slate-400 mb-8 tracking-widest">
        Trade Flow Intelligence (Origin → Entity → Destination)
      </h3>

      <div className="flex-grow relative">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={50}
            linkCurvature={0.5}
            node={<SankeyNode />}
            // RESTORED: Brighter blue links with better opacity
            link={{ stroke: "#38bdf8", strokeOpacity: 0.3, fill: "#38bdf8", fillOpacity: 0.1 }}
          >
            <Tooltip content={<AuditTooltip />} wrapperStyle={{ zIndex: 100 }} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      {/* RISK ALERTS PANEL */}
      <div className="mt-6 space-y-2">
        {riskFlags.map((flag, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 border rounded-xl ${flag.type === 'CRITICAL' ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}>
            <div className={`${flag.type === 'CRITICAL' ? 'bg-red-500' : 'bg-orange-500'} text-white text-[9px] font-black px-2 py-0.5 rounded uppercase`}>
              {flag.type} FLAG
            </div>
            <p className={`text-[11px] font-medium ${flag.type === 'CRITICAL' ? 'text-red-200' : 'text-orange-200'}`}>{flag.msg}</p>
          </div>
        ))}

        {/* AI SUMMARY PANEL */}
        <div className="p-4 bg-black/40 rounded-xl border border-slate-800/50">
          <p className="text-xs text-slate-300 leading-relaxed">
            Intelligence confirms <strong className="text-white">{summary?.topRouteName}</strong> is the primary corridor. 
            A total of <strong className="text-white">{summary?.totalVolume.toLocaleString()} sticks</strong> are transiting through <strong className="text-white">{summary?.hub}</strong>. 
            Hover over flow lines to inspect the <strong className="text-emerald-400">Mass Balance</strong> and <strong className="text-red-400">Stamp Gap</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// Fix for Depth Error: Ensures nodes are unique and links reference valid indices
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  if (x === undefined || y === undefined) return null;
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill="#38bdf8" fillOpacity={0.9} rx={2} />
      <text
        x={isOut ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize="11px"
        fontWeight="bold"
        fill="#ffffff"
        verticalAnchor="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

const AuditTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.sourceName || !data.targetName) return null;

    // Forensic Audit Logic
    const efficiency = 0.95; 
    // KG to Stick conversion for Capacity
    const capacitySticks = (data.tobacco * efficiency) / 0.0007;
    // Export value is already in sticks from the map
    const exportSticks = data.value; 
    const stampGap = Math.round(exportSticks - capacitySticks);
    
    // Recipe Check: Tow to Tobacco ratio
    const recipeRatio = data.tobacco > 0 ? (data.tow / data.tobacco) : 0;
    const isRecipeAlert = recipeRatio > 0 && (recipeRatio < 0.05 || recipeRatio > 0.15);

    return (
      <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[260px]">
        <div className="border-b border-slate-800 pb-2 mb-2">
          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Audit Inspection</p>
          <p className="text-white text-xs font-bold">{data.sourceName} → {data.targetName}</p>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <span className="text-slate-400">Tobacco (KG):</span>
            <span className="text-white text-right font-mono">{data.tobacco.toLocaleString()}</span>
            <span className="text-slate-400">Filter Tow (KG):</span>
            <span className="text-white text-right font-mono">{data.tow.toLocaleString()}</span>
          </div>

          <div className="h-px bg-slate-800 my-1" />

          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400 italic">Modeled Capacity:</span>
              <span className="text-emerald-400 font-bold">{Math.round(capacitySticks).toLocaleString()} sticks</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400 italic">Actual Exports:</span>
              <span className="text-blue-400 font-bold">{Math.round(exportSticks).toLocaleString()} sticks</span>
            </div>
          </div>

          <div className={`p-2 rounded mt-2 ${stampGap > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-bold text-slate-300 uppercase">Stamp Gap:</span>
              <span className={`text-xs font-black ${stampGap > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {stampGap > 0 ? `+${stampGap.toLocaleString()}` : stampGap.toLocaleString()}
              </span>
            </div>
            <p className="text-[8px] text-slate-500 mt-1 uppercase text-center">Calculated discrepancy in units</p>
          </div>

          {isRecipeAlert && (
            <div className="text-[9px] text-orange-400 bg-orange-400/10 p-1 border border-orange-400/20 rounded text-center font-bold">
              ⚠️ RECIPE DEVIATION DETECTED
            </div>
          )}
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
      
      // Convert Export KG to Sticks (1 KG = 1000 sticks)
      const stickVolume = (Number(d.outflow) || 0) * 1000;

      const sourceId = getOrCreateNode(origin);
      const entityId = getOrCreateNode(entity);
      const destId = getOrCreateNode(dest);

      const updateLink = (sId, tId, sName, tName) => {
        const key = `${sId}-${tId}`;
        if (!linkMap[key]) {
          linkMap[key] = { source: sId, target: tId, sourceName: sName, targetName: tName, value: 0, tobacco: 0, tow: 0, paper: 0, filter: 0 };
        }
        linkMap[key].value += stickVolume;
        linkMap[key].tobacco += Number(d.tobacco) || 0;
        linkMap[key].tow += Number(d.tow) || 0;
        linkMap[key].paper += Number(d.paper) || 0;
        linkMap[key].filter += Number(d.filter) || 0;
      };

      updateLink(sourceId, entityId, origin, entity);
      updateLink(entityId, destId, entity, dest);
    });

    const links = Object.values(linkMap).filter(l => l.value > 0);

    // AI/Audit Summary
    const totalVolume = links.reduce((acc, curr) => acc + curr.value, 0) / 2;
    const topRoute = links.reduce((p, c) => (p.value > c.value ? p : c), links[0]);

    return { 
      sankeyData: { nodes, links }, 
      summary: { totalVolume, topRouteName: `${topRoute?.sourceName} → ${topRoute?.targetName}` },
      riskFlags: totalVolume > 0 && (topRoute?.value / totalVolume > 0.6) ? ["High concentration of flow on primary route."] : []
    };
  }, [processedData]);

  if (!sankeyData.links.length) return <div className="p-10 text-slate-500 text-xs italic">Awaiting Forensic Data...</div>;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[650px] flex flex-col">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Trade Flow Intelligence</h3>
          <p className="text-[9px] text-slate-500 uppercase mt-1">Audit Mode: KG to Stick Conversion Active</p>
        </div>
        <div className="flex gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-500 uppercase">Live Audit</span>
        </div>
      </div>

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={50}
            linkCurvature={0.5}
            node={<SankeyNode />}
            link={{ stroke: "#1e293b", fill: "#334155", strokeOpacity: 0.2 }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div className="mt-8 p-4 bg-black/40 rounded-xl border border-slate-800/50">
        <p className="text-xs text-slate-400 leading-relaxed italic">
          Audit Insight: Total volume detected at <strong className="text-white">{summary?.totalVolume.toLocaleString()} sticks</strong>. 
          Primary flow is <strong className="text-white">{summary?.topRouteName}</strong>. 
          Hover over nodes to inspect the <strong className="text-emerald-400">Mass Balance</strong> and <strong className="text-red-400">Stamp Gap</strong>.
        </p>
      </div>
    </div>
  );
}

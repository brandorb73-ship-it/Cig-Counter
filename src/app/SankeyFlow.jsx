import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
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

// ✅ AUDIT TOOLTIP: Displays Mass Balance & Recipe Calculations
const AuditTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (!data.sourceName) return null;

    // Forensic Math Constants
    const efficiency = 0.95; // Assuming 5% wastage
    const capacitySticks = (data.tobacco * efficiency) / 0.0007;
    const exportSticks = data.value; // Already converted in processing
    const stampGap = Math.round(exportSticks - capacitySticks);
    
    // Recipe Deviation Check (Filter Tow vs Tobacco ratio)
    // Ideal ratio is roughly 1:12. If it's < 1:20 or > 1:5, it's a deviation.
    const recipeRatio = data.tobacco > 0 ? (data.tow / data.tobacco) : 0;
    const isRecipeAlert = recipeRatio > 0 && (recipeRatio < 0.05 || recipeRatio > 0.15);

    return (
      <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[240px]">
        <div className="border-b border-slate-800 pb-2 mb-2">
          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Audit Inspection</p>
          <p className="text-white text-xs font-bold">{data.sourceName} → {data.targetName}</p>
        </div>

        <div className="space-y-2">
          {/* Material Inputs */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <span className="text-slate-400">Tobacco (KG):</span>
            <span className="text-white text-right font-mono">{data.tobacco.toLocaleString()}</span>
            <span className="text-slate-400">Tow (KG):</span>
            <span className="text-white text-right font-mono">{data.tow.toLocaleString()}</span>
          </div>

          <div className="h-px bg-slate-800 my-1" />

          {/* Forensic Calculations */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400 italic">Modeled Capacity:</span>
              <span className="text-emerald-400 font-bold">{Math.round(capacitySticks).toLocaleString()} sticks</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400 italic">Actual Exports:</span>
              <span className="text-blue-400 font-bold">{exportSticks.toLocaleString()} sticks</span>
            </div>
          </div>

          {/* Stamp Gap Result */}
          <div className={`p-2 rounded mt-2 ${stampGap > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-bold text-slate-300 uppercase">Stamp Gap:</span>
              <span className={`text-xs font-black ${stampGap > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {stampGap > 0 ? `+${stampGap.toLocaleString()}` : stampGap.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Recipe Alert */}
          {isRecipeAlert && (
            <div className="text-[9px] text-orange-400 bg-orange-400/10 p-1 border border-orange-400/20 rounded text-center">
              ⚠️ Recipe Deviation: Inconsistent Tow/Tobacco ratio
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

    const nodeSet = new Set();
    const linkMap = {};

    processedData.forEach((d) => {
      const origin = d.origin || "Unknown Origin";
      const entity = d.entity || "Unknown Entity";
      const dest = d.dest || "Unknown Destination";
      
      // ✅ CONVERSION: KG TO STICKS (1 KG = 1000 sticks)
      const sticks = (Number(d.outflow) || 0) * 1000;

      nodeSet.add(origin);
      nodeSet.add(entity);
      nodeSet.add(dest);

      const update = (key) => {
        if (!linkMap[key]) linkMap[key] = { value: 0, tobacco: 0, tow: 0, paper: 0, filter: 0 };
        linkMap[key].value += sticks;
        linkMap[key].tobacco += Number(d.tobacco) || 0;
        linkMap[key].tow += Number(d.tow) || 0;
        linkMap[key].paper += Number(d.paper) || 0;
        linkMap[key].filter += Number(d.filter) || 0;
      };

      update(`${origin}|${entity}`);
      update(`${entity}|${dest}`);
    });

    const nodes = Array.from(nodeSet).map(name => ({ name }));
    const nodeIndex = {};
    nodes.forEach((n, i) => nodeIndex[n.name] = i);

    const links = Object.entries(linkMap).map(([key, stats]) => {
      const [s, t] = key.split("|");
      return {
        source: nodeIndex[s], target: nodeIndex[t], value: Math.max(1, stats.value),
        sourceName: s, targetName: t, ...stats
      };
    });

    // Summary Insights
    const totalFlow = links.reduce((acc, curr) => acc + curr.value, 0) / 2;
    const topRoute = links.reduce((p, c) => (p.value > c.value ? p : c));
    const flags = (topRoute.value / totalFlow > 0.4) ? [`CRITICAL CONCENTRATION: ${topRoute.sourceName} handles ${Math.round((topRoute.value / totalFlow)*100)}% of sticks.`] : [];

    return { sankeyData: { nodes, links }, summary: { totalVolume: totalFlow, topRoute: `${topRoute.sourceName} → ${topRoute.targetName}` }, riskFlags: flags };
  }, [processedData]);

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[600px] flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">Trade Flow Intelligence (In Sticks)</h3>
        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">Audit Mode: ON</span>
      </div>

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={40}
            linkCurvature={0.5}
            node={<SankeyNode />}
            link={{ stroke: "#334155", strokeOpacity: 0.4, fill: "#1e293b" }}
          >
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 space-y-3">
        {riskFlags.map((flag, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <div className="bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded">AUDIT ALERT</div>
            <p className="text-[11px] text-red-200 font-medium">{flag}</p>
          </div>
        ))}
        <div className="p-4 bg-black/40 rounded-xl border border-slate-800/50">
          <p className="text-xs text-slate-400 leading-relaxed italic">
            Engine converted KG to sticks using 1:1000 ratio. <strong className="text-white">{summary?.totalVolume.toLocaleString()} sticks</strong> total volume.
          </p>
        </div>
      </div>
    </div>
  );
}

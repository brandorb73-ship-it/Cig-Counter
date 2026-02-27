import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// 1. Custom Node with brighter labels and distinct blocks
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#38bdf8" // Bright cyan for nodes
        fillOpacity={0.9}
        rx={2}
      />
      <text
        x={isOut ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize="11px"
        fontWeight="bold"
        fill="#ffffff" // Pure white for maximum contrast
        verticalAnchor="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

export default function SankeyFlow({ processedData }) {
  const { sankeyData, summary, riskFlags } = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return { sankeyData: { nodes: [], links: [] }, summary: null, riskFlags: [] };
    }

    const nodeSet = new Set();
    const linkMap = {};

    processedData.forEach((d) => {
      const origin = d.origin || "Unknown Origin";
      const entity = d.entity || "Unknown Entity";
      const dest = d.dest || "Unknown Destination";
      const val = Number(d.outflow) || 0;

      nodeSet.add(origin);
      nodeSet.add(entity);
      nodeSet.add(dest);

      const key1 = `${origin}|${entity}`;
      linkMap[key1] = (linkMap[key1] || 0) + val;
      const key2 = `${entity}|${dest}`;
      linkMap[key2] = (linkMap[key2] || 0) + val;
    });

    const nodes = Array.from(nodeSet).map((name) => ({ name }));
    const nodeIndex = {};
    nodes.forEach((n, i) => { nodeIndex[n.name] = i; });

    const formattedLinks = Object.entries(linkMap).map(([key, value]) => {
      const [source, target] = key.split("|");
      return {
        source: nodeIndex[source],
        target: nodeIndex[target],
        value: Math.max(1, value),
        sourceName: source,
        targetName: target
      };
    });

    // AI Insight Logic
    const totalFlow = formattedLinks.reduce((acc, curr) => acc + curr.value, 0) / 2;
    const topRoute = formattedLinks.reduce((prev, current) => (prev.value > current.value) ? prev : current);
    
    // Risk Detection: Route exceeds 40% of total flow
    const flags = [];
    if ((topRoute.value / totalFlow) > 0.4) {
      flags.push(`CRITICAL CONCENTRATION: Route ${topRoute.sourceName} → ${topRoute.targetName} commands ${Math.round((topRoute.value / totalFlow) * 100)}% of total volume.`);
    }

    return { 
      sankeyData: { nodes, links: formattedLinks }, 
      summary: {
        primaryHub: processedData[0]?.entity,
        topRoute: `${topRoute.sourceName} → ${topRoute.targetName}`,
        totalVolume: totalFlow,
        destCount: new Set(processedData.map(d => d.dest)).size
      },
      riskFlags: flags
    };
  }, [processedData]);

  if (!sankeyData.nodes.length) return <div className="text-xs text-slate-500">No flow data</div>;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[550px] flex flex-col">
      <h3 className="text-xs font-black uppercase text-slate-400 mb-8 tracking-widest">
        Trade Flow Intelligence (Origin → Entity → Destination)
      </h3>

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={40}
            linkCurvature={0.5}
            node={<SankeyNode />}
            // Darker, more visible links with cyan highlight
            link={{ stroke: "#334155", strokeOpacity: 0.6, fill: "#1e293b" }}
          >
            <Tooltip 
              contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px' }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>

      {/* ✅ AI SUMMARY & RISK FLAGS */}
      <div className="mt-6 space-y-3">
        {riskFlags.map((flag, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <div className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded">RISK FLAG</div>
            <p className="text-[11px] text-red-200 font-medium">{flag}</p>
          </div>
        ))}

        <div className="p-4 bg-black/40 rounded-xl border border-slate-800/50">
          <p className="text-xs text-slate-300 leading-relaxed">
            Intelligence confirms <strong className="text-white">{summary?.topRoute}</strong> is the primary corridor. 
            A total of <strong className="text-white">{summary?.totalVolume.toLocaleString()} units</strong> are transiting through <strong className="text-white">{summary?.primaryHub}</strong>. 
            {summary?.destCount > 1 ? `Data shows distribution across ${summary?.destCount} destination points.` : "Alert: All outflow is restricted to a single destination point."}
          </p>
        </div>
      </div>
    </div>
  );
}

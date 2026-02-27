import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

// 1. Custom Label Component to fix visibility on black background
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#38bdf8"
        fillOpacity={0.8}
      />
      <text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize="10px"
        fontWeight="bold"
        fill="#e2e8f0"
        verticalAnchor="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

export default function SankeyFlow({ processedData }) {
  // 2. Data Processing & Aggregation
  const { sankeyData, summary } = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return { sankeyData: { nodes: [], links: [] }, summary: null };
    }

    const nodeSet = new Set();
    const linkMap = {}; // Use a map to aggregate values for the same path

    processedData.forEach((d) => {
      const origin = d.origin || "Unknown Origin";
      const entity = d.entity || "Unknown Entity";
      const dest = d.dest || "Unknown Destination";
      const val = Number(d.outflow) || 0;

      nodeSet.add(origin);
      nodeSet.add(entity);
      nodeSet.add(dest);

      // Aggregate Origin -> Entity
      const key1 = `${origin}|${entity}`;
      linkMap[key1] = (linkMap[key1] || 0) + val;

      // Aggregate Entity -> Destination
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
        value: Math.max(1, value), // Ensure visible flow
        sourceName: source,
        targetName: target
      };
    });

    // 3. AI Insights Logic (Dynamic Summary)
    const topRoute = formattedLinks.reduce((prev, current) => 
      (prev.value > current.value) ? prev : current
    );

    const summaryData = {
      primaryHub: processedData[0]?.entity || "the facility",
      topRoute: `${topRoute.sourceName} → ${topRoute.targetName}`,
      totalVolume: formattedLinks.reduce((acc, curr) => acc + curr.value, 0) / 2,
      uniqueDestinations: new Set(processedData.map(d => d.dest)).size
    };

    return { 
      sankeyData: { nodes, links: formattedLinks }, 
      summary: summaryData 
    };
  }, [processedData]);

  if (!sankeyData.nodes.length) {
    return <div className="text-xs text-slate-500">No flow data available</div>;
  }

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[500px] flex flex-col">
      <h3 className="text-xs font-black uppercase text-slate-400 mb-8">
        Trade Flow Intelligence (Origin → Entity → Destination)
      </h3>

      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={30}
            linkCurvature={0.5}
            node={<SankeyNode />} // Use the custom labels
            link={{ stroke: "#1e293b" }}
          >
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
              itemStyle={{ color: '#38bdf8' }}
            />
          </Sankey>
        </ResponsiveContainer>
      </div>

      {/* ✅ DYNAMIC AI SUMMARY */}
      <div className="mt-6 p-4 bg-black/40 rounded-xl border border-slate-800/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">AI Flow Analysis</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          The intelligence engine has identified <strong className="text-white">{summary?.topRoute}</strong> as the high-velocity corridor, 
          handling the bulk of the <strong className="text-white">{summary?.totalVolume.toLocaleString()} units</strong> tracked. 
          Flow is centralizing through <strong className="text-white">{summary?.primaryHub}</strong> across <strong className="text-white">{summary?.uniqueDestinations} destinations</strong>. 
          {summary?.uniqueDestinations > 3 ? " Diversified routing suggests a complex distribution network." : " Narrow destination focus indicates a dedicated supply chain."}
        </p>
      </div>
    </div>
  );
}

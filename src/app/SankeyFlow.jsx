import { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";

export default function SankeyFlow({ processedData }) {
  const sankeyData = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return { nodes: [], links: [] };
    }

    const nodeSet = new Set();
    const links = [];

    processedData.forEach((d) => {
      const origin = d.origin || "Unknown Origin";
      const entity = d.entity || "Unknown Entity";
      const dest = d.dest || "Unknown Destination";
      const value = Math.max(1, Number(d.outflow) || 1);

      // ✅ REGISTER NODES (THIS WAS MISSING)
      nodeSet.add(origin);
      nodeSet.add(entity);
      nodeSet.add(dest);

      // Origin → Entity
      links.push({
        source: origin,
        target: entity,
        value,
      });

      // Entity → Destination
      links.push({
        source: entity,
        target: dest,
        value,
      });
    });

    const nodes = Array.from(nodeSet).map((name) => ({ name }));

    const nodeIndex = {};
    nodes.forEach((n, i) => {
      nodeIndex[n.name] = i;
    });

    const formattedLinks = links.map((l) => ({
      source: nodeIndex[l.source],
      target: nodeIndex[l.target],
      value: l.value,
    }));

    return { nodes, links: formattedLinks };
  }, [processedData]);

  if (!sankeyData.nodes.length) {
    return (
      <div className="text-xs text-slate-500">No flow data available</div>
    );
  }

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[420px]">
      <h3 className="text-xs font-black uppercase text-slate-400 mb-4">
        Trade Flow Intelligence (Origin → Entity → Destination)
      </h3>

      <ResponsiveContainer width="100%" height="90%">
        <Sankey
          data={sankeyData}
          nodePadding={20}
          linkCurvature={0.5}
        >
          <Tooltip />
        </Sankey>
      </ResponsiveContainer>

      {/* ✅ SUMMARY */}
      <div className="border-t border-slate-800 mt-3 pt-3">
        <p className="text-[10px] text-slate-500 italic">
          Flow mapping highlights routing patterns and potential transshipment or diversion risks.
        </p>
      </div>
    </div>
  );
}

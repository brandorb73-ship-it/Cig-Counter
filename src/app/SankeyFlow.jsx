import React, { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from "recharts";

/* =========================
   NODE RENDERER
========================= */
const SankeyNode = ({ x, y, width, height, index, payload, containerWidth }) => {
  if (x === undefined || isNaN(x)) return null;
  const isOut = x > containerWidth / 2;
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill="#38bdf8" fillOpacity={0.9} rx={2} />
      <text
        x={isOut ? x - 10 : x + width + 10}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize={10}
        fontWeight={800}
        fill="#fff"
        dominantBaseline="middle"
      >
        {payload.name}
      </text>
    </Layer>
  );
};

/* =========================
   TOOLTIP
========================= */
const AuditTooltip = ({ payload }) => {
  if (!payload || !payload.length) return null;
  const d = payload[0].payload;
  if (!d) return null;

  return (
    <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl text-[11px] shadow-2xl">
      <div className="text-emerald-400 font-black mb-2 uppercase italic">Mass Balance Audit</div>
      <div className="font-bold text-white mb-2 border-b border-slate-800 pb-1">{d.sourceName} → {d.targetName}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4"><span>Sticks:</span><span className="text-white">{Math.round(d.value).toLocaleString()}</span></div>
        <div className="flex justify-between gap-4"><span>KG:</span><span className="text-blue-400">{(d.value * 0.0007).toFixed(2)}</span></div>
      </div>
    </div>
  );
};

/* =========================
   MAIN COMPONENT
========================= */
export default function SankeyFlow({ processedData }) {
  const { sankeyData, summary, riskFlags } = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return { sankeyData: { nodes: [], links: [] }, summary: null, riskFlags: [] };
    }

    const KG_TO_STICKS = 1 / 0.0007;
    const YIELD = 0.95;

    const nodes = [];
    const nodeMap = new Map();
    const linkMap = new Map();

    const addNode = (name, layer) => {
      const safeName = (name || "Unknown").toString().trim();
      if (!safeName) return null;
      const key = `${safeName}-L${layer}`;
      if (!nodeMap.has(key)) {
        const id = nodes.length;
        nodes.push({ name: safeName, layer });
        nodeMap.set(key, id);
        return id;
      }
      return nodeMap.get(key);
    };

    let totalCapacity = 0;
    let totalOutput = 0;

    processedData.forEach(d => {
      if (!d || Object.values(d).every(v => !v)) return;

      const origin = d.origin || d.Origin || "Unknown";
      const entity = d.entity || d.Entity || "Production Hub";
      const dest = d.dest || d.Dest || d.Destination || "Unknown Market";

      const tobaccoKG = Number(d.tobacco || d.Tobacco || 0);
      const paperKG = Number(d.paper || d.Paper || 0);
      const filterKG = Number(d.filter || d.Filter || 0);
      const towKG = Number(d.tow || d.Tow || 0);
      const cigKG = Number(d.outflow || d.Outflow || 0);

      const tobaccoSticks = tobaccoKG * YIELD * KG_TO_STICKS;
      const paperSticks = paperKG * YIELD * KG_TO_STICKS;
      const filterSticks = filterKG * YIELD * KG_TO_STICKS;
      const towSticks = towKG * YIELD * KG_TO_STICKS;
      const cigSticks = cigKG * KG_TO_STICKS;

      const capacity = Math.min(tobaccoSticks || Infinity, paperSticks || Infinity, filterSticks || Infinity, towSticks || Infinity);

      totalCapacity += isFinite(capacity) ? capacity : 0;
      totalOutput += cigSticks;

      const s = addNode(origin, 0);
      const e = addNode(entity, 1);
      const t = addNode(dest, 2);
      if (s === null || e === null || t === null) return;

      const key1 = `${s}-${e}`;
      if (!linkMap.has(key1)) linkMap.set(key1, { source: s, target: e, value: 0, sourceName: origin, targetName: entity });
      linkMap.get(key1).value += capacity;

      const key2 = `${e}-${t}`;
      if (!linkMap.has(key2)) linkMap.set(key2, { source: e, target: t, value: 0, sourceName: entity, targetName: dest });
      linkMap.get(key2).value += cigSticks;
    });

    let links = Array.from(linkMap.values()).filter(l => l.source !== null && l.target !== null && l.value > 0);

    const usedNodes = new Set();
    links.forEach(l => { usedNodes.add(l.source); usedNodes.add(l.target); });
    const filteredNodes = nodes.filter((_, i) => usedNodes.has(i));

    const indexMap = new Map();
    filteredNodes.forEach((n, i) => indexMap.set(n.name + "-L" + n.layer, i));

    links = links.map(l => ({
      ...l,
      source: indexMap.get(nodes[l.source].name + "-L" + nodes[l.source].layer),
      target: indexMap.get(nodes[l.target].name + "-L" + nodes[l.target].layer)
    }));

    const totalGap = totalOutput - totalCapacity;
    const taxLoss = totalGap > 0 ? totalGap * 0.15 : 0;

    let riskType = "BALANCED";
    if (totalGap > totalCapacity * 0.3) riskType = "UNDER_DECLARATION";
    else if (totalCapacity > totalOutput * 1.5) riskType = "STOCKPILING";
    else if (totalGap > 0) riskType = "DIVERSION";

    let severity = "LOW";
    if (totalGap > 10000) severity = "CRITICAL";
    else if (totalGap > 5000) severity = "HIGH";
    else if (totalGap > 1000) severity = "MEDIUM";

    const corridorMap = {};
    links.forEach(l => {
      const key = `${l.sourceName} → ${l.targetName}`;
      corridorMap[key] = (corridorMap[key] || 0) + l.value;
    });
    const topCorridor = Object.entries(corridorMap).sort((a,b)=>b[1]-a[1])[0]?.[0];

    const riskFlags = [];
    if (severity !== "LOW") {
      riskFlags.push({ type: severity, msg: `${riskType} risk detected with ${Math.round(totalGap).toLocaleString()} sticks gap.` });
    }

    return {
      sankeyData: { nodes: filteredNodes, links },
      summary: { totalOutput, totalCapacity, totalGap, taxLoss, severity, riskType, topCorridor },
      riskFlags
    };

  }, [processedData]);

  if (!sankeyData.nodes.length) return <div className="p-10 text-slate-500">Mapping Forensic Flow...</div>;

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[700px] flex flex-col">
      <div className="flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey data={sankeyData} nodePadding={30} link={{ stroke: "#38bdf8", strokeOpacity: 0.2 }} node={<SankeyNode />}>
            <Tooltip content={<AuditTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded text-[11px] text-slate-400 italic">
        <strong className="text-blue-400">AI Forensic Summary:</strong>{" "}

        Processed <strong className="text-white">{Math.round(summary?.totalOutput).toLocaleString()} sticks</strong>. 

        {summary?.severity !== "LOW" && (
          <span className="font-black text-red-500"> [{summary?.severity} RISK]</span>
        )}

        {summary?.riskType === "UNDER_DECLARATION" && (
          <> Output exceeds feasible production capacity, indicating under-declaration of production or inputs.</>
        )}

        {summary?.riskType === "STOCKPILING" && (
          <> Precursor inflows significantly exceed output, indicating stockpiling or buffering.</>
        )}

        {summary?.riskType === "DIVERSION" && (
          <> Gap between input and output suggests diversion into parallel or unregulated markets.</>
        )}

        {summary?.riskType === "BALANCED" && (
          <> Input and output flows are aligned with no material anomalies.</>
        )}

        {summary?.topCorridor && (
          <> Top risk corridor: <strong className="text-yellow-400">{summary?.topCorridor}</strong>.</>
        )}

        {summary?.taxLoss > 0 && (
          <> Estimated tax exposure: <strong className="text-red-500">${Math.round(summary?.taxLoss).toLocaleString()}</strong>.</>
        )}

        {riskFlags.map((f,i) => (
          <div key={i} className="text-red-500 font-bold text-[10px] mt-1">[{f.type}] {f.msg}</div>
        ))}
      </div>
    </div>
  );
}

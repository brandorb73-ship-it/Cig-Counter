import React, { useMemo } from "react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";

export default function ChartDashboard({ data }) {

  // -----------------------------
  // 1. CLEAN + NORMALIZE DATA
  // -----------------------------

  const cleanData = useMemo(() => {
    if (!data) return [];

    const KG_PER_STICK = 0.0007;

    const norm = (v) => (v && v.toString().trim() !== "" ? v : "Unknown");

    return data
      .filter(d => d && Object.values(d).some(v => v !== "" && v != null))
      .map((d) => {

        const tobaccoKG = Number(d.tobacco || d.Tobacco || 0);
        const paperKG = Number(d.paper || d.Paper || 0);
        const filterKG = Number(d.filter || d.Filter || 0);
        const towKG = Number(d.tow || d.Tow || 0);
        const cigKG = Number(d.outflow || d.Outflow || 0);

        const tobaccoSticks = tobaccoKG / KG_PER_STICK;
        const paperSticks = paperKG / KG_PER_STICK;
        const filterSticks = filterKG / KG_PER_STICK;
        const towSticks = towKG / KG_PER_STICK;
        const cigSticks = cigKG / KG_PER_STICK;

        const capacity = Math.min(
          tobaccoSticks || Infinity,
          paperSticks || Infinity,
          filterSticks || Infinity,
          towSticks || Infinity
        );

        const gap = cigSticks - capacity;

        return {
          ...d,
          tobaccoOrigin: norm(d.tobaccoOrigin),
          paperOrigin: norm(d.paperOrigin),
          filterOrigin: norm(d.filterOrigin),
          towOrigin: norm(d.towOrigin),
          destination: norm(d.destination),

          tobaccoSticks,
          paperSticks,
          filterSticks,
          towSticks,
          cigSticks,
          capacity,
          gap
        };
      });
  }, [data]);

  // -----------------------------
  // 2. ADVANCED FORENSIC SUMMARY
  // -----------------------------

  const summary = useMemo(() => {
    if (!cleanData.length) return null;

    const totalSticks = cleanData.reduce((sum, d) => sum + d.cigSticks, 0);
    const totalCapacity = cleanData.reduce((sum, d) => sum + (d.capacity || 0), 0);
    const totalGap = totalSticks - totalCapacity;

    const TAX_PER_1000 = 350;
    const taxLoss = (totalGap / 1000) * TAX_PER_1000;

    // Corridor intelligence
    const corridorMap = {};
    cleanData.forEach(d => {
      const key = `${d.tobaccoOrigin} → ${d.destination}`;
      corridorMap[key] = (corridorMap[key] || 0) + d.cigSticks;
    });

    const topCorridor = Object.entries(corridorMap)
      .sort((a, b) => b[1] - a[1])[0];

    // Risk classification logic
    let riskType = "Balanced";

    if (totalGap > totalCapacity * 0.3) {
      riskType = "Illicit Production / Under-declaration";
    } else if (totalGap > 0) {
      riskType = "Stockpiling / Timing Lag";
    } else if (totalGap < 0) {
      riskType = "Over-declared Inputs";
    }

    const riskGrade =
      taxLoss > 1_000_000 ? "Severe" :
      taxLoss > 250_000 ? "High" :
      taxLoss > 50_000 ? "Moderate" : "Low";

    return {
      hub: cleanData[0]?.destination,
      totalSticks,
      capacity: totalCapacity,
      gap: totalGap,
      taxLoss,
      riskType,
      riskGrade,
      topCorridor: topCorridor?.[0]
    };

  }, [cleanData]);

  // -----------------------------
  // 3. SANKEY DATA (FULL FLOW)
  // -----------------------------

  const sankeyData = useMemo(() => {
    const flows = [];

    cleanData.forEach(d => {
      if (d.tobaccoOrigin && d.destination)
        flows.push({ source: d.tobaccoOrigin, target: d.destination, value: d.tobaccoSticks });

      if (d.paperOrigin && d.destination)
        flows.push({ source: d.paperOrigin, target: d.destination, value: d.paperSticks });

      if (d.filterOrigin && d.destination)
        flows.push({ source: d.filterOrigin, target: d.destination, value: d.filterSticks });

      if (d.towOrigin && d.destination)
        flows.push({ source: d.towOrigin, target: d.destination, value: d.towSticks });
    });

    const nodes = [];
    const nodeMap = {};

    flows.forEach(f => {
      if (!nodeMap[f.source]) {
        nodeMap[f.source] = nodes.length;
        nodes.push({ name: f.source });
      }
      if (!nodeMap[f.target]) {
        nodeMap[f.target] = nodes.length;
        nodes.push({ name: f.target });
      }
    });

    const links = flows.map(f => ({
      source: nodeMap[f.source],
      target: nodeMap[f.target],
      value: f.value
    }));

    return { nodes, links };

  }, [cleanData]);

  // -----------------------------
  // 4. TOOLTIP (FORENSIC HOVER)
  // -----------------------------

  const SankeyTooltip = ({ payload }) => {
    if (!payload || !payload.length) return null;

    const d = payload[0].payload;

    return (
      <div className="bg-black p-3 text-xs border border-gray-700">
        <div className="text-white">
          {d.source.name} → {d.target.name}
        </div>
        <div>Sticks: {Math.round(d.value).toLocaleString()}</div>
        <div>KG: {(d.value * 0.0007).toFixed(2)}</div>
      </div>
    );
  };

  // -----------------------------
  // 5. RENDER
  // -----------------------------

  return (
    <div className="p-6 space-y-6">

      {/* SUMMARY */}
      {summary && (
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">

          <div className="text-sm">
            <strong className="text-blue-400">AI Forensic Summary:</strong>

            <span className="text-white ml-2">
              {summary.gap > 0 ? "🔴 Risk Detected" : "🟢 Balanced"}
            </span>

            <div className="mt-2">
              Hub <strong className="text-white">{summary.hub}</strong> processed
              <strong className="text-white"> {Math.round(summary.totalSticks).toLocaleString()} sticks</strong>.
            </div>

            <div className="mt-1 text-gray-300">
              {summary.riskType}
            </div>

            <div className="mt-1">
              📊 Corridor: <strong className="text-yellow-400">{summary.topCorridor}</strong>
            </div>

            <div className="mt-1">
              💰 Tax Exposure:
              <strong className="text-red-400"> ${Math.round(summary.taxLoss).toLocaleString()}</strong>
              <span className="ml-2 text-xs text-gray-400">({summary.riskGrade})</span>
            </div>

          </div>
        </div>
      )}

      {/* SANKEY */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 h-[500px]">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={sankeyData}
            nodePadding={20}
            linkCurvature={0.5}
          >
            <Tooltip content={<SankeyTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

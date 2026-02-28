"use client";

import React, { useMemo } from "react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";

// ---------- HELPERS ----------

const parseNum = (v) => {
  if (!v) return 0;
  return Number(String(v).replace(/,/g, ""));
};

const KG_TO_STICKS = 1 / 0.0007; // 1kg ≈ 1428 sticks
const YIELD = 0.95;

const toSticks = (kg) => (kg > 0 ? kg * KG_TO_STICKS : 0);

// ---------- TOOLTIP ----------

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  if (!d) return null;

  const gap = Math.round(d.exportSticks - d.precursorSticks);
  const taxLoss = gap > 0 ? gap * 0.15 : 0;

  return (
    <div className="bg-black p-4 border border-gray-700 rounded text-xs">
      <div className="font-bold text-white mb-1">
        {d.sourceName} → {d.targetName}
      </div>
      <div>Precursor Capacity: {Math.round(d.precursorSticks).toLocaleString()} sticks</div>
      <div>Actual Output: {Math.round(d.exportSticks).toLocaleString()} sticks</div>
      <div className={`mt-2 font-bold ${gap > 0 ? "text-red-400" : "text-green-400"}`}>
        {gap > 0
          ? `GAP: ${gap.toLocaleString()} | TAX LOSS: $${taxLoss.toLocaleString()}`
          : "BALANCED FLOW"}
      </div>
    </div>
  );
};

// ---------- MAIN COMPONENT ----------

export default function InvestigationSankey({ rawData }) {
  // Safe handling
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    return <div className="text-slate-500 p-4">Loading forensic data...</div>;
  }

  // ---------- PREPROCESS DATA ----------
  const { sankeyData, summary } = useMemo(() => {
    const clean = rawData
      .filter(d => d && Object.values(d).some(v => v))
      .map(d => ({
        hub: d.Entity || "Unknown Hub",
        tobaccoKG: parseNum(d.Tobacco),
        paperKG: parseNum(d.Paper),
        filterKG: parseNum(d.Filter),
        towKG: parseNum(d.Tow),
        cigKG: parseNum(d["Cigarette Exports"] || d.outflow),

        tobaccoOrigin: d["Tobacco Origin"] || "Unknown",
        paperOrigin: d["Paper Origin"] || "Unknown",
        filterOrigin: d["Filter Origin"] || "Unknown",
        towOrigin: d["Tow Origin"] || "Unknown",

        destination: d.Destination || "Unknown",
      }));

    const nodes = [];
    const nodeMap = new Map();
    const linksMap = new Map();

    const getNode = (name) => {
      if (!nodeMap.has(name)) {
        nodeMap.set(name, nodes.length);
        nodes.push({ name });
      }
      return nodeMap.get(name);
    };

    // ---------- BUILD FLOWS ----------
    clean.forEach(d => {
      const hub = d.hub;
      const dest = d.destination;

      const precursorSticks =
        (toSticks(d.tobaccoKG + d.paperKG + d.filterKG + d.towKG)) * YIELD;
      const exportSticks = toSticks(d.cigKG);

      const key = `${hub}-${dest}`;
      if (!linksMap.has(key)) {
        linksMap.set(key, {
          sourceName: hub,
          targetName: dest,
          precursorSticks: 0,
          exportSticks: 0
        });
      }
      const l = linksMap.get(key);
      l.precursorSticks += precursorSticks;
      l.exportSticks += exportSticks;
    });

    // ---------- FINAL LINKS ----------
    const links = [];
    let totalGap = 0;
    let topCorridor = null;
    let maxGap = 0;

    linksMap.forEach(l => {
      const gap = l.exportSticks - l.precursorSticks;
      totalGap += gap > 0 ? gap : 0;
      if (gap > maxGap) {
        maxGap = gap;
        topCorridor = `${l.sourceName} → ${l.targetName}`;
      }

      let color = "#22c55e"; // green
      if (gap > 1_000_000) color = "#ef4444"; // red
      else if (gap > 100_000) color = "#f97316"; // orange

      links.push({
        source: getNode(l.sourceName),
        target: getNode(l.targetName),
        value: Math.max(l.exportSticks, 1),
        sourceName: l.sourceName,
        targetName: l.targetName,
        precursorSticks: l.precursorSticks,
        exportSticks: l.exportSticks,
        stroke: color
      });
    });

    return {
      sankeyData: { nodes, links },
      summary: {
        totalSticks: links.reduce((sum, l) => sum + l.exportSticks, 0),
        totalPrecursors: links.reduce((sum, l) => sum + l.precursorSticks, 0),
        totalGap,
        topCorridor,
        severity:
          totalGap > 1_000_000
            ? "CRITICAL"
            : totalGap > 100_000
            ? "HIGH"
            : totalGap > 0
            ? "MEDIUM"
            : "LOW",
        riskType:
          links.every(l => l.exportSticks <= l.precursorSticks)
            ? "BALANCED"
            : links.some(l => l.exportSticks > l.precursorSticks * 1.2)
            ? "UNDER_DECLARATION"
            : links.some(l => l.exportSticks < l.precursorSticks * 0.8)
            ? "STOCKPILING"
            : "DIVERSION",
      },
    };
  }, [rawData]);

  if (!sankeyData.nodes.length || !sankeyData.links.length) {
    return <div className="text-red-400 p-4">⚠️ No valid Sankey data — check CSV</div>;
  }

  // ---------- RENDER ----------
  return (
    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
      <h3 className="text-sm text-white mb-2 font-bold">
        Investigation Flow: Origin → Hub → Destination
      </h3>

      <ResponsiveContainer width="100%" height={500}>
        <Sankey
          data={sankeyData}
          nodePadding={25}
          link={{ strokeOpacity: 0.4 }}
        >
          <Tooltip content={<CustomTooltip />} />
        </Sankey>
      </ResponsiveContainer>

      {/* ---------------- AI SUMMARY ---------------- */}
      <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded text-[11px] text-slate-400 italic">
        <strong className="text-blue-400 not-italic">AI Forensic Summary:</strong>{" "}
        {summary.totalGap > 0 ? (
          <>
            Detected a discrepancy of <strong>{Math.round(summary.totalGap).toLocaleString()} sticks</strong>{" "}
            between precursor capacity and reported exports.{" "}
            <strong className={`font-black ${
              summary.severity === "CRITICAL"
                ? "text-red-500"
                : summary.severity === "HIGH"
                ? "text-orange-400"
                : summary.severity === "MEDIUM"
                ? "text-yellow-400"
                : "text-emerald-400"
            }`}>[{summary.severity} RISK]</strong>
            {" "}Highest-risk corridor: <strong className="text-red-400">{summary.topCorridor}</strong>.{" "}
            {summary.riskType === "UNDER_DECLARATION" && "Exports exceed feasible production capacity; possible under-declaration."}
            {summary.riskType === "STOCKPILING" && "Precursor inputs exceed outputs; potential stockpiling or delayed distribution."}
            {summary.riskType === "DIVERSION" && "Gap suggests possible diversion to unregulated markets."}
          </>
        ) : (
          <>Precursors and exports are balanced; no significant anomalies detected.</>
        )}
      </div>
    </div>
  );
}

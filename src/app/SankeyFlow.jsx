"use client";

import React, { useMemo } from "react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";

/* =========================
   HELPERS
========================= */

// Fix "173,250.00"
const parseNum = (v) => {
  if (!v) return 0;
  return Number(String(v).replace(/,/g, ""));
};

const KG_TO_STICKS = 1 / 0.0007;
const YIELD = 0.95;

const toSticks = (kg) => (kg > 0 ? kg * KG_TO_STICKS : 0);

/* =========================
   TOOLTIP (FORENSIC)
========================= */

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

/* =========================
   MAIN COMPONENT
========================= */

export default function ForensicSankey({ rawData }) {

  const sankeyData = useMemo(() => {

    const safeData = Array.isArray(rawData) ? rawData : [];

    const clean = safeData
      .filter(d => d && Object.keys(d).length > 0)
      .map(d => ({
        hub: d.Entity || "Unknown Hub",

        tobaccoKG: parseNum(d.Tobacco),
        paperKG: parseNum(d.Paper),
        filterKG: parseNum(d.Filter),
        towKG: parseNum(d.Tow),

        cigKG: parseNum(
          d["Cigarette Exports"] ||
          d["Cigarette Exports "] ||
          d.outflow
        ),

        tobaccoOrigin: d["Tobacco Origin"] || "Unknown",
        paperOrigin: d["Paper Origin"] || "Unknown",
        filterOrigin: d["Filter Origin"] || "Unknown",
        towOrigin: d["Tow Origin"] || "Unknown",

        destination: d.Destination || "Unknown"
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

    /* =========================
       BUILD FLOWS
    ========================= */

    clean.forEach(d => {

      const hub = d.hub;
      const dest = d.destination;

      const precursorKG =
        d.tobaccoKG + d.paperKG + d.filterKG + d.towKG;

      const precursorSticks = toSticks(precursorKG) * YIELD;
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

    /* =========================
       BUILD FINAL LINKS
    ========================= */

    const links = [];

    linksMap.forEach(l => {

      const gap = l.exportSticks - l.precursorSticks;

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

    return { nodes, links };

  }, [rawData]);

  /* =========================
     SAFE RENDER
  ========================= */

  if (!rawData || !Array.isArray(rawData)) {
    return <div className="text-slate-500 p-4">Loading data...</div>;
  }

  if (!sankeyData.nodes.length || !sankeyData.links.length) {
    return (
      <div className="text-red-400 p-4">
        ⚠️ No valid Sankey data — check CSV
      </div>
    );
  }

  /* =========================
     RENDER
  ========================= */

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
    </div>
  );
}

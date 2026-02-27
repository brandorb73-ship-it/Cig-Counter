"use client";

import React, { useMemo } from "react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";

/* ================================
   CONSTANTS
================================ */

const KG_TO_STICKS = 1000; // 1kg = 1000 cigarettes
const MIN_FLOW_SHARE = 0.015;

/* ================================
   HELPERS
================================ */

const kgToSticks = (kg) => Math.round((kg || 0) * KG_TO_STICKS);

const scale = (v) => Math.log10(v + 1) * 120;

/* ================================
   RISK ENGINE (ENHANCED)
================================ */

const computeRisk = (row) => {
  let score = 0;

  if (row.stockpiling) score += 25;
  if (row.stamp_gap) score += 20;
  if (row.tax_loss) score += 30;

  if (row.entity_risk === "High") score += 25;
  if (row.entity_risk === "Medium") score += 10;

  return score;
};

/* ================================
   SUPPLY CHAIN CONSISTENCY CHECK
================================ */

const detectMismatch = (row) => {
  let flags = [];

  if (row["Tobacco Origin"] && row["Filter Origin"] &&
      row["Tobacco Origin"] !== row["Filter Origin"]) {
    flags.push("Multi-country component sourcing");
  }

  if (row["Tow Origin"] && row["Paper Origin"] &&
      row["Tow Origin"] !== row["Paper Origin"]) {
    flags.push("Tow/Paper mismatch");
  }

  return flags;
};

/* ================================
   AI SUMMARY ENGINE (REAL)
================================ */

const generateSummary = (flows) => {
  if (!flows.length) return "No flows detected.";

  const totalKg = flows.reduce((s, f) => s + f.kg, 0);
  const totalSticks = kgToSticks(totalKg);

  const top = [...flows].sort((a, b) => b.kg - a.kg)[0];

  const multiOrigin = flows.filter(f => f.flags.length > 0).length;
  const highRisk = flows.filter(f => f.risk > 60).length;

  return `
Total volume: ${totalKg.toLocaleString()} kg (~${totalSticks.toLocaleString()} sticks)

Primary destination: ${top.destination} (${Math.round((top.kg / totalKg) * 100)}%)

${multiOrigin} flows show multi-origin component structuring
${highRisk} high-risk flows (tax loss / stamp gap / stockpiling)

Pattern indicates ${multiOrigin > 2 ? "structured supply chain fragmentation" : "relatively linear trade flows"}.
  `;
};

/* ================================
   MAIN COMPONENT
================================ */

export default function SankeyFlow({ data }) {

  const sankeyData = useMemo(() => {

    if (!data || !data.length) {
      return { nodes: [], links: [], summary: "" };
    }

    /* --------------------------
       STEP 1: Build flows
    -------------------------- */

    let flows = data.map(row => {
flows = flows.filter(f =>
  f.kg > 0 &&
  f.tobacco &&
  f.destination
);
      const kg = Number(row.Kg || 0);

      return {
        kg,
        sticks: kgToSticks(kg),

        tobacco: row["Tobacco Origin"],
        tow: row["Tow Origin"],
        paper: row["Paper Origin"],
        filter: row["Filter Origin"],

        destination: row.Destination,

        risk: computeRisk(row),
        flags: detectMismatch(row),

        stockpiling: row.stockpiling,
        stamp_gap: row.stamp_gap,
        tax_loss: row.tax_loss
      };
    });

    /* --------------------------
       STEP 2: Aggregate flows
    -------------------------- */

    let linksRaw = [];

    flows.forEach(f => {
      if (f.tobacco && f.destination) {
        linksRaw.push({
          source: f.tobacco,
          target: f.destination,
          kg: f.kg,
          sticks: f.sticks,
          risk: f.risk,
          flags: f.flags,
          ...f
        });
      }
    });

    /* --------------------------
       STEP 3: Normalize / cluster
    -------------------------- */

    const total = linksRaw.reduce((s, l) => s + l.kg, 0);

    let major = [];
    let minorKg = 0;

    linksRaw.forEach(l => {
      if (l.kg / total < MIN_FLOW_SHARE) {
        minorKg += l.kg;
      } else {
        major.push(l);
      }
    });

    if (minorKg > 0) {
      major.push({
        source: "Other Origins",
        target: "Other Destinations",
        kg: minorKg,
        sticks: kgToSticks(minorKg),
        risk: 0,
        flags: []
      });
    }

    /* --------------------------
       STEP 4: Nodes
    -------------------------- */

   const nodeMap = new Map();
const nodes = [];

const getNodeIndex = (name) => {
  if (!name) return null;

  if (!nodeMap.has(name)) {
    nodeMap.set(name, nodes.length);
    nodes.push({ name });
  }
  return nodeMap.get(name);
};

const links = [];

major.forEach((l) => {
  const s = getNodeIndex(l.source);
  const t = getNodeIndex(l.target);

  // 🚨 HARD GUARD (prevents crash)
  if (s === null || t === null) return;
  if (s === t) return;

  links.push({
    source: s,
    target: t,
    value: Math.max(scale(l.kg), 1), // never 0
    rawKg: l.kg,
    sticks: l.sticks,
    risk: l.risk,
    flags: l.flags || [],
    stockpiling: l.stockpiling,
    stamp_gap: l.stamp_gap,
    tax_loss: l.tax_loss
  });
});

    const nodes = Object.keys(nodeMap).map(n => ({ name: n }));

    const summary = generateSummary(flows);

    return { nodes, links, summary };

  }, [data]);

  /* ================================
     TOOLTIP (INVESTIGATIVE)
  ================================= */

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;

    const d = payload[0].payload;

    return (
      <div style={{
        background: "#0f172a",
        color: "#e2e8f0",
        padding: "12px",
        borderRadius: "10px",
        fontSize: "12px"
      }}>
        <b>Flow Intelligence</b>

        <div>Export: {d.rawKg?.toLocaleString()} kg</div>
        <div>≈ {d.sticks?.toLocaleString()} sticks</div>

        <hr />

        <div><b>Risk Score:</b> {d.risk}</div>

        {d.stockpiling && <div>⚠ Stockpiling</div>}
        {d.stamp_gap && <div>⚠ Stamp Gap</div>}
        {d.tax_loss && <div>⚠ Tax Loss</div>}

        {d.flags?.length > 0 && (
          <>
            <hr />
            <div><b>Supply Chain Flags</b></div>
            {d.flags.map((f, i) => <div key={i}>⚠ {f}</div>)}
          </>
        )}
      </div>
    );
  };
// ✅ FIX 3 GOES HERE
if (!sankeyData.nodes.length || !sankeyData.links.length) {
  return (
    <div className="text-slate-400 text-sm p-4">
      No valid flow data
    </div>
  );
}
  return (
    <div style={{ width: "100%", height: 520 }}>

      {/* AI SUMMARY */}
      <div style={{
        background: "#020617",
        color: "#cbd5f5",
        padding: "12px",
        borderRadius: "10px",
        marginBottom: "10px",
        fontSize: "13px",
        lineHeight: "1.5"
      }}>
        <b>AI Intelligence Summary</b>
        <div style={{ marginTop: "6px", whiteSpace: "pre-line" }}>
          {sankeyData.summary}
        </div>
      </div>

      {/* SANKEY */}
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
  data={sankeyData}
  nodeId="name"   // ✅ ADD HERE
  nodePadding={28}
  linkCurvature={0.45}
          margin={{ top: 20, bottom: 20, left: 40, right: 40 }}
        >
          <Tooltip content={<CustomTooltip />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

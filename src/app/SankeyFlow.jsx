"use client";

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
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="#38bdf8"
        fillOpacity={0.9}
        rx={2}
      />
      <text
        x={isOut ? x - 10 : x + width + 10}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        fontSize={11}
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
const AuditTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const d = payload[0].payload;
  if (!d || !d.sourceName) return null;

  const efficiency = 0.95;
  const capacity = (d.tobacco * efficiency) / 0.0007;
  const exports = d.value;
  const gap = Math.round(exports - capacity);

  return (
    <div className="bg-slate-950 border border-slate-700 p-4 rounded-xl text-xs">
      <div className="text-emerald-400 font-black mb-2 uppercase">
        Mass Balance Audit
      </div>

      <div className="font-bold text-white mb-2">
        {d.sourceName} → {d.targetName}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Tobacco:</span>
          <span>{Math.round(d.tobacco).toLocaleString()} kg</span>
        </div>

        <div className="flex justify-between">
          <span>Capacity:</span>
          <span className="text-emerald-400">
            {Math.round(capacity).toLocaleString()}
          </span>
        </div>

        <div className="flex justify-between">
          <span>Exports:</span>
          <span className="text-blue-400">
            {Math.round(exports).toLocaleString()}
          </span>
        </div>

        <div
          className={`mt-2 text-center font-bold ${
            gap > 0 ? "text-red-500" : "text-emerald-400"
          }`}
        >
          GAP: {gap.toLocaleString()}
        </div>
      </div>
    </div>
  );
};

/* =========================
   MAIN COMPONENT
========================= */
export default function SankeyFlow({ processedData }) {
  const { sankeyData, riskLevel, riskFlags, summary } = useMemo(() => {
    if (!processedData || processedData.length === 0) {
      return {
        sankeyData: { nodes: [], links: [] },
        riskLevel: "LOW",
        riskFlags: [],
        summary: null,
      };
    }

    const nodes = [];
    const nodeMap = new Map();
    const linkMap = new Map();

    const CLUSTER_THRESHOLD = 0.03; // 3%

    /* ========= NODE CREATION ========= */
    const addNode = (name, layer) => {
      const safe = name || "Unknown";
      const key = `${safe}-L${layer}`;

      if (!nodeMap.has(key)) {
        const id = nodes.length;
        nodes.push({ name: safe, layer });
        nodeMap.set(key, id);
        return id;
      }
      return nodeMap.get(key);
    };

    /* ========= BUILD LINKS ========= */
    processedData.forEach((d) => {
      const valueRaw = Math.max(1, Number(d.outflow) || 0);

      // 🔥 FLOW SCALING (log compression)
      const scaled = Math.log10(valueRaw + 1) * 1000;

      const s = addNode(d.origin, 0);
      const e = addNode(d.entity, 1);
      const t = addNode(d.dest, 2);

      const update = (src, tgt, sName, tName) => {
        const key = `${src}-${tgt}`;

        if (!linkMap.has(key)) {
          linkMap.set(key, {
            source: src,
            target: tgt,
            sourceName: sName,
            targetName: tName,
            value: 0,
            tobacco: 0,
          });
        }

        const l = linkMap.get(key);
        l.value += scaled;
        l.tobacco += Number(d.tobacco) || 0;
      };

      update(s, e, d.origin, d.entity);
      update(e, t, d.entity, d.dest);
    });

    let links = Array.from(linkMap.values());

    /* ========= REMOVE INVALID ========= */
    links = links.filter(
      (l) =>
        l.value > 0 &&
        nodes[l.source] !== undefined &&
        nodes[l.target] !== undefined
    );

    if (links.length === 0) {
      return {
        sankeyData: { nodes: [], links: [] },
        riskLevel: "LOW",
        riskFlags: [],
        summary: null,
      };
    }

    /* ========= CLUSTERING ========= */
    const total = links.reduce((a, b) => a + b.value, 0);

    links = links.map((l) => {
      if (l.value / total < CLUSTER_THRESHOLD) {
        return { ...l, targetName: "OTHER" };
      }
      return l;
    });

    /* ========= RISK ========= */
    let score = 0;
    const flags = [];

    const totalTobacco =
      links.reduce((a, b) => a + b.tobacco, 0) / 2;

    const capacity = (totalTobacco * 0.95) / 0.0007;
    const volume = total;

    if (volume > capacity * 1.1) {
      flags.push({ msg: "Exports exceed capacity", type: "CRITICAL" });
      score += 4;
    }

    if (capacity > volume * 1.3) {
      flags.push({ msg: "Stockpiling detected", type: "HIGH" });
      score += 2;
    }

    const level = score >= 4 ? "CRITICAL" : score >= 2 ? "HIGH" : "LOW";

    const topRoute =
      links.length > 0
        ? links.reduce((p, c) => (p.value > c.value ? p : c))
        : null;

    return {
      sankeyData: { nodes, links },
      riskLevel: level,
      riskFlags: flags,
      summary: {
        topRoute: topRoute
          ? `${topRoute.sourceName} → ${topRoute.targetName}`
          : "N/A",
        totalVolume: Math.round(total),
        hub: processedData[0]?.entity || "Unknown",
      },
    };
  }, [processedData]);

  /* ========= EMPTY STATE ========= */
  if (!sankeyData.nodes.length || !sankeyData.links.length) {
    return (
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <p className="text-slate-400">No flow data available</p>
      </div>
    );
  }

  const styles = {
    CRITICAL: "text-red-500 border-red-500",
    HIGH: "text-orange-500 border-orange-500",
    LOW: "text-emerald-500 border-emerald-500",
  };

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[650px] flex flex-col">
      <div className="flex justify-between mb-6">
        <h3 className="text-xs text-slate-400 uppercase font-bold">
          Trade Flow Intelligence
        </h3>

        <div className={`px-3 py-1 border text-xs ${styles[riskLevel]}`}>
          {riskLevel}
        </div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={sankeyData}
          nodePadding={40}
          linkCurvature={0.5}
          node={<SankeyNode />}
          link={{ stroke: "#38bdf8", strokeOpacity: 0.3 }}
        >
          <Tooltip content={<AuditTooltip />} />
        </Sankey>
      </ResponsiveContainer>

      <div className="mt-4 text-xs text-slate-400">
        Hub: <span className="text-white">{summary?.hub}</span> | Route:{" "}
        <span className="text-white">{summary?.topRoute}</span>
      </div>
    </div>
  );
}

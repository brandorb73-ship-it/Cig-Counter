"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, 
  CartesianGrid, BarChart, Bar, Legend, Cell, Sankey, Tooltip as SankeyTooltip, LineChart,
} from "recharts";
import { ScatterChart, Scatter } from "recharts";
import Papa from "papaparse";
import TopRiskEntities from "./TopRiskEntities";
import SankeyFlow from "./SankeyFlow";
import RiskRanking from "./RiskRanking";
import OriginDestinationPanel from "./OriginDestinationPanel";

export default function ForensicEngineV3() {
  const [data, setData] = useState([]);
  const [url, setUrl] = useState("");
  const [wastage, setWastage] = useState(5);

const formatNumber = (num) => {
    if (num === null || num === undefined) return "0";
    return Number(num).toLocaleString("en-US");
  };
const fetchCSV = async () => {
  try {
    const res = await fetch(url);
    const text = await res.text();

    const { data: rows } = Papa.parse(text, {
      header: true,
      skipEmptyLines: true
    });

    const cleanNumeric = (val) => {
      if (!val) return 0;
      return parseFloat(String(val).replace(/[^\d.-]/g, "")) || 0;
    };

    const parsed = rows.map(r => ({
      entity: r["Entity"] || "Unknown",
      month: r["Month"] || "",
      year: r["Year"] || "",

      tobacco: cleanNumeric(r["Tobacco"]),
      tow: cleanNumeric(r["Tow"]),
      paper: cleanNumeric(r["Paper"]),
      filter: cleanNumeric(r["Filter"]),

      inventoryPool:
        cleanNumeric(r["Tobacco"]) +
        cleanNumeric(r["Tow"]) +
        cleanNumeric(r["Paper"]) +
        cleanNumeric(r["Filter"]),

      exports: cleanNumeric(r["Cigarette Exports"]),
exportUnit: (r["Cigarette Unit"] || "KG").toUpperCase(),

      // ✅ FIXED — use actual column names
      origin:
        r["Tobacco Origin"] ||
        r["Tow Origin"] ||
        r["Paper Origin"] ||
        r["Filter Origin"] ||
        "Unknown",

      dest: r["Destination"] || "Unknown"
    }));

    console.log("✅ Parsed CSV:", parsed);

    setData(parsed);

  } catch (err) {
    console.error("Fetch error:", err);
  }
};
 const processedData = useMemo(() => {
  if (!data || data.length === 0) return [];

  const n = (val) => {
    if (!val) return 0;
    const parsed = parseFloat(String(val).replace(/[^\d.-]/g, ""));
    return isNaN(parsed) ? 0 : Math.abs(parsed);
  };

  const monthOrder = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

  // 🔥 1. GROUP BY MONTH WITHOUT LOSING ENTITY DATA
const grouped = {};
data.forEach(d => {
  // Use entity + month + year to ensure we don't accidentally merge everything into one month
 const key = `${d.entity}-${d.month}-${d.year}`;
  
if (!grouped[key]) {
  grouped[key] = {
    month: d.month,
    year: d.year,
    entity: d.entity,
    origin: d.origin,
    dest: d.dest,
    tobacco: 0,
    tow: 0,
    paper: 0,
    filter: 0,
    inventoryPool: 0,
    exports: 0
  };
}

grouped[key].tobacco += n(d.tobacco);
grouped[key].tow += n(d.tow);
grouped[key].paper += n(d.paper);
grouped[key].filter += n(d.filter);
grouped[key].inventoryPool += n(d.inventoryPool);
grouped[key].exports += n(d.exports);
});

  const sorted = Object.values(grouped).sort((a,b) => {
    const yA = +a.year || 0, yB = +b.year || 0;
    const mA = monthOrder[(a.month||"").toLowerCase()] || 0;
    const mB = monthOrder[(b.month||"").toLowerCase()] || 0;
    return yA !== yB ? yA - yB : mA - mB;
  });

  let invPool = 0;
  let cumOut = 0;

  return sorted.map((d) => {
    const eff = (100 - wastage) / 100;
    
    // ✅ CORE MATH (Using Aggregated Values)
const inputCapacity = (d.inventoryPool * eff) / 0.0007;

invPool = invPool + inputCapacity - (invPool * 0.02);
const KG_PER_STICK = 0.0007;

const exportsInSticks =
  d.exportUnit === "KG"
    ? d.exports / KG_PER_STICK
    : d.exports;

cumOut += exportsInSticks;

    // ✅ BENFORD (Fixed Digit Extraction)
    const firstDigit = d.exports > 0 ? parseInt(String(Math.floor(d.exports))[0]) : 0;

    // ✅ RE-ESTABLISH MISSING ENTERPRISE KEYS
    const pdi = invPool > 0 ? ((invPool - cumOut) / invPool) * 100 : 0;
   const stampGap = Math.abs(cumOut - invPool);
    const transitRiskScore = d.exports > (invPool * 1.1) ? 85 : 15;

    return {
      ...d,
      xAxisLabel: `${(d.month || "").substring(0,3)} ${d.year}`,
      cumulativeInput: Math.round(invPool),
      cumulativeOutput: Math.round(cumOut),
inventoryPool: Math.round(invPool),
monthlyCapacity: Math.round(inputCapacity),
      outflow: Math.round(exportsInSticks),
exportsKG: d.exportUnit === "KG" ? d.exports : d.exports * KG_PER_STICK,
      stampGap: Math.round(stampGap),
      pdi: Math.round(pdi),
      transitRiskScore,
      firstDigit
    };
  });
}, [data, wastage]);

  // 🔥 SANKEY FLOW BUILDER (Origin → Entity → Destination)
const sankeyData = useMemo(() => {
  if (!data || data.length === 0) return { nodes: [], links: [] };

  const nodeMap = {};
  const linkMap = {};

  const addNode = (name) => {
    if (!nodeMap[name]) nodeMap[name] = { name };
  };

  data.forEach(d => {
    const origin = d.origin || "Unknown Origin";
    const entity = d.entity || "Unknown Entity";
    const dest = d.dest || "Unknown Destination";
    const value = Math.max(1, Number(d.exports) || 1);

    addNode(origin);
    addNode(entity);
    addNode(dest);

    const oe = `${origin}->${entity}`;
    const ed = `${entity}->${dest}`;

    linkMap[oe] = (linkMap[oe] || 0) + value;
    linkMap[ed] = (linkMap[ed] || 0) + value;
  });

  const nodes = Object.values(nodeMap);

  const nodeIndex = {};
  nodes.forEach((n, i) => {
    nodeIndex[n.name] = i;
  });

  const links = Object.entries(linkMap).map(([k, v]) => {
    const [s, t] = k.split("->");
    return {
      source: nodeIndex[s],
      target: nodeIndex[t],
      value: Math.round(v)
    };
  });

  return { nodes, links };
}, [data]);
  
  // ANOMALY TICKER LOGIC
const anomalies = useMemo(() => {
  return processedData.filter((d, i, arr) => {
    if (i === 0) return false;
    return d.outflow > (arr[i - 1].outflow * 2) && d.outflow > 0;
  });
}, [processedData]);

const aiSummary = useMemo(() => {
  if (!processedData.length) return "Upload data to generate forensic insight.";

  const latest = processedData[processedData.length - 1];

  const gap = latest.stampGap;
  const integrity =
    latest.cumulativeInput > 0
      ? (latest.cumulativeOutput / latest.cumulativeInput) * 100
      : 0;

  const trend =
    processedData.length > 2
      ? latest.outflow > processedData[processedData.length - 2].outflow
        ? "increasing"
        : "declining"
      : "stable";

  const anomalyCount = anomalies.length;

  // 🔥 Narrative Logic
  let riskLevel = "LOW RISK";
  if (gap > 1_000_000 || integrity > 110) riskLevel = "CRITICAL";
  else if (gap > 250_000 || integrity > 100) riskLevel = "HIGH";
  else if (gap > 50_000) riskLevel = "MODERATE";

  return `
${riskLevel} FORENSIC SIGNAL

• Modeled production capacity vs declared exports shows ${
    integrity > 100 ? "OUTPUT EXCEEDING INPUT capacity" : "aligned output"
  }.

• Total volumetric gap: ${formatNumber(gap)} sticks.

• Export trend is ${trend}, suggesting ${
    trend === "increasing"
      ? "escalating distribution activity"
      : trend === "declining"
      ? "cooling shipment patterns"
      : "no strong directional shift"
  }.

• ${anomalyCount} abnormal shipment spikes detected.

${
  integrity > 110
    ? "⚠️ Strong indicator of external sourcing, illicit manufacturing, or under-declared raw material inputs."
    : integrity > 100
    ? "⚠️ Potential leakage or unaccounted production inputs."
    : "✓ No structural imbalance detected."
}
`;
}, [processedData, anomalies]);

const benford = useMemo(() => {
  const counts = Array(9).fill(0);

  processedData.forEach(d => {
    if (d.firstDigit >= 1 && d.firstDigit <= 9) {
      counts[d.firstDigit - 1]++;
    }
  });

  const total = counts.reduce((a,b)=>a+b,0);

  return counts.map((c,i)=>({
    digit: i+1,
    actual: total ? (c/total)*100 : 0,
    ideal: [30.1,17.6,12.5,9.7,7.9,6.7,5.8,5.1,4.6][i]
  }));
}, [processedData]);

  return (
    <div className="p-6 space-y-8 bg-slate-950 min-h-screen text-slate-200">

{/* SYNC PANEL */}
<div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-6 items-end">
  <div className="flex-[2] space-y-2">
    <label className="text-[10px] font-bold uppercase text-emerald-400 tracking-widest">Forensic Data Source (CSV URL)</label>
    <input 
      className="w-full bg-black border border-slate-800 p-3 rounded-xl text-xs text-emerald-100 outline-none focus:border-emerald-500/50"
      value={url} 
      onChange={e => setUrl(e.target.value)} 
      placeholder="Paste CSV link here..." 
    />
  </div>

  {/* WASTAGE SLIDER INTEGRATED */}
  <div className="flex-1 space-y-2 min-w-[150px]">
    <label className="text-[10px] text-orange-400 font-bold uppercase tracking-widest">Wastage Factor: {wastage}%</label>
    <input 
      type="range" 
      min="0" 
      max="25" 
      step="0.5"
      value={wastage} 
      onChange={e => setWastage(parseFloat(e.target.value))} 
      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500" 
    />
  </div>

  <button 
    onClick={fetchCSV}
    className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-xs uppercase transition-all shadow-lg shadow-emerald-900/20"
  >
    Sync Intelligence
  </button>
</div>
        {/* ✅ KPI SNAPSHOT ROW */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  
  {/* STAMP GAP CARD */}
  <div className="bg-slate-900 p-6 rounded-2xl border border-red-900/40 shadow-lg shadow-red-900/10">
    <div className="flex justify-between items-start mb-2">
      <h3 className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">
        Volumetric Stamp Gap
      </h3>
      <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded border border-red-500/20">
        High Risk
      </span>
    </div>
    <p className="text-3xl font-black text-white tracking-tight">
      {processedData.length > 0 
        ? processedData[processedData.length - 1].stampGap.toLocaleString() 
        : "0"}
      <span className="text-xs text-slate-500 ml-2 font-normal">Units</span>
    </p>
    <p className="text-[9px] text-slate-500 mt-2 italic leading-relaxed">
      Total discrepancy between raw material capacity and declared trade exports.
    </p>
  </div>

  {/* CAPACITY UTILIZATION CARD */}
  <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
    <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2">
      Inventory Integrity
    </h3>
    <p className="text-3xl font-black text-white tracking-tight">
{processedData.length > 0 && processedData[processedData.length - 1].cumulativeInput > 0
  ? Math.round(
      (processedData[processedData.length - 1].cumulativeOutput /
      processedData[processedData.length - 1].cumulativeInput) * 100
    )
  : "0"}%
    </p>
    <p className="text-[9px] text-slate-500 mt-2 italic">
      Ratio of output vs. legal input capacity.
    </p>
  </div>

</div>
        
{/* ✅ SMOKING GUN: CUMULATIVE FLOW */}
<div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
  <h3 className="text-sm font-bold mb-4 uppercase text-slate-400 tracking-widest">
    Forensic Mass Balance (Smoking Gun)
  </h3>
  <ResponsiveContainer width="100%" height="90%">
   <ComposedChart 
  data={processedData} 
  margin={{ top: 20, right: 30, left: 40, bottom: 60 }} // ✅ Extra bottom margin for X-Axis labels
>
<CartesianGrid stroke="#334155" strokeDasharray="3 3" />
  
  <XAxis
  dataKey="xAxisLabel"
  stroke="#e2e8f0"
  tick={{ fill: "#e2e8f0", fontSize: 11 }}
  axisLine={{ stroke: "#94a3b8" }}
  tickLine={{ stroke: "#94a3b8" }}
/>

<YAxis
  stroke="#e2e8f0"
  tickFormatter={formatNumber}
  tick={{ fill: "#e2e8f0", fontSize: 11 }}
  axisLine={{ stroke: "#94a3b8" }}
  tickLine={{ stroke: "#94a3b8" }}
/>

<Tooltip
  content={({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const d = payload[0].payload;

    const KG_TO_STICKS = 1 / 0.0007;

    const inputKG = d.inventoryPool / KG_TO_STICKS; // reverse derived
    const exportKG = d.exportsKG;

    return (
      <div className="bg-slate-950 border border-slate-700 p-3 rounded-lg text-xs">
        <p className="font-bold text-emerald-400 mb-2">{d.xAxisLabel}</p>

        <p>🟢 Input (KG): {formatNumber(Math.round(inputKG))}</p>
        <p>🟢 Modeled Capacity (sticks): {formatNumber(d.monthlyCapacity)}</p>

        <div className="border-t border-slate-700 my-2"></div>

        <p>🔴 Exports (sticks): {formatNumber(d.outflow)}</p>
        <p>🔴 Equivalent KG Used: {formatNumber(Math.round(exportKG))}</p>

        <div className="border-t border-slate-700 my-2"></div>

        <p className="text-red-400">
          Gap: {formatNumber(d.stampGap)} sticks
        </p>

        <p className="text-yellow-400">
          Efficiency: {(100 - wastage).toFixed(1)}%
        </p>
      </div>
    );
  }}
/>
  <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '20px' }} />
  
  <Area name="Capacity" dataKey="cumulativeInput" fill="#10b981" fillOpacity={0.2} stroke="#10b981" />
  <Line name="Exports" dataKey="cumulativeOutput" stroke="#ef4444" strokeWidth={4} dot={{ r: 4, fill: '#ef4444' }} />
</ComposedChart>
  </ResponsiveContainer>
<p className="text-[10px] text-slate-400 mt-3 italic whitespace-pre-line">
  {aiSummary}
</p>
</div>
        
{/* INVENTORY DECAY */}
<div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[400px]">
  <h3 className="text-xs font-bold uppercase text-slate-400 mb-6">
    Inventory Aging (Drying Effect)
  </h3>

  <ResponsiveContainer width="100%" height="80%">
    <LineChart
      data={processedData}
      margin={{ top: 20, right: 20, left: 20, bottom: 50 }}
    >
      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />

      <XAxis tickFormatter={formatNumber} 
        dataKey="xAxisLabel"
        angle={-30}
        textAnchor="end"
        height={60}
        stroke="#e2e8f0"
        tick={{ fill: "#e2e8f0", fontSize: 11 }}
      />

      <YAxis
        stroke="#e2e8f0"
  tickFormatter={formatNumber}
  tick={{ fill: "#e2e8f0", fontSize: 11 }}
/>

      <Tooltip
  formatter={(value) => formatNumber(value)}
  contentStyle={{
    backgroundColor: "#020617",
    border: "1px solid #334155",
    color: "#e2e8f0"
  }}
/>

      <Line dataKey="inventoryPool" stroke="#f59e0b" strokeWidth={3} dot={false} />
    </LineChart>
  </ResponsiveContainer>
<p className="text-[10px] text-slate-500 mt-3 italic">
  Inventory levels reflect decay-adjusted accumulation. Persistent buildup indicates stockpiling, while sharp drops suggest bulk export cycles.
</p>
</div>
        {/* BENFORD'S LAW DISTRIBUTION */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[400px]">
          <h3 className="text-sm font-bold mb-4 uppercase text-slate-400">Data Integrity (Benford Analysis)</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={benford}>
  <XAxis dataKey="digit" stroke="#e2e8f0" fontSize={12} />
  <YAxis
  tickFormatter={formatNumber}
  tick={{ fill: "#e2e8f0", fontSize: 11 }}
/>
  <Tooltip cursor={{fill: 'transparent'}} />
  
  {/* Actual Counts from your CSV */}
  <Bar dataKey="actual" fill="#6366f1" radius={[4, 4, 0, 0]} name="Frequency" />
</BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-slate-500 mt-3 italic">
  Distribution deviation from Benford's Law may indicate artificial number manipulation or reporting bias in trade values.
</p>
        </div>
{/* SCATTER CHART: CORRELATION ANALYSIS */}
<div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[400px]">
  <h3 className="text-sm font-bold mb-4 uppercase text-slate-400">
    Mass vs Output Correlation
  </h3>

  <ResponsiveContainer width="100%" height="90%">
    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
      
      <XAxis tickFormatter={formatNumber} 
        type="number"
        dataKey="inventoryPool"
        name="Inventory"
        stroke="#e2e8f0"
        fontSize={10}
      />
      
      <YAxis
        type="number"
        dataKey="outflow" // Make sure this key matches your data
        name="Exports"
  tickFormatter={formatNumber}
  tick={{ fill: "#e2e8f0", fontSize: 11 }}
      />
      
      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
      
      <Scatter
        name="Monthly Correlation"
        data={processedData} // Ensure processedData is an array of objects with keys: inventoryPool & outflow
        fill="#38bdf8"
      />
    </ScatterChart>
  </ResponsiveContainer>
  <p className="text-[10px] text-slate-500 mt-3 italic">
  Weak correlation between input materials and exports may indicate external sourcing, misreporting, or transit trade behavior.
</p>
</div>

<SankeyFlow processedData={processedData} />
<RiskRanking processedData={processedData} />
<OriginDestinationPanel processedData={processedData} />
<TopRiskEntities processedData={processedData} />
</div>
);
}

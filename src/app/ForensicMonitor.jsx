"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, 
  CartesianGrid, BarChart, Bar, Legend, Cell, Sankey, Tooltip as SankeyTooltip, LineChart,
} from "recharts";
import { ScatterChart, Scatter } from "recharts";

export default function ForensicEngineV3() {
  const [data, setData] = useState([]);
  const [url, setUrl] = useState("");
  const [wastage, setWastage] = useState(5);

  const fetchCSV = async () => {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const rows = text.split("\n").filter(row => row.trim() !== "").slice(1);

      const parsed = rows.map(r => {
  const c = r.split(",").map(field => field.trim());
  return {
    entity: c[0] || "Unknown",
    month: c[1] || "",
    year: c[2] || "",
    tobacco: parseFloat(c[3]) || 0,
    exports: parseFloat(c[15]) || 0, // Ensure column 16 (index 15) has your data
    origin: c[5] || "Unknown",
    dest: c[14] || "Unknown"
  };
});
      setData(parsed);
    } catch (err) {
      console.error("Fetch error:", err);
      alert("Check your CSV URL and ensure it is published as a CSV.");
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
    const key = `${(d.month || "").toLowerCase()}-${d.year}`;
    if (!grouped[key]) {
      grouped[key] = {
        ...d, // Keep original row properties (origin, dest, entity)
        tobacco: 0,
        exports: 0,
      };
    }
    grouped[key].tobacco += n(d.tobacco);
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
    const monthlyCapacity = (d.tobacco * eff) / 0.0007;
    invPool = (invPool * 0.98) + monthlyCapacity; // Inventory Decay
    cumOut += d.exports;

    // ✅ BENFORD (Fixed Digit Extraction)
    const firstDigit = d.exports > 0 ? parseInt(String(Math.floor(d.exports))[0]) : 0;

    // ✅ RE-ESTABLISH MISSING ENTERPRISE KEYS
    const pdi = invPool > 0 ? ((invPool - cumOut) / invPool) * 100 : 0;
    const stampGap = Math.max(0, cumOut - invPool);
    const transitRiskScore = d.exports > (invPool * 1.1) ? 85 : 15;

    return {
      ...d,
      xAxisLabel: `${(d.month || "").substring(0,3)} ${d.year}`,
      cumulativeInput: Math.round(invPool),
      cumulativeOutput: Math.round(cumOut),
      inventoryPool: Math.round(invPool),
      monthlyCapacity: Math.round(monthlyCapacity),
      outflow: Math.round(d.exports),
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
  const links = [];

  const getNodeIndex = (name) => {
    if (!nodeMap[name]) {
      nodeMap[name] = { name };
    }
    return Object.keys(nodeMap).indexOf(name);
  };

  data.forEach(d => {
    const origin = String(d.origin || "Unknown Origin");
    const entity = String(d.entity || "Unknown Entity");
    const dest = String(d.dest || "Unknown Destination");

    const value = Math.max(1, parseFloat(d.exports) || 1);

    // Origin → Entity
    links.push({
      source: origin,
      target: entity,
      value
    });

    // Entity → Destination
    links.push({
      source: entity,
      target: dest,
      value
    });
  });

  // Convert names → indices
  const nodes = Object.keys(nodeMap).map(name => ({ name }));

  const nodeIndex = {};
  nodes.forEach((n, i) => {
    nodeIndex[n.name] = i;
  });

  const formattedLinks = links.map(l => ({
    source: nodeIndex[l.source],
    target: nodeIndex[l.target],
    value: l.value
  }));

  return { nodes, links: formattedLinks };

}, [data]);
  // ANOMALY TICKER LOGIC
const anomalies = useMemo(() => {
  return processedData.filter((d, i, arr) => {
    if (i === 0) return false;
    return d.outflow > (arr[i - 1].outflow * 2) && d.outflow > 0;
  });
}, [processedData]);

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
      {processedData.length > 0 
        ? Math.round((processedData[processedData.length - 1].cumulativeOutput / processedData[processedData.length - 1].cumulativeInput) * 100) 
        : "0"}%
    </p>
    <p className="text-[9px] text-slate-500 mt-2 italic">
      Ratio of output vs. legal input capacity.
    </p>
  </div>

</div>
        
        {/* SMOKING GUN: MATERIAL BALANCE */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[400px]">
          <h3 className="text-sm font-bold mb-4 uppercase text-slate-400">Smoking Gun: Material Balance</h3>
          <ResponsiveContainer width="100%" height={400}>
  <ComposedChart data={processedData}>
    
    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />

    <XAxis 
      dataKey="xAxisLabel"
      tick={{ fill: "#94a3b8", fontSize: 12 }}
    />

    <YAxis 
      yAxisId="left"
      tickFormatter={(v)=>v.toLocaleString()}
      tick={{ fill: "#94a3b8" }}
    />

    <YAxis 
      yAxisId="right"
      orientation="right"
      tickFormatter={(v)=>v.toLocaleString()}
      tick={{ fill: "#94a3b8" }}
    />

    <Tooltip
      formatter={(v,name)=>[
        v.toLocaleString(),
        name === "cumulativeInput" 
          ? "Material Capacity"
          : "Actual Exports"
      ]}
    />

    <Legend />

    <Area
      yAxisId="left"
      dataKey="cumulativeInput"
      stroke="#10b981"
      fill="#10b981"
      fillOpacity={0.2}
      name="Material Pool"
    />

    <Line
      yAxisId="right"
      dataKey="cumulativeOutput"
      stroke="#ef4444"
      strokeWidth={3}
      name="Exports"
    />

  </ComposedChart>
</ResponsiveContainer>
        </div>
        
{/* INVENTORY DECAY */}
<div className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
  <h3 className="text-slate-800 font-black text-[11px] uppercase tracking-[0.3em] mb-6">
    Inventory Decay (Drying Effect)
  </h3>

  <div className="h-[250px] w-full">
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={processedData}>
        <XAxis dataKey="xAxisLabel" />
        <YAxis />
        <Tooltip />
        <Line 
          dataKey="inventoryPool" 
          stroke="#f59e0b"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>
        {/* BENFORD'S LAW DISTRIBUTION */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[400px]">
          <h3 className="text-sm font-bold mb-4 uppercase text-slate-400">Data Integrity (Benford Analysis)</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={benford}>
  <XAxis dataKey="digit" stroke="#475569" fontSize={12} />
  <YAxis stroke="#475569" fontSize={10} />
  <Tooltip cursor={{fill: 'transparent'}} />
  
  {/* Actual Counts from your CSV */}
  <Bar dataKey="actual" fill="#6366f1" radius={[4, 4, 0, 0]} name="Frequency" />
</BarChart>
          </ResponsiveContainer>
        </div>
      </div>
{/* SCATTER CHART: CORRELATION ANALYSIS */}
<div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[400px]">
  <h3 className="text-sm font-bold mb-4 uppercase text-slate-400">
    Mass vs Output Correlation
  </h3>

  <ResponsiveContainer width="100%" height="90%">
    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
      
      <XAxis
        type="number"
        dataKey="inventoryPool"
        name="Inventory"
        stroke="#475569"
        fontSize={10}
      />
      
      <YAxis
        type="number"
        dataKey="outflow" // Make sure this key matches your data
        name="Exports"
        stroke="#475569"
        fontSize={10}
      />
      
      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
      
      <Scatter
        name="Monthly Correlation"
        data={processedData} // Ensure processedData is an array of objects with keys: inventoryPool & outflow
        fill="#38bdf8"
      />
    </ScatterChart>
  </ResponsiveContainer>
</div>
      {/* ✅ PASTE RISK TABLE HERE */}

      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <h3 className="text-xs font-black uppercase text-red-400 tracking-widest mb-4">
          Entity Risk Ranking
        </h3>

        <div className="space-y-2">
          {Object.entries(
            processedData.reduce((acc, d) => {
              acc[d.entity] = (acc[d.entity] || 0) + d.transitRiskScore + Math.abs(d.pdi);
              return acc;
            }, {})
          )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([entity, score], i) => (
              <div
                key={i}
                className="flex justify-between items-center bg-red-950/20 p-3 rounded-lg border border-red-900/30"
              >
                <span className="text-xs text-red-300">{entity}</span>
                <span className="text-xs font-bold text-red-400">
                  Risk Score: {Math.round(score)}
                </span>
              </div>
            ))}
        </div>
      </div>
<div className="grid grid-cols-2 gap-6 mt-6">

  {/* ORIGIN */}
  <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
    <h4 className="text-xs uppercase text-slate-400 mb-4">Origin Intelligence</h4>
    {Object.entries(
      processedData.reduce((acc,d)=>{
        acc[d.origin] = (acc[d.origin]||0)+d.tobacco;
        return acc;
      },{})
    ).map(([k,v],i)=>(
      <div key={i} className="flex justify-between text-xs mb-2">
        <span>{k}</span>
        <span>{Math.round(v)}</span>
      </div>
    ))}
  </div>

  {/* DESTINATION */}
  <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
    <h4 className="text-xs uppercase text-slate-400 mb-4">Destination Intelligence</h4>
    {Object.entries(
      processedData.reduce((acc,d)=>{
        acc[d.dest] = (acc[d.dest]||0)+d.outflow;
        return acc;
      },{})
    ).map(([k,v],i)=>(
      <div key={i} className="flex justify-between text-xs mb-2">
        <span>{k}</span>
        <span>{Math.round(v)}</span>
      </div>
    ))}
  </div>

</div>
<div className="bg-slate-900 p-6 rounded-xl border border-slate-800 mt-6">
  <h4 className="text-xs uppercase text-slate-400 mb-4">
    Top Risk Entities
  </h4>

  {Object.entries(
    processedData.reduce((acc,d)=>{
      acc[d.entity] = (acc[d.entity]||0) + d.transitRiskScore;
      return acc;
    },{})
  )
  .sort((a,b)=>b[1]-a[1])
  .slice(0,10)
  .map(([name,score],i)=>(
    <div key={i} className="flex justify-between text-xs mb-2">
      <span>{name}</span>
      <span className="text-red-400">{score}</span>
    </div>
  ))}
</div>
    </div>
  );
}

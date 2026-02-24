"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, 
  CartesianGrid, BarChart, Bar, Legend, Cell, Sankey, Tooltip as SankeyTooltip
} from "recharts";

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
          exports: parseFloat(c[15]) || 0,
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

  const units = { kg: 1, ton: 1000, mt: 1000, lb: 0.4535 };

  const n = (val) => {
    if (!val) return 0;
    const parsed = parseFloat(String(val).replace(/[^\d.-]/g, ""));
    return isNaN(parsed) ? 0 : Math.abs(parsed);
  };

  const monthOrder = {
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
    jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
  };

  const sorted = [...data].sort((a,b)=>{
    const yA = +a.year || 0;
    const yB = +b.year || 0;
    const mA = monthOrder[(a.month||"").toLowerCase()] || 0;
    const mB = monthOrder[(b.month||"").toLowerCase()] || 0;
    return yA !== yB ? yA - yB : mA - mB;
  });

  let invPool = 0;
  let cumOut = 0;

  return sorted.map((d) => {
    const eff = (100 - wastage) / 100;

    const monthShort = String(d.month || "").substring(0,3);

    const tobaccoVal = n(d.t_val);
    const tobaccoUnit = String(d.t_unit || "kg").toLowerCase();

    const tKG = tobaccoVal * (units[tobaccoUnit] || 1);

    // 🔥 PRODUCTION CAPACITY
    const monthlyCapacity = (tKG * eff) / 0.0007;

    const exports = n(
      d["Cigarette Exports"] ||
      d.outflow ||
      d.exports
    );

    // 🔥 INVENTORY DECAY MODEL
    invPool = (invPool * 0.98) + monthlyCapacity;

    // 🔥 ROLLING MASS BALANCE
    cumOut += exports;

    // 🔥 STAMP GAP
    const stampGap = Math.max(0, cumOut - invPool);

    // 🔥 PDI (Precursor Divergence)
    const pdi = invPool > 0 
      ? ((monthlyCapacity - exports) / monthlyCapacity) * 100
      : 0;

    // 🔥 TRANSIT RISK
    const riskHubs = ["SINGAPORE","DUBAI","PANAMA","BELIZE","CYPRUS"];

    const route = String(d.destination || "").toUpperCase();
    const isHighRisk = riskHubs.some(h => route.includes(h));

    const transitRiskScore = isHighRisk ? 80 : 20;

    // BENFORD
    const firstDigit = exports > 0 
      ? parseInt(exports.toString()[0]) 
      : 0;

    return {
      ...d,
      xAxisLabel: `${monthShort} ${d.year}`,

      cumulativeInput: Math.round(invPool),
      cumulativeOutput: Math.round(cumOut),

      inventoryPool: Math.round(invPool),
      monthlyCapacity: Math.round(monthlyCapacity),

      outflow: Math.round(exports),

      stampGap,
      pdi: Math.round(pdi),

      transitRiskScore,
      isHighRisk,

      firstDigit
    };
  });

}, [data, wastage]);
  // ANOMALY TICKER LOGIC
  const anomalies = useMemo(() => {
    return processed.filter((d, i, arr) => {
      if (i === 0) return false;
      // Flag if exports more than double month-over-month
      return d.exports > (arr[i - 1].exports * 2) && d.exports > 0;
    });
  }, [processed]);

  // BENFORD'S LAW (First Digit Analysis)
  const benford = useMemo(() => {
    const counts = Array(9).fill(0);
    processed.forEach(d => {
      const firstDigit = String(Math.abs(d.exports))[0];
      if (firstDigit >= "1" && firstDigit <= "9") {
        counts[parseInt(firstDigit) - 1]++;
      }
    });
    return counts.map((c, i) => ({ digit: i + 1, actual: c }));
  }, [processed]);

  return (
    <div className="p-6 space-y-8 bg-slate-950 min-h-screen text-slate-200">
      
      {/* SYNC PANEL */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 space-y-2">
          <label className="text-[10px] font-bold uppercase text-emerald-400 tracking-widest">Forensic Data Source (CSV URL)</label>
          <input 
            className="w-full bg-black border border-slate-800 p-3 rounded-xl text-xs text-emerald-100 outline-none focus:border-emerald-500/50"
            value={url} 
            onChange={e => setUrl(e.target.value)} 
            placeholder="Paste CSV link here..." 
          />
        </div>
        <button 
          onClick={fetchCSV}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold text-xs uppercase transition-all"
        >
          Sync Intelligence
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
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

        {/* BENFORD'S LAW DISTRIBUTION */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 h-[400px]">
          <h3 className="text-sm font-bold mb-4 uppercase text-slate-400">Data Integrity (Benford Analysis)</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={benford}>
              <XAxis dataKey="digit" stroke="#475569" />
              <YAxis stroke="#475569" />
              <Tooltip />
              <Bar dataKey="actual" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ANOMALY TICKER */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
        <h3 className="text-xs font-black uppercase text-red-500 tracking-widest mb-4">Live Anomaly Detection</h3>
        <div className="space-y-2">
          {anomalies.length > 0 ? anomalies.map((a, i) => (
            <div key={i} className="flex justify-between items-center bg-red-950/20 p-3 rounded-lg border border-red-900/30">
              <span className="text-xs font-mono text-red-400">⚠️ VOLUMETRIC SPIKE DETECTED</span>
              <span className="text-xs font-bold">{a.entity} — {a.month} {a.year}</span>
            </div>
          )) : (
            <div className="text-xs text-slate-500 italic">No significant volumetric spikes detected in current set.</div>
          )}
        </div>
      </div>

    </div>
  );
}

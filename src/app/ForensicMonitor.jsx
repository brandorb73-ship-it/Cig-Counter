"use client"; // REQUIRED FOR NEXT.JS

import React, { useState, useMemo } from 'react';
import { 
  ComposedChart, 
  Line, 
  Bar, 
  BarChart,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Area, 
  ScatterChart, 
  Scatter, 
  ZAxis 
} from 'recharts';
import { 
  ShieldAlert, 
  Globe, 
  Activity, 
  Zap, 
  Link, 
  Calculator, 
  TrendingUp, 
  BarChart3, 
  DollarSign, 
  Layers 
} from 'lucide-react';

const ForensicMonitor = () => {
  const [data, setData] = useState([]);
  const [sheetUrl, setSheetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [wastage, setWastage] = useState(5);

  // CONVERSION CONSTANTS
  const yieldConstants = {
    tobacco: 0.0007, // 0.7g per stick
    tow: 20000,      // 20k sticks per 1kg
    paper: 40000     // 40k sticks per unit
  };

 const fetchSheetData = async () => {
  try {
    const response = await fetch(sheetUrl);
    const csvText = await response.text();
    // Split by lines and remove empty rows
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== "");
    
    const formatted = lines.slice(1).map(row => {
      // Split by comma, but handle potential commas inside quotes if they exist
      const cols = row.split(',').map(c => c.trim());
      
      const cleanNum = (val) => {
        if (!val) return 0;
        // Removes commas/spaces and converts to float
        const n = parseFloat(val.replace(/[^\d.-]/g, ''));
        return isNaN(n) ? 0 : n;
      };

      return {
        entity: cols[0],
        month: cols[1],
        year: cols[2],
        t_val: cleanNum(cols[3]),    // "Tobacco"
        t_unit: cols[4] || 'KG',      // "Tobacco Unit"
        tow_val: cleanNum(cols[6]),  // "Tow"
        tow_unit: cols[7] || 'KG',    // "Tow Unit"
        p_val: cleanNum(cols[9]),    // "Paper"
        p_unit: cols[10] || 'M',     // "Paper Unit"
        f_val: cleanNum(cols[12]),   // "Filter"
        f_unit: cols[13] || 'PCS',   // "Filter Unit"
        outflow: cleanNum(cols[15]), // "Outflow"
        dest: cols[16]               // "Destination"
      };
    }).filter(r => r.entity && r.entity !== "");

    setData(formatted);
  } catch (error) {
    console.error("Sync Error:", error);
  }
};
const processedData = useMemo(() => {
  const units = { 'kg': 1, 'ton': 1000, 'mt': 1000, 'lb': 0.4535 };
  let pool = 0; 
  let actual = 0;

  return data.map((d) => {
    const waste = (100 - wastage) / 100;

    // Standard Industry Ratios
    const kgT = d.t_val * (units[d.t_unit?.toLowerCase()] || 1);
    const capT = (kgT * waste) / 0.0007; // 0.7g per stick

    const kgTow = d.tow_val * (units[d.tow_unit?.toLowerCase()] || 1);
    const capTow = (kgTow * waste) * 20000; // 1kg tow = 20k filters

    const capPaper = (d.p_val * waste) * 12; // 1m paper = 12 sticks
    const capRods = (d.f_val * waste) * 6;   // 1 rod = 6 filters

    // Capacity is limited by the scarcest resource
    // If a row has 0 for a precursor, we use only the available ones
    const capacities = [capT, capTow, capPaper, capRods].filter(v => v > 0);
    const theoreticalMax = capacities.length > 0 ? Math.min(...capacities) : 0;
    
    pool += theoreticalMax;
    actual += d.outflow;

    return {
      ...d,
      tobaccoKG: kgT,
      theoreticalMax,
      cumulativeInput: pool,
      cumulativeOutput: actual,
      // For Benford's Law chart
      firstDigit: parseInt(d.outflow.toString()[0]) || 0,
      priceIndex: kgT > 0 ? (d.outflow / kgT) : 0
    };
  });
}, [data, wastage]);
  
     // --- BENFORD'S LAW CALCULATION ---
  const benfordAnalysis = useMemo(() => {
    if (processedData.length === 0) return [];
    
    const counts = Array(9).fill(0);
    processedData.forEach(d => {
      // We look at the first digit of the Outflow_Sticks
      const firstDigit = parseInt(d.outflow?.toString()[0]);
      if (firstDigit > 0 && firstDigit <= 9) {
        counts[firstDigit - 1]++;
      }
    });

    const total = counts.reduce((a, b) => a + b, 0);
    const idealBenford = [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];

    return counts.map((c, i) => ({
      digit: i + 1,
      actual: total > 0 ? (c / total) * 100 : 0,
      ideal: idealBenford[i]
    }));
  }, [processedData]);
  const totalGap = processedData.reduce((acc, curr) => acc + curr.gap, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* SYNC PANEL - OBSIDIAN DARK THEME */}
      <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2.5rem] shadow-2xl">
        <div className="flex flex-col md:flex-row gap-6 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-black uppercase text-emerald-400 tracking-[0.2em] flex items-center gap-2">
              <Link size={12}/> Google Sheets Forensic Source (CSV)
            </label>
            <input 
              type="text" 
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="PASTE PUBLISHED URL..."
              className="w-full bg-black/40 border-2 border-slate-800 p-4 rounded-2xl font-mono text-[11px] text-emerald-100 outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-700"
            />
          </div>
          <button 
            onClick={fetchSheetData}
            disabled={loading}
            className="bg-emerald-500 hover:bg-emerald-400 text-black px-10 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all disabled:opacity-30 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
          >
            {loading ? 'ANALYZING...' : 'SYNC INTELLIGENCE'}
          </button>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-white border-2 border-slate-100 p-6 rounded-[2rem] shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Wastage Tolerance</p>
            <input 
                type="range" min="0" max="25" value={wastage} 
                onChange={(e) => setWastage(e.target.value)} 
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500" 
            />
            <div className="flex justify-between mt-2 text-[10px] font-bold text-emerald-600 uppercase">
                <span>Current: {wastage}%</span>
                <span>Margin: {Math.round(25-wastage)}%</span>
            </div>
         </div>

         <div className="bg-white border-2 border-slate-100 p-6 rounded-[2rem] flex justify-between items-center shadow-sm">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Ghost Volume</p>
              <p className="text-2xl font-black text-black mt-1">{Math.round(totalGap).toLocaleString()}</p>
            </div>
            <ShieldAlert className="text-red-500" size={32} />
         </div>

         <div className="bg-white border-2 border-slate-100 p-6 rounded-[2rem] flex justify-between items-center shadow-sm">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Entities</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{new Set(data.map(d=>d.entity)).size}</p>
            </div>
            <Activity className="text-emerald-500" size={32} />
         </div>
      </div>

      {/* 2. MACRO-FORENSIC SUITE (SMOKING GUN, BENFORD, SCATTER) */}
      <div className="space-y-8 mt-8">
        
        {/* THE SMOKING GUN */}
        <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2.5rem] shadow-2xl">
          <div className="mb-8">
            <h3 className="text-emerald-400 font-black text-[11px] uppercase tracking-[0.3em] flex items-center gap-2">
              <TrendingUp size={14} /> Cumulative Precursor Burn (The Smoking Gun)
            </h3>
            <p className="text-slate-500 text-[10px] mt-2 font-bold uppercase tracking-widest">
              Detects "Off-Book" production by tracking the total material pool vs total output.
            </p>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer>
              <ComposedChart data={processedData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                <XAxis dataKey="month" stroke="#475569" fontSize={10} fontStyle="bold" />
                <YAxis stroke="#475569" fontSize={10} fontStyle="bold" />
                <Tooltip 
                  contentStyle={{backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px'}} 
                  itemStyle={{fontWeight: '900'}}
                />
<Area 
  name="Theoretical Pool" 
  dataKey="cumulativeInput"  /* MUST MATCH processedData return */
  fill="#10b981" 
  stroke="#10b981" 
  fillOpacity={0.1} 
/>
<Line 
  name="Actual Exports" 
  dataKey="cumulativeOutput" /* MUST MATCH processedData return */
  stroke="#ef4444" 
  strokeWidth={4} 
/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* BENFORD'S LAW */}
          <div className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
            <h3 className="text-slate-800 font-black text-[11px] uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
              <BarChart3 size={16} className="text-blue-600" /> Benford's Law (Integrity Audit)
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer>
              <BarChart data={benfordAnalysis}>
  <XAxis dataKey="digit" /> 
  <Bar dataKey="actual" fill="#3b82f6" name="Actual %" />
  <Line type="step" dataKey="ideal" stroke="#94a3b8" name="Expected %" />
</BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PRICE-MASS SCATTER */}
          <div className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
            <h3 className="text-slate-800 font-black text-[11px] uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-600" /> Value-Mass Correlation
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer>
<ScatterChart>
  <XAxis type="number" dataKey="normTobacco" name="Tobacco KG" />
  <YAxis type="number" dataKey="priceIndex" name="Sticks per KG" />
  <Scatter name="Shipments" data={processedData} fill="#10b981" />
</ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

    </div> // Closes the main return div
  );
}; // Closes the ForensicMonitor function

export default ForensicMonitor; // Final export

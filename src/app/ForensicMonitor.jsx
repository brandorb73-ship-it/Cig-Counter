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
    const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== "");
    
    const formatted = lines.slice(1).map(row => {
      // Split by comma, but remove any quotes that Excel adds
      const cols = row.split(',').map(c => c.trim().replace(/^["']|["']$/g, ""));
      
      return {
        entity: cols[0],
        month: cols[1],
        year: cols[2],
        t_val: cols[3],    // Tobacco
        t_unit: cols[4],   // Unit
        tow_val: cols[6],  // Tow
        p_val: cols[9],    // Paper
        f_val: cols[12],   // Filter
        outflow: cols[15], // Outflow
      };
    // Change your filter to this:
}).filter(r => r.entity && r.entity.trim().length > 1 && r.month);

    setData(formatted);
  } catch (e) { console.error(e); }
};
  
// --- 1. THE DATA ENGINE ---
const processedData = useMemo(() => {
  const units = { 'kg': 1, 'ton': 1000, 'mt': 1000, 'lb': 0.4535 };
  const clean = (val) => {
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/[^\d.-]/g, ''));
    return isNaN(n) ? 0 : Math.abs(n);
  };

  // 1. Strict Filter (Stops the "62 Entities" bug)
  const validData = data.filter(d => d.entity && d.entity.trim().length > 2 && d.month);

  let inventoryPool = 0; 
  let exportTotal = 0;

  return validData.map((d, index) => {
    const eff = (100 - wastage) / 100;
    
    // Forensic Math
    const tKG = clean(d.t_val) * (units[String(d.t_unit).toLowerCase()] || 1);
    const monthlyCapacity = (tKG * eff) / 0.0007;
    const monthlyOutflow = clean(d.outflow);

    // Inventory Decay (Assumes 2% loss/degradation per month of unused leaf)
    inventoryPool = (inventoryPool * 0.98) + monthlyCapacity;
    exportTotal += monthlyOutflow;

    // Precursor Divergence Index (Comparing Paper vs Tobacco if available)
    const pCap = clean(d.p_val) * 12 * eff; 
    const pdi = pCap > 0 ? ((monthlyCapacity - pCap) / monthlyCapacity) : 0;

    return {
      ...d,
      // FIX: Forced string for X-Axis to stop "formulas"
      xAxisLabel: `${String(d.month).substring(0,3)} ${String(d.year).slice(-2)}`,
      tobaccoKG: Math.round(tKG),
      outflow: Math.round(monthlyOutflow),
      capacity: Math.round(monthlyCapacity),
      cumulativeCapacity: Math.round(inventoryPool),
      cumulativeOutflow: Math.round(exportTotal),
      pdi: pdi.toFixed(2),
      // Virtual Stamp Gap: If exports exceed current raw material stock
      stampGap: Math.max(0, exportTotal - inventoryPool),
      firstDigit: parseInt(String(monthlyOutflow)[0]) || 0
    };
  });
}, [data, wastage]);

// --- KPI MATH (Rounded & Non-Negative) ---
const totalOutflow = Math.round(processedData.reduce((acc, curr) => acc + curr.outflow, 0));
const totalGhostVolume = Math.round(processedData.reduce((acc, curr) => {
  // Gap is only "Ghost" if exports > capacity
  const gap = curr.cumulativeOutput - curr.cumulativeInput;
  return acc + Math.max(0, gap);
}, 0));
const activeEntities = new Set(processedData.map(d => d.entity)).size;
  
     // --- BENFORD'S LAW CALCULATION ---
  const benfordAnalysis = useMemo(() => {
    if (processedData.length === 0) return [];
    
    const counts = Array(9).fill(0);
    // We only look at rows where the outflow is greater than 0
    const validRows = processedData.filter(d => d.firstDigit > 0);
    
    validRows.forEach(d => {
      counts[d.firstDigit - 1]++;
    });

    const idealDistribution = [30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6];
    
    return counts.map((count, i) => ({
      digit: (i + 1).toString(),
      actual: validRows.length > 0 ? parseFloat(((count / validRows.length) * 100).toFixed(1)) : 0,
      ideal: idealDistribution[i]
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
<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
    {/* 1. Wastage Slider (Keep as is) */}
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

    {/* 2. UPDATED: Ghost Volume (Now uses totalGhostVolume) */}
    <div className="bg-white border-2 border-slate-100 p-6 rounded-[2rem] flex justify-between items-center shadow-sm">
        <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Ghost Volume</p>
            <p className="text-2xl font-black text-red-600 mt-1">
                {Math.round(totalGhostVolume).toLocaleString()}
            </p>
        </div>
        <ShieldAlert className="text-red-500" size={32} />
    </div>

    {/* 3. NEW: Total Exports (Gives context to the Ghost Volume) */}
    <div className="bg-white border-2 border-slate-100 p-6 rounded-[2rem] flex justify-between items-center shadow-sm">
        <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Exports</p>
            <p className="text-2xl font-black text-black mt-1">
                {Math.round(totalOutflow).toLocaleString()}
            </p>
        </div>
        <BarChart3 className="text-slate-400" size={32} />
    </div>

    {/* 4. Active Entities (Keep as is) */}
    <div className="bg-white border-2 border-slate-100 p-6 rounded-[2rem] flex justify-between items-center shadow-sm">
        <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Entities</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">
                {new Set(processedData.map(d => d.entity)).size}
            </p>
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
            <ResponsiveContainer width="100%" height={400}>
  <ComposedChart 
    data={processedData} 
    margin={{ top: 20, right: 30, left: 40, bottom: 60 }} // Adds space so numbers aren't cut
  >
    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
{/* Smoking Gun Axis */}
<XAxis 
  dataKey="xAxisLabel" 
  type="category" 
  stroke="#94a3b8" 
  fontSize={10} 
  tick={{fill: '#94a3b8'}}
/>
<YAxis 
  stroke="#94a3b8" 
  fontSize={10} 
  tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v.toLocaleString()} 
/>

{/* Scatter Plot Axis (Fixes long numbers) */}
<Area dataKey="cumulativeInput" fill="#10b981" fillOpacity={0.2} stroke="#10b981" />
<Line dataKey="cumulativeOutput" stroke="#ef4444" strokeWidth={3} dot={true} />
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
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={benfordAnalysis}>
    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
    <XAxis dataKey="digit" stroke="#94a3b8" />
    <YAxis stroke="#94a3b8" unit="%" />
    <Tooltip />
    <Bar dataKey="actual" fill="#3b82f6" name="Reported %" radius={[4, 4, 0, 0]} />
    <Line type="step" dataKey="ideal" stroke="#94a3b8" name="Expected %" strokeDasharray="5 5" />
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
              <ResponsiveContainer width="100%" height={300}>
<ScatterChart margin={{ left: 40, bottom: 20 }}>
  <XAxis 
  type="number" 
  dataKey="tobaccoKG" 
  tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
/>
  <YAxis type="number" dataKey="outflow" name="Sticks" stroke="#94a3b8" />
  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
  <Scatter name="Shipments" data={processedData} fill="#3b82f6" />
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

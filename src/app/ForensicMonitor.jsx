"use client"; // REQUIRED FOR NEXT.JS

import React, { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { ShieldAlert, Globe, Activity, Zap, Link, Calculator } from 'lucide-react';

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
    if (!sheetUrl) return;
    setLoading(true);
    try {
      // Automatically convert standard Google Sheet URL to CSV export link
      let csvUrl = sheetUrl.includes('/edit') 
        ? sheetUrl.replace(/\/edit.*$/, '/export?format=csv') 
        : sheetUrl;
        
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error("Network response was not ok");
      const text = await response.text();
      
      const rows = text.split('\n').slice(1);
      const formatted = rows.map(row => {
        const cols = row.split(',');
        return {
          entity: cols[0]?.trim(),
          month: cols[1]?.trim(),
          tobaccoVal: parseFloat(cols[2]) || 0,
          tobaccoUnit: cols[3]?.toLowerCase().trim() || 'kg',
          towVal: parseFloat(cols[4]) || 0,
          towUnit: cols[5]?.toLowerCase().trim() || 'kg',
          rodVal: parseFloat(cols[6]) || 0,
          paperVal: parseFloat(cols[7]) || 0,
          outflow: parseFloat(cols[8]) || 0,
          origin: cols[9]?.trim() || 'Unknown',
          dest: cols[10]?.trim() || 'Unknown'
        };
      }).filter(r => r.entity);
      
      setData(formatted);
    } catch (e) {
      console.error(e);
      alert("SYNC ERROR: Ensure the Google Sheet is 'Published to the Web' as a CSV.");
    } finally {
      setLoading(false);
    }
  };

  const processedData = useMemo(() => {
    const wasteFactor = (100 - wastage) / 100;
    return data.map(item => {
      const capTobacco = (item.tobaccoVal * wasteFactor) / yieldConstants.tobacco;
      const capTow = (item.towVal * wasteFactor) * yieldConstants.tow;
      
      // The ceiling is the lower of the two critical precursors
      const theoreticalMax = Math.min(capTobacco, capTow);
      const gap = item.outflow > theoreticalMax ? item.outflow - theoreticalMax : 0;
      
      return { ...item, theoreticalMax, gap };
    });
  }, [data, wastage]);

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

      {/* TREND ANALYSIS CHART */}
      <div className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
        <h3 className="text-[11px] font-black uppercase tracking-[0.3em] mb-8 text-slate-800 flex items-center gap-2">
          <Zap size={14} className="text-emerald-500" /> Mass-Balance Bottleneck Trend
        </h3>
        <div className="h-[350px] w-full">
          <ResponsiveContainer>
            <AreaChart data={processedData}>
              <defs>
                <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} fontStyle="bold" axisLine={false} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: '900'}} 
              />
              <Area 
                name="Production Ceiling" type="monotone" dataKey="theoreticalMax" 
                stroke="#10b981" strokeWidth={3} fill="url(#colorMax)" 
              />
              <Area 
                name="Actual Exports" type="monotone" dataKey="outflow" 
                stroke="#ef4444" strokeWidth={2} fill="#fee2e2" fillOpacity={0.2} strokeDasharray="5 5" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ForensicMonitor; // THIS LINE IS CRITICAL

"use client";
import React, { useState } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Factory, Zap, Globe, Info, Scale, List, LayoutDashboard, RefreshCcw, Trash2, XCircle } from 'lucide-react';

const CONVERSIONS = {
  'Tobacco': 1333.33,
  'Acetate tow': 8333.33,
  'Cigarette paper': 20000,
  'Filter rods': 6,
  'UNITS': {
    'MIL': 1000, 'KGM': 1000, 'KG': 1000, 'KILOGRAMS': 1000,
    'BOX/BAG/PACK': 20, 'PIECE': 1, 'ШТ': 1, 'CASE': 10000,
  }
};

export default function ProfessionalMonitor() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');

  const processData = (raw) => {
    const registry = {};
    let countryTotals = { tobaccoKg: 0, towKg: 0, paperKg: 0, totalExported: 0 };

    raw.forEach(row => {
      const entity = row.Importer || row.Exporter;
      if (!entity) return;

      if (!registry[entity]) {
        registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, actual: 0 };
      }

      const mat = row.Material;
      const qty = parseFloat(row.Quantity) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = CONVERSIONS.UNITS[unit] || 1;

      if (mat === 'Cigarettes') {
        const sticks = qty * factor;
        registry[entity].actual += sticks;
        countryTotals.totalExported += sticks;
      } else if (mat === 'Tobacco') {
        registry[entity].tobacco += qty * CONVERSIONS['Tobacco'];
        countryTotals.tobaccoKg += qty;
      } else if (mat === 'Acetate tow') {
        registry[entity].tow += qty * CONVERSIONS['Acetate tow'];
        countryTotals.towKg += qty;
      } else if (mat === 'Cigarette paper') {
        registry[entity].paper += qty * CONVERSIONS['Cigarette paper'];
        countryTotals.paperKg += qty;
      }
    });

    const entities = Object.values(registry).map(e => {
      const potential = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const bottleneck = potential.length > 0 ? Math.min(...potential) : 0;
      const riskRatio = bottleneck > 0 ? (e.actual / bottleneck) : 0;
      return { ...e, bottleneck, riskRatio };
    }).sort((a, b) => b.bottleneck - a.bottleneck);

    const countryPotential = Math.min(
      countryTotals.tobaccoKg * CONVERSIONS['Tobacco'],
      countryTotals.towKg > 0 ? countryTotals.towKg * CONVERSIONS['Acetate tow'] : Infinity,
      countryTotals.paperKg > 0 ? countryTotals.paperKg * CONVERSIONS['Cigarette paper'] : Infinity
    );

    return { entities, countryTotals, countryPotential };
  };

 const sync = () => {
    if (!url) return alert("Please paste a URL first");
    
    setLoading(true);
    setData(null); // Wipes the screen entirely

    // Force Google to treat this as a unique, non-cached request
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    const uniqueId = Math.random().toString(36).substring(7);
    const csvUrl = `${baseUrl}&cachebust=${uniqueId}`; 
    
    Papa.parse(csvUrl, {
      download: true, 
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        console.log("New Data Received:", res.data[0]); // Check your browser console!
        if (res.data && res.data.length > 0) {
          setData(processData(res.data));
        } else {
          alert("Sheet appears empty.");
        }
        setLoading(false);
      },
      error: () => {
        setLoading(false);
        alert("Fetch failed. Is the sheet public?");
      }
    });
  };
  const handleReset = () => {
    setData(null);
    setUrl('');
    // Manually clear the input field
    const input = document.getElementById('url-input');
    if (input) input.value = '';
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-8 font-sans">
      <div className="max-w-7xl mx-auto mb-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-2xl">
          <div className="flex items-center gap-3">
             <div className="bg-blue-600 p-2 rounded-lg">
                <Factory className="text-white" size={24} />
             </div>
             <div>
                <h1 className="text-xl font-black text-white tracking-tight">AUDIT ENGINE v3.2</h1>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Precursor Monitoring System</p>
             </div>
          </div>

          <div className="flex flex-1 max-w-2xl gap-2 w-full">
            <input 
              id="url-input"
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm flex-1 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-blue-100" 
              placeholder="Paste Google Sheet Public Link..." 
              onChange={(e) => setUrl(e.target.value)} 
            />
            <button 
                onClick={sync} 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition active:scale-95 shadow-lg shadow-blue-900/20"
            >
              {loading ? <RefreshCcw className="animate-spin" size={18} /> : <Zap size={18} />}
              {loading ? "AUDITING..." : "RUN AUDIT"}
            </button>
            
            {/* VERY CLEAR RESET BUTTON */}
            <button 
                onClick={handleReset}
                className="bg-slate-700 hover:bg-red-900/40 hover:text-red-400 px-4 py-3 rounded-xl font-bold transition flex items-center gap-2 border border-slate-600"
            >
              <Trash2 size={18} />
              <span className="hidden md:inline">CLEAR</span>
            </button>
          </div>
        </div>
      </div>

      {!data && !loading && (
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-20 text-center opacity-40">
            <Globe size={80} className="mb-6 text-slate-700" />
            <h2 className="text-2xl font-bold italic text-slate-600">Waiting for Data Source...</h2>
            <p className="max-w-sm mt-2 text-slate-500">Paste your Google Sheet link above to begin the country-level precursor analysis.</p>
        </div>
      )}

      {loading && (
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-center py-20">
            <RefreshCcw size={40} className="animate-spin text-blue-500 mb-4" />
            <p className="text-blue-400 font-mono animate-pulse">EXTRACTING PRECURSOR BALANCES...</p>
        </div>
      )}

      {data && (
        <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* TABS HEADER */}
          <div className="flex gap-2 mb-8 bg-slate-900/50 p-1.5 rounded-xl w-fit border border-slate-800">
            <button 
                onClick={() => setActiveTab('country')} 
                className={`px-6 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'country' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <LayoutDashboard size={16} /> Country View
            </button>
            <button 
                onClick={() => setActiveTab('entities')} 
                className={`px-6 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${activeTab === 'entities' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <List size={16} /> Entity Rankings
            </button>
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-2">Tobacco Import Volume</p>
                  <p className="text-3xl font-mono text-blue-400 font-bold">{data.countryTotals.tobaccoKg.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-600 mt-1 uppercase">Kilograms (KGM)</p>
                </div>
                <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-2">Max Stick Potential</p>
                  <p className="text-3xl font-mono text-white font-bold">{Math.round(data.countryPotential).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-600 mt-1 uppercase">Based on Bottleneck</p>
                </div>
                <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-2">Total Exported Volume</p>
                  <p className="text-3xl font-mono text-emerald-400 font-bold">{Math.round(data.countryTotals.totalExported).toLocaleString()}</p>
                  <p className="text-[10px] text-slate-600 mt-1 uppercase">Finished Sticks</p>
                </div>
                <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 shadow-xl">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-2">National Balance</p>
                  <p className={`text-3xl font-mono font-bold ${data.countryPotential - data.countryTotals.totalExported < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                    {Math.round(data.countryPotential - data.countryTotals.totalExported).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1 uppercase">Difference</p>
                </div>
              </div>

              <div className="bg-blue-900/10 border border-blue-500/20 p-8 rounded-3xl relative overflow-hidden">
                <div className="relative z-10">
                    <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2"><Info className="text-blue-500" /> Auditor's Summary</h3>
                    <p className="text-slate-300 leading-relaxed text-lg mb-6 max-w-4xl">
                       In this dataset, the country's imported precursors allow for a maximum production of <strong>{Math.round(data.countryPotential).toLocaleString()}</strong> sticks. 
                       Recorded exports totaled <strong>{Math.round(data.countryTotals.totalExported).toLocaleString()}</strong> sticks.
                    </p>
                    <div className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900/80 rounded-2xl border border-slate-700 font-bold text-sm italic">
                       {data.countryPotential - data.countryTotals.totalExported < 0 
                         ? <><XCircle className="text-red-500" /> <span className="text-red-400 tracking-wide">ILLICIT SOURCE WARNING: EXPORTS EXCEED RAW MATERIAL CAPACITY</span></>
                         : <><Info className="text-emerald-500" /> <span className="text-emerald-400 tracking-wide">VALIDATION PASSED: EXPORTS WITHIN PRECURSOR LIMITS</span></>}
                    </div>
                </div>
                <Globe size={200} className="absolute -right-20 -bottom-20 text-blue-500/5 rotate-12" />
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/40 rounded-3xl border border-slate-700 overflow-hidden shadow-2xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900/80 text-slate-500 uppercase text-[10px] tracking-widest font-black">
                  <tr>
                    <th className="px-8 py-5">Entity Name</th>
                    <th className="px-8 py-5 text-center">Risk Profile</th>
                    <th className="px-8 py-5 text-right">Potential (Sticks)</th>
                    <th className="px-8 py-5 text-right">Actual Exports</th>
                    <th className="px-8 py-5 text-right">Surplus/Gap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {data.entities.map((row, i) => (
                    <tr key={i} className="hover:bg-blue-500/5 transition-colors group">
                      <td className="px-8 py-5 font-bold text-slate-200 group-hover:text-blue-400">{row.name}</td>
                      <td className="px-8 py-5 text-center">
                        <span className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-tighter ${row.riskRatio > 1.1 ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                          {row.riskRatio > 1.1 ? 'CRITICAL RISK' : 'LOW RISK'}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right font-mono text-slate-400">{Math.round(row.bottleneck).toLocaleString()}</td>
                      <td className="px-8 py-5 text-right font-mono text-emerald-400 font-bold">{Math.round(row.actual).toLocaleString()}</td>
                      <td className={`px-8 py-5 text-right font-mono font-bold ${row.bottleneck - row.actual < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                        {Math.round(row.bottleneck - row.actual).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

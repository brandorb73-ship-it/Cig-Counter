"use client";
import React, { useState } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Factory, Zap, Globe, Info, Scale, List, LayoutDashboard, RefreshCcw, Trash2 } from 'lucide-react';

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
    setData(null); // Step 1: Clear old data immediately

    // Step 2: Convert to CSV URL and add a timestamp to prevent browser caching
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    const cacheBuster = `&t=${new Date().getTime()}`;
    const csvUrl = baseUrl + cacheBuster;
    
    Papa.parse(csvUrl, {
      download: true, 
      header: true,
      skipEmptyLines: true, // Handle messy sheets
      complete: (res) => {
        if (res.data && res.data.length > 0) {
          setData(processData(res.data));
        } else {
          alert("Sheet appears empty or incorrectly formatted.");
        }
        setLoading(false);
      },
      error: (err) => {
        alert("Error fetching sheet. Ensure 'Anyone with the link' can view.");
        setLoading(false);
      }
    });
  };

  const clearData = () => {
    setData(null);
    setUrl('');
    const input = document.getElementById('urlInput');
    if (input) input.value = '';
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-8 font-sans transition-all">
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Factory className="text-blue-500" /> MONITOR v3.1
        </h1>
        <div className="flex gap-2 w-full md:w-auto">
          <input 
            id="urlInput"
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm flex-1 md:w-80 outline-none focus:border-blue-500" 
            placeholder="Paste NEW Google Sheet URL..." 
            onChange={(e) => setUrl(e.target.value)} 
          />
          <button onClick={sync} className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition disabled:opacity-50" disabled={loading}>
            {loading ? <RefreshCcw className="animate-spin" size={16} /> : <Zap size={16} />} 
            {loading ? "Processing..." : "Run Audit"}
          </button>
          {data && (
            <button onClick={clearData} className="p-2 text-slate-500 hover:text-red-400 transition" title="Clear All">
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      {data && (
        <div className="max-w-7xl mx-auto animate-in fade-in zoom-in duration-300">
          <div className="flex gap-4 border-b border-slate-700 mb-8">
            <button onClick={() => setActiveTab('country')} className={`pb-4 px-2 flex items-center gap-2 text-sm font-bold transition ${activeTab === 'country' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>
              <LayoutDashboard size={18} /> Country Overview
            </button>
            <button onClick={() => setActiveTab('entities')} className={`pb-4 px-2 flex items-center gap-2 text-sm font-bold transition ${activeTab === 'entities' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>
              <List size={18} /> Entity Rankings
            </button>
          </div>

          {activeTab === 'country' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/60 p-6 rounded-xl border border-slate-700 shadow-lg">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Tobacco Imports</p>
                  <p className="text-2xl font-mono text-blue-400">{data.countryTotals.tobaccoKg.toLocaleString()} <span className="text-sm italic text-slate-500">kg</span></p>
                </div>
                <div className="bg-slate-800/60 p-6 rounded-xl border border-slate-700 shadow-lg">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">National Potential</p>
                  <p className="text-2xl font-mono">{Math.round(data.countryPotential).toLocaleString()}</p>
                </div>
                <div className="bg-slate-800/60 p-6 rounded-xl border border-slate-700 shadow-lg">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Actual Exports</p>
                  <p className="text-2xl font-mono text-emerald-400">{Math.round(data.countryTotals.totalExported).toLocaleString()}</p>
                </div>
                <div className="bg-slate-800/60 p-6 rounded-xl border border-slate-700 shadow-lg">
                  <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Surplus/Deficit</p>
                  <p className={`text-2xl font-mono ${data.countryPotential - data.countryTotals.totalExported < 0 ? 'text-red-500' : 'text-slate-300'}`}>
                    {Math.round(data.countryPotential - data.countryTotals.totalExported).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-blue-900/10 border border-blue-500/20 p-8 rounded-2xl">
                <h3 className="text-lg font-bold text-blue-400 mb-4 flex items-center gap-2"><Info size={20}/> Forensic Conclusion</h3>
                <p className="text-slate-300 leading-relaxed mb-4">
                   Based on the <strong>current sheet data</strong>: The country imported enough raw material for <strong>{Math.round(data.countryPotential).toLocaleString()}</strong> sticks. 
                   Official records show <strong>{Math.round(data.countryTotals.totalExported).toLocaleString()}</strong> sticks left the country.
                </p>
                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 text-sm italic font-medium">
                   {data.countryPotential - data.countryTotals.totalExported < 0 
                     ? "⚠️ ALERT: Export volumes exceed precursor capacity. Potential illicit sourcing detected." 
                     : "✅ VALID: Export volumes are consistent with reported imports."}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'entities' && (
            <div className="bg-slate-800/40 rounded-2xl border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/50 text-slate-400 uppercase text-[10px] tracking-widest">
                    <tr>
                      <th className="px-6 py-4">Entity Name</th>
                      <th className="px-6 py-4 text-center">Risk</th>
                      <th className="px-6 py-4 text-right">Potential (Sticks)</th>
                      <th className="px-6 py-4 text-right">Actual (Sticks)</th>
                      <th className="px-6 py-4 text-right">Gap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {data.entities.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-700/20 transition group">
                        <td className="px-6 py-4 font-semibold text-slate-100 group-hover:text-blue-400">{row.name}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${row.riskRatio > 1.1 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                            {row.riskRatio > 1.1 ? 'HIGH' : 'LOW'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono">{Math.round(row.bottleneck).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-emerald-400">{Math.round(row.actual).toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-400">{Math.round(row.bottleneck - row.actual).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

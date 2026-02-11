"use client";
import React, { useState } from 'react';
import Papa from 'papaparse';
import { Factory, Zap, Database, Wind, FileText, Pipette, Trash2, Scale, List, LayoutDashboard, Info, Hash } from 'lucide-react';

const CONVERSIONS = {
  'Tobacco': 1333.33,
  'Acetate tow': 8333.33,
  'Cigarette paper': 20000,
  'Filter rods': 6,
  'UNITS': {
    'MIL': 1000, 'KGM': 1, 'KG': 1, 'KILOGRAMS': 1,
    'TON': 1000, 'TONNE': 1000, 'MT': 1000, // Added bulk weight support
    'BOX/BAG/PACK': 20, 'PIECE': 1, 'ШТ': 1, 'CASE': 10000,
  }
};

const Icons = {
  'Tobacco': <Database className="text-amber-500" size={14} />,
  'Acetate tow': <Wind className="text-sky-400" size={14} />,
  'Cigarette paper': <FileText className="text-slate-300" size={14} />,
  'Filter rods': <Pipette className="text-purple-400" size={14} />,
  'Cigarettes': <Zap className="text-emerald-400" size={14} />
};

export default function ForensicMonitorV4() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');

  const processData = (raw) => {
    const registry = {};
    let national = { tobacco: { kg: 0, sticks: 0 }, tow: { kg: 0, sticks: 0 }, paper: { kg: 0, sticks: 0 }, rods: { units: 0, sticks: 0 }, exported: 0 };

    raw.forEach(row => {
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;

      if (!registry[entity]) {
        registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {}, txCount: 0 };
      }

      const mat = row.Material;
      const qty = parseFloat(String(row.Quantity).replace(/,/g, '')) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const unitFactor = CONVERSIONS.UNITS[unit] || 1;
      
      const convertedQty = qty * unitFactor;
      registry[entity].txCount += 1;

      if (mat === 'Cigarettes') {
        const sticks = qty * (unit === 'MIL' ? 1000000 : unitFactor);
        registry[entity].actual += sticks;
        national.exported += sticks;
      } else if (CONVERSIONS[mat]) {
        const sticks = convertedQty * CONVERSIONS[mat];
        
        // Track per-material breakdown for the entity
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { weight: 0, sticks: 0 };
        registry[entity].materials[mat].weight += convertedQty;
        registry[entity].materials[mat].sticks += sticks;

        // Track National totals
        if (mat === 'Tobacco') { national.tobacco.kg += convertedQty; national.tobacco.sticks += sticks; }
        else if (mat === 'Acetate tow') { national.tow.kg += convertedQty; national.tow.sticks += sticks; }
        else if (mat === 'Cigarette paper') { national.paper.kg += convertedQty; national.paper.sticks += sticks; }
        else if (mat === 'Filter rods') { national.rods.units += convertedQty; national.rods.sticks += sticks; }
      }
    });

    const entities = Object.values(registry).map(e => {
      const potential = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const bottleneck = potential.length > 0 ? Math.min(...potential) : 0;
      return { ...e, bottleneck, risk: e.actual > (bottleneck * 1.05) && bottleneck > 0 };
    }).sort((a, b) => b.bottleneck - a.bottleneck);

    return { entities, national };
  };

  const sync = () => {
    if (!url) return;
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}&t=${Date.now()}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setData(processData(res.data)); setLoading(false); }
    });
  };

  return (
    <div className="min-h-screen bg-[#050810] text-slate-300 font-sans p-4 md:p-8">
      {/* Search Bar */}
      <div className="max-w-7xl mx-auto mb-8 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center">
        <div className="flex items-center gap-2 mr-auto">
          <Scale className="text-blue-500" size={24}/>
          <h1 className="font-black text-white tracking-tighter text-xl">FORENSIC MONITOR <span className="text-blue-500 text-xs">v4.1</span></h1>
        </div>
        <input className="bg-black/50 border border-slate-700 rounded-xl px-4 py-2 text-sm w-full md:w-96 focus:ring-2 focus:ring-blue-600 outline-none" placeholder="Paste Tab URL (gid=...)" onChange={e => setUrl(e.target.value)} />
        <button onClick={sync} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-2 rounded-xl transition shadow-lg shadow-blue-900/20 uppercase text-xs tracking-widest">Run Audit</button>
        <button onClick={() => setData(null)} className="text-slate-600 hover:text-red-500 transition"><Trash2 size={20}/></button>
      </div>

      {data && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex gap-4 border-b border-slate-800 text-sm font-bold">
            <button onClick={() => setActiveTab('country')} className={`pb-4 px-2 flex items-center gap-2 ${activeTab === 'country' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}><LayoutDashboard size={16}/> Country Overview</button>
            <button onClick={() => setActiveTab('entities')} className={`pb-4 px-2 flex items-center gap-2 ${activeTab === 'entities' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}><List size={16}/> Entity Audit</button>
          </div>

          {activeTab === 'entities' && (
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <table className="w-full text-left text-[11px] md:text-xs border-collapse">
                <thead className="bg-black/40 text-slate-500 uppercase tracking-widest font-black">
                  <tr>
                    <th className="p-4 border-b border-slate-800">Entity Name</th>
                    <th className="p-4 border-b border-slate-800 text-center"><Hash size={14} className="inline mr-1"/>Tx</th>
                    <th className="p-4 border-b border-slate-800">Material Breakdown (Weight in KG)</th>
                    <th className="p-4 border-b border-slate-800 text-right">Potential Sticks</th>
                    <th className="p-4 border-b border-slate-800 text-right">Actual Exports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-blue-500/5 transition-all group">
                      <td className="p-4 font-bold text-slate-200 group-hover:text-blue-400">{e.name}</td>
                      <td className="p-4 text-center text-slate-500 font-mono">{e.txCount}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(e.materials).map(([mat, stats]) => (
                            <div key={mat} className="group relative bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-1 flex items-center gap-2 cursor-help">
                              {Icons[mat]}
                              <span className="font-mono font-bold text-slate-300">{Math.round(stats.weight).toLocaleString()} <span className="text-[9px] text-slate-500 uppercase">KG</span></span>
                              {/* HOVER TOOLTIP */}
                              <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-950 border border-blue-500/50 p-3 rounded-xl shadow-2xl z-50 min-w-[200px]">
                                <p className="text-blue-400 font-bold mb-1 underline decoration-blue-500/30">{mat} Math:</p>
                                <div className="space-y-1 font-mono text-[10px]">
                                  <p>Declared Weight: {stats.weight.toLocaleString()} KG</p>
                                  <p>Ratio: {CONVERSIONS[mat]} sticks/kg</p>
                                  <div className="border-t border-slate-800 mt-1 pt-1 text-white">
                                    Result: {Math.round(stats.sticks).toLocaleString()} sticks
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono text-slate-400">{Math.round(e.bottleneck).toLocaleString()}</td>
                      <td className={`p-4 text-right font-mono font-bold ${e.risk ? 'text-red-500' : 'text-emerald-500'}`}>{Math.round(e.actual).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'country' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {['Tobacco', 'Acetate tow', 'Cigarette paper', 'Filter rods'].map(m => {
                const key = m === 'Filter rods' ? 'rods' : m.split(' ')[m.split(' ').length-1].toLowerCase();
                const stats = data.national[key];
                return (
                  <div key={m} className="bg-slate-900/50 border border-slate-800 p-6 rounded-3xl shadow-xl">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{m}</span>
                      {Icons[m]}
                    </div>
                    <div className="space-y-1">
                       <p className="text-2xl font-mono font-bold text-white">{Math.round(stats.kg || stats.units).toLocaleString()}</p>
                       <p className="text-[9px] text-slate-500 uppercase">Total Net Weight (KG)</p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-slate-800">
                       <p className="text-lg font-mono text-blue-500">{Math.round(stats.sticks).toLocaleString()}</p>
                       <p className="text-[9px] text-slate-500 uppercase tracking-tighter">Stick Potential</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";
import React, { useState } from 'react';
import Papa from 'papaparse';
import { Factory, Zap, Database, Wind, FileText, Pipette, Trash2, Scale, List, LayoutDashboard, Hash, Calculator } from 'lucide-react';

const CONVERSIONS = {
  'Tobacco': 1333.33,
  'Acetate tow': 8333.33,
  'Cigarette paper': 20000,
  'Filter rods': 6,
  'UNITS': {
    'MIL': 1000, 'KGM': 1, 'KG': 1, 'KILOGRAMS': 1,
    'TON': 1000, 'TONNE': 1000, 'MT': 1000,
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
        registry[entity] = { name: entity, totalPrecursorSticks: 0, actual: 0, materials: {}, txCount: 0 };
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
        
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { weight: 0, sticks: 0, unit, rawQty: 0 };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      } else if (CONVERSIONS[mat]) {
        const sticks = convertedQty * CONVERSIONS[mat];
        registry[entity].totalPrecursorSticks += sticks;

        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { weight: 0, sticks: 0, unit, rawQty: 0 };
        registry[entity].materials[mat].weight += convertedQty;
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;

        if (mat === 'Tobacco') { national.tobacco.kg += convertedQty; national.tobacco.sticks += sticks; }
        else if (mat === 'Acetate tow') { national.tow.kg += convertedQty; national.tow.sticks += sticks; }
        else if (mat === 'Cigarette paper') { national.paper.kg += convertedQty; national.paper.sticks += sticks; }
        else if (mat === 'Filter rods') { national.rods.units += convertedQty; national.rods.sticks += sticks; }
      }
    });

    const entities = Object.values(registry).map(e => {
      // Bottleneck logic for risk calculation
      const potentialArray = [
        e.materials['Tobacco']?.sticks, 
        e.materials['Acetate tow']?.sticks, 
        e.materials['Cigarette paper']?.sticks
      ].filter(v => v > 0);
      const bottleneck = potentialArray.length > 0 ? Math.min(...potentialArray) : 0;
      
      return { ...e, bottleneck, risk: e.actual > (bottleneck * 1.05) && bottleneck > 0 };
    }).sort((a, b) => b.totalPrecursorSticks - a.totalPrecursorSticks);

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
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center">
        <div className="flex items-center gap-2 mr-auto">
          <Scale className="text-blue-500" size={24}/>
          <h1 className="font-black text-white tracking-tighter text-xl">FORENSIC MONITOR <span className="text-blue-500 text-xs">v4.2</span></h1>
        </div>
        <input className="bg-black/50 border border-slate-700 rounded-xl px-4 py-2 text-sm w-full md:w-96 outline-none" placeholder="Paste Tab URL (gid=...)" onChange={e => setUrl(e.target.value)} />
        <button onClick={sync} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-2 rounded-xl transition uppercase text-xs">Run Audit</button>
        <button onClick={() => setData(null)} className="text-slate-600 hover:text-red-500"><Trash2 size={20}/></button>
      </div>

      {data && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex gap-4 border-b border-slate-800 text-sm font-bold">
            <button onClick={() => setActiveTab('country')} className={`pb-4 px-2 ${activeTab === 'country' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>Country Overview</button>
            <button onClick={() => setActiveTab('entities')} className={`pb-4 px-2 ${activeTab === 'entities' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>Entity Audit</button>
          </div>

          {activeTab === 'entities' && (
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <table className="w-full text-left text-[11px] md:text-xs">
                <thead className="bg-black/40 text-slate-500 uppercase tracking-widest font-black">
                  <tr>
                    <th className="p-4">Entity</th>
                    <th className="p-4 text-center">Tx</th>
                    <th className="p-4">Material Logs</th>
                    <th className="p-4 text-right bg-blue-900/10 text-blue-400">Total Precursor Sticks</th>
                    <th className="p-4 text-right">Actual Exports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-blue-500/5 transition-all group">
                      <td className="p-4 font-bold text-slate-200">{e.name}</td>
                      <td className="p-4 text-center text-slate-500 font-mono">{e.txCount}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(e.materials).map(([mat, stats]) => (
                            <div key={mat} className="group relative bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-1 flex items-center gap-2 cursor-help">
                              {Icons[mat]}
                              <span className="font-mono font-bold">{Math.round(stats.rawQty).toLocaleString()} <span className="text-[8px] text-slate-500 uppercase">{stats.unit}</span></span>
                              {/* HOVER TOOLTIP */}
                              <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-950 border border-blue-500/50 p-3 rounded-xl shadow-2xl z-50 min-w-[200px]">
                                <p className="text-blue-400 font-bold mb-1 underline decoration-blue-500/30">{mat} Math:</p>
                                <div className="space-y-1 font-mono text-[10px]">
                                  <p>Raw Input: {stats.rawQty.toLocaleString()} {stats.unit}</p>
                                  {mat !== 'Cigarettes' && <p>KG Multiplier: {CONVERSIONS.UNITS[stats.unit] || 1}</p>}
                                  <p>Stick Ratio: {mat === 'Cigarettes' ? '1:1 (Direct)' : `${CONVERSIONS[mat]} sticks/kg`}</p>
                                  <div className="border-t border-slate-800 mt-1 pt-1 text-white">
                                    Stick Equiv: {Math.round(stats.sticks).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono text-blue-400 font-bold bg-blue-900/5">
                        {Math.round(e.totalPrecursorSticks).toLocaleString()}
                      </td>
                      <td className={`p-4 text-right font-mono font-bold ${e.risk ? 'text-red-500' : 'text-emerald-500'}`}>
                        {Math.round(e.actual).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'country' && (
             <div className="bg-blue-900/10 border border-blue-500/20 p-8 rounded-3xl">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Calculator className="text-blue-500"/> National Manufacturing Capacity</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                   <SummaryCard label="Tobacco Potential" val={data.national.tobacco.sticks} />
                   <SummaryCard label="Tow Potential" val={data.national.tow.sticks} />
                   <SummaryCard label="Paper Potential" val={data.national.paper.sticks} />
                   <SummaryCard label="Actual Exports" val={data.national.exported} color="text-emerald-400" />
                </div>
                <div className="p-4 bg-black/40 rounded-xl border border-slate-700">
                   <p className="text-sm">Summary: The country has enough Tobacco for <span className="text-white font-bold">{Math.round(data.national.tobacco.sticks).toLocaleString()}</span> sticks. However, based on all precursor inputs, the actual output was <span className="text-emerald-400 font-bold">{Math.round(data.national.exported).toLocaleString()}</span> sticks.</p>
                </div>
             </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, val, color = "text-white" }) {
    return (
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] uppercase font-black text-slate-500 mb-1">{label}</p>
            <p className={`text-xl font-mono font-bold ${color}`}>{Math.round(val).toLocaleString()}</p>
        </div>
    );
}

"use client";
import React, { useState } from 'react';
import Papa from 'papaparse';
import { Factory, Zap, Globe, Info, Scale, List, LayoutDashboard, Trash2, Database, Wind, FileText, Pipette } from 'lucide-react';

const CONVERSIONS = {
  'Tobacco': 1333.33,
  'Acetate tow': 8333.33,
  'Cigarette paper': 20000,
  'Filter rods': 6,
  'UNITS': {
    'MIL': 1000, 'KGM': 1, 'KG': 1, 'KILOGRAMS': 1,
    'BOX/BAG/PACK': 20, 'PIECE': 1, 'ШТ': 1, 'CASE': 10000,
  }
};

const Icons = {
  'Tobacco': <Database className="text-amber-500" size={16} />,
  'Acetate tow': <Wind className="text-sky-400" size={16} />,
  'Cigarette paper': <FileText className="text-slate-300" size={16} />,
  'Filter rods': <Pipette className="text-purple-400" size={16} />,
  'Cigarettes': <Zap className="text-emerald-400" size={16} />
};

export default function ForensicMonitor() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');

  const processData = (raw) => {
    const registry = {};
    let national = {
      tobacco: { kg: 0, sticks: 0 },
      tow: { kg: 0, sticks: 0 },
      paper: { kg: 0, sticks: 0 },
      rods: { units: 0, sticks: 0 },
      exported: 0
    };

    raw.forEach(row => {
      // Support for flexible headers: Entity, Importer, OR Exporter
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;

      if (!registry[entity]) {
        registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, raw_weights: {} };
      }

      const mat = row.Material;
      const qty = parseFloat(row.Quantity) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const unitFactor = CONVERSIONS.UNITS[unit] || 1;
      
      const rawQty = qty * unitFactor;
      registry[entity].raw_weights[mat] = (registry[entity].raw_weights[mat] || 0) + rawQty;

      if (mat === 'Cigarettes') {
        const sticks = qty * (unit === 'MIL' ? 1000000 : unitFactor);
        registry[entity].actual += sticks;
        national.exported += sticks;
      } else if (CONVERSIONS[mat]) {
        const sticks = rawQty * CONVERSIONS[mat];
        if (mat === 'Tobacco') { 
          registry[entity].tobacco += sticks; 
          national.tobacco.kg += rawQty; 
          national.tobacco.sticks += sticks; 
        }
        else if (mat === 'Acetate tow') { 
          registry[entity].tow += sticks; 
          national.tow.kg += rawQty; 
          national.tow.sticks += sticks; 
        }
        else if (mat === 'Cigarette paper') { 
          registry[entity].paper += sticks; 
          national.paper.kg += rawQty; 
          national.paper.sticks += sticks; 
        }
        else if (mat === 'Filter rods') { 
          registry[entity].rods += sticks; 
          national.rods.units += rawQty; 
          national.rods.sticks += sticks; 
        }
      }
    });

    const entities = Object.values(registry).map(e => {
      const potential = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const bottleneck = potential.length > 0 ? Math.min(...potential) : 0;
      return { ...e, bottleneck, risk: e.actual > bottleneck * 1.1 && bottleneck > 0 };
    }).sort((a, b) => b.bottleneck - a.bottleneck);

    const countryPotential = Math.min(
      national.tobacco.sticks || Infinity,
      national.tow.sticks || Infinity,
      national.paper.sticks || Infinity
    );

    return { entities, national, countryPotential: countryPotential === Infinity ? 0 : countryPotential };
  };

  const sync = () => {
    if (!url) return;
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    const csvUrl = `${baseUrl}&gid=${gid}&t=${new Date().getTime()}`;

    Papa.parse(csvUrl, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => {
        setData(processData(res.data));
        setLoading(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-300 p-6">
      {/* Search Header */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-10 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><Scale className="text-blue-500"/> AUDIT PRO</h1>
        <div className="flex gap-2">
          <input className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-sm w-96" placeholder="Paste Tab URL..." onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-600 px-6 py-2 rounded-lg font-bold text-white">SYNC</button>
          <button onClick={() => setData(null)} className="p-2 text-slate-500 hover:text-red-500"><Trash2 size={20}/></button>
        </div>
      </div>

      {data && (
        <div className="max-w-7xl mx-auto">
          {/* Tabs */}
          <div className="flex gap-6 mb-8 border-b border-slate-800">
            <button onClick={() => setActiveTab('country')} className={`pb-4 text-sm font-bold ${activeTab === 'country' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}>COUNTRY BALANCE</button>
            <button onClick={() => setActiveTab('entities')} className={`pb-4 text-sm font-bold ${activeTab === 'entities' ? 'border-b-2 border-blue-500 text-blue-500' : ''}`}>ENTITY ANALYSIS</button>
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard title="Tobacco" kg={data.national.tobacco.kg} sticks={data.national.tobacco.sticks} icon={Icons.Tobacco} />
                <StatCard title="Acetate Tow" kg={data.national.tow.kg} sticks={data.national.tow.sticks} icon={Icons.Tow} />
                <StatCard title="Cig. Paper" kg={data.national.paper.kg} sticks={data.national.paper.sticks} icon={Icons.Paper} />
                <StatCard title="Filter Rods" kg={data.national.rods.units} sticks={data.national.rods.sticks} icon={Icons.Rods} label="Units" />
              </div>
              <div className="bg-blue-600/10 border border-blue-500/20 p-6 rounded-2xl">
                <h2 className="text-blue-400 font-bold flex items-center gap-2 mb-2"><Globe size={18}/> National Summary</h2>
                <p className="text-slate-400 text-sm italic">
                  Bottleneck Potential: <span className="text-white font-mono">{Math.round(data.countryPotential).toLocaleString()} sticks</span> | 
                  Actual Exports: <span className="text-emerald-400 font-mono">{Math.round(data.national.exported).toLocaleString()} sticks</span>
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-500 uppercase tracking-tighter">
                  <tr>
                    <th className="p-4">Entity</th>
                    <th className="p-4">Materials Found</th>
                    <th className="p-4 text-right">Potential (Bottleneck)</th>
                    <th className="p-4 text-right">Actual Exports</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-800/30">
                      <td className="p-4 font-bold text-slate-200">{e.name}</td>
                      <td className="p-4 flex gap-3">
                        {Object.entries(e.raw_weights).map(([mat, weight]) => (
                          <div key={mat} className="group relative flex items-center gap-1 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                            {Icons[mat]}
                            <span>{Math.round(weight).toLocaleString()}</span>
                            <div className="hidden group-hover:block absolute bottom-full left-0 bg-black text-[10px] p-2 rounded mb-1 whitespace-nowrap z-50">
                              {mat} Conversion: {weight.toLocaleString()} × {CONVERSIONS[mat]} = {Math.round(weight * CONVERSIONS[mat]).toLocaleString()} sticks
                            </div>
                          </div>
                        ))}
                      </td>
                      <td className="p-4 text-right font-mono">{Math.round(e.bottleneck).toLocaleString()}</td>
                      <td className={`p-4 text-right font-mono ${e.risk ? 'text-red-500' : 'text-emerald-500'}`}>{Math.round(e.actual).toLocaleString()}</td>
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

function StatCard({ title, kg, sticks, icon, label = "Kg" }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
      <div className="flex justify-between items-start mb-3">
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{title}</p>
        {icon}
      </div>
      <p className="text-xl font-mono text-white leading-none">{Math.round(kg).toLocaleString()} <span className="text-[10px] text-slate-500 uppercase">{label}</span></p>
      <div className="mt-4 pt-4 border-t border-slate-800/50">
        <p className="text-[9px] text-slate-500 mb-1">EQUIVALENT STICKS</p>
        <p className="text-sm font-mono text-blue-400">{Math.round(sticks).toLocaleString()}</p>
      </div>
    </div>
  );
}

"use client";
import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Scale, List, LayoutDashboard, TrendingUp, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33,
  'TOW': 8333.33,
  'PAPER': 20000,
  'RODS': 6,
  'UNITS': {
    'MIL': 1000, 'KGM': 1, 'KG': 1, 'KILOGRAMS': 1,
    'TON': 1000, 'TONNE': 1000, 'MT': 1000,
    'BOX/BAG/PACK': 20, 'PIECE': 1, 'ШТ': 1, 'CASE': 10000,
  }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-500" size={14} />,
  'TOW': <Wind className="text-sky-400" size={14} />,
  'PAPER': <FileText className="text-slate-300" size={14} />,
  'RODS': <Pipette className="text-purple-400" size={14} />,
  'CIGARETTES': <Activity className="text-emerald-400" size={14} />
};

export default function ForensicIntelligenceV5() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');

  const processData = (raw) => {
    const registry = {};
    let nat = { tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0 };

    raw.forEach(row => {
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;

      if (!registry[entity]) {
        registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {}, tx: 0 };
      }

      const matRaw = (row.Material || '').toUpperCase();
      const mat = matRaw.includes('TOBACCO') ? 'TOBACCO' : 
                  matRaw.includes('TOW') ? 'TOW' : 
                  matRaw.includes('PAPER') ? 'PAPER' : 
                  matRaw.includes('ROD') ? 'RODS' : 
                  matRaw.includes('CIGARETTE') && !matRaw.includes('PAPER') ? 'CIGARETTES' : null;

      const qty = parseFloat(String(row.Quantity).replace(/,/g, '')) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const unitFactor = CONVERSIONS.UNITS[unit] || 1;
      const convQty = qty * unitFactor;

      registry[entity].tx += 1;

      if (mat === 'CIGARETTES') {
        const sticks = qty * (unit === 'MIL' ? 1000000 : unitFactor);
        registry[entity].actual += sticks;
        nat.actual += sticks;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        const key = mat.toLowerCase();
        registry[entity][key] += sticks;
        nat[key] += sticks;

        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { weight: 0, sticks: 0, unit };
        registry[entity].materials[mat].weight += convQty;
        registry[entity].materials[mat].sticks += sticks;
      }
    });

    const entities = Object.values(registry).map(e => {
      const potential = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPotential = potential.length > 0 ? Math.min(...potential) : 0;
      const totalPrecursor = e.tobacco + e.tow + e.paper + e.rods;
      const ratio = minPotential > 0 ? (e.actual / minPotential) : (e.actual > 0 ? 999 : 0);
      
      return { 
        ...e, 
        minPotential, 
        totalPrecursor,
        riskScore: ratio > 1.2 ? 'CRITICAL' : ratio > 1.05 ? 'HIGH' : 'LOW',
        gap: e.actual - minPotential
      };
    }).sort((a, b) => b.actual - a.actual);

    return { entities, nat };
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

  const chartData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Tobacco', sticks: data.nat.tobacco, color: '#f59e0b' },
      { name: 'Acetate Tow', sticks: data.nat.tow, color: '#38bdf8' },
      { name: 'Cig. Paper', sticks: data.nat.paper, color: '#94a3b8' },
      { name: 'Actual Exports', sticks: data.nat.actual, color: '#10b981' }
    ];
  }, [data]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans p-4 lg:p-10">
      {/* Search Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 mb-12 bg-slate-900/50 p-6 rounded-3xl border border-slate-800 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
            <ShieldAlert className="text-white" size={28}/>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">FORENSIC MONITOR <span className="text-blue-500 text-sm">v5.0</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Illicit Production & Precursor Audit</p>
          </div>
        </div>
        <div className="flex w-full md:w-auto gap-3">
          <input className="bg-black/40 border border-slate-700 rounded-xl px-5 py-3 text-sm w-full md:w-96 focus:ring-2 focus:ring-blue-600 outline-none transition-all" placeholder="Paste Tab URL (gid=...)" onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-xl font-black text-white text-xs tracking-widest transition-transform active:scale-95">SYNC</button>
          <button onClick={() => setData(null)} className="p-3 bg-slate-800 hover:bg-red-900/30 rounded-xl transition-colors"><Trash2 size={20}/></button>
        </div>
      </div>

      {data && (
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="flex gap-8 border-b border-slate-800 text-xs font-black tracking-widest uppercase">
            <button onClick={() => setActiveTab('country')} className={`pb-4 transition-all ${activeTab === 'country' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>Country Intelligence</button>
            <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-all ${activeTab === 'entities' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>Target Analysis</button>
          </div>

          {activeTab === 'country' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* National Discrepancy Graph */}
              <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800 p-8 rounded-3xl">
                <h2 className="text-lg font-bold text-white mb-8 flex items-center gap-2"><TrendingUp size={20} className="text-blue-500"/> Volume Comparison (Sticks)</h2>
                <div className="h-80 w-full">
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${(value / 1e9).toFixed(1)}B`} />
                      <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px'}} />
                      <Bar dataKey="sticks" radius={[6, 6, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Forensic Narrative */}
              <div className="bg-blue-600/5 border border-blue-500/20 p-8 rounded-3xl relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-xl font-bold text-blue-400 mb-6">Auditor Conclusion</h2>
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 p-2 bg-blue-500/20 rounded-lg"><AlertTriangle className="text-blue-400" size={18}/></div>
                      <p className="text-sm leading-relaxed">
                        Total reported exports are <span className="text-white font-bold">{(data.nat.actual / data.nat.tobacco).toFixed(1)}x higher</span> than the volume supportable by reported tobacco imports.
                      </p>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="mt-1 p-2 bg-emerald-500/20 rounded-lg"><CheckCircle className="text-emerald-400" size={18}/></div>
                      <p className="text-sm leading-relaxed text-slate-400">
                        {data.nat.tow > 0 ? "Acetate Tow data detected and processed." : "CRITICAL: No Acetate Tow detected. Finished filters may be sourced illicitly."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-10 p-4 bg-slate-900/80 border border-slate-700 rounded-xl">
                    <p className="text-[10px] text-slate-500 uppercase font-black mb-2">Primary Risk Indicator</p>
                    <p className="text-red-500 font-mono text-lg font-bold">
                      UNACCOUNTED: {Math.max(0, data.nat.actual - data.nat.tobacco).toLocaleString()} Sticks
                    </p>
                  </div>
                </div>
                <div className="absolute -right-10 -bottom-10 opacity-5 text-blue-500"><ShieldAlert size={200}/></div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/20 border border-slate-800 rounded-3xl overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-black/60 text-slate-500 uppercase font-black tracking-widest">
                  <tr>
                    <th className="p-5">Entity & Forensic Summary</th>
                    <th className="p-5">Material Inventory (KG)</th>
                    <th className="p-5 text-right">Potential (Cap)</th>
                    <th className="p-5 text-right">Actual Exports</th>
                    <th className="p-5 text-center">Risk Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition-colors group">
                      <td className="p-5 max-w-xs">
                        <div className="font-bold text-slate-100 mb-1">{e.name}</div>
                        <div className="text-[10px] text-slate-500 leading-tight">
                          {e.gap > 0 ? (
                            <span className="text-red-400/80 italic">Discrepancy: Production exceeds precursor inputs by {Math.round(e.gap).toLocaleString()} sticks. Possible illicit sourcing.</span>
                          ) : (
                            <span className="text-emerald-500/80 italic">Compliant: Production volume sits within legal precursor limits.</span>
                          )}
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="bg-slate-800/50 border border-slate-700 rounded-lg px-2 py-1 flex items-center gap-2">
                              {Icons[m]} <span className="font-mono">{Math.round(s.weight).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-5 text-right font-mono text-slate-500">{Math.round(e.minPotential).toLocaleString()}</td>
                      <td className="p-5 text-right font-mono text-white font-bold">{Math.round(e.actual).toLocaleString()}</td>
                      <td className="p-5 text-center">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black ${
                          e.riskScore === 'CRITICAL' ? 'bg-red-500/20 text-red-500 border border-red-500/40' : 
                          e.riskScore === 'HIGH' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40' : 
                          'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
                        }`}>
                          {e.riskScore}
                        </span>
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

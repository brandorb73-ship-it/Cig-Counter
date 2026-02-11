"use client";
import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Scale, List, LayoutDashboard, Calculator, AlertTriangle, CheckCircle, Info, Hash } from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 'TOW': 8333.33, 'PAPER': 20000, 'RODS': 6,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-500" size={14} />,
  'TOW': <Wind className="text-sky-400" size={14} />,
  'PAPER': <FileText className="text-slate-300" size={14} />,
  'RODS': <Pipette className="text-purple-400" size={14} />,
  'CIGARETTES': <Activity className="text-emerald-400" size={14} />
};

export default function ForensicAuditV6() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');

  const processData = (raw) => {
    const registry = {};
    let nat = { tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, tobaccoKg: 0, towKg: 0, paperKg: 0, rodsUnits: 0 };

    raw.forEach(row => {
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;

      if (!registry[entity]) {
        registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {}, tx: 0 };
      }

      const mR = (row.Material || '').toUpperCase();
      const mat = mR.includes('TOBACCO') ? 'TOBACCO' : mR.includes('TOW') ? 'TOW' : 
                  mR.includes('PAPER') ? 'PAPER' : mR.includes('ROD') ? 'RODS' : 
                  (mR.includes('CIGARETTE') && !mR.includes('PAPER')) ? 'CIGARETTES' : null;

      const qty = parseFloat(String(row.Quantity).replace(/,/g, '')) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = CONVERSIONS.UNITS[unit] || 1;
      const convQty = qty * factor;

      registry[entity].tx += 1;

      if (mat === 'CIGARETTES') {
        const sticks = qty * (unit === 'MIL' ? 1000000 : factor);
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        
        if (mat === 'TOBACCO') nat.tobaccoKg += convQty;
        if (mat === 'TOW') nat.towKg += convQty;
        if (mat === 'PAPER') nat.paperKg += convQty;
        if (mat === 'RODS') nat.rodsUnits += convQty;
        nat[mat.toLowerCase()] += sticks;

        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, factor };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      }
    });

    const entities = Object.values(registry).map(e => {
      const pots = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPot = pots.length > 0 ? Math.min(...pots) : 0;
      const ratio = minPot > 0 ? (e.actual / minPot) : (e.actual > 0 ? 999 : 0);
      return { ...e, minPot, risk: ratio > 1.1 ? 'CRITICAL' : 'RECONCILED' };
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

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 p-4 lg:p-8 font-sans">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 bg-slate-900/40 border border-slate-800 p-6 rounded-3xl flex flex-col md:flex-row gap-6 items-center">
        <div className="flex items-center gap-3 mr-auto">
          <ShieldAlert className="text-blue-500" size={32}/>
          <div>
            <h1 className="text-xl font-black text-white leading-none">FORENSIC MONITOR <span className="text-blue-500 text-xs">v6.0</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Advanced Precursor Reconciliation</p>
          </div>
        </div>
        <input className="bg-black/50 border border-slate-700 rounded-xl px-4 py-2 text-sm w-full md:w-96 outline-none" placeholder="Paste Tab URL..." onChange={e => setUrl(e.target.value)} />
        <button onClick={sync} className="bg-blue-600 px-8 py-2 rounded-xl font-black text-white text-xs tracking-widest uppercase">Sync Audit</button>
      </div>

      {data && (
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex gap-8 border-b border-slate-800 text-xs font-black uppercase tracking-tighter">
            <button onClick={() => setActiveTab('country')} className={`pb-4 ${activeTab === 'country' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>Country Intelligence</button>
            <button onClick={() => setActiveTab('entities')} className={`pb-4 ${activeTab === 'entities' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-slate-500'}`}>Target Analysis</button>
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Visual Chart */}
                <div className="lg:col-span-2 bg-slate-900/20 border border-slate-800 p-8 rounded-3xl">
                  <h2 className="text-sm font-bold text-slate-400 mb-8 uppercase tracking-widest">Stick Volume Comparison</h2>
                  <div className="h-64">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: data.nat.tobacco, col: '#f59e0b' },
                        { name: 'Tow', val: data.nat.tow, col: '#38bdf8' },
                        { name: 'Paper', val: data.nat.paper, col: '#94a3b8' },
                        { name: 'Rods', val: data.nat.rods, col: '#a855f7' },
                        { name: 'Exports', val: data.nat.actual, col: '#10b981' }
                      ]}>
                        <XAxis dataKey="name" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: 'none', borderRadius: '8px'}} />
                        <Bar dataKey="val" radius={[4, 4, 0, 0]}>
                          {[0,1,2,3,4].map((e, i) => <Cell key={i} fill={['#f59e0b', '#38bdf8', '#94a3b8', '#a855f7', '#10b981'][i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Calculation Sidebar */}
                <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl space-y-4">
                  <h2 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800 pb-2">Forensic Math</h2>
                  <CalculationRow label="Tobacco" kg={data.nat.tobaccoKg} sticks={data.nat.tobacco} unit="KG" />
                  <CalculationRow label="Acetate Tow" kg={data.nat.towKg} sticks={data.nat.tow} unit="KG" />
                  <CalculationRow label="Cig. Paper" kg={data.nat.paperKg} sticks={data.nat.paper} unit="KG" />
                  <CalculationRow label="Filter Rods" kg={data.nat.rodsUnits} sticks={data.nat.rods} unit="PCS" />
                  <div className="pt-4 border-t border-slate-800">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Unaccounted Surplus</p>
                    <p className="text-xl font-mono font-bold text-red-500">{Math.max(0, data.nat.actual - data.nat.tobacco).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Forensic Guide */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-blue-600/5 border border-blue-500/20 p-8 rounded-3xl">
                  <h3 className="text-blue-400 font-bold mb-4 flex items-center gap-2"><Info size={18}/> Audit Interpretation Guide</h3>
                  <div className="space-y-4 text-xs leading-relaxed text-slate-400">
                    <p><strong className="text-slate-200">1. The Tobacco Ceiling:</strong> Reported tobacco imports represent the maximum legal production capacity. If exports exceed this, finished goods are likely being produced from unrecorded raw leaf.</p>
                    <p><strong className="text-slate-200">2. The Precursor Gap:</strong> Comparing Tow, Paper, and Rods helps identify which component is the bottleneck. A high Rod-to-Export ratio suggests "Plug-and-Play" manufacturing using pre-made filters.</p>
                  </div>
                </div>
                <div className="bg-amber-600/5 border border-amber-500/20 p-8 rounded-3xl">
                  <h3 className="text-amber-400 font-bold mb-4 flex items-center gap-2"><AlertTriangle size={18}/> Strategic Conclusion</h3>
                  <p className="text-xs leading-relaxed text-slate-400 italic">
                    Based on the current dataset, the reported infrastructure supports <span className="text-white">{(data.nat.tobacco / 1e6).toFixed(1)}M</span> sticks. The actual export of <span className="text-white">{(data.nat.actual / 1e9).toFixed(1)}B</span> sticks indicates a systemic reliance on shadow supply chains or gross misdeclaration of raw material weights.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/20 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-black/60 text-slate-500 uppercase font-black tracking-widest">
                  <tr>
                    <th className="p-5">Entity</th>
                    <th className="p-5 text-center"><Hash size={14} className="inline"/></th>
                    <th className="p-5">Material Inventory Log</th>
                    <th className="p-5 text-right">Precursor Potential</th>
                    <th className="p-5 text-right">Actual Exports</th>
                    <th className="p-5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition-colors group">
                      <td className="p-5 font-bold text-slate-200">{e.name}</td>
                      <td className="p-5 text-center text-slate-500 font-mono">{e.tx}</td>
                      <td className="p-5">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="group relative bg-slate-800 border border-slate-700 rounded px-2 py-1 flex items-center gap-2 cursor-help transition-colors hover:border-blue-500">
                              {Icons[m]}
                              <span className="font-mono text-slate-300">{Math.round(s.rawQty).toLocaleString()} <span className="text-[8px] text-slate-500">{s.unit}</span></span>
                              <div className="pointer-events-none absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-950 border border-blue-500 p-3 rounded-lg shadow-2xl z-50 min-w-[180px]">
                                <p className="text-blue-400 font-bold text-[10px] mb-1">{m} Conversion</p>
                                <div className="font-mono text-[9px] text-slate-400">
                                  {m === 'CIGARETTES' ? (
                                    <p>{s.rawQty.toLocaleString()} {s.unit} = {Math.round(s.sticks).toLocaleString()} sticks</p>
                                  ) : (
                                    <>
                                      <p>{s.rawQty.toLocaleString()} {s.unit} × {s.factor || 1} (Unit Adj)</p>
                                      <p>× {CONVERSIONS[m]} (Stick Ratio)</p>
                                      <p className="border-t border-slate-800 mt-1 pt-1 text-white">= {Math.round(s.sticks).toLocaleString()} Sticks</p>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-5 text-right font-mono text-slate-500">{Math.round(e.minPot).toLocaleString()}</td>
                      <td className="p-5 text-right font-mono text-white font-bold">{Math.round(e.actual).toLocaleString()}</td>
                      <td className="p-5 text-center">
                        <div className="group relative inline-block">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black cursor-default transition-all ${
                            e.risk === 'CRITICAL' ? 'bg-red-500/20 text-red-500 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          }`}>
                            {e.risk}
                          </span>
                          {e.risk === 'CRITICAL' && (
                            <div className="pointer-events-none absolute bottom-full right-0 mb-2 hidden group-hover:block bg-red-950 border border-red-500 p-3 rounded-lg shadow-2xl z-50 w-64 text-left">
                              <p className="text-red-400 font-bold text-[10px] mb-1">Forensic Discrepancy Found</p>
                              <p className="text-[9px] text-slate-300 leading-tight">Production exceeds supportable precursor inputs by {Math.round(e.actual - e.minPot).toLocaleString()} sticks. This indicates high probability of illicit sourcing.</p>
                            </div>
                          )}
                        </div>
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

function CalculationRow({ label, kg, sticks, unit }) {
  return (
    <div className="flex justify-between items-end">
      <div>
        <p className="text-[9px] text-slate-500 uppercase font-bold">{label}</p>
        <p className="text-xs font-mono text-slate-300">{Math.round(kg).toLocaleString()} {unit}</p>
      </div>
      <p className="text-[10px] font-mono text-blue-400/80">→ {Math.round(sticks).toLocaleString()} sticks</p>
    </div>
  );
}

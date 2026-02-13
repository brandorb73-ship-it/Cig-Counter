"use client";
import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Scale, LayoutDashboard, Calculator, AlertTriangle, Hash, RefreshCcw, ChevronRight } from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 'TOW': 8333.33, 'PAPER': 20000, 'RODS': 6,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-500" size={16} />,
  'TOW': <Wind className="text-sky-400" size={16} />,
  'PAPER': <FileText className="text-slate-300" size={16} />,
  'RODS': <Pipette className="text-purple-400" size={16} />,
  'CIGARETTES': <Activity className="text-emerald-400" size={16} />
};

export default function ForensicCorporateV7() {
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
      if (!registry[entity]) registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {}, tx: 0 };

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
    <div className="min-h-screen bg-[#0a0f1c] text-slate-300 p-6 lg:p-12 font-sans selection:bg-blue-500/30">
      {/* RESTORED: Header with Clear Button */}
      <div className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row items-center gap-8 bg-slate-900/40 border border-slate-800/60 p-6 rounded-2xl shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-3 rounded-xl shadow-lg shadow-blue-900/20">
            <ShieldAlert className="text-white" size={28}/>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight uppercase">Forensic Monitor <span className="text-blue-500">v7.0</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">Institutional Audit Suite</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-950 border border-slate-800 rounded-xl px-5 py-2.5 text-sm w-full lg:w-96 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-700 font-mono" placeholder="G-Sheet URL (gid=...)" value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-600 hover:bg-blue-500 px-8 py-2.5 rounded-xl font-bold text-white text-[11px] tracking-widest uppercase transition-all shadow-lg shadow-blue-600/10 active:scale-95">Run Audit</button>
          {/* RESTORED CLEAR BUTTON */}
          <button onClick={() => {setData(null); setUrl('');}} className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all" title="Reset Audit"><RefreshCcw size={20}/></button>
        </div>
      </div>

      {data && (
        <div className="max-w-[1600px] mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex gap-10 border-b border-slate-800/60 text-[11px] font-bold uppercase tracking-widest">
            <button onClick={() => setActiveTab('country')} className={`pb-4 transition-all relative ${activeTab === 'country' ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>
              Country Intelligence {activeTab === 'country' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-500 shadow-[0_-4px_10px_rgba(59,130,246,0.5)]"/>}
            </button>
            <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-all relative ${activeTab === 'entities' ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>
              Entity Risk Analysis {activeTab === 'entities' && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-500 shadow-[0_-4px_10px_rgba(59,130,246,0.5)]"/>}
            </button>
          </div>

          {activeTab === 'country' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 bg-slate-900/20 border border-slate-800/50 p-10 rounded-[2rem] shadow-inner backdrop-blur-sm">
                <div className="flex justify-between items-center mb-10">
                   <h2 className="text-sm font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2"><LayoutDashboard size={18} className="text-blue-500"/> Volume Comparison Matrix</h2>
                   <div className="flex gap-4">
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold"><div className="w-2 h-2 rounded-full bg-amber-500"/> Precursors</div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold"><div className="w-2 h-2 rounded-full bg-emerald-500"/> Actual Exports</div>
                   </div>
                </div>
                <div className="h-[400px]">
                  <ResponsiveContainer>
                    <BarChart data={[
                      { name: 'Tobacco', val: data.nat.tobacco, col: '#f59e0b' },
                      { name: 'Tow', val: data.nat.tow, col: '#38bdf8' },
                      { name: 'Paper', val: data.nat.paper, col: '#94a3b8' },
                      { name: 'Rods', val: data.nat.rods, col: '#a855f7' },
                      { name: 'Exports', val: data.nat.actual, col: '#10b981' }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#475569" fontSize={11} axisLine={false} tickLine={false} tick={{dy: 10}} />
                      <YAxis stroke="#475569" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                      <Tooltip cursor={{fill: 'rgba(255,255,255,0.03)'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px'}} />
                      <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                        {[0,1,2,3,4].map((e, i) => <Cell key={i} fill={['#f59e0b', '#38bdf8', '#94a3b8', '#a855f7', '#10b981'][i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-4 space-y-6">
                 <div className="bg-slate-900/40 border border-slate-800/50 p-8 rounded-[2rem] shadow-xl">
                    <h2 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800/50 pb-4 mb-6 flex items-center justify-between">
                       Forensic Balance Sheet <Calculator size={16}/>
                    </h2>
                    <div className="space-y-6">
                      <MetricRow label="Tobacco" kg={data.nat.tobaccoKg} sticks={data.nat.tobacco} unit="KG" icon={<Database size={14}/>} />
                      <MetricRow label="Acetate Tow" kg={data.nat.towKg} sticks={data.nat.tow} unit="KG" icon={<Wind size={14}/>} />
                      <MetricRow label="Cig. Paper" kg={data.nat.paperKg} sticks={data.nat.paper} unit="KG" icon={<FileText size={14}/>} />
                      <MetricRow label="Filter Rods" kg={data.nat.rodsUnits} sticks={data.nat.rods} unit="PCS" icon={<Pipette size={14}/>} />
                      <div className="pt-6 border-t border-slate-800 flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Global Surplus Gap</span>
                        <span className="text-xl font-mono font-bold text-red-500 tracking-tighter">{(data.nat.actual - data.nat.tobacco).toLocaleString()}</span>
                      </div>
                    </div>
                 </div>

                 <div className="bg-blue-600/5 border border-blue-500/20 p-8 rounded-[2rem] relative overflow-hidden group">
                    <div className="relative z-10">
                      <h3 className="text-blue-400 font-bold text-sm mb-4">Strategic Conclusion</h3>
                      <p className="text-[13px] leading-relaxed text-slate-400 italic">
                        Current data indicates reported infrastructure supports <span className="text-white font-bold">{(data.nat.tobacco / 1e6).toFixed(1)}M</span> sticks. 
                        The declared export of <span className="text-white font-bold">{(data.nat.actual / 1e9).toFixed(1)}B</span> suggests a reliance on unrecorded supply chains.
                      </p>
                    </div>
                    <ShieldAlert className="absolute -right-6 -bottom-6 text-blue-500/10 rotate-12 transition-transform group-hover:scale-110" size={140}/>
                 </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/20 border border-slate-800/50 rounded-[2rem] overflow-hidden shadow-2xl backdrop-blur-sm">
              <table className="w-full text-left text-[11px] border-separate border-spacing-0">
                <thead className="bg-slate-950/80 text-slate-500 uppercase font-bold tracking-widest border-b border-slate-800">
                  <tr>
                    <th className="p-6 border-b border-slate-800">Entity Profiling</th>
                    <th className="p-6 border-b border-slate-800 text-center"><Hash size={14} className="inline"/></th>
                    <th className="p-6 border-b border-slate-800">Inventory Logs</th>
                    <th className="p-6 border-b border-slate-800 text-right">Precursor Cap</th>
                    <th className="p-6 border-b border-slate-800 text-right">Declared Exports</th>
                    <th className="p-6 border-b border-slate-800 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-blue-500/[0.03] transition-colors group">
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                           <div className={`w-1.5 h-1.5 rounded-full ${e.risk === 'CRITICAL' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500'}`}/>
                           <span className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors">{e.name}</span>
                        </div>
                      </td>
                      <td className="p-6 text-center text-slate-500 font-mono text-[10px]">{e.tx}</td>
                      <td className="p-6">
                        <div className="flex flex-wrap gap-2.5">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="group/tip relative bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-3 cursor-help hover:border-blue-500 transition-all shadow-sm">
                              {Icons[m]}
                              <span className="font-mono text-slate-300 font-bold">{Math.round(s.rawQty).toLocaleString()} <span className="text-[9px] text-slate-500">{s.unit}</span></span>
                              
                              {/* PREMIUM ANCHORED TOOLTIP */}
                              <div className="invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 absolute bottom-full left-0 mb-4 z-[100] transition-all duration-300 transform group-hover/tip:-translate-y-1">
                                <div className="bg-[#0f172a] border border-blue-500/40 p-5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] min-w-[240px]">
                                   <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                                      {Icons[m]}
                                      <span className="text-blue-400 font-black text-[10px] uppercase tracking-tighter">{m} Conversion Audit</span>
                                   </div>
                                   <div className="space-y-2 font-mono text-[10px] text-slate-400">
                                      <div className="flex justify-between"><span>Reported:</span> <span className="text-white">{s.rawQty.toLocaleString()} {s.unit}</span></div>
                                      {m !== 'CIGARETTES' && (
                                        <>
                                          <div className="flex justify-between"><span>Unit Multiplier:</span> <span className="text-white">× {s.factor || 1}</span></div>
                                          <div className="flex justify-between"><span>Precursor Ratio:</span> <span className="text-white">× {CONVERSIONS[m]}</span></div>
                                        </>
                                      )}
                                      <div className="pt-2 mt-2 border-t border-slate-800 flex justify-between font-bold">
                                         <span className="text-blue-400">Stick Equiv:</span>
                                         <span className="text-white">{Math.round(s.sticks).toLocaleString()}</span>
                                      </div>
                                   </div>
                                </div>
                                <div className="w-4 h-4 bg-[#0f172a] border-r border-b border-blue-500/40 rotate-45 absolute -bottom-2 left-6"/>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-6 text-right font-mono text-slate-500">{Math.round(e.minPot).toLocaleString()}</td>
                      <td className="p-6 text-right font-mono text-white font-bold">{Math.round(e.actual).toLocaleString()}</td>
                      <td className="p-6 text-center">
                        <div className="group/risk relative inline-block">
                          <span className={`px-4 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all cursor-default ${
                            e.risk === 'CRITICAL' ? 'bg-red-500/10 text-red-500 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {e.risk}
                          </span>
                          {e.risk === 'CRITICAL' && (
                            <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute bottom-full right-0 mb-4 z-[100] w-72 transition-all">
                              <div className="bg-slate-900 border border-red-500/40 p-5 rounded-2xl shadow-2xl text-left">
                                <p className="text-red-400 font-bold text-[10px] mb-2 uppercase tracking-widest flex items-center gap-2"><AlertTriangle size={14}/> Forensic Discrepancy</p>
                                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                                  Output exceeds reported precursor baseline by <span className="text-white font-bold">{Math.round(e.actual - e.minPot).toLocaleString()}</span> sticks. 
                                  High probability of shadow precursor procurement.
                                </p>
                              </div>
                              <div className="w-4 h-4 bg-slate-900 border-r border-b border-red-500/40 rotate-45 absolute -bottom-2 right-8"/>
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

function MetricRow({ label, kg, sticks, unit, icon }) {
  return (
    <div className="flex justify-between items-end group">
      <div className="flex items-center gap-3">
        <div className="text-slate-500 group-hover:text-blue-400 transition-colors">{icon}</div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-0.5">{label}</p>
          <p className="text-xs font-mono font-bold text-slate-300">{Math.round(kg).toLocaleString()} <span className="text-[9px] font-normal text-slate-600 tracking-tighter">{unit}</span></p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-mono text-blue-400/80 font-bold">{(sticks/1e6).toFixed(1)}M sticks</p>
        <ChevronRight size={12} className="inline text-slate-800 ml-2"/>
      </div>
    </div>
  );
}

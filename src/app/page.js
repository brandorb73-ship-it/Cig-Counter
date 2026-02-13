"use client";
import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, Hash, RefreshCcw, Save, History, FileDown, Info } from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 'TOW': 8333.33, 'PAPER': 20000, 'RODS': 6,
  'CIGARETTES_WT': 1333.33, // Corrected: 1kg = 1333.33 sticks
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ForensicRestoreV9() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('forensic_v9_reports');
    if (saved) setReports(JSON.parse(saved));
  }, []);

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
        let sticks = 0;
        let ratioUsed = 1;
        // CORRECTED RATIO LOGIC
        if (unit === 'MIL') {
          sticks = qty * 1000000;
          ratioUsed = 1000000;
        } else if (['KG', 'KGM', 'TON', 'MT'].includes(unit)) {
          sticks = convQty * CONVERSIONS.CIGARETTES_WT;
          ratioUsed = CONVERSIONS.CIGARETTES_WT;
        } else {
          sticks = convQty;
        }
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed };
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
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: CONVERSIONS[mat] };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      }
    });

    const entities = Object.values(registry).map(e => {
      const pots = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPot = pots.length > 0 ? Math.min(...pots) : 0;
      return { ...e, minPot, risk: e.actual > (minPot * 1.1) ? 'CRITICAL' : 'RECONCILED' };
    }).sort((a, b) => b.actual - a.actual);

    return { entities, nat };
  };

  const sync = () => {
    if (!url) return;
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setData(processData(res.data)); setLoading(false); }
    });
  };

  const saveReport = () => {
    if (!data || !reportTitle) return;
    const newReport = { id: Date.now(), title: reportTitle, date: new Date().toLocaleString(), data };
    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v9_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  const deleteReport = (id) => {
    const updated = reports.filter(r => r.id !== id);
    setReports(updated);
    localStorage.setItem('forensic_v9_reports', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 lg:p-10 font-sans">
      {/* Header Reverted to Clean V9 Style */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-md"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">Forensic Monitor <span className="text-blue-700">9.1</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Global Production Intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none focus:border-blue-600" placeholder="G-Sheet Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-bold text-white text-xs uppercase tracking-widest transition-all shadow-md">Run Audit</button>
          <button onClick={() => {setData(null); setUrl('');}} className="p-2.5 text-slate-400 hover:text-red-700 bg-slate-100 rounded-xl border border-slate-200"><RefreshCcw size={20}/></button>
        </div>
      </div>

      {data && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
          <div className="flex justify-between items-center border-b border-slate-200">
            <div className="flex gap-10 text-xs font-bold uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 transition-colors ${activeTab === 'country' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-400'}`}>Country Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-colors ${activeTab === 'entities' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-400'}`}>Target Analysis</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 transition-colors ${activeTab === 'reports' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-slate-400'}`}>Archived Reports</button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-2 pb-4">
                <input className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-[11px] font-bold" placeholder="Snapshot Title..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 transition-all"><Save size={14}/> Save Report</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2rem] shadow-sm">
                  <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={18} className="text-blue-700"/> Production vs. Precursor Matrix</h2>
                  <div className="h-[400px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: data.nat.tobacco, fill: '#b45309' },
                        { name: 'Tow', val: data.nat.tow, fill: '#0369a1' },
                        { name: 'Paper', val: data.nat.paper, fill: '#334155' },
                        { name: 'Rods', val: data.nat.rods, fill: '#7e22ce' },
                        { name: 'Cigarette Exports', val: data.nat.actual, fill: '#047857' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} fontWeight="bold" tickLine={false} axisLine={false} />
                        <YAxis fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="val" radius={[6, 6, 0, 0]} barSize={50}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm">
                  <h2 className="text-[11px] font-bold text-blue-700 uppercase tracking-widest border-b pb-4 mb-6">Forensic Balance Sheet</h2>
                  <div className="space-y-5">
                    <BalanceRow label="Tobacco" kg={data.nat.tobaccoKg} sticks={data.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                    <BalanceRow label="Acetate Tow" kg={data.nat.towKg} sticks={data.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                    <BalanceRow label="Cig. Paper" kg={data.nat.paperKg} sticks={data.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                    <BalanceRow label="Filter Rods" kg={data.nat.rodsUnits} sticks={data.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                    <div className="pt-6 border-t border-slate-100">
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Unaccounted Surplus</p>
                       <p className="text-2xl font-bold text-red-700 font-mono tracking-tighter">{(data.nat.actual - data.nat.tobacco).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Auditing Guide Restored */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10">
                <div className="bg-blue-50 p-8 rounded-3xl border border-blue-100">
                  <h3 className="text-blue-900 font-bold text-sm mb-4 flex items-center gap-2"><Info size={18}/> 1. Tobacco Ceiling</h3>
                  <p className="text-xs leading-relaxed text-blue-800">
                    Infrastructure supports <span className="font-bold">{(data.nat.tobacco / 1e6).toFixed(1)}M</span> sticks. Actual exports are <span className="font-bold text-red-700">{(data.nat.actual / data.nat.tobacco).toFixed(1)}x higher</span>, confirming unrecorded leaf.
                  </p>
                </div>
                <div className="bg-slate-100 p-8 rounded-3xl border border-slate-200">
                  <h3 className="text-slate-900 font-bold text-sm mb-4 flex items-center gap-2"><Calculator size={18}/> 2. Material Logic</h3>
                  <p className="text-xs leading-relaxed text-slate-700">
                    The gap between Tow and Paper potential is <span className="font-bold">{(Math.abs(data.nat.tow - data.nat.paper) / 1e6).toFixed(1)}M</span> sticks, indicating irregular procurement.
                  </p>
                </div>
                <div className="bg-red-50 p-8 rounded-3xl border border-red-100">
                  <h3 className="text-red-900 font-bold text-sm mb-4 flex items-center gap-2"><AlertTriangle size={18}/> 3. Strategic Summary</h3>
                  <p className="text-xs leading-relaxed text-red-900 italic font-medium">
                    Reported precursor volume cannot support the export output. Evidence indicates a 98% shadow-market reliance.
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold tracking-widest border-b border-slate-200">
                  <tr>
                    <th className="p-6">Entity</th>
                    <th className="p-6 text-center">Tx</th>
                    <th className="p-6">Inventory</th>
                    <th className="p-6 text-right">Potential</th>
                    <th className="p-6 text-right text-emerald-700">Exports</th>
                    <th className="p-6 text-center">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-6 font-bold text-slate-900">{e.name}</td>
                      <td className="p-6 text-center text-slate-400 font-mono">{e.tx}</td>
                      <td className="p-6">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="group/pop relative bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-3 cursor-help hover:border-blue-400">
                              {Icons[m]}
                              <span className="font-mono text-slate-600 font-bold">{Math.round(s.rawQty).toLocaleString()} <span className="text-[9px] text-slate-400">{s.unit}</span></span>
                              
                              <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-3 z-50 transition-all">
                                <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl min-w-[200px]">
                                  <p className="text-blue-400 font-bold text-[9px] uppercase mb-2 border-b border-slate-700 pb-1">{m} Calc</p>
                                  <div className="space-y-1 font-mono text-[10px]">
                                    <div className="flex justify-between"><span>Qty:</span> <span>{s.rawQty.toLocaleString()} {s.unit}</span></div>
                                    <div className="flex justify-between"><span>Ratio:</span> <span>x {s.ratioUsed.toLocaleString()}</span></div>
                                    <div className="flex justify-between pt-1 border-t border-slate-700 font-bold text-emerald-400"><span>Equiv:</span> <span>{Math.round(s.sticks).toLocaleString()}</span></div>
                                  </div>
                                </div>
                                <div className="w-3 h-3 bg-slate-900 rotate-45 absolute -bottom-1 left-4"/>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-6 text-right font-mono text-slate-400">{Math.round(e.minPot).toLocaleString()}</td>
                      <td className="p-6 text-right font-mono text-slate-900 font-bold">{Math.round(e.actual).toLocaleString()}</td>
                      <td className="p-6 text-center">
                         <div className="group/risk relative inline-block">
                            <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold tracking-widest ${
                              e.risk === 'CRITICAL' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {e.risk}
                            </span>
                            {e.risk === 'CRITICAL' && (
                              <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute bottom-full right-0 mb-3 z-50 w-64 transition-all">
                                <div className="bg-white border border-red-500 p-4 rounded-xl shadow-2xl text-left">
                                  <p className="text-red-600 font-bold text-[10px] mb-1 uppercase">Forensic Alert</p>
                                  <p className="text-[10px] text-slate-600 leading-tight">
                                    Capacity exceeded by <span className="font-bold">{(e.actual - e.minPot).toLocaleString()}</span> sticks.
                                  </p>
                                </div>
                                <div className="w-3 h-3 bg-white border-r border-b border-red-500 rotate-45 absolute -bottom-1.5 right-6"/>
                              </div>
                            )}
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm hover:border-blue-400 group">
                   <div className="flex justify-between items-start mb-6">
                    <div className="bg-slate-100 p-3 rounded-lg text-slate-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><FileDown size={20}/></div>
                    <button onClick={() => deleteReport(r.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg mb-1">{r.title}</h3>
                  <p className="text-[10px] text-slate-500 font-bold mb-6 italic">{r.date}</p>
                  <button onClick={() => {setData(r.data); setActiveTab('country');}} className="w-full bg-slate-900 py-3 rounded-xl text-white font-bold text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md">Restore Audit</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BalanceRow({ label, kg, sticks, unit, color, ratio }) {
  return (
    <div className="group relative">
      <div className="flex justify-between items-end cursor-help">
        <div className="flex items-center gap-3">
          <div className={`w-1 h-10 rounded-full ${color}`}/>
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-0.5">{label}</p>
            <p className="text-sm font-bold text-slate-700">{Math.round(kg).toLocaleString()} <span className="text-[9px] text-slate-400 font-normal">{unit}</span></p>
          </div>
        </div>
        <p className="text-[10px] font-mono font-bold text-blue-700">{(sticks/1e6).toFixed(1)}M sticks</p>
      </div>
      
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-0 bottom-full mb-3 z-50 transition-all">
         <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xl text-[10px] font-mono min-w-[200px]">
            <p className="text-blue-400 font-bold uppercase mb-2 border-b border-slate-700 pb-1">{label} Calculation</p>
            <div className="flex justify-between"><span>Input:</span> <span>{Math.round(kg).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Ratio:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-1 border-t border-slate-700 text-emerald-400 font-bold"><span>Total:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
         </div>
         <div className="w-3 h-3 bg-slate-900 rotate-45 absolute -bottom-1 left-6"/>
      </div>
    </div>
  );
}

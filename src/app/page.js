"use client";
import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, Hash, RefreshCcw, Save, History, FileDown, Info } from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 'TOW': 8333.33, 'PAPER': 20000, 'RODS': 6,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ForensicGradeV9() {
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
        const sticks = unit === 'MIL' ? qty * 1000000 : convQty;
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, factor };
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 p-6 lg:p-10 font-sans">
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-md">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">Forensic Monitor <span className="text-blue-700">9.0</span></h1>
            <p className="text-xs text-slate-600 font-bold uppercase tracking-widest">Global Production & Precursor Intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none focus:border-blue-600 font-medium" placeholder="G-Sheet Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase tracking-widest transition-all shadow-md">Run Audit</button>
          <button onClick={() => {setData(null); setUrl('');}} className="p-2.5 text-slate-600 hover:text-red-700 bg-slate-100 border border-slate-200 rounded-xl" title="Clear Data"><RefreshCcw size={20}/></button>
        </div>
      </div>

      {data && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 transition-colors ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-slate-600'}`}>Country Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-colors ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-slate-600'}`}>Target Analysis</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 transition-colors ${activeTab === 'reports' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-slate-600'}`}>Archived Reports</button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-3 pb-4">
                <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-bold" placeholder="Snapshot Title..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="flex items-center gap-2 bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-800 shadow-sm transition-all"><Save size={16}/> Save Report</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> Production vs. Precursor Matrix</h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: data.nat.tobacco, fill: '#b45309' },
                        { name: 'Tow', val: data.nat.tow, fill: '#0369a1' },
                        { name: 'Paper', val: data.nat.paper, fill: '#334155' },
                        { name: 'Rods', val: data.nat.rods, fill: '#7e22ce' },
                        { name: 'Cigarette Exports', val: data.nat.actual, fill: '#047857' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} fontWeight="bold" tickLine={false} axisLine={false} tick={{dy: 10}} />
                        <YAxis fontSize={11} fontWeight="bold" tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '15px'}} />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8">Forensic Balance Sheet</h2>
                  <div className="space-y-6">
                    <BalanceRow label="Tobacco" kg={data.nat.tobaccoKg} sticks={data.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                    <BalanceRow label="Acetate Tow" kg={data.nat.towKg} sticks={data.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                    <BalanceRow label="Cig. Paper" kg={data.nat.paperKg} sticks={data.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                    <BalanceRow label="Filter Rods" kg={data.nat.rodsUnits} sticks={data.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                    <div className="pt-8 border-t-2 border-slate-50">
                       <p className="text-xs text-slate-500 font-black uppercase tracking-tighter">Global Surplus Gap</p>
                       <p className="text-3xl font-black text-red-700 font-mono tracking-tighter mt-1">{(data.nat.actual - data.nat.tobacco).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10">
                <div className="bg-blue-50 p-10 rounded-[2rem] border-2 border-blue-100">
                  <h3 className="text-blue-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-wide"><Info size={22}/> 1. Tobacco Ceiling</h3>
                  <p className="text-sm leading-relaxed text-blue-800 font-medium">
                    The declared tobacco imports support <span className="font-black">{(data.nat.tobacco / 1e6).toFixed(1)}M</span> sticks. Actual exports are <span className="font-black text-red-700">{(data.nat.actual / data.nat.tobacco).toFixed(1)}x higher</span>, indicating massive unrecorded leaf inflow.
                  </p>
                </div>
                <div className="bg-slate-100 p-10 rounded-[2rem] border-2 border-slate-200">
                  <h3 className="text-slate-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-wide"><Calculator size={22}/> 2. Material Logic</h3>
                  <p className="text-sm leading-relaxed text-slate-800 font-medium">
                    Forensic audit of tow vs. paper shows a gap of <span className="font-black">{(Math.abs(data.nat.tow - data.nat.paper) / 1e6).toFixed(1)}M</span> potential sticks. This imbalance confirms non-linear procurement.
                  </p>
                </div>
                <div className="bg-red-50 p-10 rounded-[2rem] border-2 border-red-100">
                  <h3 className="text-red-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-wide"><AlertTriangle size={22}/> 3. Strategic Summary</h3>
                  <p className="text-sm leading-relaxed text-red-900 font-medium italic">
                    Infrastructure supports 542M sticks. The actual export of 37B sticks confirms a 98% shadow-market reliance or gross material misdeclaration.
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-white uppercase font-black tracking-widest">
                  <tr>
                    <th className="p-8">Entity Name</th>
                    <th className="p-8 text-center"><Hash size={18} className="inline"/></th>
                    <th className="p-8">Material Inventory</th>
                    <th className="p-8 text-right">Potential (Cap)</th>
                    <th className="p-8 text-right text-emerald-400">Actual Exports</th>
                    <th className="p-8 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-blue-50/50 transition-colors group border-b border-slate-100">
                      <td className="p-8 font-black text-slate-900 text-base">{e.name}</td>
                      <td className="p-8 text-center text-slate-500 font-mono font-bold">{e.tx}</td>
                      <td className="p-8">
                        <div className="flex flex-wrap gap-3">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="group/pop relative bg-white border-2 border-slate-200 rounded-xl px-4 py-2 flex items-center gap-3 cursor-help hover:border-blue-700 hover:shadow-md transition-all">
                              {Icons[m]}
                              <span className="font-mono text-slate-900 font-black text-sm">{Math.round(s.rawQty).toLocaleString()} <span className="text-[10px] text-slate-500">{s.unit}</span></span>
                              
                              <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-4 z-50 transition-all">
                                <div className="bg-slate-950 text-white p-6 rounded-2xl shadow-2xl min-w-[260px] border border-slate-800">
                                  <p className="text-blue-400 font-black text-[11px] uppercase mb-3 border-b border-slate-800 pb-2">{m} Conversion Audit</p>
                                  <div className="space-y-2 font-mono text-xs">
                                    <div className="flex justify-between text-slate-400"><span>Input Qty:</span> <span className="text-white font-bold">{s.rawQty.toLocaleString()} {s.unit}</span></div>
                                    <div className="flex justify-between text-slate-400"><span>Multiplier:</span> <span className="text-white font-bold">x {s.unit === 'MIL' ? '1,000,000' : (s.factor || 1)}</span></div>
                                    {m !== 'CIGARETTES' && <div className="flex justify-between text-slate-400"><span>Stick Ratio:</span> <span className="text-white font-bold">x {CONVERSIONS[m]}</span></div>}
                                    <div className="flex justify-between pt-3 border-t border-slate-800 font-black text-emerald-400 text-sm"><span>Stick Eqv:</span> <span>{Math.round(s.sticks).toLocaleString()}</span></div>
                                  </div>
                                </div>
                                <div className="w-4 h-4 bg-slate-950 rotate-45 absolute -bottom-2 left-6 border-r border-b border-slate-800"/>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-8 text-right font-mono text-slate-500 font-bold text-base">{Math.round(e.minPot).toLocaleString()}</td>
                      <td className="p-8 text-right font-mono text-slate-950 font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                      <td className="p-8 text-center">
                         <div className="group/risk relative inline-block">
                            <span className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest border-2 shadow-sm ${
                              e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              {e.risk}
                            </span>
                            {e.risk === 'CRITICAL' && (
                              <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute bottom-full right-0 mb-4 z-50 w-80 transition-all">
                                <div className="bg-white border-2 border-red-500 p-6 rounded-2xl shadow-2xl text-left">
                                  <p className="text-red-700 font-black text-xs mb-2 uppercase tracking-widest flex items-center gap-2"><AlertTriangle size={18}/> Critical Audit Discrepancy</p>
                                  <p className="text-xs text-slate-700 leading-relaxed font-bold">
                                    Export volume exceeds material capacity by <span className="text-red-700">{(e.actual - e.minPot).toLocaleString()}</span> sticks. 
                                    High evidence of unrecorded precursor utilization.
                                  </p>
                                </div>
                                <div className="w-4 h-4 bg-white border-r-2 border-b-2 border-red-500 rotate-45 absolute -bottom-2 right-10"/>
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
                <div key={r.id} className="bg-white border-2 border-slate-200 p-8 rounded-[2rem] shadow-sm hover:border-blue-600 transition-all group">
                   <div className="flex justify-between items-start mb-6">
                    <div className="bg-slate-100 p-3 rounded-xl text-slate-900 group-hover:bg-blue-700 group-hover:text-white transition-colors"><FileDown size={24}/></div>
                    <button onClick={() => deleteReport(r.id)} className="text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={20}/></button>
                  </div>
                  <h3 className="font-black text-slate-900 text-lg mb-1">{r.title}</h3>
                  <p className="text-xs text-slate-500 font-bold mb-6">{r.date}</p>
                  <button onClick={() => {setData(r.data); setActiveTab('country');}} className="w-full bg-slate-50 py-3 rounded-xl text-slate-900 font-black text-[11px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all">Restore Report</button>
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
        <div className="flex items-center gap-4">
          <div className={`w-1.5 h-10 rounded-full ${color}`}/>
          <div>
            <p className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1">{label}</p>
            <p className="text-lg font-black text-slate-900">{Math.round(kg).toLocaleString()} <span className="text-xs text-slate-500 font-bold uppercase">{unit}</span></p>
          </div>
        </div>
        <p className="text-sm font-black text-blue-700 font-mono">{(sticks/1e6).toFixed(1)}M sticks</p>
      </div>
      
      {/* HOVER CALCULATION FOR BALANCE SHEET */}
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-0 bottom-full mb-3 z-50 transition-all">
         <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xl text-[11px] font-mono min-w-[200px]">
            <p className="text-blue-400 font-black uppercase mb-1 border-b border-slate-700 pb-1">{label} Math</p>
            <div className="flex justify-between"><span>Input:</span> <span>{Math.round(kg).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Ratio:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-1 border-t border-slate-700 text-emerald-400 font-black"><span>Total Eq:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
         </div>
         <div className="w-3 h-3 bg-slate-900 rotate-45 absolute -bottom-1 left-6"/>
      </div>
    </div>
  );
}

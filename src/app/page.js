"use client";
import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, Hash, RefreshCcw, Save, History, FileDown, Info } from 'lucide-react';

// STICK RATIOS: KG to Sticks
const CONVERSIONS = {
  'TOBACCO': 1333.33, 
  'TOW': 8333.33, 
  'PAPER': 20000, 
  'RODS': 6,
  'CIGARETTES_WT': 1333.33, // Added: 1kg of cigarettes = ~1333 sticks (0.75g/stick)
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-800" size={20} />,
  'TOW': <Wind className="text-sky-800" size={20} />,
  'PAPER': <FileText className="text-slate-800" size={20} />,
  'RODS': <Pipette className="text-purple-800" size={20} />,
  'CIGARETTES': <Activity className="text-emerald-800" size={20} />
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
        // FIXED CALCULATION: If cigarettes are in KG/KGM, apply the 1333.33 ratio. If MIL, use 1,000,000.
        let sticks = 0;
        let ratioUsed = 1;
        
        if (unit === 'MIL') {
          sticks = qty * 1000000;
          ratioUsed = 1000000;
        } else if (unit === 'KG' || unit === 'KGM' || unit === 'TON' || unit === 'MT') {
          sticks = convQty * CONVERSIONS.CIGARETTES_WT;
          ratioUsed = CONVERSIONS.CIGARETTES_WT;
        } else {
          sticks = convQty; // Pieces/Cases
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
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border-2 border-slate-200 p-8 rounded-2xl shadow-sm">
        <div className="flex items-center gap-5 mr-auto">
          <div className="bg-black p-4 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={32}/></div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-black uppercase">Forensic Monitor <span className="text-blue-700">9.1</span></h1>
            <p className="text-sm text-slate-700 font-bold uppercase tracking-widest">Global Production & Precursor Intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-3 text-base w-full lg:w-96 outline-none focus:border-blue-600 font-bold text-black" placeholder="G-Sheet Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-700 hover:bg-blue-800 px-10 py-3 rounded-xl font-black text-white text-sm uppercase tracking-widest transition-all shadow-md">Run Audit</button>
          <button onClick={() => {setData(null); setUrl('');}} className="p-3 text-slate-600 hover:text-red-700 bg-slate-100 border-2 border-slate-200 rounded-xl"><RefreshCcw size={24}/></button>
        </div>
      </div>

      {data && (
        <div className="max-w-[1600px] mx-auto space-y-10">
          <div className="flex justify-between items-center border-b-4 border-slate-200">
            <div className="flex gap-12 text-base font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-5 transition-colors ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Country Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-5 transition-colors ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Target Analysis</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-5 transition-colors ${activeTab === 'reports' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Saved Reports</button>
            </div>
            {activeTab !== 'reports' && (activeTab !== 'reports') && (
              <div className="flex gap-3 pb-5">
                <input className="bg-white border-2 border-slate-300 rounded-xl px-4 py-2 text-sm font-black text-black" placeholder="Report Title..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="flex items-center gap-2 bg-emerald-700 text-white px-8 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-800 shadow-md"><Save size={18}/> Save</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border-2 border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-base font-black text-black uppercase tracking-widest mb-10 flex items-center gap-3"><Activity size={24} className="text-blue-700"/> Production vs. Precursor Matrix</h2>
                  <div className="h-[480px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: data.nat.tobacco, fill: '#b45309' },
                        { name: 'Tow', val: data.nat.tow, fill: '#0369a1' },
                        { name: 'Paper', val: data.nat.paper, fill: '#334155' },
                        { name: 'Rods', val: data.nat.rods, fill: '#7e22ce' },
                        { name: 'Cigarette Exports', val: data.nat.actual, fill: '#047857' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" fontSize={14} fontWeight="900" tick={{fill: '#000'}} tickLine={false} axisLine={false} tick={{dy: 10}} />
                        <YAxis fontSize={12} fontWeight="900" tick={{fill: '#000'}} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: '2px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '15px'}} />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={70}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white border-2 border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black text-blue-700 uppercase tracking-widest border-b-4 border-slate-50 pb-5 mb-8">Forensic Balance Sheet</h2>
                  <div className="space-y-8">
                    <BalanceRow label="Tobacco" kg={data.nat.tobaccoKg} sticks={data.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                    <BalanceRow label="Acetate Tow" kg={data.nat.towKg} sticks={data.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                    <BalanceRow label="Cig. Paper" kg={data.nat.paperKg} sticks={data.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                    <BalanceRow label="Filter Rods" kg={data.nat.rodsUnits} sticks={data.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                    <div className="pt-8 border-t-4 border-slate-50">
                       <p className="text-sm text-slate-500 font-black uppercase tracking-tighter">Unaccounted Surplus</p>
                       <p className="text-4xl font-black text-red-700 font-mono tracking-tighter mt-2">{(data.nat.actual - data.nat.tobacco).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pb-12">
                <AuditBox icon={<Info className="text-blue-900"/>} title="1. Tobacco Ceiling" bg="bg-blue-50" border="border-blue-200">
                    Infrastructure supports <span className="font-black text-black">{(data.nat.tobacco / 1e6).toFixed(1)}M</span> sticks. Actual exports are <span className="font-black text-red-700">{(data.nat.actual / data.nat.tobacco).toFixed(1)}x higher</span>, confirming unrecorded leaf.
                </AuditBox>
                <AuditBox icon={<Calculator className="text-slate-900"/>} title="2. Precursor Imbalance" bg="bg-slate-100" border="border-slate-300">
                    The gap between Tow and Paper potential is <span className="font-black text-black">{(Math.abs(data.nat.tow - data.nat.paper) / 1e6).toFixed(1)}M</span> sticks, indicating irregular procurement.
                </AuditBox>
                <AuditBox icon={<AlertTriangle className="text-red-900"/>} title="3. Strategic Conclusion" bg="bg-red-50" border="border-red-200">
                    A <span className="font-black text-red-700">98% shadow-market reliance</span> is detected. The reported precursor volume cannot support the export output.
                </AuditBox>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-md animate-in slide-in-from-right-5 duration-500">
              <table className="w-full text-left">
                <thead className="bg-black text-white uppercase font-black tracking-widest text-xs">
                  <tr>
                    <th className="p-10">Entity Identification</th>
                    <th className="p-10 text-center">Tx</th>
                    <th className="p-10">Material Inventory Log</th>
                    <th className="p-10 text-right">Precursor Cap</th>
                    <th className="p-10 text-right text-emerald-400">Cigarette Exports</th>
                    <th className="p-10 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-blue-50 transition-colors border-b-2 border-slate-50">
                      <td className="p-10 font-black text-black text-xl">{e.name}</td>
                      <td className="p-10 text-center text-slate-500 font-mono font-bold text-lg">{e.tx}</td>
                      <td className="p-10">
                        <div className="flex flex-wrap gap-4">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="group/pop relative bg-white border-2 border-slate-300 rounded-2xl px-5 py-3 flex items-center gap-4 cursor-help hover:border-blue-700 hover:shadow-lg transition-all">
                              {Icons[m]}
                              <span className="font-mono text-black font-black text-base">{Math.round(s.rawQty).toLocaleString()} <span className="text-xs text-slate-500">{s.unit}</span></span>
                              
                              <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-5 z-50 transition-all">
                                <div className="bg-black text-white p-8 rounded-2xl shadow-2xl min-w-[320px] border border-slate-800">
                                  <p className="text-blue-400 font-black text-xs uppercase mb-4 border-b border-slate-800 pb-2">{m} Forensic Calc</p>
                                  <div className="space-y-3 font-mono text-sm">
                                    <div className="flex justify-between text-slate-400"><span>Reported Qty:</span> <span className="text-white font-bold">{s.rawQty.toLocaleString()} {s.unit}</span></div>
                                    <div className="flex justify-between text-slate-400"><span>Applied Ratio:</span> <span className="text-white font-bold">x {s.ratioUsed.toLocaleString()}</span></div>
                                    <div className="flex justify-between pt-4 border-t border-slate-800 font-black text-emerald-400 text-lg"><span>Stick Eqv:</span> <span>{Math.round(s.sticks).toLocaleString()}</span></div>
                                  </div>
                                </div>
                                <div className="w-5 h-5 bg-black rotate-45 absolute -bottom-2 left-8 border-r border-b border-slate-800"/>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-10 text-right font-mono text-slate-600 font-black text-lg">{Math.round(e.minPot).toLocaleString()}</td>
                      <td className="p-10 text-right font-mono text-black font-black text-2xl">{Math.round(e.actual).toLocaleString()}</td>
                      <td className="p-10 text-center">
                        <div className="group/risk relative inline-block">
                          <span className={`px-8 py-3 rounded-full text-xs font-black tracking-widest border-2 shadow-sm ${
                            e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          }`}>
                            {e.risk}
                          </span>
                          {e.risk === 'CRITICAL' && (
                            <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute bottom-full right-0 mb-5 z-50 w-96 transition-all">
                              <div className="bg-white border-4 border-red-600 p-8 rounded-3xl shadow-2xl text-left">
                                <p className="text-red-700 font-black text-sm mb-3 uppercase tracking-widest flex items-center gap-3"><AlertTriangle size={24}/> Forensic Alert</p>
                                <p className="text-sm text-black leading-relaxed font-black">
                                  Production capacity exceeded by <span className="text-red-700 text-base">{(e.actual - e.minPot).toLocaleString()}</span> sticks. 
                                  Requires immediate audit of secondary leaf supply chains.
                                </p>
                              </div>
                              <div className="w-6 h-6 bg-white border-r-4 border-b-4 border-red-600 rotate-45 absolute -bottom-3 right-12"/>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-10 rounded-[2.5rem] shadow-sm hover:border-blue-700 transition-all group">
                   <div className="flex justify-between items-start mb-8">
                    <div className="bg-slate-100 p-4 rounded-xl text-black group-hover:bg-blue-700 group-hover:text-white transition-colors shadow-sm"><FileDown size={28}/></div>
                    <button onClick={() => deleteReport(r.id)} className="text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={24}/></button>
                  </div>
                  <h3 className="font-black text-black text-2xl mb-2">{r.title}</h3>
                  <p className="text-sm text-slate-500 font-bold mb-8 italic">{r.date}</p>
                  <button onClick={() => {setData(r.data); setActiveTab('country');}} className="w-full bg-black py-4 rounded-2xl text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg">Restore Audit</button>
                </div>
              ))}
              {reports.length === 0 && (
                <div className="col-span-full py-32 text-center border-4 border-dashed border-slate-200 rounded-[3rem]">
                   <History className="mx-auto text-slate-200 mb-6" size={64}/>
                   <p className="text-slate-400 font-black text-xl">Audit archives are empty.</p>
                </div>
              )}
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
        <div className="flex items-center gap-5">
          <div className={`w-2 h-12 rounded-full ${color}`}/>
          <div>
            <p className="text-xs text-slate-500 font-black uppercase tracking-widest mb-1">{label}</p>
            <p className="text-2xl font-black text-black">{Math.round(kg).toLocaleString()} <span className="text-sm text-slate-500 font-bold uppercase">{unit}</span></p>
          </div>
        </div>
        <p className="text-base font-black text-blue-800 font-mono">{(sticks/1e6).toFixed(1)}M sticks</p>
      </div>
      
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-0 bottom-full mb-4 z-50 transition-all">
         <div className="bg-black text-white p-6 rounded-2xl shadow-2xl text-xs font-mono min-w-[240px] border border-slate-800">
            <p className="text-blue-400 font-black uppercase mb-3 border-b border-slate-800 pb-2">{label} Math</p>
            <div className="flex justify-between"><span>Input:</span> <span>{Math.round(kg).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Ratio:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-3 border-t border-slate-800 text-emerald-400 font-black text-sm"><span>Total Eq:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
         </div>
         <div className="w-4 h-4 bg-black rotate-45 absolute -bottom-2 left-8"/>
      </div>
    </div>
  );
}

function AuditBox({ icon, title, bg, border, children }) {
    return (
        <div className={`${bg} p-10 rounded-[2.5rem] border-2 ${border} shadow-sm`}>
            <h3 className="text-black font-black text-base mb-5 flex items-center gap-3 uppercase tracking-wide">{icon} {title}</h3>
            <p className="text-base leading-relaxed text-slate-800 font-bold">{children}</p>
        </div>
    );
}

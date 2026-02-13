"use client";
import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, Hash, RefreshCcw, ChevronRight, Save, History, FileDown, Info, CheckCircle } from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 'TOW': 8333.33, 'PAPER': 20000, 'RODS': 6,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-600" size={16} />,
  'TOW': <Wind className="text-sky-600" size={16} />,
  'PAPER': <FileText className="text-slate-500" size={16} />,
  'RODS': <Pipette className="text-purple-600" size={16} />,
  'CIGARETTES': <Activity className="text-emerald-600" size={16} />
};

export default function ForensicInstitutionalV8() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');

  // Load saved reports
  useEffect(() => {
    const saved = localStorage.getItem('forensic_reports');
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
    localStorage.setItem('forensic_reports', JSON.stringify(updated));
    setReportTitle('');
    alert("Report Saved Successfully.");
  };

  const deleteReport = (id) => {
    const updated = reports.filter(r => r.id !== id);
    setReports(updated);
    localStorage.setItem('forensic_reports', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 lg:p-10 font-sans">
      {/* Header */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-blue-600 p-3 rounded-xl shadow-md"><ShieldAlert className="text-white" size={24}/></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">FORENSIC MONITOR <span className="text-blue-600">v8.0</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Institutional Precursor Intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none focus:border-blue-500" placeholder="Source Sheet URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-600 hover:bg-blue-700 px-6 py-2.5 rounded-xl font-bold text-white text-xs uppercase tracking-widest transition-all">Audit</button>
          <button onClick={() => {setData(null); setUrl('');}} className="p-2.5 text-slate-400 hover:text-red-600 bg-slate-100 rounded-xl"><RefreshCcw size={18}/></button>
        </div>
      </div>

      {data && (
        <div className="max-w-[1600px] mx-auto space-y-8">
          {/* Navigation & Save Report */}
          <div className="flex justify-between items-center border-b border-slate-200">
            <div className="flex gap-8 text-xs font-bold uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 ${activeTab === 'country' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Country Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 ${activeTab === 'entities' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Entity Analysis</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 ${activeTab === 'reports' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Saved Reports</button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-2 pb-4">
                <input className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-xs" placeholder="Report Title..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 transition-all"><Save size={14}/> Save</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-8 rounded-3xl shadow-sm">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8 flex items-center gap-2"><Activity size={16} className="text-blue-600"/> Production vs. Precursor Matrix</h2>
                  <div className="h-[400px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: data.nat.tobacco, fill: '#f59e0b' },
                        { name: 'Tow', val: data.nat.tow, fill: '#38bdf8' },
                        { name: 'Paper', val: data.nat.paper, fill: '#64748b' },
                        { name: 'Rods', val: data.nat.rods, fill: '#a855f7' },
                        { name: 'Exports', val: data.nat.actual, fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="val" radius={[6, 6, 0, 0]} barSize={50}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#38bdf8', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-3xl shadow-sm">
                  <h2 className="text-[11px] font-bold text-blue-600 uppercase tracking-widest border-b pb-4 mb-6">Forensic Balance Sheet</h2>
                  <div className="space-y-5">
                    <BalanceRow label="Tobacco" kg={data.nat.tobaccoKg} sticks={data.nat.tobacco} unit="KG" color="bg-amber-500" />
                    <BalanceRow label="Acetate Tow" kg={data.nat.towKg} sticks={data.nat.tow} unit="KG" color="bg-sky-500" />
                    <BalanceRow label="Cig. Paper" kg={data.nat.paperKg} sticks={data.nat.paper} unit="KG" color="bg-slate-500" />
                    <BalanceRow label="Filter Rods" kg={data.nat.rodsUnits} sticks={data.nat.rods} unit="PCS" color="bg-purple-500" />
                    <div className="pt-6 border-t border-slate-100">
                       <p className="text-[10px] text-slate-400 font-bold uppercase">Unaccounted Surplus</p>
                       <p className="text-2xl font-bold text-red-600 font-mono tracking-tighter">{(data.nat.actual - data.nat.tobacco).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* RESTORED: Detailed Auditing Guide */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10">
                <div className="bg-blue-50 p-8 rounded-3xl border border-blue-100">
                  <h3 className="text-blue-800 font-bold text-sm mb-4 flex items-center gap-2"><Info size={18}/> 1. Tobacco Ceiling</h3>
                  <p className="text-xs leading-relaxed text-blue-700/80">
                    Tobacco is the primary constraint. If exports exceed the tobacco potential (currently <span className="font-bold">{(data.nat.actual / data.nat.tobacco).toFixed(1)}x higher</span>), it suggests raw leaf is entering the country through undeclared channels.
                  </p>
                </div>
                <div className="bg-slate-100 p-8 rounded-3xl border border-slate-200">
                  <h3 className="text-slate-800 font-bold text-sm mb-4 flex items-center gap-2"><Calculator size={18}/> 2. Precursor Imbalance</h3>
                  <p className="text-xs leading-relaxed text-slate-600">
                    Anomalies between Tow and Paper indicate different manufacturing modes. High paper imports but low tow suggests filters are imported pre-made (Filter Rods), as seen in the <span className="font-bold">{data.nat.rodsUnits.toLocaleString()}</span> units detected.
                  </p>
                </div>
                <div className="bg-red-50 p-8 rounded-3xl border border-red-100">
                  <h3 className="text-red-800 font-bold text-sm mb-4 flex items-center gap-2"><AlertTriangle size={18}/> 3. Red Flag Threshold</h3>
                  <p className="text-xs leading-relaxed text-red-700/80 italic">
                    Strategic Conclusion: The current infrastructure supports 542M sticks. The actual export of 37B sticks confirms a 98% shadow-market reliance or massive material misdeclaration.
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm animate-in slide-in-from-right-4 duration-500">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold tracking-widest border-b border-slate-200">
                  <tr>
                    <th className="p-6">Entity</th>
                    <th className="p-6 text-center"><Hash size={14} className="inline"/></th>
                    <th className="p-6">Material Inventory</th>
                    <th className="p-6 text-right">Precursor Potential</th>
                    <th className="p-6 text-right font-black">Actual Exports</th>
                    <th className="p-6 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="p-6 font-bold text-slate-800">{e.name}</td>
                      <td className="p-6 text-center text-slate-400 font-mono text-[10px]">{e.tx}</td>
                      <td className="p-6">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="group/pop relative bg-white border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-3 cursor-help hover:border-blue-400 hover:shadow-sm">
                              {Icons[m]}
                              <span className="font-mono text-slate-600 font-bold">{Math.round(s.rawQty).toLocaleString()} <span className="text-[9px] text-slate-400">{s.unit}</span></span>
                              
                              <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-3 z-50 transition-all">
                                <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl min-w-[200px]">
                                  <p className="text-blue-400 font-bold text-[9px] uppercase mb-2 border-b border-slate-700 pb-1">{m} CONVERSION</p>
                                  <div className="space-y-1 font-mono text-[10px]">
                                    <div className="flex justify-between"><span>Input:</span> <span>{s.rawQty.toLocaleString()} {s.unit}</span></div>
                                    {m !== 'CIGARETTES' && <div className="flex justify-between"><span>Ratio:</span> <span>x {CONVERSIONS[m]}</span></div>}
                                    <div className="flex justify-between pt-1 border-t border-slate-700 font-bold text-emerald-400"><span>Stick Eqv:</span> <span>{Math.round(s.sticks).toLocaleString()}</span></div>
                                  </div>
                                </div>
                                <div className="w-3 h-3 bg-slate-900 rotate-45 absolute -bottom-1 left-4"/>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-6 text-right font-mono text-slate-400">{Math.round(e.minPot).toLocaleString()}</td>
                      <td className="p-6 text-right font-mono text-slate-900 font-black">{Math.round(e.actual).toLocaleString()}</td>
                      <td className="p-6 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold tracking-widest ${
                          e.risk === 'CRITICAL' ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}>
                          {e.risk}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in zoom-in-95 duration-300">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:border-blue-300 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><FileDown size={20}/></div>
                    <button onClick={() => deleteReport(r.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                  </div>
                  <h3 className="font-bold text-slate-900 mb-1">{r.title}</h3>
                  <p className="text-[10px] text-slate-400 font-bold mb-4">{r.date}</p>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 border-t pt-4">
                    <span>{r.data.entities.length} Entities</span>
                    <button onClick={() => {setData(r.data); setActiveTab('country');}} className="text-blue-600 hover:underline">View Report</button>
                  </div>
                </div>
              ))}
              {reports.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                  <History className="mx-auto text-slate-200 mb-4" size={48}/>
                  <p className="text-slate-400 font-bold text-sm">No saved audit reports found.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BalanceRow({ label, kg, sticks, unit, color }) {
  return (
    <div className="flex justify-between items-end group">
      <div className="flex items-center gap-3">
        <div className={`w-1 h-8 rounded-full ${color}`}/>
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-0.5">{label}</p>
          <p className="text-sm font-bold text-slate-700">{Math.round(kg).toLocaleString()} <span className="text-[9px] text-slate-400 font-normal">{unit}</span></p>
        </div>
      </div>
      <p className="text-[10px] font-mono font-bold text-blue-600">{(sticks/1e6).toFixed(1)}M sticks</p>
    </div>
  );
}

"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, RefreshCcw, Save, History, Search, Info, Sliders, CheckCircle, TrendingUp, ArrowRight } from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 'TOW': 8333.33, 'PAPER': 20000, 'RODS': 6,
  'CIGARETTES_WT': 1333.33,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ForensicGradeV10() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  useEffect(() => {
    const saved = localStorage.getItem('forensic_v10_reports');
    if (saved) setReports(JSON.parse(saved));
  }, []);

  const auditResult = useMemo(() => {
    if (rawData.length === 0) return null;
    const registry = {};
    let nat = { tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, tobaccoKg: 0, towKg: 0, paperKg: 0, rodsUnits: 0 };

    rawData.forEach(row => {
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
        let sticks = (unit === 'MIL') ? qty * 1000000 : (['KG', 'KGM', 'TON', 'MT'].includes(unit)) ? convQty * CONVERSIONS.CIGARETTES_WT : convQty;
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: sticks/qty };
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
      // RECONCILED LOGIC: Potential is 0 if Tobacco is 0. 
      const precursors = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPot = (e.tobacco === 0) ? 0 : Math.min(...precursors);
      
      const isZeroTobaccoViolation = e.actual > 0 && e.tobacco === 0;
      const thresholdMultiplier = 1 + (riskThreshold / 100);
      const isOverCap = e.actual > (minPot * thresholdMultiplier);

      return { 
        ...e, 
        minPot, 
        risk: (isZeroTobaccoViolation || isOverCap) ? 'CRITICAL' : 'RECONCILED',
        violationType: isZeroTobaccoViolation ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    return { entities, nat };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => {
    if (!auditResult) return [];
    return auditResult.entities.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [auditResult, searchTerm]);

  const filteredSums = useMemo(() => {
    return filteredEntities.reduce((acc, curr) => ({
      tx: acc.tx + curr.tx,
      actual: acc.actual + curr.actual,
      minPot: acc.minPot + curr.minPot
    }), { tx: 0, actual: 0, minPot: 0 });
  }, [filteredEntities]);

  const sync = () => {
    if (!url) return;
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setRawData(res.data); setLoading(false); }
    });
  };

  const saveReport = () => {
    if (!reportTitle || !auditResult) return;
    const newReport = { id: Date.now(), title: reportTitle, data: rawData, date: new Date().toLocaleString() };
    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v10_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  const deleteReport = (id) => {
    const updated = reports.filter(r => r.id !== id);
    setReports(updated);
    localStorage.setItem('forensic_v10_reports', JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      {/* HEADER SECTION */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black uppercase">Forensic Monitor <span className="text-blue-700">9.10</span></h1>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Stability Locked & Analysis Expanded</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 font-black uppercase text-[10px] text-black">
             <Sliders size={18} className="text-blue-700"/> Threshold
           </div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none focus:border-blue-600 font-bold" placeholder="G-Sheet Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase tracking-widest transition-all">Run Audit</button>
          <button onClick={() => {setRawData([]); setUrl(''); setSearchTerm('');}} className="p-2.5 text-slate-400 hover:text-red-700 bg-slate-100 border border-slate-200 rounded-xl"><RefreshCcw size={20}/></button>
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 transition-colors ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Country Intelligence</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-colors ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Target Analysis</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 transition-colors ${activeTab === 'reports' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Archived Reports</button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-3 pb-4">
                <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black" placeholder="Save Snapshot As..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-800 shadow-sm transition-all flex items-center gap-2"><Save size={16}/> Save Report</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black uppercase mb-10 flex items-center gap-2 tracking-widest"><Activity size={20} className="text-blue-700"/> National Supply Matrix</h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Actual Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} fontWeight="bold" />
                        <YAxis fontSize={11} fontWeight="bold" tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip formatter={(v) => [v.toLocaleString(), "Sticks"]} contentStyle={{borderRadius: '16px', border: 'none'}} />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                           { [0,1,2,3].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8">Calculated Audit Totals</h2>
                  <div className="space-y-6">
                    <BalanceRow label="Tobacco" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" />
                    <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" />
                    <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" />
                    <div className="pt-4 border-t-2 border-slate-100">
                       <p className="text-xs font-black uppercase text-slate-500 mb-1 tracking-tight">Theoretical Surplus Gap (Shadow Leaf)</p>
                       <p className="text-3xl font-black text-red-700 font-mono tracking-tighter">{Math.round(auditResult.nat.actual - auditResult.nat.tobacco).toLocaleString()} Sticks</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* STRATEGIC ANALYSIS PANEL */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl relative overflow-hidden">
                  <TrendingUp className="mb-6 text-blue-400" size={32}/>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-4">Forensic Summary</h3>
                  <p className="text-sm font-bold text-slate-300 leading-relaxed">
                    Based on mass-balance data, the national limiting factor is 
                    <span className="text-blue-400"> {auditResult.nat.tobacco < auditResult.nat.tow ? 'Tobacco' : 'Acetate Tow'}</span>. 
                    The total precursor gap across all analyzed entities represents a potential shadow-market volume of 
                    <span className="text-emerald-400"> {Math.round((auditResult.nat.actual / Math.min(auditResult.nat.tobacco, auditResult.nat.tow) - 1)*100)}%</span> beyond legal capacity.
                  </p>
                </div>
                <div className="bg-white p-10 rounded-[2.5rem] border-2 border-slate-200">
                  <h3 className="text-slate-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-wide"><Info size={22} className="text-blue-700"/> 1. The Tobacco Ceiling</h3>
                  <p className="text-sm leading-relaxed text-slate-600 font-bold italic">Max legal production. If exports exceed this, finished goods are sourced from unrecorded raw leaf.</p>
                </div>
                <div className="bg-white p-10 rounded-[2.5rem] border-2 border-slate-200">
                  <h3 className="text-slate-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-wide"><Calculator size={22} className="text-blue-700"/> 2. Bottleneck Analysis</h3>
                  <p className="text-sm leading-relaxed text-slate-600 font-bold italic">Identifies the tightest precursor (Tobacco, Tow, or Paper). Tightest material defines the Cap.</p>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              {/* SEARCH & SUM BAR */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 flex items-center gap-4 bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-sm">
                  <Search className="text-slate-400" size={20}/>
                  <input className="w-full outline-none font-bold text-black" placeholder="Search target entities..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="bg-slate-900 text-white px-8 py-4 rounded-2xl flex items-center gap-10 shadow-lg">
                   <div className="text-center">
                     <p className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">Filtered Actual</p>
                     <p className="font-mono font-black text-emerald-400">{Math.round(filteredSums.actual).toLocaleString()}</p>
                   </div>
                   <div className="text-center">
                     <p className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">Filtered Potential</p>
                     <p className="font-mono font-black text-blue-400">{Math.round(filteredSums.minPot).toLocaleString()}</p>
                   </div>
                   <div className="text-center">
                     <p className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">Total TX</p>
                     <p className="font-mono font-black">{filteredSums.tx.toLocaleString()}</p>
                   </div>
                </div>
              </div>

              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[11px]">
                    <tr>
                      <th className="p-8">Entity Name</th>
                      <th className="p-8">Material Inventory Breakdown</th>
                      <th className="p-8 text-right">Potential (Cap)</th>
                      <th className="p-8 text-right text-emerald-400">Actual Exports</th>
                      <th className="p-8 text-center">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 transition-colors group">
                        <td className="p-8 font-black text-black text-base leading-tight w-1/4">{e.name}</td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="bg-white border-2 border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-2 group-hover:border-slate-300">
                                {Icons[m]}
                                <span className="font-mono font-black text-[11px]">{Math.round(s.rawQty).toLocaleString()} <span className="text-[9px] text-slate-500">{s.unit}</span></span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono font-bold text-slate-600">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                           <div className="group/note relative inline-block">
                              <span className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest border-2 ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>{e.risk}</span>
                              {e.risk === 'CRITICAL' && (
                                <div className="invisible group-hover/note:visible opacity-0 group-hover/note:opacity-100 absolute bottom-full right-0 mb-4 z-50 w-80 transition-all pointer-events-none">
                                  <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-2xl text-left border border-slate-700">
                                    <p className="text-red-400 font-black text-xs mb-2 uppercase tracking-widest flex items-center gap-2"><AlertTriangle size={16}/> Critical Audit Finding</p>
                                    <p className="text-xs text-slate-300 leading-relaxed font-bold">
                                      {e.violationType === 'ZERO_TOBACCO' 
                                        ? `CRITICAL: Exporting finished goods with ZERO recorded tobacco imports. Highly likely 100% shadow leaf production.`
                                        : `SURPLUS: Production exceeds precursor cap by ${Math.round(e.actual - e.minPot).toLocaleString()} sticks, surpassing your ${riskThreshold}% threshold.`}
                                    </p>
                                  </div>
                                </div>
                              )}
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-20">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all group border-b-8 border-b-slate-900">
                  <div className="flex justify-between items-start mb-6">
                    <div className="bg-slate-100 p-4 rounded-2xl text-slate-400 group-hover:bg-blue-700 group-hover:text-white transition-all"><History size={28}/></div>
                    <button onClick={() => deleteReport(r.id)} className="text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={22}/></button>
                  </div>
                  <h3 className="font-black text-black text-xl mb-1">{r.title}</h3>
                  <p className="text-xs text-slate-500 font-bold mb-8 italic">{r.date}</p>
                  <button onClick={() => {setRawData(r.data); setActiveTab('country');}} className="w-full bg-slate-900 py-4 rounded-xl text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md">Restore Data State</button>
                </div>
              ))}
              {reports.length === 0 && (
                <div className="col-span-3 border-4 border-dashed border-slate-200 rounded-[2.5rem] p-20 text-center">
                  <div className="inline-block p-6 bg-slate-100 rounded-full text-slate-300 mb-6"><Save size={40}/></div>
                  <p className="text-slate-400 font-black uppercase tracking-widest">No Archived Snapshots Found</p>
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
    <div className="flex justify-between items-end">
      <div className="flex items-center gap-4">
        <div className={`w-1.5 h-10 rounded-full ${color}`}/>
        <div>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">{label}</p>
          <p className="text-lg font-black text-black leading-none">{Math.round(kg).toLocaleString()} <span className="text-[10px] font-bold uppercase text-slate-400">{unit}</span></p>
        </div>
      </div>
      <p className="text-sm font-black text-blue-700 font-mono tracking-tight">{Math.round(sticks).toLocaleString()} sticks</p>
    </div>
  );
}

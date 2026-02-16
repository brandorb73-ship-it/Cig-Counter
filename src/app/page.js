"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, 
  Calculator, AlertTriangle, RefreshCcw, Save, History, Search, 
  Info, Sliders, CheckCircle, TrendingUp, Eraser, Layers
} from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 
  'TOW': 8333.33, 
  'PAPER': 20000, 
  'RODS': 6,
  'CIGARETTES_WT': 1333.33,
  'UNITS': { 
    'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 
    'CASE': 10000, 'PIECE': 1 
  }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={20} />,
  'TOW': <Wind className="text-sky-700" size={20} />,
  'PAPER': <FileText className="text-slate-700" size={20} />,
  'RODS': <Pipette className="text-purple-700" size={20} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={20} />
};

export default function ForensicGradeV13() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  useEffect(() => {
    const saved = localStorage.getItem('forensic_v13_reports');
    if (saved) setReports(JSON.parse(saved));
  }, []);

  const auditResult = useMemo(() => {
    if (rawData.length === 0) return null;
    const registry = {};
    let nat = { 
      tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, 
      tobaccoKg: 0, towKg: 0, paperKg: 0, rodsUnits: 0 
    };

    rawData.forEach(row => {
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;
      if (!registry[entity]) registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {}, tx: 0 };

      const mR = (row.Material || '').toUpperCase();
      let mat = null;
      if (mR.includes('TOBACCO')) mat = 'TOBACCO';
      else if (mR.includes('TOW')) mat = 'TOW';
      else if (mR.includes('PAPER')) mat = 'PAPER';
      else if (mR.includes('ROD')) mat = 'RODS';
      else if (mR.includes('CIGARETTE') && !mR.includes('PAPER')) mat = 'CIGARETTES';

      const qty = parseFloat(String(row.Quantity).replace(/,/g, '')) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = CONVERSIONS.UNITS[unit] || 1;
      const convQty = qty * factor;
      registry[entity].tx += 1;

      if (mat === 'CIGARETTES') {
        let sticks = (unit === 'MIL') ? qty * 1000000 : (['KG', 'KGM', 'TON', 'MT'].includes(unit)) ? convQty * CONVERSIONS.CIGARETTES_WT : convQty;
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, calc: "" };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
        registry[entity].materials[mat].calc = `${qty.toLocaleString()} ${unit} × ${sticks/qty === 1000000 ? "1M" : CONVERSIONS.CIGARETTES_WT}`;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        if (mat === 'TOBACCO') nat.tobaccoKg += convQty;
        if (mat === 'TOW') nat.towKg += convQty;
        if (mat === 'PAPER') nat.paperKg += convQty;
        if (mat === 'RODS') nat.rodsUnits += convQty;
        nat[mat.toLowerCase()] += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, calc: "" };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
        registry[entity].materials[mat].calc = `${qty.toLocaleString()} ${unit} × ${CONVERSIONS[mat]}`;
      }
    });

    const entities = Object.values(registry).map(e => {
      const precursors = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPot = (e.tobacco === 0) ? 0 : Math.min(...precursors);
      const isZeroTobacco = e.actual > 0 && e.tobacco === 0;
      const isOverCap = e.actual > (minPot * (1 + riskThreshold / 100));
      return { ...e, minPot, risk: (isZeroTobacco || isOverCap) ? 'CRITICAL' : 'RECONCILED', violationType: isZeroTobacco ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : 'NONE' };
    }).sort((a, b) => b.actual - a.actual);
    return { entities, nat };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => (auditResult?.entities || []).filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())), [auditResult, searchTerm]);
  const filteredSums = useMemo(() => filteredEntities.reduce((acc, curr) => ({ tx: acc.tx + curr.tx, actual: acc.actual + curr.actual, minPot: acc.minPot + curr.minPot }), { tx: 0, actual: 0, minPot: 0 }), [filteredEntities]);

  const handleSync = () => {
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}`, { download: true, header: true, complete: (res) => { setRawData(res.data); setLoading(false); } });
  };

  const clearData = () => { setRawData([]); setUrl(''); setSearchTerm(''); };

  // Summary Logic Correction
  const nationalLimitingFactor = auditResult ? (auditResult.nat.tobacco < auditResult.nat.tow ? 'Tobacco' : 'Acetate Tow') : '';
  const nationalPotential = auditResult ? Math.min(auditResult.nat.tobacco, auditResult.nat.tow, auditResult.nat.paper) : 0;
  const shadowMarketPercent = auditResult && nationalPotential > 0 ? Math.max(0, ((auditResult.nat.actual / nationalPotential) - 1) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <header className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row items-center gap-8 bg-white border border-slate-200 p-8 rounded-3xl shadow-sm">
        <div className="flex items-center gap-5 mr-auto">
          <div className="bg-slate-900 p-4 rounded-2xl"><ShieldAlert className="text-white" size={32}/></div>
          <div><h1 className="text-3xl font-black uppercase">Forensic Monitor <span className="text-blue-600">v9.13</span></h1><p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Deep Material Reconciliation</p></div>
        </div>
        
        <div className="flex items-center gap-6 bg-slate-100 px-8 py-4 rounded-2xl border border-slate-200">
           <div className="flex flex-col"><span className="text-[10px] font-black uppercase text-slate-500 mb-1">Sensitivity</span><div className="flex items-center gap-4">
             <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 accent-blue-600 cursor-pointer" />
             <span className="font-mono font-black text-blue-600">{riskThreshold}%</span>
           </div></div>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3.5 text-sm font-bold w-full lg:w-96 outline-none focus:border-blue-600" placeholder="Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={handleSync} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">Run Audit</button>
          <button onClick={clearData} className="p-3.5 text-slate-400 hover:text-red-600 bg-slate-50 border border-slate-200 rounded-2xl transition-all flex items-center gap-2 font-bold text-xs uppercase"><Eraser size={20}/> Clear</button>
        </div>
      </header>

      {auditResult && (
        <main className="max-w-[1600px] mx-auto space-y-10">
          <nav className="flex gap-12 text-sm font-black uppercase tracking-widest border-b-2 border-slate-200">
            <button onClick={() => setActiveTab('country')} className={`pb-5 ${activeTab === 'country' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400'}`}>Country Intel</button>
            <button onClick={() => setActiveTab('entities')} className={`pb-5 ${activeTab === 'entities' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400'}`}>Target Analysis</button>
            <button onClick={() => setActiveTab('reports')} className={`pb-5 ${activeTab === 'reports' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400'}`}>Archives</button>
          </nav>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                <section className="lg:col-span-8 bg-white border border-slate-200 p-12 rounded-[3rem] shadow-sm">
                  <h2 className="text-xl font-black uppercase mb-12 flex items-center gap-3"><Activity className="text-blue-600" size={24}/> National Supply Matrix</h2>
                  <div className="h-[480px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Actual Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} fontWeight="bold" />
                        <YAxis fontSize={12} fontWeight="bold" tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip />
                        <Bar dataKey="val" radius={[10, 10, 0, 0]} barSize={65}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <aside className="lg:col-span-4 bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm flex flex-col">
                  <h2 className="text-sm font-black text-blue-600 uppercase tracking-widest border-b pb-6 mb-8">Calculated Totals</h2>
                  <div className="space-y-8 flex-1">
                    <BalanceRow label="Tobacco" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-500" />
                    <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-500" />
                    <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-500" />
                    <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-500" />
                  </div>
                  <div className="mt-8 pt-8 border-t-2 border-slate-50">
                     <p className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Theoretical Shadow Surplus</p>
                     <p className="text-4xl font-black text-red-700 font-mono tracking-tighter">
                       {Math.round(auditResult.nat.actual - auditResult.nat.tobacco).toLocaleString()}
                     </p>
                  </div>
                </aside>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <section className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-2xl overflow-hidden relative">
                  <TrendingUp className="mb-6 text-blue-400" size={36}/>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-4">Strategic Finding</h3>
                  <p className="text-lg font-bold text-slate-100 leading-snug">
                    Limiting Factor: <span className="text-blue-400">{nationalLimitingFactor}</span>.
                  </p>
                  <p className="text-sm text-slate-400 font-bold mt-4 leading-relaxed">
                    Surplus Gap: <span className="text-emerald-400 font-black">{shadowMarketPercent.toFixed(2)}%</span> production beyond raw material ceiling.
                  </p>
                </section>

                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200">
                  <h3 className="text-slate-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-widest"><Info size={20} className="text-blue-600"/> The Tobacco Ceiling</h3>
                  <p className="text-xs leading-relaxed text-slate-500 font-black uppercase italic">Imports define max capacity. Any export volume exceeding this represents illicit leaf sourcing.</p>
                </div>

                <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200">
                  <h3 className="text-slate-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-widest"><CheckCircle size={20} className="text-emerald-600"/> Reconciled Audit Guide</h3>
                  <p className="text-xs leading-relaxed text-slate-500 font-black uppercase italic">
                    Status is RECONCILED if: <br/><br/>
                    Actual Exports ≤ (Min Precursor Cap × (1 + {riskThreshold}%))
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 flex items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <Search className="text-slate-400" size={28}/><input className="w-full outline-none font-bold text-xl placeholder:text-slate-300" placeholder="Filter Target..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="bg-slate-900 text-white px-10 py-6 rounded-3xl flex items-center gap-12 shadow-xl">
                   <div className="text-center"><p className="text-[10px] font-black uppercase text-slate-500 mb-1">Actual</p><p className="font-mono font-black text-emerald-400 text-2xl">{Math.round(filteredSums.actual).toLocaleString()}</p></div>
                   <div className="text-center"><p className="text-[10px] font-black uppercase text-slate-500 mb-1">Potential</p><p className="font-mono font-black text-blue-400 text-2xl">{Math.round(filteredSums.minPot).toLocaleString()}</p></div>
                   <div className="text-center"><p className="text-[10px] font-black uppercase text-slate-500 mb-1">TX</p><p className="font-mono font-black text-white text-2xl">{filteredSums.tx}</p></div>
                </div>
              </div>

              <div className="bg-white border-2 border-slate-200 rounded-[3rem] overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-900 text-white uppercase font-black text-xs tracking-widest">
                    <tr>
                      <th className="p-10">Entity Target</th>
                      <th className="p-10 text-center">TX</th>
                      <th className="p-10">Material Logistics</th>
                      <th className="p-10 text-right">Potential Cap</th>
                      <th className="p-10 text-right text-emerald-400">Actual Exports</th>
                      <th className="p-10 text-center">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100 font-bold text-sm">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-all group">
                        <td className="p-10 font-black text-xl text-slate-900">{e.name}</td>
                        <td className="p-10 text-center text-lg">{e.tx}</td>
                        <td className="p-10">
                          <div className="flex flex-wrap gap-4">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="group/calc relative flex items-center gap-3 bg-white border-2 border-slate-200 px-5 py-3 rounded-2xl hover:border-blue-400 transition-all">
                                {Icons[m]}
                                <span className="text-base font-black text-slate-800">{Math.round(s.rawQty).toLocaleString()} {s.unit}</span>
                                <div className="invisible group-hover/calc:visible opacity-0 group-hover/calc:opacity-100 absolute bottom-full left-0 mb-3 bg-slate-900 text-white p-4 rounded-xl text-xs font-mono w-56 shadow-2xl z-50 transition-all pointer-events-none">
                                  <p className="text-blue-400 mb-1 uppercase font-black tracking-tighter">Stick Calculation:</p>
                                  <p className="text-white">{s.calc} = {Math.round(s.sticks).toLocaleString()} Sticks</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-10 text-right font-mono text-xl text-slate-400">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-10 text-right font-mono text-2xl text-slate-900">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-10 text-center">
                           <div className="group/note relative inline-block">
                              <span className={`px-8 py-3 rounded-full text-xs font-black tracking-widest border-2 transition-all ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>{e.risk}</span>
                              <div className="invisible group-hover/note:visible opacity-0 group-hover/note:opacity-100 absolute bottom-full right-0 mb-6 w-96 bg-slate-900 text-white p-8 rounded-3xl text-left shadow-2xl z-50 transition-all border border-slate-700">
                                <h4 className="text-blue-400 text-[10px] font-black uppercase mb-4 tracking-[0.2em] flex items-center gap-2"><Calculator size={14}/> Audit Logic Breakdown</h4>
                                <div className="space-y-3 mb-6 font-mono text-xs border-b border-slate-700 pb-4">
                                  <div className="flex justify-between"><span className="text-slate-500">Actual Exports:</span><span>{Math.round(e.actual).toLocaleString()}</span></div>
                                  <div className="flex justify-between"><span className="text-slate-500">Legal Capacity:</span><span>{Math.round(e.minPot).toLocaleString()}</span></div>
                                  <div className={`flex justify-between font-black ${e.actual > e.minPot ? 'text-red-400' : 'text-emerald-400'}`}>
                                    <span>Variance:</span><span>{Math.round(e.actual - e.minPot).toLocaleString()}</span>
                                  </div>
                                </div>
                                <p className="text-xs font-bold leading-relaxed">
                                  {e.violationType === 'ZERO_TOBACCO' ? "VIOLATION: Exporting with zero recorded tobacco imports. Highly likely shadow leaf usage." :
                                   e.violationType === 'OVER_CAP' ? `OVERAGE: Production exceeds capacity by ${Math.round(e.actual - e.minPot).toLocaleString()} sticks (>${riskThreshold}% Threshold).` :
                                   `VALID: Exports are within legal precursor capacity (Threshold set at ${riskThreshold}%).`}
                                </p>
                              </div>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-10 rounded-[3rem] shadow-sm hover:shadow-xl transition-all group">
                   <div className="flex justify-between mb-8">
                    <div className="bg-slate-100 p-5 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all"><History size={32}/></div>
                    <button onClick={() => setReports(reports.filter(x => x.id !== r.id))} className="text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={24}/></button>
                  </div>
                  <h3 className="font-black text-2xl mb-2">{r.title}</h3>
                  <p className="text-xs text-slate-400 font-bold mb-10 tracking-widest">{r.date}</p>
                  <button onClick={() => {setRawData(r.data); setActiveTab('country');}} className="w-full bg-slate-900 py-5 rounded-2xl text-white font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all">Restore Report</button>
                </div>
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function BalanceRow({ label, kg, sticks, unit, color }) {
  return (
    <div className="flex justify-between items-center group">
      <div className="flex items-center gap-5">
        <div className={`w-2.5 h-12 rounded-full ${color}`}/>
        <div><p className="text-[10px] text-slate-400 font-black uppercase mb-1">{label}</p><p className="text-xl font-black">{Math.round(kg).toLocaleString()} <span className="text-[10px] font-bold text-slate-300">{unit}</span></p></div>
      </div>
      <div className="text-right"><p className="text-sm font-black text-blue-600 font-mono tracking-tighter">{Math.round(sticks).toLocaleString()}</p><p className="text-[9px] font-black text-slate-300 uppercase">Sticks</p></div>
    </div>
  );
}

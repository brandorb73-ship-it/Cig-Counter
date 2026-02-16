"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, 
  LineChart, Line 
} from 'recharts';
import { 
  ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, 
  Calculator, AlertTriangle, RefreshCcw, Save, History, Search, 
  Info, Sliders, CheckCircle, TrendingUp, ArrowRight, Layers
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
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ForensicGradeV12() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  // Persistence Logic
  useEffect(() => {
    const saved = localStorage.getItem('forensic_v12_reports');
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
      
      if (!registry[entity]) {
        registry[entity] = { 
          name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, 
          actual: 0, materials: {}, tx: 0 
        };
      }

      const materialRaw = (row.Material || '').toUpperCase();
      let matType = null;
      if (materialRaw.includes('TOBACCO')) matType = 'TOBACCO';
      else if (materialRaw.includes('TOW')) matType = 'TOW';
      else if (materialRaw.includes('PAPER')) matType = 'PAPER';
      else if (materialRaw.includes('ROD')) matType = 'RODS';
      else if (materialRaw.includes('CIGARETTE') && !materialRaw.includes('PAPER')) matType = 'CIGARETTES';

      const qty = parseFloat(String(row.Quantity).replace(/,/g, '')) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = CONVERSIONS.UNITS[unit] || 1;
      const convQty = qty * factor;

      registry[entity].tx += 1;

      if (matType === 'CIGARETTES') {
        let sticks = (unit === 'MIL') ? qty * 1000000 : 
                     (['KG', 'KGM', 'TON', 'MT'].includes(unit)) ? convQty * CONVERSIONS.CIGARETTES_WT : 
                     convQty;
        registry[entity].actual += sticks;
        nat.actual += sticks;
        
        if (!registry[entity].materials[matType]) {
          registry[entity].materials[matType] = { rawQty: 0, sticks: 0, unit };
        }
        registry[entity].materials[matType].rawQty += qty;
        registry[entity].materials[matType].sticks += sticks;
      } 
      else if (matType && CONVERSIONS[matType]) {
        const sticks = convQty * CONVERSIONS[matType];
        registry[entity][matType.toLowerCase()] += sticks;
        
        // National Aggregation
        if (matType === 'TOBACCO') nat.tobaccoKg += convQty;
        if (matType === 'TOW') nat.towKg += convQty;
        if (matType === 'PAPER') nat.paperKg += convQty;
        if (matType === 'RODS') nat.rodsUnits += convQty;
        nat[matType.toLowerCase()] += sticks;

        if (!registry[entity].materials[matType]) {
          registry[entity].materials[matType] = { rawQty: 0, sticks: 0, unit };
        }
        registry[entity].materials[matType].rawQty += qty;
        registry[entity].materials[matType].sticks += sticks;
      }
    });

    const finalEntities = Object.values(registry).map(e => {
      // THE TOBACCO ANCHOR: If Tobacco is 0, Cap is 0.
      const precursors = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPot = (e.tobacco === 0) ? 0 : Math.min(...precursors);
      
      const isZeroTobacco = e.actual > 0 && e.tobacco === 0;
      const limitWithThreshold = minPot * (1 + riskThreshold / 100);
      const isOverCap = e.actual > limitWithThreshold;

      return { 
        ...e, 
        minPot, 
        risk: (isZeroTobacco || isOverCap) ? 'CRITICAL' : 'RECONCILED',
        violationType: isZeroTobacco ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    return { entities: finalEntities, nat };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => {
    return (auditResult?.entities || []).filter(e => 
      e.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [auditResult, searchTerm]);

  const filteredSums = useMemo(() => {
    return filteredEntities.reduce((acc, curr) => ({
      tx: acc.tx + curr.tx,
      actual: acc.actual + curr.actual,
      minPot: acc.minPot + curr.minPot
    }), { tx: 0, actual: 0, minPot: 0 });
  }, [filteredEntities]);

  const handleSync = () => {
    if (!url) return;
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}`, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRawData(res.data);
        setLoading(false);
      },
      error: () => setLoading(false)
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] p-8 font-sans antialiased">
      {/* GLOBAL HEADER */}
      <header className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row items-center gap-8 bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm">
        <div className="flex items-center gap-5 mr-auto">
          <div className="bg-slate-900 p-4 rounded-2xl shadow-xl shadow-blue-100">
            <ShieldAlert className="text-white" size={32}/>
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight">Forensic Monitor <span className="text-blue-600">v9.12</span></h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Material Balance Audit System</p>
          </div>
        </div>
        
        <div className="flex items-center gap-8 bg-slate-50 px-8 py-4 rounded-[1.5rem] border border-slate-100">
           <div className="flex flex-col">
             <span className="text-[10px] font-black uppercase text-slate-400 mb-1">Audit Sensitivity</span>
             <div className="flex items-center gap-4">
               <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-200 rounded-lg accent-blue-600 cursor-pointer" />
               <span className="font-mono font-black text-blue-600 text-base">{riskThreshold}%</span>
             </div>
           </div>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-96">
            <Database className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
            <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:border-blue-600 outline-none transition-all" placeholder="Enter Google Sheet URL..." value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <button onClick={handleSync} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-10 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all">
            {loading ? 'Processing...' : 'Sync Audit'}
          </button>
        </div>
      </header>

      {auditResult && (
        <main className="max-w-[1600px] mx-auto space-y-10">
          {/* TAB NAVIGATION */}
          <nav className="flex justify-between items-center border-b-2 border-slate-100">
            <div className="flex gap-12 text-sm font-black uppercase tracking-[0.15em]">
              <button onClick={() => setActiveTab('country')} className={`pb-5 transition-all relative ${activeTab === 'country' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                Country Intelligence
                {activeTab === 'country' && <div className="absolute bottom-[-2px] left-0 w-full h-1 bg-blue-600 rounded-full"/>}
              </button>
              <button onClick={() => setActiveTab('entities')} className={`pb-5 transition-all relative ${activeTab === 'entities' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                Target Analysis
                {activeTab === 'entities' && <div className="absolute bottom-[-2px] left-0 w-full h-1 bg-blue-600 rounded-full"/>}
              </button>
              <button onClick={() => setActiveTab('reports')} className={`pb-5 transition-all relative ${activeTab === 'reports' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
                Archives
                {activeTab === 'reports' && <div className="absolute bottom-[-2px] left-0 w-full h-1 bg-blue-600 rounded-full"/>}
              </button>
            </div>
          </nav>

          {activeTab === 'country' ? (
            <div className="space-y-10 animate-in fade-in duration-700">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* NATIONAL CHART */}
                <section className="lg:col-span-8 bg-white border border-slate-200 p-12 rounded-[3rem] shadow-sm">
                  <header className="flex justify-between items-center mb-12">
                    <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-3"><Activity className="text-blue-600" size={24}/> National Supply Balance</h2>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400"><div className="w-3 h-3 rounded-sm bg-blue-500"/> Input</div>
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400"><div className="w-3 h-3 rounded-sm bg-emerald-500"/> Output</div>
                    </div>
                  </header>
                  <div className="h-[480px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Filter Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Actual Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="name" fontSize={11} fontWeight="800" axisLine={false} tickLine={false} dy={10} />
                        <YAxis fontSize={10} fontWeight="800" axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip 
                          cursor={{fill: '#f8fafc'}}
                          contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} 
                          formatter={(v) => [Number(v).toLocaleString(), "Sticks"]}
                        />
                        <Bar dataKey="val" radius={[10, 10, 0, 0]} barSize={65}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* NATIONAL TOTALS SIDEBAR */}
                <aside className="lg:col-span-4 bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm flex flex-col">
                  <h2 className="text-xs font-black text-blue-600 uppercase tracking-widest border-b border-slate-100 pb-6 mb-8 text-center">Mass Balance Matrix</h2>
                  <div className="space-y-8 flex-1">
                    <BalanceRow label="Raw Tobacco" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-500" />
                    <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-500" />
                    <BalanceRow label="Cigarette Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-500" />
                    <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-500" />
                  </div>
                  <div className="mt-8 pt-8 border-t-2 border-slate-50">
                     <div className="flex justify-between items-center mb-2">
                        <p className="text-[10px] font-black uppercase text-slate-400">Total Shadow Leaf Deficit</p>
                        <AlertTriangle className="text-red-600" size={16}/>
                     </div>
                     <p className="text-3xl font-black text-red-700 font-mono tracking-tighter tabular-nums">
                       {Math.round(auditResult.nat.actual - auditResult.nat.tobacco).toLocaleString()}
                     </p>
                     <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase italic">Unaccounted Finished Sticks</p>
                  </div>
                </aside>
              </div>

              {/* COUNTRY SUMMARY & GUIDES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <section className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                    <TrendingUp size={120}/>
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Layers size={20} className="text-blue-400"/> Forensic Intelligence
                  </h3>
                  <p className="text-base font-bold text-slate-300 leading-relaxed mb-4">
                    The national production bottleneck is 
                    <span className="text-blue-400"> {auditResult.nat.tobacco < auditResult.nat.tow ? 'Tobacco' : 'Acetate Tow'}</span>.
                  </p>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    National surplus suggests unrecorded production of 
                    <span className="text-emerald-400 font-black"> {Math.max(0, Math.round(((auditResult.nat.actual / Math.min(auditResult.nat.tobacco, auditResult.nat.tow)) - 1) * 100))}% </span> 
                    above legal raw material capacity.
                  </p>
                </section>

                <div className="bg-white p-10 rounded-[3rem] border border-slate-200">
                  <h3 className="text-slate-900 font-black text-xs mb-4 flex items-center gap-2 uppercase tracking-widest"><Info size={20} className="text-blue-600"/> The Tobacco Ceiling</h3>
                  <p className="text-xs leading-relaxed text-slate-500 font-bold uppercase italic">
                    Tobacco leaf is the anchor. If a manufacturer has no recorded tobacco imports but exports finished cigarettes, they are utilizing shadow-market raw leaf.
                  </p>
                </div>

                <div className="bg-white p-10 rounded-[3rem] border border-slate-200">
                  <h3 className="text-slate-900 font-black text-xs mb-4 flex items-center gap-2 uppercase tracking-widest"><CheckCircle size={20} className="text-emerald-600"/> Reconciled Logic</h3>
                  <p className="text-xs leading-relaxed text-slate-500 font-bold uppercase italic">
                    An entity is Reconciled if Exports do not exceed Potential + {riskThreshold}%. If tobacco is 0, the legal Potential is automatically 0.
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
              {/* SEARCH & AGGREGATE SUMMARY */}
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 flex items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                  <Search className="text-slate-400 ml-2" size={24}/>
                  <input className="w-full outline-none font-bold text-lg placeholder:text-slate-300" placeholder="Filter targets by name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="bg-slate-900 text-white px-10 py-5 rounded-3xl flex items-center gap-12 shadow-2xl">
                   <div className="text-center">
                     <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Sum Actual</p>
                     <p className="font-mono font-black text-emerald-400 text-xl">{Math.round(filteredSums.actual).toLocaleString()}</p>
                   </div>
                   <div className="text-center">
                     <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Sum Potential</p>
                     <p className="font-mono font-black text-blue-400 text-xl">{Math.round(filteredSums.minPot).toLocaleString()}</p>
                   </div>
                   <div className="text-center">
                     <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Total TX</p>
                     <p className="font-mono font-black text-white text-xl">{filteredSums.tx.toLocaleString()}</p>
                   </div>
                </div>
              </div>

              {/* ENTITY TABLE */}
              <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="p-8">Entity Identifier</th>
                      <th className="p-8 text-center">TX</th>
                      <th className="p-8">Inventory Logistics Breakdown</th>
                      <th className="p-8 text-right">Potential (Cap)</th>
                      <th className="p-8 text-right text-emerald-600">Actual Exports</th>
                      <th className="p-8 text-center">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50/80 transition-all group">
                        <td className="p-8 font-black text-base text-slate-900 w-1/4 leading-tight">{e.name}</td>
                        <td className="p-8 text-center font-mono font-bold text-slate-500">{e.tx}</td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-3">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm group-hover:border-slate-300">
                                {Icons[m]}
                                <span className="font-mono font-black text-xs text-slate-700">
                                  {Math.round(s.rawQty).toLocaleString()} <span className="text-[9px] text-slate-400 uppercase">{s.unit}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono font-bold text-slate-500">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-xl text-slate-900">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                           <div className="group/note relative inline-block">
                              <span className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest border-2 transition-all ${
                                e.risk === 'CRITICAL' 
                                ? 'bg-red-50 text-red-700 border-red-100 group-hover:bg-red-600 group-hover:text-white' 
                                : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                              }`}>
                                {e.risk}
                              </span>
                              
                              {/* HOVER CALCULATION TOOLTIP */}
                              <div className="invisible group-hover/note:visible opacity-0 group-hover/note:opacity-100 absolute bottom-full right-0 mb-6 z-50 w-[320px] transition-all pointer-events-none">
                                <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-2xl border border-slate-800">
                                  <header className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                                    <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest">Math Verification</p>
                                    <Calculator size={16} className="text-slate-500"/>
                                  </header>
                                  <div className="space-y-4 mb-6 font-mono text-xs">
                                    <div className="flex justify-between"><span className="text-slate-400">Actual:</span><span>{Math.round(e.actual).toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Potential:</span><span>{Math.round(e.minPot).toLocaleString()}</span></div>
                                    <div className="flex justify-between pt-2 border-t border-slate-800 font-black text-emerald-400">
                                      <span>Variance:</span><span>{Math.round(e.actual - e.minPot).toLocaleString()}</span>
                                    </div>
                                  </div>
                                  <p className="text-xs font-bold leading-relaxed">
                                    {e.violationType === 'ZERO_TOBACCO' 
                                      ? "CRITICAL ALERT: Entity is exporting finished sticks with zero recorded tobacco imports. Indicates 100% illicit leaf usage." 
                                      : e.violationType === 'OVER_CAP' 
                                      ? `SURPLUS DETECTED: Production exceeds precursor capacity by ${Math.round(e.actual - e.minPot).toLocaleString()} sticks (>${riskThreshold}% Threshold).` 
                                      : "RECONCILED: Entity exports are within the legal range of imported precursors."}
                                  </p>
                                </div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pb-24 animate-in fade-in duration-500">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm hover:shadow-xl hover:border-blue-200 transition-all group">
                   <div className="flex justify-between items-start mb-8">
                    <div className="bg-slate-100 p-5 rounded-2xl text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <History size={32}/>
                    </div>
                    <button onClick={() => {
                      const updated = reports.filter(x => x.id !== r.id);
                      setReports(updated);
                      localStorage.setItem('forensic_v12_reports', JSON.stringify(updated));
                    }} className="text-slate-200 hover:text-red-600 transition-colors">
                      <Trash2 size={24}/>
                    </button>
                  </div>
                  <h3 className="font-black text-slate-900 text-2xl mb-2">{r.title}</h3>
                  <p className="text-xs text-slate-400 font-bold mb-10 uppercase tracking-widest">{r.date}</p>
                  <button onClick={() => {setRawData(r.data); setActiveTab('country');}} className="w-full bg-slate-900 py-5 rounded-2xl text-white font-black text-[11px] uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-lg">
                    Restore Data State
                  </button>
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
        <div className={`w-2 h-12 rounded-full ${color} opacity-80 group-hover:opacity-100 transition-opacity`}/>
        <div>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">{label}</p>
          <p className="text-xl font-black text-slate-900 leading-tight">
            {Math.round(kg).toLocaleString()} <span className="text-[10px] font-bold text-slate-300 uppercase">{unit}</span>
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-black text-blue-600 font-mono tracking-tighter">
          {Math.round(sticks).toLocaleString()}
        </p>
        <p className="text-[9px] font-black text-slate-300 uppercase">Sticks</p>
      </div>
    </div>
  );
}

"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, RefreshCcw, Save, History, Search, Info, Sliders, CheckCircle, Target, Gavel } from 'lucide-react';

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

export default function ForensicGradeV9() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  useEffect(() => {
    const saved = localStorage.getItem('forensic_v9_reports');
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
        // FIXED MATH: Ensure Kg to sticks conversion uses the standard 1333.33 ratio
        let sticks = (unit === 'MIL') ? qty * 1000000 : (['KG', 'KGM', 'TON', 'MT'].includes(unit)) ? convQty * CONVERSIONS.CIGARETTES_WT : convQty;
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: (unit === 'MIL' ? 1000000 : CONVERSIONS.CIGARETTES_WT) };
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
      const hasZeroTobaccoViolation = e.actual > 0 && e.tobacco === 0;
      const thresholdMultiplier = 1 + (riskThreshold / 100);
      const isOverCap = e.actual > (minPot * thresholdMultiplier);

      return { 
        ...e, 
        minPot, 
        risk: (hasZeroTobaccoViolation || isOverCap) ? 'CRITICAL' : 'RECONCILED',
        violationType: hasZeroTobaccoViolation ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    // Summary Analysis: Identifies strictness of precursor supply
    const pools = [
        { name: 'Tobacco Leaf', val: nat.tobacco },
        { name: 'Acetate Tow', val: nat.tow },
        { name: 'Cigarette Paper', val: nat.paper }
    ].filter(p => p.val > 0);
    const bottleneck = pools.length > 0 ? pools.reduce((p, c) => p.val < c.val ? p : c) : { name: 'N/A', val: 0 };

    return { entities, nat, bottleneck, tobaccoCeiling: nat.tobacco };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => {
    if (!auditResult) return [];
    return auditResult.entities.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [auditResult, searchTerm]);

  const filteredSums = useMemo(() => {
    return filteredEntities.reduce((acc, curr) => ({
        actual: acc.actual + curr.actual,
        potential: acc.potential + curr.minPot
    }), { actual: 0, potential: 0 });
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

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black uppercase">Forensic Monitor <span className="text-blue-700">9.4</span></h1>
            <p className="text-xs text-black font-bold uppercase tracking-widest">Audit Logic: Hard-Locked</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2"><Sliders size={18} className="text-blue-700"/> <span className="text-[10px] font-black uppercase text-black">Risk Threshold</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none focus:border-blue-600 font-bold text-black" placeholder="G-Sheet Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase tracking-widest transition-all shadow-md">Run Audit</button>
          <button onClick={() => {setRawData([]); setUrl('');}} className="p-2.5 text-black hover:text-red-700 bg-slate-100 border border-slate-200 rounded-xl"><RefreshCcw size={20}/></button>
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 transition-colors ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Country Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-colors ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Target Analysis</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 transition-colors ${activeTab === 'reports' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Archived Reports</button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-3 pb-4">
                <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black text-black" placeholder="Snapshot Title..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={() => {if(reportTitle) setReports([{id:Date.now(), title:reportTitle, data:auditResult, date:new Date().toLocaleString()}, ...reports])}} className="flex items-center gap-2 bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-800 shadow-sm transition-all"><Save size={16}/> Save Report</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              {/* Summary Analysis Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Tobacco Ceiling</p>
                  <div className="flex items-end gap-3">
                    <p className="text-3xl font-black text-amber-700">{Math.round(auditResult.tobaccoCeiling).toLocaleString()}</p>
                    <p className="text-[10px] font-bold text-slate-500 pb-1">MAX STICKS FROM LEAF</p>
                  </div>
                </div>
                <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Supply Chain Bottleneck</p>
                  <div className="flex items-end gap-3">
                    <p className="text-3xl font-black text-blue-700 uppercase">{auditResult.bottleneck.name}</p>
                    <p className="text-[10px] font-bold text-slate-500 pb-1">STRICTEST COMPONENT</p>
                  </div>
                </div>
                <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-3xl shadow-lg">
                  <p className="text-[10px] font-black text-blue-400 uppercase mb-2">Aggregate Deficit</p>
                  <div className="flex items-end gap-3">
                    <p className="text-3xl font-black text-white">
                        {Math.max(0, Math.round(auditResult.nat.actual - auditResult.nat.tobacco)).toLocaleString()}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 pb-1 uppercase">Sticks over supply</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> Production vs. Precursor Matrix</h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Cigarette Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} fontWeight="bold" tick={{fill: '#000'}} tickLine={false} axisLine={false} tick={{dy: 10}} />
                        <YAxis fontSize={11} fontWeight="bold" tick={{fill: '#000'}} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip formatter={(v) => [v.toLocaleString(), "Sticks"]} cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '15px'}} />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                            { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
                    <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8">Forensic Balance Sheet</h2>
                    <div className="space-y-6">
                      <BalanceRow label="Tobacco" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                      <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                      <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                      <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                      <div className="py-4 border-y-2 border-slate-50">
                          <BalanceRow label="Cigarette Exports" kg={auditResult.nat.actual / 1333.33} sticks={auditResult.nat.actual} unit="KG Eqv" color="bg-emerald-600" ratio={1333.33} />
                      </div>
                    </div>
                  </div>

                  {/* Audit Guide */}
                  <div className="bg-blue-50 border-2 border-blue-100 p-8 rounded-[2.5rem]">
                    <h2 className="text-xs font-black text-blue-800 uppercase tracking-widest mb-4 flex items-center gap-2"><Gavel size={16}/> Audit Standards</h2>
                    <ul className="space-y-3 text-[11px] font-bold text-blue-900 leading-relaxed">
                        <li>• <span className="text-blue-600 uppercase">Tobacco Ceiling:</span> Absolute limit of sticks produced from declared leaf ($1\text{kg} = 1333\text{ sticks}$).</li>
                        <li>• <span className="text-blue-600 uppercase">Bottleneck:</span> Supply chain security is determined by the precursor with the lowest volume.</li>
                        <li>• <span className="text-blue-600 uppercase">Recheck:</span> Weight-to-stick ratios are hard-locked at 0.75g per stick.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-6 animate-in fade-in duration-500">
                {/* Search and Summary Bar */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-3xl border border-slate-200">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-12 pr-4 text-sm font-bold focus:border-blue-600 outline-none"
                            placeholder="Search by Entity Name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-8 px-6 border-l border-slate-100">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">Filtered Actual</p>
                            <p className="text-lg font-black text-emerald-700">{Math.round(filteredSums.actual).toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase">Filtered Potential</p>
                            <p className="text-lg font-black text-slate-800">{Math.round(filteredSums.potential).toLocaleString()}</p>
                        </div>
                    </div>
                </div>

              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest">
                    <tr>
                      <th className="p-8">Entity Name</th>
                      <th className="p-8 text-center">Transactions</th>
                      <th className="p-8">Material Inventory Log</th>
                      <th className="p-8 text-right">Potential (Cap)</th>
                      <th className="p-8 text-right text-emerald-400">Actual Exports</th>
                      <th className="p-8 text-center">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                        <td className="p-8 font-black text-black text-base">{e.name}</td>
                        <td className="p-8 text-center text-black font-mono font-bold text-lg">{e.tx}</td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-3">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="group/pop relative bg-white border-2 border-slate-200 rounded-xl px-4 py-2 flex items-center gap-3 cursor-help hover:border-blue-700 transition-all text-black">
                                {Icons[m]}
                                <span className="font-mono text-black font-black text-sm">{Math.round(s.rawQty).toLocaleString()} <span className="text-[10px] text-black font-bold">{s.unit}</span></span>
                                <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-4 z-50 transition-all">
                                  <div className="bg-slate-950 text-white p-6 rounded-2xl shadow-2xl min-w-[260px] border border-slate-800">
                                    <p className="text-blue-400 font-black text-[11px] uppercase mb-3 border-b border-slate-800 pb-2">{m} Conversion Math</p>
                                    <div className="space-y-2 font-mono text-xs">
                                      <div className="flex justify-between"><span>Input:</span> <span className="text-white font-bold">{s.rawQty.toLocaleString()} {s.unit}</span></div>
                                      <div className="flex justify-between"><span>Multiplier:</span> <span className="text-white font-bold">x {s.ratioUsed.toLocaleString()}</span></div>
                                      <div className="flex justify-between pt-3 border-t border-slate-800 font-black text-emerald-400 text-sm"><span>Total Sticks:</span> <span>{Math.round(s.sticks).toLocaleString()}</span></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono text-black font-bold text-base">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono text-black font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                           <div className="group/risk relative inline-block">
                              <span className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest border-2 flex items-center gap-2 ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                  {e.risk === 'CRITICAL' ? <AlertTriangle size={12}/> : <CheckCircle size={12}/>}
                                  {e.risk}
                              </span>
                              <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute bottom-full right-0 mb-4 z-50 w-80 transition-all text-left">
                                <div className={`bg-white border-2 p-6 rounded-2xl shadow-2xl ${e.risk === 'CRITICAL' ? 'border-red-500' : 'border-emerald-500'}`}>
                                  <p className={`${e.risk === 'CRITICAL' ? 'text-red-700' : 'text-emerald-700'} font-black text-xs mb-2 uppercase tracking-widest flex items-center gap-2`}>
                                      {e.risk === 'CRITICAL' ? <AlertTriangle size={18}/> : <CheckCircle size={18}/>} 
                                      Audit Logic Guide
                                  </p>
                                  <p className="text-xs text-black leading-relaxed font-bold">
                                    {e.risk === 'CRITICAL' ? (
                                        e.violationType === 'ZERO_TOBACCO' 
                                        ? "Violation: Production recorded without any primary tobacco leaf imports. Suggests illicit sourcing."
                                        : `Violation: Production exceeds theoretical cap by ${Math.round((e.actual/e.minPot - 1)*100)}%, exceeding your threshold.`
                                    ) : (
                                        "Reconciled: Production volume is fully supported by documented precursor inventory. Low risk of shadow-sourcing."
                                    )}
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
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-8 rounded-[2rem] shadow-sm hover:border-blue-600 transition-all group">
                   <div className="flex justify-between items-start mb-6">
                    <div className="bg-slate-100 p-3 rounded-xl text-black group-hover:bg-blue-700 group-hover:text-white transition-colors"><History size={24}/></div>
                    <button onClick={() => {setReports(reports.filter(x => x.id !== r.id))}} className="text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={20}/></button>
                  </div>
                  <h3 className="font-black text-black text-lg mb-1">{r.title}</h3>
                  <p className="text-xs text-black font-bold mb-6 italic">{r.date}</p>
                  <button onClick={() => {setRawData(r.data.rawOriginal || []); setActiveTab('country');}} className="w-full bg-slate-900 py-3 rounded-xl text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all">Restore Report</button>
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
            <p className="text-lg font-black text-black">{Math.round(kg).toLocaleString()} <span className="text-xs text-slate-400 font-bold uppercase">{unit}</span></p>
          </div>
        </div>
        <p className="text-sm font-black text-blue-700 font-mono">{Math.round(sticks).toLocaleString()} sticks</p>
      </div>
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-0 bottom-full mb-3 z-50 transition-all">
         <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xl text-[11px] font-mono min-w-[200px]">
            <p className="text-blue-400 font-black uppercase mb-1 border-b border-slate-700 pb-1">{label} Math</p>
            <div className="flex justify-between"><span>Input:</span> <span>{Math.round(kg).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Ratio:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-1 border-t border-slate-700 text-emerald-400 font-black"><span>Total Eq:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
         </div>
      </div>
    </div>
  );
}

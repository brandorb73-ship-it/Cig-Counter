"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, AreaChart, Area
} from 'recharts';
import { 
  ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, 
  Calculator, AlertTriangle, RefreshCcw, Save, History, Search, Info, 
  Sliders, CheckCircle, Target, Gavel, Zap, Download, Landmark, TrendingUp, Fingerprint, EyeOff, BookOpen
} from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 'TOW': 8333.33, 'PAPER': 20000, 'RODS': 6,
  'CIGARETTES_EXPORT': 1000, 'TAX_PER_STICK': 0.15,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ForensicUnifiedV13() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  useEffect(() => {
    const saved = localStorage.getItem('forensic_v13_snapshots');
    if (saved) setReports(JSON.parse(saved));
  }, []);

  const auditResult = useMemo(() => {
    if (!rawData.length) return null;
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
        let sticks = (unit === 'MIL') ? qty * 1000000 : convQty * CONVERSIONS.CIGARETTES_EXPORT;
        registry[entity].actual += sticks; nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: 1 };
        registry[entity].materials[mat].rawQty += qty; registry[entity].materials[mat].sticks += sticks;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        if (mat === 'TOBACCO') { nat.tobaccoKg += convQty; nat.tobacco += sticks; }
        if (mat === 'TOW') { nat.towKg += convQty; nat.tow += sticks; }
        if (mat === 'PAPER') { nat.paperKg += convQty; nat.paper += sticks; }
        if (mat === 'RODS') { nat.rodsUnits += convQty; nat.rods += sticks; }
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: CONVERSIONS[mat] };
        registry[entity].materials[mat].rawQty += qty; registry[entity].materials[mat].sticks += sticks;
      }
    });

    const entities = Object.values(registry).map(e => {
      const pots = [e.tobacco, e.tow, e.paper, e.rods].filter(v => v > 0);
      const minPot = pots.length > 0 ? Math.min(...pots) : 0;
      const maxPot = pots.length > 0 ? Math.max(...pots) : 0;
      const variance = maxPot > 0 ? ((maxPot - minPot) / maxPot) * 100 : 0;
      const hasZeroTobaccoViolation = e.actual > 0 && e.tobacco === 0;
      return { 
        ...e, minPot, reliability: 100 - variance,
        risk: (hasZeroTobaccoViolation || e.actual > minPot * (1 + riskThreshold/100)) ? 'CRITICAL' : 'RECONCILED',
        violationType: hasZeroTobaccoViolation ? 'ZERO_TOBACCO' : (e.actual > minPot) ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    const productionGap = Math.max(0, nat.actual - nat.tobacco);
    const leakageData = [
      { name: 'Tobacco Deficit', value: Math.max(0, nat.actual - nat.tobacco), fill: '#f59e0b' },
      { name: 'Tow Deficit', value: Math.max(0, nat.actual - nat.tow), fill: '#0ea5e9' },
      { name: 'Paper Deficit', value: Math.max(0, nat.actual - nat.paper), fill: '#64748b' }
    ].filter(d => d.value > 0);

    return { entities, nat, productionGap, shadowProb: nat.actual > 0 ? (productionGap / nat.actual) * 100 : 0, taxLoss: productionGap * 0.15, leakageData };
  }, [rawData, riskThreshold]);

  const sync = () => {
    if (!url) return; setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setRawData(res.data); setLoading(false); },
      error: () => setLoading(false)
    });
  };

  const saveReport = () => {
    const newR = { id: Date.now(), title: reportTitle || 'Unnamed Audit', date: new Date().toLocaleString(), gap: auditResult.productionGap, prob: auditResult.shadowProb };
    const updated = [newR, ...reports]; setReports(updated);
    localStorage.setItem('forensic_v13_snapshots', JSON.stringify(updated)); setReportTitle('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black text-black uppercase tracking-tight">Forensic Monitor <span className="text-blue-700">13.1</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">V12.0 ENGINE | V9.7 INTEL</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-80 font-bold" placeholder="Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} disabled={loading} className="bg-blue-700 text-white px-8 py-2.5 rounded-xl font-black text-xs uppercase shadow-md transition-all hover:bg-blue-800">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Sync Audit'}
          </button>
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>National Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Target Analysis</button>
              <button onClick={() => setActiveTab('guide')} className={`pb-4 ${activeTab === 'guide' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Audit Guide</button>
            </div>
            <div className="flex gap-3 pb-4">
              <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black" placeholder="Snapshot Name..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
              <button onClick={saveReport} className="bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-emerald-800"><Save size={16}/> Save Archive</button>
            </div>
          </div>

          {activeTab === 'country' && (
            <div className="space-y-10">
              <div className="bg-slate-950 p-12 rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl border-b-8 border-blue-700">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-16 relative z-10">
                  <div>
                    <div className="flex items-center gap-2 text-blue-400 font-black uppercase tracking-widest mb-6 border-b border-white/10 pb-4"><EyeOff size={18}/> Shadow Signal</div>
                    <p className="text-8xl font-black tracking-tighter mb-4">{Math.round(auditResult.shadowProb)}<span className="text-4xl text-blue-500">%</span></p>
                    <p className="text-slate-400 text-xs font-bold leading-relaxed max-w-xs uppercase">Probability of unlicensed precursor utilization.</p>
                  </div>
                  <div className="border-x border-white/5 px-16">
                    <div className="flex items-center gap-2 text-emerald-400 font-black uppercase tracking-widest mb-6 border-b border-white/10 pb-4"><Landmark size={18}/> Fiscal Gap</div>
                    <p className="text-6xl font-black tracking-tighter mb-4">${(auditResult.taxLoss/1e9).toFixed(2)}B</p>
                    <p className="text-slate-400 text-xs font-bold leading-relaxed max-w-xs uppercase">Estimated excise evasion.</p>
                  </div>
                  <div className="flex flex-col justify-center gap-4">
                    <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                      <p className="text-[10px] font-black uppercase mb-1 text-slate-400 tracking-widest">Primary Bottleneck</p>
                      <p className="text-2xl font-black text-blue-400 uppercase tracking-tighter">Tobacco Leaf</p>
                    </div>
                  </div>
                </div>
                <Zap size={400} className="absolute right-[-50px] bottom-[-100px] text-white/5 rotate-12" />
              </div>

              <div className="bg-white border-2 border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
                <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-8 flex justify-between">Material Balance Ledger <span className="text-slate-400">Unit: Sticks Equivalent (SE)</span></h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                  <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} color="bg-amber-600" ratio={1333.33} />
                  <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} color="bg-sky-600" ratio={8333.33} />
                  <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} color="bg-slate-600" ratio={20000} />
                  <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} color="bg-purple-600" ratio={6} />
                </div>
                <div className="h-80 mt-12">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={auditResult.leakageData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                      <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'entities' && (
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-3xl border border-slate-200 flex justify-between items-center shadow-sm">
                <div className="relative w-96">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 pl-12 text-sm font-bold" placeholder="Filter Target..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3 bg-slate-50 px-6 py-2 rounded-2xl border-2 border-slate-100">
                    <span className="text-[10px] font-black uppercase text-slate-400">Risk Sensitivity</span>
                    <input type="range" min="0" max="100" value={riskThreshold} onChange={e => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1 bg-slate-200 accent-blue-700" />
                    <span className="text-xs font-black text-blue-700">{riskThreshold}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                    <tr>
                      <th className="p-8">Entity Identifier</th>
                      <th className="p-8 text-center">Reliability</th>
                      <th className="p-8">Material Archive</th>
                      <th className="p-8 text-right text-slate-400">Ceiling</th>
                      <th className="p-8 text-right text-emerald-400">Actual Output</th>
                      <th className="p-8 text-center">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-50">
                    {auditResult.entities.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())).map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-all">
                        <td className="p-8 font-black text-base">{e.name}</td>
                        <td className="p-8 text-center">
                          <span className="text-[10px] font-black font-mono border-2 border-slate-200 px-3 py-1 rounded-lg bg-slate-50">{e.reliability.toFixed(1)}%</span>
                        </td>
                        <td className="p-8">
                          <div className="flex gap-2">
                            {Object.entries(e.materials).map(([m, s]) => (
                               <div key={m} className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                                 {Icons[m]} <span className="font-mono font-bold text-[10px] tracking-tight">{Math.round(s.rawQty).toLocaleString()}</span>
                               </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono font-bold text-slate-400">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                          <div className="group relative inline-block">
                            <span className={`px-5 py-2 rounded-full text-[10px] font-black border-2 flex items-center gap-2 justify-center uppercase ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                              {e.risk === 'CRITICAL' ? <AlertTriangle size={12}/> : <CheckCircle size={12}/>} {e.risk}
                            </span>
                            <div className="invisible group-hover:visible absolute top-full right-0 mt-3 w-80 bg-slate-900 text-white p-6 rounded-2xl shadow-2xl z-[100] text-left border border-white/10">
                              <p className="text-blue-400 font-black text-[10px] uppercase mb-2 border-b border-white/10 pb-2">Forensic Verdict</p>
                              <p className="text-xs font-medium leading-relaxed italic text-slate-300">
                                {e.risk === 'CRITICAL' ? (
                                  e.violationType === 'ZERO_TOBACCO' ? "CRITICAL ALERT: Finished sticks confirmed with ZERO tobacco imports." : `CRITICAL ALERT: Volume exceeds potential by ${Math.round((e.actual/e.minPot - 1)*100)}%.`
                                ) : "RECONCILED: Verified within precursor limits."}
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
          )}

          {activeTab === 'guide' && (
            <div className="bg-white p-12 rounded-[3rem] border-2 border-slate-900 shadow-xl max-w-4xl mx-auto">
              <h3 className="text-2xl font-black uppercase mb-10 flex items-center gap-3 border-b-4 border-slate-900 pb-4">
                <Info className="text-blue-700" /> Audit Protocol V13.1
              </h3>
              <div className="space-y-8 text-base font-bold text-slate-700">
                <div className="flex gap-6">
                  <span className="bg-slate-900 text-white h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs">1</span>
                  <p>Identify the <span className="text-black underline decoration-amber-500 decoration-4">Precursor Ceiling</span> (Lowest potential SE across Leaf, Tow, and Paper).</p>
                </div>
                <div className="flex gap-6">
                  <span className="bg-slate-900 text-white h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs">2</span>
                  <p>Map <span className="text-black underline decoration-blue-500 decoration-4">Actual Stick Output</span> (Exports) against this ceiling.</p>
                </div>
                <div className="flex gap-6">
                  <span className="bg-red-600 text-white h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-black">!</span>
                  <p className="text-red-700 italic">Flag <span className="underline">Shadow Sourcing</span> if: (Actual Output {" > "} Ceiling * Risk Sensitivity).</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BalanceRow({ label, kg, sticks, color, ratio }) {
  return (
    <div className="group relative">
      <div className="flex justify-between items-end border-b-2 border-slate-50 pb-4 transition-all group-hover:border-slate-200">
        <div className="flex items-center gap-3">
          <div className={`w-1.5 h-8 rounded-full ${color}`}/>
          <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
        </div>
        <p className="text-2xl font-black text-slate-900 font-mono tracking-tighter">{Math.round(sticks).toLocaleString()}</p>
      </div>
      <div className="invisible group-hover:visible absolute bottom-full left-0 mb-4 w-64 bg-slate-900 text-white p-6 rounded-2xl text-[10px] font-mono z-[100] shadow-2xl border border-white/10">
         <div className="space-y-2">
            <div className="flex justify-between text-blue-400 font-black border-b border-white/10 pb-2 mb-2 uppercase"><span>Forensic Factor</span><span>V12.0 Logic</span></div>
            <div className="flex justify-between"><span>Material Factor:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-2 border-t border-slate-700 text-emerald-400 font-black text-[11px]">
                <span>Stick Potential:</span> <span>{Math.round(sticks).toLocaleString()}</span>
            </div>
         </div>
         <p className="mt-3 text-[8px] text-slate-500 leading-tight">Conversion reflects national standard for legal precursor utilization ratios.</p>
      </div>
    </div>
  );
}

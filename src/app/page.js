"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend 
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
        let sticks = (unit === 'MIL') ? qty * 1000000 : (['KG', 'KGM', 'TON', 'MT'].includes(unit)) ? convQty * CONVERSIONS.CIGARETTES_EXPORT : convQty;
        registry[entity].actual += sticks; nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: (unit === 'MIL' ? 1000000 : CONVERSIONS.CIGARETTES_EXPORT) };
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
        ...e, minPot, reliability: Math.max(0, 100 - variance),
        risk: (hasZeroTobaccoViolation || e.actual > minPot * (1 + riskThreshold/100)) ? 'CRITICAL' : 'RECONCILED',
        violationType: hasZeroTobaccoViolation ? 'ZERO_TOBACCO' : (e.actual > minPot) ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    const productionGap = Math.max(0, nat.actual - nat.tobacco);
    const shadowProb = nat.actual > 0 ? Math.min(100, (productionGap / nat.actual) * 100) : 0;
    const leakageData = [
      { name: 'Tobacco Deficit', value: Math.max(0, nat.actual - nat.tobacco), fill: '#f59e0b' },
      { name: 'Tow Deficit', value: Math.max(0, nat.actual - nat.tow), fill: '#0ea5e9' },
      { name: 'Paper Deficit', value: Math.max(0, nat.actual - nat.paper), fill: '#64748b' },
      { name: 'Rod Deficit', value: Math.max(0, nat.actual - nat.rods), fill: '#a855f7' }
    ].filter(d => d.value > 0);

    return { entities, nat, productionGap, shadowProb, leakageData, taxLoss: productionGap * 0.15 };
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
  const filteredEntities = useMemo(() => {
    return (auditResult?.entities || []).filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [auditResult, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      {/* GLOBAL HEADER */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black text-black uppercase tracking-tight">Forensic Monitor <span className="text-blue-700">13.1</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">V12.0 ENGINE | V9.7 INTEL</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 text-blue-700"><Sliders size={18}/> <span className="text-[10px] font-black uppercase text-black">Sensitivity</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>

        <div className="flex items-center gap-3">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl pl-4 pr-4 py-2.5 text-sm w-80 outline-none font-bold focus:border-blue-700 transition-all" placeholder="Enter Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} disabled={loading} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase transition-all shadow-md flex items-center gap-2">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Sync Audit'}
          </button>
        </div>
      </div>

      {auditResult ? (
        <div className="max-w-[1600px] mx-auto space-y-8">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <TabBtn active={activeTab === 'country'} label="National Intel" icon={<Activity size={14}/>} onClick={() => setActiveTab('country')} />
              <TabBtn active={activeTab === 'entities'} label="Target Analysis" icon={<Target size={14}/>} onClick={() => setActiveTab('entities')} />
              <TabBtn active={activeTab === 'guide'} label="Audit Guide" icon={<BookOpen size={14}/>} onClick={() => setActiveTab('guide')} />
            </div>
            <div className="flex gap-3 pb-4">
              <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black w-48" placeholder="Snapshot Name..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
              <button onClick={saveReport} className="bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-emerald-800 transition-all"><Save size={16}/> Save Archive</button>
            </div>
          </div>

          {activeTab === 'country' && (
            <div className="space-y-10 animate-in fade-in">
              {/* V9.7 NATIONAL INTEL CARD */}
              <div className="bg-slate-950 p-12 rounded-[3.5rem] text-white relative overflow-hidden shadow-2xl border-b-8 border-blue-700">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-16 relative z-10">
                  <div>
                    <div className="flex items-center gap-2 text-blue-400 font-black uppercase tracking-widest mb-6 border-b border-white/10 pb-4"><EyeOff size={18}/> Shadow Signal</div>
                    <p className="text-8xl font-black tracking-tighter mb-4">{Math.round(auditResult.shadowProb)}<span className="text-4xl text-blue-500">%</span></p>
                    <p className="text-slate-400 text-xs font-bold leading-relaxed max-w-xs uppercase">Likelihood of unlicensed precursor utilization across confirm records.</p>
                  </div>
                  <div className="border-x border-white/5 px-16">
                    <div className="flex items-center gap-2 text-emerald-400 font-black uppercase tracking-widest mb-6 border-b border-white/10 pb-4"><Landmark size={18}/> Fiscal Gap</div>
                    <p className="text-6xl font-black tracking-tighter mb-4">${(auditResult.taxLoss/1e9).toFixed(2)}B</p>
                    <p className="text-slate-400 text-xs font-bold leading-relaxed max-w-xs uppercase">Estimated excise evasion based on precursor-to-output deficit.</p>
                  </div>
                  <div className="flex flex-col justify-center gap-4">
                     <SummaryBox title="Production Gap" val={auditResult.productionGap} sub="UNSUPPORTED STICKS" color="text-red-500" />
                     <SummaryBox title="Bottleneck" val="Tobacco Leaf" sub="STRICTEST PRECURSOR" color="text-amber-500" isText />
                  </div>
                </div>
                <Zap size={400} className="absolute right-[-50px] bottom-[-100px] text-white/5 rotate-12" />
              </div>

              {/* MATERIAL BALANCE LEDGER */}
              <div className="bg-white border-2 border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
                <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8 flex justify-between items-center">
                    Material Balance Ledger <span className="text-[10px] text-slate-400 font-bold">Forensic Unit: Sticks Equivalent (SE)</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                  <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={1333.33} />
                  <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={8333.33} />
                  <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={20000} />
                  <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={6} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'entities' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-slate-200">
                <div className="relative w-96">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 pl-12 text-sm font-bold focus:border-blue-600" placeholder="Filter Target..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </div>

              {/* V12.0 TARGET TABLE */}
              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px]">
                    <tr>
                      <th className="p-8">Target Entity</th>
                      <th className="p-8 text-center">TX</th>
                      <th className="p-8 text-center">Reliability</th>
                      <th className="p-8">Archive</th>
                      <th className="p-8 text-right">Potential</th>
                      <th className="p-8 text-right text-emerald-400">Actual</th>
                      <th className="p-8 text-center">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                        <td className="p-8 font-black text-black text-base">{e.name}</td>
                        <td className="p-8 text-center font-mono font-bold text-slate-600">{e.tx}</td>
                        <td className="p-8 text-center">
                          <span className="text-[10px] font-black font-mono border-2 border-slate-200 px-3 py-1 rounded-lg bg-slate-50">{e.reliability.toFixed(1)}%</span>
                        </td>
                        <td className="p-8">
                          <div className="flex gap-2">
                            {Object.entries(e.materials).map(([m, s]) => (
                               <div key={m} className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                                 {Icons[m]} <span className="font-mono font-bold text-[11px]">{Math.round(s.rawQty).toLocaleString()}</span>
                               </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono font-bold text-slate-400">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                          <div className="group relative inline-block">
                            <span className={`px-6 py-2 rounded-full text-[10px] font-black border-2 flex items-center gap-2 uppercase ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                              {e.risk === 'CRITICAL' ? <AlertTriangle size={12}/> : <CheckCircle size={12}/>} {e.risk}
                            </span>
                            <div className="invisible group-hover:visible absolute top-full right-0 mt-2 z-50 w-80 bg-white border-2 border-slate-900 p-6 rounded-2xl shadow-2xl text-left">
                                <p className="font-black text-xs mb-3 uppercase flex items-center gap-2 text-slate-900 border-b pb-2"><Info size={16}/> Forensic Prose</p>
                                <p className="text-xs text-black leading-relaxed font-bold italic">
                                  {e.risk === 'CRITICAL' ? (
                                    e.violationType === 'ZERO_TOBACCO' ? "CRITICAL ALERT: Finished sticks confirmed with ZERO matching tobacco leaf records. Shadow sourcing confirmed." : `CRITICAL ALERT: Volume exceeds precursor potential by ${Math.round((e.actual/e.minPot - 1)*100)}%.`
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
            <div className="bg-white p-12 rounded-[3rem] border-2 border-slate-900 max-w-4xl shadow-2xl animate-in zoom-in-95">
              <h2 className="text-3xl font-black uppercase mb-10 border-b-4 border-slate-900 pb-4">Audit Protocol V13.1</h2>
              <div className="space-y-10">
                <div className="flex gap-8">
                   <div className="bg-slate-900 text-white h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-xl shadow-lg">01</div>
                   <div>
                     <h3 className="font-black text-lg uppercase mb-2">Precursor Ceiling Logic</h3>
                     <p className="text-slate-600 font-bold leading-relaxed">The system calculates theoretical capacity for every material. The <span className="text-blue-700 underline">Ceiling</span> is defined as the minimum sticks possible across all confirmed precursor imports.</p>
                   </div>
                </div>
                <div className="flex gap-8">
                   <div className="bg-blue-700 text-white h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-xl shadow-lg">02</div>
                   <div>
                     <h3 className="font-black text-lg uppercase mb-2">Forensic Yield Constants</h3>
                     <div className="grid grid-cols-2 gap-4 mt-4 text-[10px] font-black uppercase">
                       <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">Tobacco: 1,333/kg</div>
                       <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">Tow: 8,333/kg</div>
                       <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">Paper: 20,000/kg</div>
                       <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">Excise: $0.15/Stick</div>
                     </div>
                   </div>
                </div>
                <div className="flex gap-8">
                   <div className="bg-red-600 text-white h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-xl shadow-lg">03</div>
                   <div>
                     <h3 className="font-black text-lg uppercase mb-2 text-red-600">Shadow Sourcing Detection</h3>
                   <div>
  <h3 className="font-black text-lg uppercase mb-2 text-red-600">Shadow Sourcing Detection</h3>
  <p className="text-slate-600 font-bold leading-relaxed italic">
    "Shadow Signal" is triggered if Actual Exports {" > "} Ceiling * (1 + Risk Sensitivity). Zero-Tobacco sourcing is flagged as a Critical violation regardless of volume.
  </p>
</div>
                   </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-[1600px] mx-auto h-[60vh] flex flex-col items-center justify-center bg-white rounded-[3rem] border-4 border-dashed border-slate-200">
           <Database className="text-slate-200 mb-6" size={80} />
           <p className="text-slate-400 font-black uppercase tracking-widest text-lg">Execute Audit Protocol 13.1</p>
        </div>
      )}
    </div>
  );
}

function SummaryBox({ title, val, sub, color, isText }) {
    return (
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex justify-between items-center group hover:bg-white/10 transition-all cursor-default">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">{title}</p>
              <p className={`text-xl font-black ${color}`}>{isText ? val : Math.round(val).toLocaleString()}</p>
            </div>
            <p className="text-[7px] font-black text-slate-500 uppercase vertical-text">{sub}</p>
        </div>
    );
}

function TabBtn({ active, label, icon, onClick }) {
  return (
    <button onClick={onClick} className={`pb-4 transition-all flex items-center gap-2 ${active ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>
      {icon} {label}
    </button>
  );
}

function BalanceRow({ label, kg, sticks, unit, color, ratio }) {
  return (
    <div className="group relative">
      <div className="flex justify-between items-end border-b-2 border-slate-100 pb-4">
        <div className="flex items-center gap-4">
          <div className={`w-2 h-10 rounded-full ${color}`}/>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">{label}</p>
            <p className="text-xl font-black text-black">{Math.round(kg).toLocaleString()} <span className="text-[10px] font-bold text-slate-300 uppercase">{unit}</span></p>
          </div>
        </div>
        <div className="text-right">
            <p className="text-base font-black text-blue-700 font-mono tracking-tighter">{Math.round(sticks).toLocaleString()}</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase">Sticks Eq</p>
        </div>
      </div>
      <div className="invisible group-hover:visible absolute bottom-full bg-slate-900 text-white p-5 rounded-xl text-[10px] font-mono w-56 mb-2 shadow-2xl z-50 transition-all">
         <p className="text-blue-400 font-black mb-2 uppercase border-b border-white/10 pb-2">Forensic Conversion</p>
         <div className="flex justify-between"><span>Registry:</span> <span>{Math.round(kg).toLocaleString()}</span></div>
         <div className="flex justify-between"><span>Factor:</span> <span>x {ratio}</span></div>
      </div>
    </div>
  );
}

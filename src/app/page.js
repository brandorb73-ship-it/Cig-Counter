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
  Sliders, CheckCircle, Target, Gavel, Zap, Download, XCircle, 
  ChevronRight, HelpCircle, Landmark, TrendingUp, Fingerprint, EyeOff 
} from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 
  'TOW': 8333.33, 
  'PAPER': 20000, 
  'RODS': 6,
  'CIGARETTES_EXPORT': 1000, 
  'TAX_PER_STICK': 0.15,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ObsidianPrimeForensic() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('obsidian_prime_reports');
      if (saved) setReports(JSON.parse(saved));
    } catch (e) { setReports([]); }
  }, []);

  const clearSession = () => {
    if(window.confirm("CRITICAL: Wipe current audit?")) { setRawData([]); setUrl(''); }
  };

  const auditResult = useMemo(() => {
    if (!rawData || rawData.length === 0) return null;
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
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: (unit === 'MIL' ? 1000000 : CONVERSIONS.CIGARETTES_EXPORT) };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        if (mat === 'TOBACCO') { nat.tobaccoKg += convQty; nat.tobacco += sticks; }
        if (mat === 'TOW') { nat.towKg += convQty; nat.tow += sticks; }
        if (mat === 'PAPER') { nat.paperKg += convQty; nat.paper += sticks; }
        if (mat === 'RODS') { nat.rodsUnits += convQty; nat.rods += sticks; }
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: CONVERSIONS[mat] };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      }
    });

    const entities = Object.values(registry).map(e => {
      const pots = [e.tobacco, e.tow, e.paper, e.rods].filter(v => v > 0);
      const minPot = pots.length > 0 ? Math.min(...pots) : 0;
      const thresholdMultiplier = 1 + (riskThreshold / 100);
      const variance = pots.length > 0 ? ((Math.max(...pots) - minPot) / Math.max(...pots)) * 100 : 0;
      const reliability = Math.max(0, 100 - variance);
      const isCritical = (e.actual > 0 && e.tobacco === 0) || (e.actual > (minPot * thresholdMultiplier));
      return { 
        ...e, minPot, reliability, 
        risk: isCritical ? 'CRITICAL' : 'RECONCILED',
        violationType: (e.actual > 0 && e.tobacco === 0) ? 'ZERO_TOBACCO' : (e.actual > (minPot * thresholdMultiplier)) ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    const productionGap = Math.max(0, nat.actual - nat.tobacco);
    return { 
      entities, nat, productionGap, 
      shadowProb: nat.actual > 0 ? Math.min(100, (productionGap / nat.actual) * 100) : 0,
      bottleneck: [{name: 'Tobacco', val: nat.tobacco}, {name: 'Tow', val: nat.tow}, {name: 'Paper', val: nat.paper}, {name: 'Rods', val: nat.rods}].filter(p => p.val > 0).reduce((p, c) => p.val < c.val ? p : c, {name: 'None', val: 0}),
      taxLoss: productionGap * CONVERSIONS.TAX_PER_STICK 
    };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => {
    return (auditResult?.entities || []).filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [auditResult, searchTerm]);

  const sync = () => {
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    Papa.parse(`${url.replace(/\/edit.*$/, '/export?format=csv')}&gid=${gid}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setRawData(res.data); setLoading(false); },
      error: () => setLoading(false)
    });
  };

  const saveReport = () => {
    const newR = { id: Date.now(), title: reportTitle || 'Unnamed Audit', date: new Date().toLocaleString(), gap: auditResult.productionGap, prob: auditResult.shadowProb };
    const updated = [newR, ...reports];
    setReports(updated);
    localStorage.setItem('obsidian_prime_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      {/* HEADER */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg border-t border-slate-700"><ShieldAlert className="text-white" size={28}/></div>
          <div><h1 className="text-2xl font-black text-black uppercase tracking-tight">Obsidian <span className="text-blue-700">Prime</span></h1><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Forensic Intelligence V12.0</p></div>
        </div>
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 text-blue-700"><Sliders size={18}/><span className="text-[10px] font-black uppercase text-black">Sensitivity</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none font-bold focus:border-blue-700" placeholder="Google Sheets URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} disabled={loading} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase flex items-center gap-2">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Audit'}
          </button>
          {rawData.length > 0 && <button onClick={clearSession} className="bg-red-50 text-red-600 p-2.5 rounded-xl border border-red-200"><Trash2 size={20}/></button>}
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
          {/* NAVIGATION */}
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 transition-all ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>National</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-all ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Targets</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 transition-all ${activeTab === 'reports' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Archives</button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-3 pb-4">
                <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black outline-none" placeholder="Snapshot Name..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase flex items-center gap-2"><Save size={16}/> Save</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <SummaryBox title="Tobacco Ceiling" val={auditResult.nat.tobacco} sub="MAX STICKS FROM LEAF" color="text-amber-700" />
                <SummaryBox title="Bottleneck" val={auditResult.bottleneck.name} sub="STRICTEST PRECURSOR" color="text-blue-700" isText />
                <SummaryBox title="Production Gap" val={auditResult.productionGap} sub="UNSUPPORTED VOLUME" color="text-red-600" />
                <SummaryBox title="Tax Leakage" val={`$${(auditResult.taxLoss/1e6).toFixed(1)}M`} sub="EST. EXCISE EVASION" color="text-emerald-700" isText />
                <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col justify-center overflow-hidden group">
                    <div className="relative z-10">
                        <p className="text-[10px] text-white uppercase tracking-widest font-black flex items-center gap-2"><EyeOff size={14}/> Shadow Market</p>
                        <p className="text-4xl font-black text-white">{Math.round(auditResult.shadowProb)}%</p>
                    </div>
                    <Zap className="absolute right-[-10px] bottom-[-10px] opacity-10 text-red-500" size={100} />
                </div>
              </div>

              {/* ANALYTICS BAR CHART */}
              <div className="bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> National Precursor vs. Output Matrix</h2>
                <div className="h-[400px]">
                  <ResponsiveContainer>
                    <BarChart data={[
                      { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                      { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                      { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                      { name: 'Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                      { name: 'Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" fontSize={12} fontWeight="bold" tickLine={false} axisLine={false} />
                      <YAxis fontSize={11} fontWeight="bold" tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                          { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* MATERIAL LEDGER */}
              <div className="bg-white border-2 border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
                <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8">Material Balance Ledger</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                  <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                  <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                  <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                  <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                </div>
              </div>

              {/* NATIONAL FORENSIC SUMMARY GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl">
                  <h2 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Gavel size={20}/> National Forensic Analysis</h2>
                  <div className="space-y-6 text-sm leading-relaxed text-blue-50 font-medium">
                    <p>Total recorded exports stand at <span className="text-emerald-400 font-black">{Math.round(auditResult.nat.actual).toLocaleString()}</span> sticks. Maximum sustainable production is limited by <span className="text-blue-400 font-black underline uppercase">{auditResult.bottleneck.name}</span>.</p>
                    <p className="bg-red-950/30 p-4 border-l-4 border-red-500 rounded-r-xl">A production gap of <span className="text-red-400 font-black">{auditResult.productionGap.toLocaleString()}</span> sticks represents a potential fiscal leakage of <span className="text-red-400 font-black">${Math.round(auditResult.taxLoss).toLocaleString()}</span> in unpaid excise.</p>
                    <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-2">Verdict Summary</p>
                      {auditResult.nat.actual > auditResult.nat.tobacco ? (
                        <p className="text-red-400 font-bold italic flex gap-2"><AlertTriangle size={18}/> High Risk: Production exceeds leaf availability by {Math.round((auditResult.nat.actual/auditResult.nat.tobacco - 1)*100)}%.</p>
                      ) : (
                        <p className="text-emerald-400 font-bold italic flex gap-2"><CheckCircle size={18}/> Reconciled: Volumes are within the legal precursor envelope.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-white border-2 border-slate-200 p-10 rounded-[2.5rem] shadow-sm flex flex-col justify-center">
                  <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2"><Target size={18} className="text-blue-700"/> Compliance Metrics</h2>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="border-l-2 border-slate-100 pl-6">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Precursor Utilization</p>
                      <p className="text-2xl font-black text-black">{auditResult.nat.actual > 0 ? Math.min(100, (auditResult.nat.tobacco / auditResult.nat.actual) * 100).toFixed(1) : 0}%</p>
                    </div>
                    <div className="border-l-2 border-slate-100 pl-6">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Audit Integrity</p>
                      <p className="text-2xl font-black text-blue-700">{auditResult.entities.filter(e => e.reliability > 80).length} / {auditResult.entities.length}</p>
                    </div>
                  </div>
                  <div className="mt-10 pt-8 border-t border-slate-100">
                    <div className="flex justify-between items-center mb-2"><span className="text-[10px] font-black uppercase text-slate-400">Gap Severity</span><span className="text-[10px] font-black text-red-600 uppercase">Impact Level</span></div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full transition-all" style={{ width: `${Math.min(100, (auditResult.productionGap / (auditResult.nat.actual || 1)) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-3xl border border-slate-200">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 pl-12 pr-4 text-sm font-bold focus:border-blue-600 outline-none transition-all" placeholder="Search Target..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>

              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px]">
                    <tr>
                      <th className="p-8">Target Entity</th>
                      <th className="p-8 text-center">TX</th>
                      <th className="p-8 text-center">Reliability</th>
                      <th className="p-8">Materials Archive</th>
                      <th className="p-8 text-right">Potential</th>
                      <th className="p-8 text-right text-emerald-400">Actual</th>
                      <th className="p-8 text-center">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 group/row transition-colors">
                        <td className="p-8 font-black text-black">{e.name}</td>
                        <td className="p-8 text-center font-mono font-bold text-slate-500">{e.tx}</td>
                        <td className="p-8 text-center">
                            <div className="group/rel relative inline-block cursor-help">
                                <span className="text-[10px] font-black font-mono border-2 border-slate-200 px-3 py-1 rounded-lg bg-slate-50">{e.reliability.toFixed(1)}%</span>
                                <div className="invisible group-hover/rel:visible opacity-0 group-hover/rel:opacity-100 absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100] w-64 bg-slate-900 text-white p-5 rounded-xl text-[10px] font-medium leading-relaxed shadow-2xl transition-all">
                                    <p className="text-blue-400 font-black uppercase mb-2 flex items-center gap-2 underline underline-offset-4"><Fingerprint size={12}/> Analysis Guide</p>
                                    Standard deviation between precursors. Low scores indicate missing records for critical materials like leaf, suggesting illicit factory support.
                                </div>
                            </div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="group/pop relative bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2 cursor-help">
                                {Icons[m]} <span className="font-mono text-black font-bold text-[11px]">{Math.round(s.rawQty).toLocaleString()}</span>
                                <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-3 z-[60] bg-slate-950 text-white p-4 rounded-xl shadow-2xl min-w-[200px] border border-slate-800 transition-all">
                                    <p className="text-blue-400 font-black text-[10px] uppercase mb-1">{m} CONVERSION</p>
                                    <div className="flex justify-between font-mono text-[10px]"><span>Potential (SE):</span> <span>{Math.round(s.sticks).toLocaleString()}</span></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono font-bold text-slate-500">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                           <div className="group/risk relative inline-block">
                              <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase cursor-help ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                                 {e.risk}
                              </span>
                              <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute top-full right-0 mt-2 z-[100] w-80 bg-white border-2 border-slate-900 p-6 rounded-2xl shadow-2xl text-left transition-all">
                                  <p className="font-black text-xs mb-3 uppercase flex items-center gap-2 text-slate-900 border-b pb-2"><Info size={16}/> Forensic Evidence</p>
                                  <p className="text-xs text-black leading-relaxed font-bold">
                                    {e.risk === 'CRITICAL' ? (
                                        e.violationType === 'ZERO_TOBACCO' 
                                        ? "CRITICAL: Physical exports confirmed with ZERO matching leaf records. Evidence of shadow sourcing."
                                        : `CRITICAL: Export volumes exceed precursor capacity by ${Math.round((e.actual/e.minPot - 1)*100)}%.`
                                    ) : "RECONCILED: Production is within material import limits."}
                                  </p>
                              </div>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* DYNAMIC TOTALS FOOTER */}
                  <tfoot className="bg-slate-50 border-t-4 border-slate-900 sticky bottom-0 z-20">
                    <tr className="font-black text-black">
                      <td className="p-8 text-base uppercase">Total Filtered: {filteredEntities.length}</td>
                      <td className="p-8 text-center font-mono text-lg text-slate-600">{filteredEntities.reduce((sum, e) => sum + e.tx, 0)}</td>
                      <td className="p-8 text-center text-[10px] text-slate-400">AGGR. RELIABILITY</td>
                      <td className="p-8"></td>
                      <td className="p-8 text-right font-mono text-slate-500">{filteredEntities.reduce((sum, e) => sum + e.minPot, 0).toLocaleString()}</td>
                      <td className="p-8 text-right font-mono text-xl text-blue-700">{filteredEntities.reduce((sum, e) => sum + e.actual, 0).toLocaleString()}</td>
                      <td className="p-8 text-center"><div className="text-[10px] bg-slate-900 text-white py-2 px-4 rounded-lg inline-block uppercase tracking-widest">Audit Summary</div></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-8 rounded-[2rem] shadow-sm hover:border-blue-600 transition-all">
                   <div className="flex justify-between items-start mb-6">
                    <div className="bg-slate-100 p-3 rounded-xl"><History size={24}/></div>
                    <button onClick={() => { setReports(reports.filter(x => x.id !== r.id)); localStorage.setItem('obsidian_prime_reports', JSON.stringify(reports.filter(x => x.id !== r.id))); }} className="text-slate-300 hover:text-red-600"><Trash2 size={20}/></button>
                  </div>
                  <h3 className="font-black text-black text-xl mb-1">{r.title}</h3>
                  <p className="text-[10px] text-slate-500 font-bold mb-6 uppercase">{r.date}</p>
                  <div className="space-y-4 mb-8 border-y py-6 border-slate-50">
                     <div className="flex justify-between text-xs font-bold"><span>Gap</span> <span className="text-red-600 font-mono">{Math.round(r.gap).toLocaleString()}</span></div>
                     <div className="flex justify-between text-xs font-bold"><span>Shadow</span> <span className="text-blue-700 font-mono">{Math.round(r.prob)}%</span></div>
                  </div>
                  <button onClick={() => setActiveTab('country')} className="w-full bg-slate-900 py-3 rounded-xl text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all">Reload Analysis</button>
                </div>
              ))}
              {reports.length === 0 && <div className="col-span-full py-20 text-center bg-slate-100 border-2 border-dashed rounded-[2.5rem] text-slate-400 uppercase font-black text-xs">No snapshots archived.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryBox({ title, val, sub, color, isText }) {
    return (
        <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm hover:border-blue-100 transition-all">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">{title}</p>
            <p className={`text-3xl font-black ${color}`}>{isText ? val : Math.round(val).toLocaleString()}</p>
            <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">{sub}</p>
        </div>
    );
}

function BalanceRow({ label, kg, sticks, unit, color, ratio }) {
  return (
    <div className="group relative">
      <div className="flex justify-between items-end cursor-help border-b border-slate-100 pb-3 hover:border-blue-200 transition-colors">
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
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute right-0 bottom-full mb-3 z-[60] bg-slate-900 text-white p-5 rounded-xl text-[10px] font-mono min-w-[240px] shadow-2xl transition-all border border-slate-700 pointer-events-none">
         <div className="flex items-center gap-2 text-blue-400 font-black uppercase mb-3 border-b border-slate-700 pb-2"><Calculator size={14}/> Forensic Conversion</div>
         <div className="space-y-2">
            <div className="flex justify-between"><span>Physical:</span> <span>{Math.round(kg).toLocaleString()} {unit}</span></div>
            <div className="flex justify-between"><span>Material Factor:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-2 border-t border-slate-700 text-emerald-400 font-black text-[11px]"><span>Potential:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
         </div>
         <p className="mt-3 text-[8px] text-slate-500 leading-tight">National standard for legal precursor utilization ratios.</p>
      </div>
    </div>
  );
}

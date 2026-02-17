"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, LineChart, Line
} from 'recharts';
import { 
  ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, 
  Calculator, AlertTriangle, RefreshCcw, Save, History, Search, Info, 
  Sliders, CheckCircle, Target, Gavel, Zap, Download, XCircle, 
  ChevronRight, HelpCircle, Landmark, TrendingUp, Fingerprint, EyeOff, Scale
} from 'lucide-react';

// STATED CONVERSION CONSTANTS
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

export default function ForensicGradeV12_1() {
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
      const saved = localStorage.getItem('forensic_v12_reports');
      if (saved) setReports(JSON.parse(saved));
    } catch (e) { setReports([]); }
  }, []);

  const clearSession = () => {
    if(window.confirm("CRITICAL: Erase current session and all calculated entity risk profiles?")) {
      setRawData([]);
      setUrl('');
    }
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
      const maxPot = pots.length > 0 ? Math.max(...pots) : 0;
      const variance = maxPot > 0 ? ((maxPot - minPot) / maxPot) * 100 : 0;
      const reliability = Math.max(0, 100 - variance);

      const hasZeroTobaccoViolation = e.actual > 0 && e.tobacco === 0;
      const thresholdMultiplier = 1 + (riskThreshold / 100);
      const isOverCap = e.actual > (minPot * thresholdMultiplier);

      return { 
        ...e, minPot, reliability,
        risk: (hasZeroTobaccoViolation || isOverCap) ? 'CRITICAL' : 'RECONCILED',
        violationType: hasZeroTobaccoViolation ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    const productionGap = Math.max(0, nat.actual - nat.tobacco);
    const shadowProb = nat.actual > 0 ? Math.min(100, (productionGap / nat.actual) * 100) : 0;

    // RISK WEIGHTING: Missing physical mass calculation
    const leakageData = [
      { name: 'Tobacco Deficit', value: Math.max(0, (nat.actual - nat.tobacco) / CONVERSIONS.TOBACCO), fill: '#f59e0b', unit: 'KG' },
      { name: 'Tow Deficit', value: Math.max(0, (nat.actual - nat.tow) / CONVERSIONS.TOW), fill: '#0ea5e9', unit: 'KG' },
      { name: 'Paper Deficit', value: Math.max(0, (nat.actual - nat.paper) / CONVERSIONS.PAPER), fill: '#64748b', unit: 'KG' }
    ].filter(d => d.value > 0);

    return { 
        entities, nat, productionGap, shadowProb, leakageData,
        bottleneck: [{name: 'Tobacco', val: nat.tobacco}, {name: 'Tow', val: nat.tow}, {name: 'Paper', val: nat.paper}, {name: 'Rods', val: nat.rods}].filter(p => p.val > 0).reduce((p, c) => p.val < c.val ? p : c, {name: 'None', val: 0}),
        taxLoss: productionGap * CONVERSIONS.TAX_PER_STICK 
    };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => {
    return (auditResult?.entities || []).filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [auditResult, searchTerm]);

  const sync = () => {
    if (!url) return;
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setRawData(res.data); setLoading(false); },
      error: () => setLoading(false)
    });
  };

  const saveReport = () => {
    if (!reportTitle || !auditResult) return;
    const newReport = { id: Date.now(), title: reportTitle, date: new Date().toLocaleString(), nat: auditResult.nat, gap: auditResult.productionGap, prob: auditResult.shadowProb };
    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v12_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      {/* 9.9 HEADER & ACTIONS */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black text-black uppercase tracking-tight">Forensic Monitor <span className="text-blue-700">12.1</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1"><Landmark size={12}/> National Audit Protocol</p>
          </div>
        </div>
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 text-blue-700"><Sliders size={18}/> <span className="text-[10px] font-black uppercase text-black text-nowrap">Risk sensitivity</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none font-bold" placeholder="Google Sheets URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} disabled={loading} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase transition-all shadow-md flex items-center gap-2">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Sync Audit'}
          </button>
          {rawData.length > 0 && <button onClick={clearSession} className="bg-red-50 text-red-600 p-2.5 rounded-xl border border-red-200 hover:bg-red-600 hover:text-white transition-all"><Trash2 size={20}/></button>}
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>National Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Target Analysis</button>
              <button onClick={() => setActiveTab('guide')} className={`pb-4 ${activeTab === 'guide' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Audit Guide</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 ${activeTab === 'reports' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Archives</button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-3 pb-4">
                <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black outline-none" placeholder="Snapshot name..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase flex items-center gap-2 hover:bg-emerald-800 transition-all"><Save size={16}/> Archive</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              {/* 9.9 NATIONAL SUMMARY ANALYSIS */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <SummaryBox title="Tobacco Ceiling" val={auditResult.nat.tobacco} sub="MAX STICKS FROM LEAF" color="text-amber-700" />
                <SummaryBox title="Bottleneck" val={auditResult.bottleneck.name} sub="STRICTEST PRECURSOR" color="text-blue-700" isText />
                <SummaryBox title="Production Gap" val={auditResult.productionGap} sub="UNSUPPORTED VOLUME" color="text-red-600" />
                <SummaryBox title="Tax Leakage" val={`$${(auditResult.taxLoss/1e9).toFixed(2)}B`} sub="EST. EXCISE EVASION" color="text-emerald-700" isText />
                <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-3xl shadow-xl relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1 text-red-400"><EyeOff size={14}/><p className="text-[10px] text-white font-black uppercase">Shadow Probability</p></div>
                        <p className="text-3xl font-black text-white">{Math.round(auditResult.shadowProb)}%</p>
                    </div>
                    <div className="absolute right-[-10px] bottom-[-10px] opacity-10"><Zap size={80} className="text-red-500" /></div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> Supply Matrix Balance</h2>
                  <div className="h-[400px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" fontSize={12} fontWeight="bold" />
                        <YAxis fontSize={11} fontWeight="bold" tickFormatter={(v) => `${(v/1e6).toFixed(0)}M`} />
                        <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="val" radius={[6, 6, 0, 0]} barSize={60}>
                            { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* SMUGGLING RISK BY WEIGHT CHART */}
                <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2 flex items-center gap-2"><Scale size={16} className="text-red-600"/> Smuggling Weighting</h2>
                  <p className="text-[10px] text-slate-400 font-bold mb-6">PHYSICAL DEFICIT MASS (KG)</p>
                  <div className="h-[300px]">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={auditResult.leakageData} innerRadius={60} outerRadius={85} paddingAngle={5} dataKey="value">
                          {auditResult.leakageData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip formatter={(v) => `${Math.round(v).toLocaleString()} KG`} />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-12 bg-white border-2 border-slate-100 p-8 rounded-[2.5rem]">
                    <h2 className="text-xs font-black text-blue-700 uppercase mb-8 border-b pb-4">Forensic Precursor Ledger</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                      <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                      <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                      <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                      <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                    </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200">
                  <div className="relative w-96">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input className="w-full bg-slate-50 border rounded-xl py-2 pl-12 pr-4 text-sm font-bold" placeholder="Search entity..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  <div className="flex gap-4">
                    <button className="text-[10px] font-black uppercase text-slate-400 hover:text-black transition-all">Filter: Critical Only</button>
                    <button onClick={() => {
                        const csv = Papa.unparse(filteredEntities);
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = "Forensic_Audit.csv";
                        link.click();
                    }} className="bg-slate-900 text-white p-2 rounded-xl px-4 flex items-center gap-2 text-[10px] font-black"><Download size={14}/> Export</button>
                  </div>
              </div>
              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-visible shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px] sticky top-0 z-10">
                    <tr>
                      <th className="p-8">Target Entity</th>
                      <th className="p-8 text-center">TX Count</th>
                      <th className="p-8 text-center">Reliability</th>
                      <th className="p-8">Material Inventory</th>
                      <th className="p-8 text-right">Potential Cap</th>
                      <th className="p-8 text-right text-emerald-400">Actual Output</th>
                      <th className="p-8 text-center">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 group/row">
                        <td className="p-8 font-black text-black">{e.name}</td>
                        <td className="p-8 text-center font-mono font-bold text-slate-500">{e.tx}</td>
                        <td className="p-8 text-center">
                            <div className="group/rel relative inline-block cursor-help">
                                <span className="text-[10px] font-black font-mono border px-2 py-1 rounded bg-slate-50">{e.reliability.toFixed(1)}%</span>
                                <div className="invisible group-hover/rel:visible opacity-0 group-hover/rel:opacity-100 absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-64 bg-slate-900 text-white p-4 rounded-xl text-[10px] font-medium leading-relaxed transition-all shadow-2xl">
                                    <p className="text-blue-400 font-black uppercase mb-1 flex items-center gap-1"><Fingerprint size={12}/> Analysis</p>
                                    Measures precursor balance. A low score (e.g. 10%) means the entity has massive quantities of one material but zero of others, a primary illicit signal.
                                </div>
                            </div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="bg-white border border-slate-200 rounded-xl px-3 py-1 flex items-center gap-2 group/pop relative cursor-help">
                                {Icons[m]} <span className="font-mono font-bold text-[11px]">{Math.round(s.rawQty).toLocaleString()}</span>
                                <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-2 z-50 bg-slate-900 text-white p-3 rounded-lg text-[10px] whitespace-nowrap shadow-xl">
                                    {m} Conversion: {Math.round(s.sticks).toLocaleString()} Sticks
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono font-bold">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center relative overflow-visible">
                           <div className="group/risk relative inline-block">
                              <span className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest border-2 flex items-center gap-2 uppercase cursor-pointer ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                  {e.risk === 'CRITICAL' ? <AlertTriangle size={12}/> : <CheckCircle size={12}/>} {e.risk}
                              </span>
                              {/* RESTORED V9.8 PROSE */}
                              <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute top-full right-0 mt-2 z-[100] w-80 bg-white border-2 border-slate-900 p-6 rounded-2xl shadow-2xl text-left transition-all">
                                  <p className="font-black text-xs mb-2 uppercase flex items-center gap-2 text-slate-900"><Info size={16}/> Forensic Evidence Log</p>
                                  <p className="text-xs text-black leading-relaxed font-bold">
                                    {e.risk === 'CRITICAL' ? (
                                        e.violationType === 'ZERO_TOBACCO' 
                                        ? "CRITICAL ALERT: Physical exports confirmed, but registry contains ZERO tobacco leaf records. Direct indicator of shadow sourcing from clandestine suppliers."
                                        : `CRITICAL ALERT: Physical exports exceed calculated precursor potential by ${Math.round((e.actual/e.minPot - 1)*100)}%. Volume is mathematically impossible based on input records.`
                                    ) : (
                                        "RECONCILED: Entity exports are supported by recorded precursor material imports. No shadow signal detected."
                                    )}
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
          ) : activeTab === 'guide' ? (
            /* 9.9 AUDIT GUIDE RESTORED */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-left-4 duration-500">
               <div className="bg-white border-2 border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-xl font-black mb-6 uppercase tracking-tight flex items-center gap-3"><Gavel className="text-blue-700" /> Forensic Protocols</h2>
                  <div className="space-y-6">
                    <div className="border-l-4 border-amber-500 pl-6 py-2">
                        <p className="font-black text-sm uppercase">1. Precursor Ceiling</p>
                        <p className="text-xs text-slate-600 font-bold mt-1">We determine the 'Minimum Potential' by identifying which precursor runs out first. A factory cannot produce 1B sticks with only 100kg of Acetate Tow.</p>
                    </div>
                    <div className="border-l-4 border-blue-500 pl-6 py-2">
                        <p className="font-black text-sm uppercase">2. Smuggling Weighting</p>
                        <p className="text-xs text-slate-600 font-bold mt-1">Missing precursor mass is calculated by multiplying the production gap by material yield factors. This identifies the volume of contraband leaf or tow required to sustain output.</p>
                    </div>
                  </div>
               </div>
               <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl">
                  <h2 className="text-xl font-black mb-6 uppercase tracking-tight text-blue-400">Yield Constants</h2>
                  <div className="space-y-4 font-mono text-xs">
                    <div className="flex justify-between border-b border-slate-800 pb-2"><span>Tobacco Leaf (KG)</span> <span>{CONVERSIONS.TOBACCO} Sticks</span></div>
                    <div className="flex justify-between border-b border-slate-800 pb-2"><span>Acetate Tow (KG)</span> <span>{CONVERSIONS.TOW} Sticks</span></div>
                    <div className="flex justify-between border-b border-slate-800 pb-2"><span>Cig. Paper (KG)</span> <span>{CONVERSIONS.PAPER} Sticks</span></div>
                    <div className="flex justify-between border-b border-slate-800 pb-2"><span>Filter Rods (PCS)</span> <span>{CONVERSIONS.RODS} Sticks</span></div>
                    <div className="flex justify-between text-emerald-400 pt-4 font-black"><span>Excise Rate</span> <span>$0.15 / Stick</span></div>
                  </div>
               </div>
            </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-8 rounded-[2rem] shadow-sm hover:border-blue-600 transition-all">
                   <div className="flex justify-between mb-6">
                    <div className="bg-slate-100 p-3 rounded-xl"><History size={24}/></div>
                    <button onClick={() => { setReports(reports.filter(x => x.id !== r.id)); localStorage.setItem('forensic_v12_reports', JSON.stringify(reports.filter(x => x.id !== r.id))); }} className="text-slate-300 hover:text-red-600"><Trash2 size={20}/></button>
                  </div>
                  <h3 className="font-black text-black text-lg">{r.title}</h3>
                  <p className="text-[10px] text-slate-500 font-bold mb-6 uppercase tracking-widest">{r.date}</p>
                  <div className="space-y-2 mb-8">
                    <div className="flex justify-between text-[10px] font-bold"><span>Gap</span> <span>{Math.round(r.gap).toLocaleString()}</span></div>
                    <div className="flex justify-between text-[10px] font-bold"><span>Shadow Risk</span> <span className="text-red-600">{Math.round(r.prob)}%</span></div>
                  </div>
                  <button onClick={() => setActiveTab('country')} className="w-full bg-slate-900 py-3 rounded-xl text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-700">Restore Data</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryBox({ title, val, sub, color, isText }) {
    return (
        <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm hover:border-blue-200 transition-all">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">{title}</p>
            <p className={`text-2xl font-black ${color}`}>{isText ? val : Math.round(val).toLocaleString()}</p>
            <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">{sub}</p>
        </div>
    );
}

function BalanceRow({ label, kg, sticks, unit, color, ratio }) {
  return (
    <div className="group relative">
      <div className="flex justify-between items-end cursor-help border-b border-slate-100 pb-3">
        <div className="flex items-center gap-4">
          <div className={`w-1.5 h-10 rounded-full ${color}`}/>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
            <p className="text-lg font-black text-black">{Math.round(kg).toLocaleString()} <span className="text-[10px] font-bold text-slate-300 uppercase">{unit}</span></p>
          </div>
        </div>
        <div className="text-right">
            <p className="text-sm font-black text-blue-700 font-mono tracking-tighter">{Math.round(sticks).toLocaleString()}</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase">Sticks Eq</p>
        </div>
      </div>
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute right-0 bottom-full mb-3 z-[100] bg-slate-900 text-white p-5 rounded-xl text-[10px] font-mono min-w-[240px] shadow-2xl transition-all border border-slate-700">
         <p className="text-blue-400 font-black uppercase mb-1 border-b border-slate-700 pb-1 flex items-center gap-2"><Calculator size={14}/> Forensic Conversion</p>
         <div className="space-y-1">
            <div className="flex justify-between"><span>Registry Input:</span> <span>{Math.round(kg).toLocaleString()} {unit}</span></div>
            <div className="flex justify-between"><span>Factor:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-1 border-t border-slate-700 text-emerald-400 font-black"><span>Capacity:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
         </div>
      </div>
    </div>
  );
}

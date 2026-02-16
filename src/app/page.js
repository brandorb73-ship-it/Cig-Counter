"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, RefreshCcw, Save, History, Search, Info, Sliders, CheckCircle, Target, Gavel, Zap, Download, XCircle, ChevronRight, HelpCircle, Landmark, TrendingUp, Fingerprint } from 'lucide-react';

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
    try {
      const saved = localStorage.getItem('forensic_v9_reports');
      if (saved) setReports(JSON.parse(saved));
    } catch (e) { setReports([]); }
  }, []);

  const clearSession = () => { if(window.confirm("Reset entire audit session?")) { setRawData([]); setUrl(''); } };

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
      
      // RELIABILITY CALCULATION (Precursor Variance)
      const variance = maxPot > 0 ? ((maxPot - minPot) / maxPot) * 100 : 0;
      const reliability = Math.max(0, 100 - variance);

      const hasZeroTobaccoViolation = e.actual > 0 && e.tobacco === 0;
      const thresholdMultiplier = 1 + (riskThreshold / 100);
      const isOverCap = e.actual > (minPot * thresholdMultiplier);

      return { 
        ...e, 
        minPot, 
        reliability,
        risk: (hasZeroTobaccoViolation || isOverCap) ? 'CRITICAL' : 'RECONCILED',
        violationType: hasZeroTobaccoViolation ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    const pools = [
        { name: 'Tobacco Leaf', val: nat.tobacco },
        { name: 'Acetate Tow', val: nat.tow },
        { name: 'Cigarette Paper', val: nat.paper },
        { name: 'Filter Rods', val: nat.rods }
    ].filter(p => p.val > 0);
    const bottleneck = pools.length > 0 ? pools.reduce((p, c) => p.val < c.val ? p : c) : { name: 'None', val: 0 };
    const productionGap = Math.max(0, nat.actual - nat.tobacco);
    const taxLoss = productionGap * CONVERSIONS.TAX_PER_STICK;

    return { entities, nat, bottleneck, tobaccoCeiling: nat.tobacco, productionGap, taxLoss };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => {
    if (!auditResult) return [];
    return auditResult.entities.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [auditResult, searchTerm]);

  const filteredSums = useMemo(() => {
    return filteredEntities.reduce((acc, curr) => ({
        actual: acc.actual + curr.actual,
        potential: acc.potential + curr.minPot,
        tx: acc.tx + curr.tx
    }), { actual: 0, potential: 0, tx: 0 });
  }, [filteredEntities]);

  const downloadCSV = () => {
    const data = filteredEntities.map(e => ({
      Entity: e.name,
      Transactions: e.tx,
      'Relability Score %': e.reliability.toFixed(1),
      'Potential Cap': Math.round(e.minPot),
      'Actual Exports': Math.round(e.actual),
      'Tax Risk': (Math.max(0, e.actual - e.minPot) * CONVERSIONS.TAX_PER_STICK).toFixed(2),
      Verdict: e.risk
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Forensic_Audit_V9.9_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

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
    const newReport = {
      id: Date.now(), title: reportTitle, date: new Date().toLocaleString(),
      summary: { ...auditResult.nat, bottleneck: auditResult.bottleneck },
      entities: auditResult.entities
    };
    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v9_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      {/* HEADER SECTION */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black uppercase">Forensic Monitor <span className="text-blue-700">9.9</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1"><Fingerprint size={10} className="text-blue-600"/> Reliability & Precursor Integrity</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 text-blue-700"><Sliders size={18}/> <span className="text-[10px] font-black uppercase text-black">Risk Sensitivity</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none focus:border-blue-600 font-bold" placeholder="Google Sheets URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} disabled={loading} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase tracking-widest transition-all shadow-md flex items-center gap-2">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Run Audit'}
          </button>
          {rawData.length > 0 && (
            <button onClick={clearSession} className="bg-red-50 text-red-600 p-2.5 rounded-xl border border-red-200 hover:bg-red-600 hover:text-white transition-all shadow-sm">
                <Trash2 size={20}/>
            </button>
          )}
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
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              {/* TOP CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <SummaryBox title="Tobacco Ceiling" val={auditResult.tobaccoCeiling} sub="MAX STICKS FROM LEAF" color="text-amber-700" />
                <SummaryBox title="Supply Bottleneck" val={auditResult.bottleneck.name} sub="STRICTEST PRECURSOR" color="text-blue-700" isText />
                <SummaryBox title="Production Gap" val={auditResult.productionGap} sub="UNSUPPORTED VOLUME" color="text-red-600" />
                <SummaryBox title="Tax Revenue Loss" val={`$${(auditResult.taxLoss/1e9).toFixed(2)}B`} sub="EST. EXCISE EVASION" color="text-emerald-700" isText />
                <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-3xl shadow-lg flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-1"><Zap size={14} className="text-yellow-400"/><p className="text-[10px] font-black text-white uppercase">Health Score</p></div>
                    <p className="text-3xl font-black text-white">{auditResult.nat.tobacco > 0 ? Math.round((auditResult.nat.actual/auditResult.nat.tobacco)*100) : 0}%</p>
                </div>
              </div>

              {/* GRAPH & MATRIX */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> National Precursor vs. Production Matrix</h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} fontWeight="bold" tickLine={false} axisLine={false} tick={{dy: 10}} />
                        <YAxis fontSize={11} fontWeight="bold" tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1e6).toFixed(0)}M`} />
                        <Tooltip formatter={(v) => [v.toLocaleString(), "Sticks"]} cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                            { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
                    <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8">Balance Table</h2>
                    <div className="space-y-6">
                      <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                      <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                      <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                      <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                      <div className="py-4 border-y-2 border-slate-50">
                          <BalanceRow label="Cigarette Exports" kg={auditResult.nat.actual / CONVERSIONS.CIGARETTES_EXPORT} sticks={auditResult.nat.actual} unit="KG Gross" color="bg-emerald-600" ratio={CONVERSIONS.CIGARETTES_EXPORT} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* MOVED ANALYSIS & GUIDE */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl">
                    <h2 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Gavel size={20}/> National Forensic Analysis</h2>
                    <div className="space-y-6 text-sm leading-relaxed text-blue-50 font-medium">
                        <p>Total recorded exports stand at <span className="text-emerald-400 font-black">{Math.round(auditResult.nat.actual).toLocaleString()}</span> sticks. Based on raw material precursors, the maximum sustainable production is limited by <span className="text-blue-400 font-black underline uppercase">{auditResult.bottleneck.name}</span>.</p>
                        <p className="bg-red-950/30 p-4 border-l-4 border-red-500 rounded-r-xl">The production gap of <span className="text-red-400 font-black">{auditResult.productionGap.toLocaleString()}</span> sticks represents a potential fiscal leakage of <span className="text-red-400 font-black">${auditResult.taxLoss.toLocaleString()}</span> in unpaid excise duties.</p>
                        <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
                           <p className="text-xs font-bold text-slate-400 uppercase mb-2">Verdict Summary</p>
                           {auditResult.nat.actual > auditResult.nat.tobacco ? (
                               <p className="text-red-400 font-bold italic flex gap-2"><AlertTriangle size={18}/> High Risk: Production exceeds tobacco leaf availability by {Math.round((auditResult.nat.actual/auditResult.nat.tobacco - 1)*100)}%.</p>
                           ) : (
                               <p className="text-emerald-400 font-bold flex gap-2"><CheckCircle size={18}/> Balanced: National precursor imports sufficient.</p>
                           )}
                        </div>
                    </div>
                  </div>

                  <div className="bg-white border-2 border-slate-200 p-10 rounded-[2.5rem]">
                    <h2 className="text-sm font-black text-black uppercase tracking-widest mb-6 flex items-center gap-2"><HelpCircle size={20} className="text-blue-700"/> Audit Interpretation Guide</h2>
                    <div className="grid grid-cols-1 gap-4">
                        <div className="flex gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <CheckCircle className="text-emerald-600 shrink-0" size={20}/>
                            <div><p className="text-xs font-black text-emerald-900 uppercase">RECONCILED</p><p className="text-[11px] font-bold text-emerald-700">Exports are within {riskThreshold}% of the precursor limit.</p></div>
                        </div>
                        <div className="flex gap-4 p-4 bg-red-50 rounded-2xl border border-red-100">
                            <AlertTriangle className="text-red-600 shrink-0" size={20}/>
                            <div><p className="text-xs font-black text-red-900 uppercase">CRITICAL (Over-Cap)</p><p className="text-[11px] font-bold text-red-700">Production exceeds available raw materials. Indicates shadow sourcing.</p></div>
                        </div>
                        <div className="flex gap-4 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                            <Activity className="text-orange-600 shrink-0" size={20}/>
                            <div><p className="text-xs font-black text-orange-900 uppercase">CRITICAL (Zero-Tobacco)</p><p className="text-[11px] font-bold text-orange-700">Cigarettes exported with zero tobacco leaf records.</p></div>
                        </div>
                    </div>
                  </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative w-full md:w-96">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-12 pr-4 text-sm font-bold focus:border-blue-600 outline-none" placeholder="Filter by Entity Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <button onClick={downloadCSV} className="bg-slate-900 text-white p-2.5 rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2 px-4">
                            <Download size={18}/> <span className="text-[10px] font-black uppercase tracking-widest">Export CSV</span>
                        </button>
                    </div>
                    <div className="flex gap-8 px-6 border-l border-slate-100">
                        <div><p className="text-[10px] font-black text-slate-400 uppercase">Actual Total</p><p className="text-lg font-black text-emerald-700">{Math.round(filteredSums.actual).toLocaleString()}</p></div>
                        <div><p className="text-[10px] font-black text-slate-400 uppercase">Transactions</p><p className="text-lg font-black text-blue-700">{filteredSums.tx}</p></div>
                    </div>
                </div>

              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-visible shadow-sm">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px] sticky top-0 z-20">
                    <tr>
                      <th className="p-8">Entity Analysis</th>
                      <th className="p-8 text-center">Reliability Score</th>
                      <th className="p-8">Calculated Inventory (Sticks Eq)</th>
                      <th className="p-8 text-right">Potential Cap</th>
                      <th className="p-8 text-right text-emerald-400">Actual Exports</th>
                      <th className="p-8 text-center">Audit Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 group/row relative">
                        <td className="p-8 font-black text-black text-base">{e.name}</td>
                        <td className="p-8 text-center">
                            <div className="group/rel relative inline-block cursor-help">
                                <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden mb-1">
                                    <div className={`h-full rounded-full ${e.reliability > 80 ? 'bg-emerald-500' : e.reliability > 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{width: `${e.reliability}%`}}/>
                                </div>
                                <span className="text-[10px] font-black text-slate-600 font-mono">{e.reliability.toFixed(1)}%</span>
                                <div className="invisible group-hover/rel:visible opacity-0 group-hover/rel:opacity-100 absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100] w-64 transition-all">
                                    <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 text-left">
                                        <p className="text-blue-400 font-black text-[10px] uppercase mb-2 flex items-center gap-2"><Fingerprint size={12}/> Reliability Logic</p>
                                        <p className="text-[10px] leading-relaxed">Measures precursor variance. Low scores indicate an entity is heavily over-balanced on one material while lacking others (e.g., has Paper but no Tobacco).</p>
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="group/pop relative bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2 cursor-help hover:border-blue-600 transition-all">
                                {Icons[m]}
                                <span className="font-mono text-black font-bold text-[11px]">{Math.round(s.rawQty).toLocaleString()}</span>
                                <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-3 z-[60] transition-all">
                                  <div className="bg-slate-950 text-white p-5 rounded-2xl shadow-2xl min-w-[240px] border border-slate-800">
                                    <p className="text-blue-400 font-black text-[10px] uppercase mb-1">{m} Calc</p>
                                    <div className="space-y-1 font-mono text-[10px]">
                                      <div className="flex justify-between"><span>Input:</span> <span>{s.rawQty.toLocaleString()}</span></div>
                                      <div className="flex justify-between border-t border-slate-800 pt-1 text-emerald-400 font-black"><span>Stick Eq:</span> <span>{Math.round(s.sticks).toLocaleString()}</span></div>
                                    </div>
                                  </div>
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
                              <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute top-full right-0 mt-2 z-[100] w-80 transition-all text-left pointer-events-none">
                                <div className={`bg-white border-2 p-6 rounded-2xl shadow-2xl ${e.risk === 'CRITICAL' ? 'border-red-500' : 'border-emerald-500'}`}>
                                  <p className={`${e.risk === 'CRITICAL' ? 'text-red-700' : 'text-emerald-700'} font-black text-xs mb-2 uppercase flex items-center gap-2`}><Info size={16}/> Evidence Log</p>
                                  <p className="text-xs text-black leading-relaxed font-bold">
                                    {e.risk === 'CRITICAL' ? (e.violationType === 'ZERO_TOBACCO' ? "CRITICAL: No matching leaf records." : `CRITICAL: Over-cap by ${Math.round((e.actual/e.minPot - 1)*100)}%.`) : "RECONCILED: Balanced."}
                                  </p>
                                  <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs font-black">
                                      <span className="text-slate-400 uppercase">Tax Risk</span>
                                      <span className="text-red-600">${(Math.max(0, e.actual - e.minPot) * CONVERSIONS.TAX_PER_STICK).toLocaleString()}</span>
                                  </div>
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
              {reports && reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-8 rounded-[2rem] shadow-sm hover:border-blue-600 group">
                   <div className="flex justify-between items-start mb-6">
                    <div className="bg-slate-100 p-3 rounded-xl text-black group-hover:bg-blue-700"><History size={24}/></div>
                    <button onClick={() => {
                        const updated = reports.filter(x => x.id !== r.id);
                        setReports(updated);
                        localStorage.setItem('forensic_v9_reports', JSON.stringify(updated));
                    }} className="text-slate-300 hover:text-red-600"><Trash2 size={20}/></button>
                  </div>
                  <h3 className="font-black text-black text-lg mb-1">{r.title}</h3>
                  <p className="text-[10px] text-slate-500 font-bold mb-6">{r.date}</p>
                  <button onClick={() => {setActiveTab('country');}} className="w-full bg-slate-900 py-3 rounded-xl text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all">View Analytics</button>
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
        <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">{title}</p>
            <p className={`text-2xl font-black ${color}`}>{isText ? val : Math.round(val).toLocaleString()}</p>
            <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">{sub}</p>
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
            <p className="text-[10px] font-black uppercase tracking-widest mb-1 text-slate-500">{label}</p>
            <p className="text-lg font-black text-black">{Math.round(kg).toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">{unit}</span></p>
          </div>
        </div>
        <div className="text-right">
            <p className="text-sm font-black text-blue-700 font-mono">{Math.round(sticks).toLocaleString()}</p>
            <p className="text-[8px] font-bold uppercase text-slate-400">STICKS EQ</p>
        </div>
      </div>
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-0 bottom-full mb-3 z-[60] transition-all">
         <div className="bg-slate-900 text-white p-4 rounded-xl shadow-xl text-[10px] font-mono min-w-[200px]">
            <p className="text-blue-400 font-black uppercase mb-1 border-b border-slate-700 pb-1">Audit Logic</p>
            <div className="flex justify-between"><span>Raw Input:</span> <span>{Math.round(kg).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Factor:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-1 border-t border-slate-700 text-emerald-400 font-black"><span>Stick Capacity:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
         </div>
      </div>
    </div>
  );
}

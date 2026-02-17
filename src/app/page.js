"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Cell, PieChart, Pie, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import { 
  ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, 
  Calculator, AlertTriangle, RefreshCcw, Save, History, Search, Info, 
  Sliders, CheckCircle, Target, Gavel, Zap, Download, XCircle, 
  ChevronRight, HelpCircle, Landmark, TrendingUp, Fingerprint, EyeOff, Map, BookOpen
} from 'lucide-react';

// V12.0 CONSTANTS & CONVERSIONS
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

export default function ForensicGradeV13() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  // V12.0 Persistence
  useEffect(() => {
    try {
      const saved = localStorage.getItem('forensic_v13_reports');
      if (saved) setReports(JSON.parse(saved));
    } catch (e) { setReports([]); }
  }, []);

  const clearSession = () => {
    if(window.confirm("CRITICAL: Erase all current audit data?")) {
      setRawData([]);
      setUrl('');
    }
  };

  // CORE FORENSIC ENGINE (V12.0 + V13.0 Optimizations)
  const auditResult = useMemo(() => {
    if (!rawData || rawData.length === 0) return null;
    const registry = {};
    let nat = { tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, tobaccoKg: 0, towKg: 0, paperKg: 0, rodsUnits: 0 };

    rawData.forEach(row => {
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;
      if (!registry[entity]) registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {}, tx: 0, region: row.Region || 'Unknown' };

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
    
    // Leakage Pie (V12.0 logic)
    const leakageData = [
      { name: 'Tobacco Deficit', value: Math.max(0, nat.actual - nat.tobacco), fill: '#f59e0b' },
      { name: 'Tow Deficit', value: Math.max(0, nat.actual - nat.tow), fill: '#0ea5e9' },
      { name: 'Paper Deficit', value: Math.max(0, nat.actual - nat.paper), fill: '#64748b' },
      { name: 'Rod Deficit', value: Math.max(0, nat.actual - nat.rods), fill: '#a855f7' }
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

  const downloadCSV = () => {
    const csv = Papa.unparse(filteredEntities.map(e => ({
      Entity: e.name, 'TX Count': e.tx, 'Reliability': e.reliability.toFixed(1),
      'Potential Cap': Math.round(e.minPot), 'Actual Export': Math.round(e.actual), 
      'Excise Risk': (Math.max(0, e.actual - e.minPot) * 0.15).toFixed(2), Verdict: e.risk
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `V13_Forensic_Export_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans selection:bg-blue-100">
      {/* GLOBAL HEADER */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg border-t border-slate-700"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black text-black uppercase tracking-tight">Forensic Monitor <span className="text-blue-700">13.0</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">Protocol: Advanced Precursor Verification</p>
          </div>
        </div>
        
        {/* SENSITIVITY CONTROL */}
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 text-blue-700"><Sliders size={18}/> <span className="text-[10px] font-black uppercase text-black">Risk Sensitivity</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>

        {/* INPUT ACTIONS */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full lg:w-80">
             <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
             <input className="bg-slate-50 border-2 border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm w-full outline-none font-bold focus:border-blue-700 transition-all" placeholder="Enter Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <button onClick={sync} disabled={loading} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase transition-all shadow-md flex items-center gap-2">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Sync Audit'}
          </button>
          {rawData.length > 0 && <button onClick={clearSession} className="bg-red-50 text-red-600 p-2.5 rounded-xl border border-red-200 hover:bg-red-600 hover:text-white transition-all"><Trash2 size={20}/></button>}
        </div>
      </div>

      {auditResult ? (
        <div className="max-w-[1600px] mx-auto space-y-8">
          {/* NAVIGATION BAR */}
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <TabBtn active={activeTab === 'country'} label="National Intel" icon={<Activity size={14}/>} onClick={() => setActiveTab('country')} />
              <TabBtn active={activeTab === 'entities'} label="Target Analysis" icon={<Target size={14}/>} onClick={() => setActiveTab('entities')} />
              <TabBtn active={activeTab === 'reports'} label="Audit Snapshots" icon={<History size={14}/>} onClick={() => setActiveTab('reports')} />
              <TabBtn active={activeTab === 'guide'} label="Audit Guide" icon={<BookOpen size={14}/>} onClick={() => setActiveTab('guide')} />
            </div>
          </div>

          {activeTab === 'country' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2">
               <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <SummaryBox title="Tobacco Ceiling" val={auditResult.nat.tobacco} sub="MAX STICKS FROM LEAF" color="text-amber-700" />
                <SummaryBox title="Supply Bottleneck" val={auditResult.bottleneck.name} sub="STRICTEST PRECURSOR" color="text-blue-700" isText />
                <SummaryBox title="Production Gap" val={auditResult.productionGap} sub="UNSUPPORTED VOLUME" color="text-red-600" />
                <SummaryBox title="Tax Revenue Loss" val={`$${(auditResult.taxLoss/1e9).toFixed(2)}B`} sub="EST. EXCISE EVASION" color="text-emerald-700" isText />
                <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1 text-red-400 font-black"><EyeOff size={14}/><p className="text-[10px] text-white uppercase tracking-widest">Shadow Market</p></div>
                        <p className="text-4xl font-black text-white">{Math.round(auditResult.shadowProb)}%</p>
                        <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Illicit Sourcing Probability</p>
                    </div>
                    <div className="absolute right-[-10px] bottom-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-500"><Zap size={100} className="text-red-500" /></div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> National Supply Matrix vs. Output</h2>
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
                        <YAxis fontSize={11} fontWeight="bold" tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1e6).toFixed(0)}M`} />
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                            { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="lg:col-span-4 bg-white border border-slate-200 p-8 rounded-[2.5rem] shadow-sm flex flex-col items-center">
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest self-start mb-6 flex items-center gap-2"><TrendingUp size={16} className="text-red-600"/> Precursor Leakage</h2>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={auditResult.leakageData} innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                                    {auditResult.leakageData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                                </Pie>
                                <Tooltip formatter={(v) => Math.round(v).toLocaleString()} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-4 text-center">Shortfalls Relative to Export Volume</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'entities' && (
            <div className="space-y-6 animate-in fade-in">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-3xl border border-slate-200">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 pl-12 pr-4 text-sm font-bold focus:border-blue-600 outline-none transition-all" placeholder="Filter Entity..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <button onClick={downloadCSV} className="bg-slate-900 text-white p-2.5 rounded-xl px-6 flex items-center gap-2 uppercase text-[10px] font-black hover:bg-blue-700 transition-all"><Download size={18}/> Download CSV</button>
                </div>

                <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px]">
                            <tr>
                                <th className="p-8">Target Entity</th>
                                <th className="p-8 text-center">TX</th>
                                <th className="p-8 text-center">Reliability</th>
                                <th className="p-8">Materials Archive</th>
                                <th className="p-8 text-right">Pot. Cap</th>
                                <th className="p-8 text-right text-emerald-400">Actual Export</th>
                                <th className="p-8 text-center">Verdict</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-2 divide-slate-100">
                            {filteredEntities.map((e, i) => (
                                <tr key={i} className="hover:bg-blue-50/50 group/row transition-colors">
                                    <td className="p-8 font-black text-black text-base">{e.name}</td>
                                    <td className="p-8 text-center font-mono font-bold text-lg text-slate-600">{e.tx}</td>
                                    <td className="p-8 text-center">
                                        <div className="group/rel relative inline-block cursor-help">
                                            <span className="text-[10px] font-black font-mono border-2 border-slate-200 px-3 py-1 rounded-lg bg-slate-50">{e.reliability.toFixed(1)}%</span>
                                            <div className="invisible group-hover/rel:visible opacity-0 group-hover/rel:opacity-100 absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100] w-64 bg-slate-900 text-white p-5 rounded-xl text-[10px] font-medium leading-relaxed shadow-2xl transition-all">
                                                Analyzes precursor distribution. Low scores indicate missing leaf or filter imports for confirmed exports.
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-8">
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(e.materials).map(([m, s]) => (
                                                <div key={m} className="group/pop relative bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                                                    {Icons[m]} <span className="font-mono text-black font-bold text-[11px]">{Math.round(s.rawQty).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-8 text-right font-mono font-bold text-slate-500">{Math.round(e.minPot).toLocaleString()}</td>
                                    <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                                    <td className="p-8 text-center">
                                        <div className="group/risk relative inline-block">
                                            <span className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest border-2 flex items-center gap-2 uppercase cursor-pointer ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
                                                {e.risk === 'CRITICAL' ? <AlertTriangle size={12}/> : <CheckCircle size={12}/>} {e.risk}
                                            </span>
                                            <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute top-full right-0 mt-2 z-[100] w-80 bg-white border-2 border-slate-900 p-6 rounded-2xl shadow-2xl text-left transition-all">
                                                <p className="font-black text-xs mb-3 uppercase flex items-center gap-2 text-slate-900 border-b pb-2"><Info size={16}/> Forensic Evidence Log</p>
                                                <p className="text-xs text-black leading-relaxed font-bold">
                                                    {e.risk === 'CRITICAL' ? (
                                                        e.violationType === 'ZERO_TOBACCO' 
                                                        ? "CRITICAL ALERT: Physical exports confirmed, but registry contains ZERO tobacco leaf records. High shadow-sourcing indicator."
                                                        : `CRITICAL ALERT: Volume exceeds precursor potential by ${Math.round((e.actual/e.minPot - 1)*100)}%.`
                                                    ) : "RECONCILED: Exports within calculated precursor potential."}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
              <div className="bg-white p-10 rounded-[2.5rem] border-2 border-slate-200 shadow-sm">
                <h3 className="text-lg font-black uppercase mb-6 flex items-center gap-2 text-blue-700"><Gavel size={20}/> Audit Protocol</h3>
                <div className="space-y-6 text-sm font-bold text-slate-600 leading-relaxed">
                  <p className="border-l-4 border-amber-500 pl-4">1. Identify the <span className="text-black">Precursor Ceiling</span> (The lowest stick potential across Leaf, Tow, and Paper).</p>
                  <p className="border-l-4 border-blue-500 pl-4">2. Map <span className="text-black">Export Output</span> against this ceiling.</p>
                  <p className="border-l-4 border-red-500 pl-4">3. Flag <span className="text-red-600">Shadow Sourcing</span> where Output > Ceiling * Risk Sensitivity.</p>
                </div>
              </div>
              <div className="bg-slate-900 p-10 rounded-[2.5rem] text-white shadow-xl">
                <h3 className="text-lg font-black uppercase mb-6 flex items-center gap-2 text-emerald-400"><Calculator size={20}/> Forensic Constants</h3>
                <div className="grid grid-cols-2 gap-4">
                  <ConstantCard label="Tobacco" value="1,333 Sticks/kg" />
                  <ConstantCard label="Acetate Tow" value="8,333 Sticks/kg" />
                  <ConstantCard label="Cig. Paper" value="20,000 Sticks/kg" />
                  <ConstantCard label="Tax Rate" value="$0.15 / Stick" />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-[1600px] mx-auto h-[60vh] flex flex-col items-center justify-center bg-white rounded-[3rem] border-4 border-dashed border-slate-200">
           <Database className="text-slate-200 mb-6" size={80} />
           <p className="text-slate-400 font-black uppercase tracking-widest text-lg">Awaiting Data Execution</p>
           <p className="text-slate-300 text-xs mt-2 font-bold uppercase tracking-tighter">Paste a valid Google Sheets URL to begin forensic audit</p>
        </div>
      )}
    </div>
  );
}

// SUPPORT COMPONENTS
function SummaryBox({ title, val, sub, color, isText }) {
    return (
        <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm hover:border-blue-100 transition-all">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">{title}</p>
            <p className={`text-3xl font-black ${color}`}>{isText ? val : Math.round(val).toLocaleString()}</p>
            <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">{sub}</p>
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

function ConstantCard({ label, value }) {
  return (
    <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

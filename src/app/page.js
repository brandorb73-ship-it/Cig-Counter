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
  Sliders, CheckCircle, Target, Gavel, Zap, Download, Scale, Fingerprint, EyeOff, Landmark, TrendingUp 
} from 'lucide-react';

/**
 * ARCHITECTURAL CONSTANTS
 * Defined for national forensic standardization
 */
const CONVERSIONS = {
  'TOBACCO': 1333.33, 
  'TOW': 8333.33, 
  'PAPER': 20000, 
  'RODS': 6,
  'CIGARETTES_EXPORT': 1000, 
  'TAX_PER_STICK': 0.15,
  'UNITS': { 
    'MIL': 1000, 
    'KGM': 1, 
    'KG': 1, 
    'TON': 1000, 
    'MT': 1000, 
    'CASE': 10000, 
    'PIECE': 1 
  }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ForensicMasterV12_6() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  // Persistence Engine for Forensic Snapshots
  useEffect(() => {
    try {
      const saved = localStorage.getItem('forensic_v12_reports');
      if (saved) {
        setReports(JSON.parse(saved));
      }
    } catch (e) { 
      setReports([]); 
    }
  }, []);

  const clearSession = () => {
    if (window.confirm("CRITICAL WARNING: This action will purge all current data from the dashboard. Proceed?")) {
      setRawData([]);
      setUrl('');
    }
  };

  /**
   * CORE ANALYTICS ENGINE (V12.6)
   * Handles multi-material precursor reconciliation
   */
  const auditResult = useMemo(() => {
    if (!rawData || rawData.length === 0) return null;
    
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
          name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, 
          materials: {}, tx: 0 
        };
      }

      const mR = (row.Material || '').toUpperCase();
      const mat = mR.includes('TOBACCO') ? 'TOBACCO' : 
                  mR.includes('TOW') ? 'TOW' : 
                  mR.includes('PAPER') ? 'PAPER' : 
                  (mR.includes('ROD') || mR.includes('FILTER')) ? 'RODS' : 
                  (mR.includes('CIGARETTE') && !mR.includes('PAPER')) ? 'CIGARETTES' : null;

      const qty = parseFloat(String(row.Quantity).replace(/,/g, '')) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = CONVERSIONS.UNITS[unit] || 1;
      const convQty = qty * factor;

      registry[entity].tx += 1;

      if (mat === 'CIGARETTES') {
        let sticks = (unit === 'MIL') ? qty * 1000000 : 
                     (['KG', 'KGM', 'TON', 'MT'].includes(unit)) ? convQty * CONVERSIONS.CIGARETTES_EXPORT : convQty;
        registry[entity].actual += sticks;
        nat.actual += sticks;
        
        if (!registry[entity].materials[mat]) {
          registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: (unit === 'MIL' ? 1000000 : CONVERSIONS.CIGARETTES_EXPORT) };
        }
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        
        if (mat === 'TOBACCO') { nat.tobaccoKg += convQty; nat.tobacco += sticks; }
        if (mat === 'TOW') { nat.towKg += convQty; nat.tow += sticks; }
        if (mat === 'PAPER') { nat.paperKg += convQty; nat.paper += sticks; }
        if (mat === 'RODS') { nat.rodsUnits += convQty; nat.rods += sticks; }
        
        if (!registry[entity].materials[mat]) {
          registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: CONVERSIONS[mat] };
        }
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      }
    });

    const entities = Object.values(registry).map(e => {
      const pots = [e.tobacco, e.tow, e.paper, e.rods].filter(v => v > 0);
      const minPot = pots.length > 0 ? Math.min(...pots) : 0;
      const maxPot = pots.length > 0 ? Math.max(...pots) : 0;
      
      const reliability = maxPot > 0 ? Math.max(0, 100 - (((maxPot - minPot) / maxPot) * 100)) : 0;
      const exciseRisk = Math.max(0, e.actual - minPot) * CONVERSIONS.TAX_PER_STICK;

      return { 
        ...e, 
        minPot, 
        reliability, 
        exciseRisk,
        risk: (e.actual > (minPot * (1 + riskThreshold/100)) || (e.actual > 0 && e.tobacco === 0)) ? 'CRITICAL' : 'RECONCILED'
      };
    }).sort((a, b) => b.exciseRisk - a.exciseRisk);

    const nationalPrecursorCeiling = Math.min(
      nat.tobacco > 0 ? nat.tobacco : Infinity, 
      nat.tow > 0 ? nat.tow : Infinity, 
      nat.paper > 0 ? nat.paper : Infinity, 
      nat.rods > 0 ? nat.rods : Infinity
    );
    
    const productionGap = Math.max(0, nat.actual - (nationalPrecursorCeiling === Infinity ? 0 : nationalPrecursorCeiling));
    const shadowProb = nat.actual > 0 ? Math.min(100, (productionGap / nat.actual) * 100) : 0;
    
    const leakageWeightage = [
      { name: 'Tobacco Deficit', value: Math.max(0, (nat.actual - nat.tobacco) / CONVERSIONS.TOBACCO), fill: '#f59e0b' },
      { name: 'Tow Deficit', value: Math.max(0, (nat.actual - nat.tow) / CONVERSIONS.TOW), fill: '#0ea5e9' },
      { name: 'Paper Deficit', value: Math.max(0, (nat.actual - nat.paper) / CONVERSIONS.PAPER), fill: '#64748b' },
      { name: 'Rods Deficit', value: Math.max(0, (nat.actual - nat.rods) / CONVERSIONS.RODS), fill: '#a855f7' }
    ].filter(d => d.value > 0);

    return { 
      entities, nat, productionGap, shadowProb, 
      leakageWeightage, 
      taxLoss: productionGap * CONVERSIONS.TAX_PER_STICK 
    };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => {
    return (auditResult?.entities || []).filter(e => 
      e.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [auditResult, searchTerm]);

  const sync = () => {
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
      error: () => {
        setLoading(false);
        alert("Failed to fetch data. Ensure sheet is public.");
      }
    });
  };

  const saveReport = () => {
    if (!reportTitle || !auditResult) return;
    const reportData = { 
      id: Date.now(), 
      title: reportTitle, 
      date: new Date().toLocaleString(), 
      nat: auditResult.nat, 
      gap: auditResult.productionGap 
    };
    const updated = [reportData, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v12_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  /**
   * RENDER UI
   */
  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans selection:bg-blue-100">
      
      {/* GLOBAL HEADER & SOURCE INPUT */}
      <div className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-7 rounded-[2rem] shadow-sm">
        <div className="flex items-center gap-5 mr-auto">
          <div className="bg-slate-900 p-4 rounded-2xl shadow-xl border-t border-slate-700">
            <ShieldAlert className="text-white" size={32}/>
          </div>
          <div>
            <h1 className="text-3xl font-black text-black uppercase tracking-tighter">
              Forensic Monitor <span className="text-blue-700">12.6</span>
            </h1>
            <p className="text-[11px] text-slate-500 font-bold uppercase tracking-[0.2em] flex items-center gap-2">
              <Landmark size={14}/> Intelligence Bureau Protocol
            </p>
          </div>
        </div>

        {/* RISK SENSITIVITY ENGINE */}
        <div className="flex items-center gap-7 bg-slate-50 px-8 py-4 rounded-3xl border-2 border-slate-200 shadow-inner">
           <div className="flex items-center gap-3 text-blue-700">
             <Sliders size={20}/> 
             <span className="text-xs font-black uppercase text-black tracking-tight">Audit Sensitivity</span>
           </div>
           <input 
             type="range" min="0" max="100" step="5" 
             value={riskThreshold} 
             onChange={(e) => setRiskThreshold(parseInt(e.target.value))} 
             className="w-40 h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" 
           />
           <span className="font-mono font-black text-blue-700 w-12 text-base">{riskThreshold}%</span>
        </div>

        {/* DATA CONNECTION TOOLBAR */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative group w-full lg:w-96">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
              <Database size={18}/>
            </div>
            <input 
              className="bg-white border-2 border-slate-200 rounded-2xl px-5 py-3.5 pl-12 text-sm w-full outline-none font-bold focus:border-blue-700 focus:ring-4 focus:ring-blue-50 transition-all" 
              placeholder="Google Sheets Public URL..." 
              value={url} 
              onChange={e => setUrl(e.target.value)} 
            />
          </div>
          <button 
            onClick={sync} 
            disabled={loading} 
            className="bg-blue-700 hover:bg-blue-800 px-10 py-4 rounded-2xl font-black text-white text-[11px] uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-3 disabled:bg-slate-400"
          >
            {loading ? <RefreshCcw className="animate-spin" size={18}/> : 'Execute Protocol'}
          </button>
          {rawData.length > 0 && (
            <button onClick={clearSession} className="bg-red-50 text-red-600 p-4 rounded-2xl border border-red-200 hover:bg-red-600 hover:text-white transition-all shadow-sm">
              <Trash2 size={22}/>
            </button>
          )}
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
          
          {/* NAVIGATION SYSTEM */}
          <div className="flex justify-between items-center border-b-4 border-slate-200">
            <div className="flex gap-14 text-[12px] font-black uppercase tracking-[0.15em]">
              <button onClick={() => setActiveTab('country')} className={`pb-5 transition-all relative ${activeTab === 'country' ? 'text-blue-700' : 'text-slate-400 hover:text-black'}`}>
                National Analysis
                {activeTab === 'country' && <div className="absolute bottom-[-4px] left-0 w-full h-1 bg-blue-700 rounded-full"/>}
              </button>
              <button onClick={() => setActiveTab('entities')} className={`pb-5 transition-all relative ${activeTab === 'entities' ? 'text-blue-700' : 'text-slate-400 hover:text-black'}`}>
                Target Table
                {activeTab === 'entities' && <div className="absolute bottom-[-4px] left-0 w-full h-1 bg-blue-700 rounded-full"/>}
              </button>
              <button onClick={() => setActiveTab('guide')} className={`pb-5 transition-all relative ${activeTab === 'guide' ? 'text-blue-700' : 'text-slate-400 hover:text-black'}`}>
                Audit Guide
                {activeTab === 'guide' && <div className="absolute bottom-[-4px] left-0 w-full h-1 bg-blue-700 rounded-full"/>}
              </button>
              <button onClick={() => setActiveTab('reports')} className={`pb-5 transition-all relative ${activeTab === 'reports' ? 'text-blue-700' : 'text-slate-400 hover:text-black'}`}>
                Archives
                {activeTab === 'reports' && <div className="absolute bottom-[-4px] left-0 w-full h-1 bg-blue-700 rounded-full"/>}
              </button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-3 pb-5">
                <input className="bg-white border-2 border-slate-200 rounded-xl px-5 py-2 text-[11px] font-black outline-none focus:border-blue-600" placeholder="Archive Reference..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="bg-emerald-700 text-white px-7 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-emerald-800 transition-all shadow-md"><Save size={16}/> Archive</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-12">
              
              {/* RESTORED V9.7 NATIONAL SUMMARY ANALYSIS + TAX SUMMARY */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
                <SummaryBox title="Tobacco Supply" val={auditResult.nat.tobacco} sub="LEAF CAPACITY (STICKS)" color="text-amber-700" />
                <SummaryBox title="Acetate Supply" val={auditResult.nat.tow} sub="TOW CAPACITY (STICKS)" color="text-sky-700" />
                <SummaryBox title="Production Gap" val={auditResult.productionGap} sub="UNSUPPORTED EXPORT VOLUME" color="text-red-600" />
                
                {/* TAX SUMMARY CARD (EMERALD V9.7 STYLE) */}
                <div className="bg-emerald-50 border-2 border-emerald-100 p-8 rounded-[2rem] shadow-sm group hover:border-emerald-300 transition-all">
                    <p className="text-[10px] font-black text-emerald-800 uppercase mb-3 tracking-widest flex items-center gap-2">
                      <Gavel size={16}/> Tax Summary
                    </p>
                    <p className="text-4xl font-black text-emerald-700">
                      ${(auditResult.taxLoss/1e9).toFixed(2)}B
                    </p>
                    <p className="text-[9px] font-bold text-emerald-600 mt-2 uppercase leading-tight">
                      ESTIMATED NATIONAL EXCISE LEAKAGE
                    </p>
                </div>

                {/* SHADOW PROBABILITY CARD */}
                <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2 text-red-400 font-black">
                          <EyeOff size={16}/><p className="text-[10px] text-white uppercase tracking-widest">Shadow Risk Score</p>
                        </div>
                        <p className="text-5xl font-black text-white">{Math.round(auditResult.shadowProb)}%</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-tight">Source Anomaly Probability</p>
                    </div>
                    <div className="absolute right-[-15px] bottom-[-15px] opacity-10 group-hover:scale-125 transition-transform duration-700">
                      <Zap size={110} className="text-red-500" />
                    </div>
                </div>
              </div>

              {/* NATIONAL CHARTS GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                
                {/* BAR CHART: SUPPLY VS OUTPUT */}
                <div className="lg:col-span-8 bg-white border border-slate-200 p-12 rounded-[3rem] shadow-sm">
                  <div className="flex justify-between items-start mb-12">
                    <h2 className="text-base font-black text-black uppercase tracking-widest flex items-center gap-3">
                      <Activity size={24} className="text-blue-700"/> National Precursor Supply Matrix
                    </h2>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Unit Conversion</p>
                      <p className="text-xs font-bold text-black uppercase">Sticks Equivalent (SE)</p>
                    </div>
                  </div>
                  <div className="h-[450px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Acetate Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Cig. Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Filter Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Actual Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          fontSize={11} 
                          fontWeight="black" 
                          tickLine={false} 
                          axisLine={false} 
                          dy={10}
                        />
                        <YAxis 
                          fontSize={11} 
                          fontWeight="bold" 
                          tickLine={false} 
                          axisLine={false} 
                          tickFormatter={(v) => (v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v.toLocaleString())} 
                        />
                        <Tooltip 
                          formatter={(v) => v.toLocaleString()} 
                          contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.2)'}} 
                        />
                        <Bar dataKey="val" radius={[10, 10, 0, 0]} barSize={65}>
                            { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* PIE CHART: SMUGGLING WEIGHTAGE (MASS) */}
                <div className="lg:col-span-4 bg-white border border-slate-200 p-10 rounded-[3rem] shadow-sm flex flex-col items-center">
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest self-start mb-2 flex items-center gap-3">
                      <Scale size={20} className="text-red-600"/> Smuggling Weighting
                    </h2>
                    <p className="text-[10px] text-slate-400 font-bold self-start mb-8 uppercase">Physical Deficit Mass (KG/Units)</p>
                    <div className="h-[320px] w-full">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie 
                                  data={auditResult.leakageWeightage} 
                                  innerRadius={70} 
                                  outerRadius={110} 
                                  paddingAngle={8} 
                                  dataKey="value"
                                >
                                    {auditResult.leakageWeightage.map((entry, index) => <Cell key={index} fill={entry.fill} stroke="none" />)}
                                </Pie>
                                <Tooltip 
                                  formatter={(v) => `${Math.round(v).toLocaleString()} KG/Units`} 
                                  contentStyle={{borderRadius: '15px', border: 'none', fontWeight: 'bold'}}
                                />
                                <Legend verticalAlign="bottom" height={40} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-8 p-5 bg-slate-50 rounded-2xl border border-slate-100 w-full">
                       <p className="text-[9px] text-slate-500 leading-relaxed font-bold uppercase text-center">
                         This weighting identifies the specific precursor volume required to bridge the production gap.
                       </p>
                    </div>
                </div>

                {/* FORENSIC LEDGER (DETAILED BALANCES) */}
                <div className="lg:col-span-12 bg-white border-2 border-slate-100 p-12 rounded-[3.5rem] shadow-sm">
                    <h2 className="text-[11px] font-black text-blue-700 uppercase mb-12 border-b-2 border-slate-50 pb-6 flex items-center justify-between">
                       <span className="flex items-center gap-3"><Calculator size={20}/> National Precursor Ledger</span>
                       <span className="text-slate-400">Unit: Sticks Equivalent (SE)</span>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                      <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                      <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                      <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                      <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                    </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-8">
              
              {/* TARGET SEARCH & EXPORT */}
              <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm gap-4">
                  <div className="relative w-full md:w-[500px]">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                      <input 
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 pl-14 pr-6 text-sm font-bold focus:border-blue-600 outline-none transition-all" 
                        placeholder="Filter by Target Entity Name..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                      />
                  </div>
                  <button onClick={() => {
                    const csv = Papa.unparse(filteredEntities);
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(blob);
                    link.download = `Audit_Target_Intelligence_${new Date().toISOString().slice(0,10)}.csv`;
                    link.click();
                  }} className="bg-slate-900 text-white p-4 rounded-2xl px-8 flex items-center gap-3 text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95">
                    <Download size={18}/> Export Intelligence Report
                  </button>
              </div>

              {/* TARGET ANALYSIS TABLE */}
              <div className="bg-white border-2 border-slate-200 rounded-[3rem] overflow-visible shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px] sticky top-0 z-30">
                    <tr>
                      <th className="p-8">Target Entity Identification</th>
                      <th className="p-8 text-center">TX Count</th>
                      <th className="p-8 text-center">Reliability</th>
                      <th className="p-8">Precursor Analysis (Sticks Eq)</th>
                      <th className="p-8 text-right">Potential Cap</th>
                      <th className="p-8 text-right text-emerald-400">Actual Output</th>
                      <th className="p-8 text-right">Tax Heatmap</th>
                      <th className="p-8 text-center">Audit Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/40 group/row relative transition-colors border-l-4 border-l-transparent hover:border-l-blue-600">
                        <td className="p-8">
                          <p className="font-black text-black text-lg group-hover/row:text-blue-700 transition-colors">{e.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Confirmed Exporter Registry</p>
                        </td>
                        <td className="p-8 text-center font-mono font-black text-slate-500 text-xl">{e.tx}</td>
                        <td className="p-8 text-center">
                            <div className="group/rel relative inline-block cursor-help">
                                <span className={`text-[11px] font-black font-mono border-2 px-4 py-1.5 rounded-xl ${e.reliability < 50 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 border-slate-200'}`}>
                                  {e.reliability.toFixed(1)}%
                                </span>
                                <div className="invisible group-hover/rel:visible opacity-0 group-hover/rel:opacity-100 absolute top-full left-1/2 -translate-x-1/2 mt-3 z-[100] w-72 bg-slate-900 text-white p-6 rounded-3xl text-[10px] font-medium leading-relaxed shadow-2xl border border-slate-700 transition-all">
                                    <p className="text-blue-400 font-black uppercase mb-2 flex items-center gap-2 border-b border-slate-700 pb-2">
                                      <Fingerprint size={14}/> Reliability Index (RI)
                                    </p>
                                    RI measures the deviation between Tobacco, Tow, and Paper. Low percentages signal a "Missing Precursor" event—where an entity is exporting finished goods without matching raw leaf imports.
                                </div>
                            </div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-2.5">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="bg-white border-2 border-slate-100 rounded-2xl px-4 py-2 flex items-center gap-3 group/pop relative cursor-help hover:border-blue-600 transition-all shadow-sm">
                                {Icons[m]} 
                                <span className="font-mono font-black text-black text-[12px]">{Math.round(s.rawQty).toLocaleString()}</span>
                                <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-[100] bg-slate-950 text-white p-5 rounded-2xl text-[11px] whitespace-nowrap shadow-2xl border border-slate-800 transition-all">
                                    <span className="text-blue-400 font-black uppercase tracking-widest">{m} RECONCILIATION</span>
                                    <div className="mt-2 space-y-1">
                                      <p>Input Qty: {Math.round(s.rawQty).toLocaleString()} {s.unit}</p>
                                      <p className="text-emerald-400 font-black">Yield Cap: {Math.round(s.sticks).toLocaleString()} SE</p>
                                    </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono font-bold text-slate-500 text-base">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-2xl text-black">{Math.round(e.actual).toLocaleString()}</td>
                        
                        {/* TAX EVASION HEATMAP COLUMN */}
                        <td className="p-8 text-right">
                            <span className={`font-mono font-black text-sm px-4 py-2 rounded-xl shadow-sm border-2 ${e.exciseRisk > 1000000 ? 'bg-red-50 text-red-700 border-red-200' : e.exciseRisk > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                ${e.exciseRisk >= 1e6 ? `${(e.exciseRisk/1e6).toFixed(1)}M` : Math.round(e.exciseRisk).toLocaleString()}
                            </span>
                        </td>

                        <td className="p-8 text-center relative overflow-visible">
                           <div className="group/risk relative inline-block">
                              <span className={`px-8 py-3 rounded-full text-[11px] font-black tracking-[0.15em] border-2 flex items-center gap-3 uppercase cursor-pointer transition-all ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'}`}>
                                  {e.risk === 'CRITICAL' ? <AlertTriangle size={14} className="animate-pulse"/> : <CheckCircle size={14}/>} {e.risk}
                              </span>
                              
                              {/* RESTORED V9.8 PROSE NARRATIVE */}
                              <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute top-full right-0 mt-3 z-[100] w-96 bg-white border-4 border-slate-900 p-8 rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] text-left transition-all">
                                  <div className="flex justify-between items-center border-b-2 border-slate-100 pb-4 mb-4">
                                    <p className="font-black text-xs uppercase flex items-center gap-3 text-slate-900"><Info size={20} className="text-blue-700"/> Forensic Evidence Log</p>
                                    <span className="text-[10px] font-black text-slate-400">{new Date().toLocaleDateString()}</span>
                                  </div>
                                  <p className="text-xs text-black leading-relaxed font-bold">
                                    {e.risk === 'CRITICAL' ? (
                                        (e.actual > 0 && e.tobacco === 0) 
                                        ? "CRITICAL ALERT: Physical exports confirmed in national registry, but zero tobacco leaf imports recorded for this entity. This factory is sourcing raw materials from undisclosed, clandestine shadow markets."
                                        : `CRITICAL ALERT: Actual export volume exceeds the maximum calculated precursor ceiling by ${Math.round((e.actual/e.minPot - 1)*100)}%. This output is mathematically impossible under current legal import transparency.`
                                    ) : (
                                        "RECONCILED: The entity's physical export volume aligns with recorded precursor material imports within the allowed variance threshold. No shadow signal detected."
                                    )}
                                  </p>
                                  <div className="mt-6 pt-5 border-t border-slate-100 flex justify-between items-center">
                                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Est. Recovery Potential</p>
                                      <p className="text-red-700 font-mono font-black text-lg">${Math.round(e.exciseRisk).toLocaleString()}</p>
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
          ) : activeTab === 'guide' ? (
            
            /* RESTORED AUDIT GUIDE TAB (V9.9 FULL CONTENT) */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-in slide-in-from-bottom-8 duration-700">
               
               {/* DEFINITIONS PANEL */}
               <div className="bg-white border-2 border-slate-200 p-12 rounded-[3.5rem] shadow-sm">
                  <h2 className="text-2xl font-black mb-10 uppercase tracking-tight flex items-center gap-4 border-b-4 border-blue-50 pb-6">
                    <Gavel className="text-blue-700" size={32}/> Forensic Audit Protocol
                  </h2>
                  <div className="space-y-10">
                    <div className="group">
                        <p className="font-black text-sm uppercase text-blue-700 flex items-center gap-3 mb-2">
                          <Target size={18}/> Reliability Index (RI)
                        </p>
                        <p className="text-xs text-slate-600 font-bold leading-relaxed border-l-4 border-blue-100 pl-6 group-hover:border-blue-600 transition-colors">
                          The RI measures the consistency of the precursor supply chain. A score of 100% means an entity's imports of Tobacco, Tow, and Paper are perfectly synchronized to produce the same volume of finished product. A low score (under 50%) indicates a "Precursor Mismatch"—suggesting certain ingredients are being sourced from the shadow market while others are imported legally.
                        </p>
                    </div>
                    <div className="group">
                        <p className="font-black text-sm uppercase text-red-600 flex items-center gap-3 mb-2">
                          <TrendingUp size={18}/> Smuggling Weighting
                        </p>
                        <p className="text-xs text-slate-600 font-bold leading-relaxed border-l-4 border-red-50 pl-6 group-hover:border-red-600 transition-colors">
                          Identifies the physical mass (KG/Units) of illegal raw material required to sustain the current "unsupported" export volume. This weighting allows agents to prioritize searches for specific missing materials (e.g., hidden Acetate Tow shipments versus hidden Raw Leaf).
                        </p>
                    </div>
                    <div className="group">
                        <p className="font-black text-sm uppercase text-slate-900 flex items-center gap-3 mb-2">
                          <Fingerprint size={18}/> Shadow Probability Algorithm
                        </p>
                        <p className="text-xs text-slate-600 font-bold leading-relaxed border-l-4 border-slate-100 pl-6 group-hover:border-slate-900 transition-colors">
                          A national-level calculation comparing total precursor imports against total physical exports. Any deviation beyond the set Sensitivity Threshold results in a "Critical" flag, indicating a high likelihood of clandestine factory activity.
                        </p>
                    </div>
                  </div>
               </div>

               {/* YIELD CONSTANTS PANEL */}
               <div className="bg-slate-900 text-white p-12 rounded-[3.5rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-10 opacity-5">
                    <Calculator size={200}/>
                  </div>
                  <h2 className="text-2xl font-black mb-10 uppercase tracking-tight text-blue-400 flex items-center gap-4 border-b-2 border-slate-800 pb-6">
                    <Calculator size={32}/> Yield Conversion Constants
                  </h2>
                  <div className="space-y-8 font-mono">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                      <span className="text-slate-400 text-xs font-bold uppercase">Tobacco Leaf (KG)</span> 
                      <span className="text-blue-400 font-black text-lg">{CONVERSIONS.TOBACCO} Sticks</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                      <span className="text-slate-400 text-xs font-bold uppercase">Acetate Tow (KG)</span> 
                      <span className="text-blue-400 font-black text-lg">{CONVERSIONS.TOW} Sticks</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                      <span className="text-slate-400 text-xs font-bold uppercase">Cig. Paper (KG)</span> 
                      <span className="text-blue-400 font-black text-lg">{CONVERSIONS.PAPER} Sticks</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                      <span className="text-slate-400 text-xs font-bold uppercase">Filter Rods (PCS)</span> 
                      <span className="text-blue-400 font-black text-lg">{CONVERSIONS.RODS} Sticks</span>
                    </div>
                    
                    <div className="mt-16 pt-10 border-t-2 border-slate-800">
                        <p className="text-[10px] font-black uppercase text-slate-500 mb-6 tracking-[0.3em]">National Taxation Logic</p>
                        <div className="flex justify-between items-center text-emerald-400 font-black mb-4">
                          <span className="text-xs">Standard Excise Rate</span> 
                          <span className="text-2xl">$0.15 / Stick</span>
                        </div>
                        <div className="flex justify-between items-center text-emerald-400 font-black">
                          <span className="text-xs">Master Case Volume</span> 
                          <span className="text-2xl">10,000 Sticks</span>
                        </div>
                    </div>
                  </div>
               </div>
            </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-10 rounded-[2.5rem] shadow-sm hover:border-blue-600 transition-all group">
                   <div className="flex justify-between mb-8">
                    <div className="bg-slate-100 p-4 rounded-2xl group-hover:bg-blue-700 group-hover:text-white transition-all">
                      <History size={28}/>
                    </div>
                    <button onClick={() => { 
                      const updated = reports.filter(x => x.id !== r.id);
                      setReports(updated); 
                      localStorage.setItem('forensic_v12_reports', JSON.stringify(updated)); 
                    }} className="text-slate-300 hover:text-red-600 transition-colors">
                      <Trash2 size={24}/>
                    </button>
                  </div>
                  <h3 className="font-black text-black text-2xl mb-2">{r.title}</h3>
                  <p className="text-[11px] text-slate-400 font-bold mb-8 uppercase tracking-widest">{r.date}</p>
                  <div className="space-y-4 mb-10 border-y py-6 border-slate-50">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-500">PRODUCTION GAP</span> 
                      <span className="text-red-600 font-mono">{Math.round(r.gap).toLocaleString()}</span>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab('country')} className="w-full bg-slate-900 py-4 rounded-2xl text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md active:scale-95">
                    Restore Snapshot
                  </button>
                </div>
              ))}
              {reports.length === 0 && (
                <div className="col-span-full py-24 text-center bg-slate-100 border-4 border-dashed border-slate-300 rounded-[3rem]">
                   <History className="mx-auto mb-6 text-slate-300" size={60} />
                   <p className="text-slate-400 font-black uppercase text-sm tracking-widest">No historical snapshots available.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * REUSABLE UI COMPONENTS (INTERNAL)
 */
function SummaryBox({ title, val, sub, color }) {
    return (
        <div className="bg-white border-2 border-slate-100 p-8 rounded-[2rem] shadow-sm hover:border-blue-200 transition-all group">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-[0.15em]">{title}</p>
            <p className={`text-4xl font-black ${color} group-hover:scale-105 transition-transform duration-500 origin-left`}>
              {typeof val === 'number' ? Math.round(val).toLocaleString() : val}
            </p>
            <p className="text-[9px] font-bold text-slate-500 mt-2 uppercase tracking-tight">{sub}</p>
        </div>
    );
}

function BalanceRow({ label, kg, sticks, unit, color, ratio }) {
  return (
    <div className="group relative">
      <div className="flex justify-between items-end cursor-help border-b-2 border-slate-50 pb-5 hover:border-blue-300 transition-all">
        <div className="flex items-center gap-5">
          <div className={`w-2.5 h-12 rounded-full ${color} shadow-lg shadow-${color}/20`}/>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{label}</p>
            <p className="text-2xl font-black text-black">
              {Math.round(kg).toLocaleString()} <span className="text-[11px] font-bold text-slate-300 uppercase">{unit}</span>
            </p>
          </div>
        </div>
        <div className="text-right">
            <p className="text-lg font-black text-blue-700 font-mono tracking-tighter">{Math.round(sticks).toLocaleString()}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sticks Eq</p>
        </div>
      </div>
      
      {/* HOVER TOOLTIP LOGIC */}
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute right-0 bottom-full mb-4 z-[100] bg-slate-900 text-white p-7 rounded-3xl text-[11px] font-mono min-w-[300px] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)] transition-all border border-slate-700 pointer-events-none">
         <p className="text-blue-400 font-black uppercase mb-4 border-b border-slate-700 pb-3 flex items-center gap-3">
           <Calculator size={18}/> Forensic Conversion Engine
         </p>
         <div className="space-y-2">
            <div className="flex justify-between border-b border-slate-800 pb-1"><span>Physical Registry:</span> <span>{Math.round(kg).toLocaleString()} {unit}</span></div>
            <div className="flex justify-between border-b border-slate-800 pb-1"><span>Material Factor:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-3 text-emerald-400 font-black text-sm">
                <span>Stick Potential (SE):</span> <span>{Math.round(sticks).toLocaleString()}</span>
            </div>
         </div>
         <p className="mt-5 text-[9px] text-slate-500 leading-relaxed font-bold uppercase italic">
           Calculated using national yield standards for legal precursor utilization.
         </p>
      </div>
    </div>
  );
}

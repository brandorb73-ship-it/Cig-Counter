"use client";

import React, { 
  useState, 
  useEffect, 
  useMemo 
} from 'react';
import Papa from 'papaparse';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { 
  ShieldAlert, 
  Activity, 
  Database, 
  Wind, 
  FileText, 
  Pipette, 
  Trash2, 
  Calculator, 
  AlertTriangle, 
  RefreshCcw, 
  Save, 
  History, 
  Search, 
  Info, 
  Sliders, 
  CheckCircle, 
  TrendingUp, 
  Eraser, 
  Layers 
} from 'lucide-react';

/**
 * Audit Conversion Standards
 * Tobacco: 1kg -> 1333.33 sticks
 * Acetate Tow: 1kg -> 8333.33 sticks
 * Paper: 1kg -> 20,000 sticks
 * Rods: 1 unit -> 6 sticks
 */
const CONVERSIONS = {
  'TOBACCO': 1333.33, 
  'TOW': 8333.33, 
  'PAPER': 20000, 
  'RODS': 6,
  'CIGARETTES_WT': 1333.33,
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
  'TOBACCO': <Database className="text-amber-700" size={22} />,
  'TOW': <Wind className="text-sky-700" size={22} />,
  'PAPER': <FileText className="text-slate-700" size={22} />,
  'RODS': <Pipette className="text-purple-700" size={22} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={22} />
};

export default function ForensicGradeV14() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  // Load persistence on mount
  useEffect(() => {
    const saved = localStorage.getItem('forensic_v14_reports');
    if (saved) {
      setReports(JSON.parse(saved));
    }
  }, []);

  /**
   * CORE AUDIT ENGINE
   * Processes CSV rows into entity-based material balances
   */
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
          name: entity, 
          tobacco: 0, 
          tow: 0, 
          paper: 0, 
          rods: 0, 
          actual: 0, 
          materials: {}, 
          tx: 0 
        };
      }

      const mR = (row.Material || '').toUpperCase();
      let mat = null;
      
      // Material Categorization
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
        let sticks = 0;
        if (unit === 'MIL') {
          sticks = qty * 1000000;
        } else if (['KG', 'KGM', 'TON', 'MT'].includes(unit)) {
          sticks = convQty * CONVERSIONS.CIGARETTES_WT;
        } else {
          sticks = convQty;
        }
        
        registry[entity].actual += sticks;
        nat.actual += sticks;
        
        if (!registry[entity].materials[mat]) {
          registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, calc: "" };
        }
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
        registry[entity].materials[mat].calc = `${qty.toLocaleString()} ${unit} × ${sticks/qty === 1000000 ? "1M" : CONVERSIONS.CIGARETTES_WT}`;
      } 
      else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        
        // Populate National Object
        if (mat === 'TOBACCO') nat.tobaccoKg += convQty;
        if (mat === 'TOW') nat.towKg += convQty;
        if (mat === 'PAPER') nat.paperKg += convQty;
        if (mat === 'RODS') nat.rodsUnits += convQty;
        nat[mat.toLowerCase()] += sticks;

        if (!registry[entity].materials[mat]) {
          registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, calc: "" };
        }
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
        registry[entity].materials[mat].calc = `${qty.toLocaleString()} ${unit} × ${CONVERSIONS[mat]}`;
      }
    });

    // Determine Risk Status
    const entities = Object.values(registry).map(e => {
      const precursors = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      
      // TOBACCO ANCHOR: Potential is 0 if Tobacco is missing
      const minPot = (e.tobacco === 0) ? 0 : Math.min(...precursors);
      
      const isZeroTobacco = e.actual > 0 && e.tobacco === 0;
      const thresholdLimit = minPot * (1 + riskThreshold / 100);
      const isOverCap = e.actual > thresholdLimit;
      
      return { 
        ...e, 
        minPot, 
        risk: (isZeroTobacco || isOverCap) ? 'CRITICAL' : 'RECONCILED', 
        violationType: isZeroTobacco ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : 'NONE' 
      };
    }).sort((a, b) => b.actual - a.actual);

    return { entities, nat };
  }, [rawData, riskThreshold]);

  /**
   * UI HANDLERS
   */
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
      complete: (res) => { 
        setRawData(res.data); 
        setLoading(false); 
      } 
    });
  };

  const clearDashboard = () => {
    setRawData([]);
    setUrl('');
    setSearchTerm('');
  };

  const saveToArchive = () => {
    if (!reportTitle) return;
    const newReport = { 
      id: Date.now(), 
      title: reportTitle, 
      data: rawData, 
      date: new Date().toLocaleString() 
    };
    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v14_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  // Strategic Intelligence Math
  const nationalLimitingFactor = auditResult 
    ? (auditResult.nat.tobacco < auditResult.nat.tow ? 'Tobacco' : 'Acetate Tow') 
    : '';
    
  const nationalPotential = auditResult 
    ? Math.min(auditResult.nat.tobacco, auditResult.nat.tow, auditResult.nat.paper) 
    : 0;
    
  // Fixed percentage logic (Actual vs Potential)
  const shadowMarketPercent = (auditResult && nationalPotential > 0) 
    ? Math.max(0, ((auditResult.nat.actual / nationalPotential) - 1) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans antialiased">
      
      {/* HEADER: CONFIGURATION & SYNC */}
      <header className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row items-center gap-8 bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm">
        <div className="flex items-center gap-6 mr-auto">
          <div className="bg-slate-900 p-5 rounded-2xl">
            <ShieldAlert className="text-white" size={36}/>
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight">
              Forensic Monitor <span className="text-blue-600">v9.14</span>
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.3em]">
              Mass-Balance Reconciliation System
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-8 bg-slate-100 px-8 py-5 rounded-[1.5rem] border border-slate-200">
           <div className="flex flex-col">
             <span className="text-[10px] font-black uppercase text-slate-500 mb-2">Sensitivity Threshold</span>
             <div className="flex items-center gap-6">
               <input 
                 type="range" 
                 min="0" 
                 max="100" 
                 step="5" 
                 value={riskThreshold} 
                 onChange={(e) => setRiskThreshold(parseInt(e.target.value))} 
                 className="w-40 accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none" 
               />
               <span className="font-mono font-black text-blue-600 text-lg">{riskThreshold}%</span>
             </div>
           </div>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto">
          <input 
            className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold w-full lg:w-96 outline-none focus:border-blue-600 transition-all" 
            placeholder="Paste Google Sheet URL..." 
            value={url} 
            onChange={e => setUrl(e.target.value)} 
          />
          <button 
            onClick={handleSync} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all active:scale-95"
          >
            Run Audit
          </button>
          <button 
            onClick={clearDashboard} 
            className="p-4 text-slate-400 hover:text-red-600 bg-white border-2 border-slate-100 rounded-2xl transition-all flex items-center gap-2 font-black text-xs uppercase tracking-widest active:bg-red-50"
          >
            <Eraser size={22}/> Clear
          </button>
        </div>
      </header>

      {auditResult && (
        <main className="max-w-[1600px] mx-auto space-y-12">
          
          {/* NAVIGATION */}
          <nav className="flex gap-14 text-sm font-black uppercase tracking-[0.2em] border-b-2 border-slate-200">
            <button 
              onClick={() => setActiveTab('country')} 
              className={`pb-6 transition-all relative ${activeTab === 'country' ? 'text-blue-600' : 'text-slate-400'}`}
            >
              Country Intelligence
              {activeTab === 'country' && <div className="absolute bottom-[-2px] left-0 w-full h-1.5 bg-blue-600 rounded-full"/>}
            </button>
            <button 
              onClick={() => setActiveTab('entities')} 
              className={`pb-6 transition-all relative ${activeTab === 'entities' ? 'text-blue-600' : 'text-slate-400'}`}
            >
              Target Analysis
              {activeTab === 'entities' && <div className="absolute bottom-[-2px] left-0 w-full h-1.5 bg-blue-600 rounded-full"/>}
            </button>
            <button 
              onClick={() => setActiveTab('reports')} 
              className={`pb-6 transition-all relative ${activeTab === 'reports' ? 'text-blue-600' : 'text-slate-400'}`}
            >
              Archived Reports
              {activeTab === 'reports' && <div className="absolute bottom-[-2px] left-0 w-full h-1.5 bg-blue-600 rounded-full"/>}
            </button>
          </nav>

          {activeTab === 'country' ? (
            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                
                {/* NATIONAL GRAPH */}
                <section className="lg:col-span-8 bg-white border border-slate-200 p-12 rounded-[3.5rem] shadow-sm">
                  <h2 className="text-xl font-black uppercase mb-12 flex items-center gap-4">
                    <Activity className="text-blue-600" size={28}/> 
                    National Precursor Balance
                  </h2>
                  <div className="h-[520px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Acetate Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Cig. Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Filter Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Actual Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" fontSize={12} fontWeight="900" axisLine={false} tickLine={false} dy={15} />
                        <YAxis fontSize={12} fontWeight="900" axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip cursor={{fill: '#f8fafc'}} />
                        <Bar dataKey="val" radius={[12, 12, 0, 0]} barSize={70}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* NATIONAL STATS SIDEBAR */}
                <aside className="lg:col-span-4 bg-white border border-slate-200 p-10 rounded-[3.5rem] shadow-sm flex flex-col">
                  <h2 className="text-xs font-black text-blue-600 uppercase tracking-[0.2em] border-b-2 border-slate-50 pb-8 mb-10 text-center">
                    Audit Conversion Matrix
                  </h2>
                  <div className="space-y-10 flex-1">
                    <BalanceRow label="Raw Tobacco" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-500" />
                    <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-500" />
                    <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-500" />
                    <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-500" />
                  </div>
                  <div className="mt-10 pt-10 border-t-2 border-slate-100">
                     <p className="text-[11px] font-black uppercase text-slate-400 mb-2 tracking-widest">Global Shadow Stick Surplus</p>
                     <p className="text-5xl font-black text-red-700 font-mono tracking-tighter">
                       {Math.round(auditResult.nat.actual - auditResult.nat.tobacco).toLocaleString()}
                     </p>
                     <p className="text-xs font-bold text-slate-400 mt-2 italic uppercase">Unrecorded production volume</p>
                  </div>
                </aside>
              </div>

              {/* INTEL CARDS & GUIDES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <section className="bg-slate-900 text-white p-12 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-125 transition-transform duration-500">
                    <TrendingUp size={140}/>
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-widest mb-8 flex items-center gap-3 text-blue-400">
                    <Layers size={24}/> Strategic Assessment
                  </h3>
                  <div className="space-y-6 relative z-10">
                    <div>
                      <p className="text-xs font-black text-slate-500 uppercase mb-1">National Bottleneck</p>
                      <p className="text-2xl font-black text-white">{nationalLimitingFactor}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-500 uppercase mb-1">Production Above Ceiling</p>
                      <p className="text-4xl font-black text-emerald-400 font-mono tracking-tighter">
                        {shadowMarketPercent.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </section>

                <div className="bg-white p-12 rounded-[3rem] border-2 border-slate-100">
                  <h3 className="text-slate-900 font-black text-sm mb-6 flex items-center gap-3 uppercase tracking-widest">
                    <Info size={24} className="text-blue-600"/> The Tobacco Ceiling
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-500 font-bold uppercase italic">
                    Tobacco is the anchor precursor. If a manufacturer has no recorded tobacco imports but exports finished cigarettes, they are utilizing shadow-market raw leaf.
                  </p>
                </div>

                <div className="bg-white p-12 rounded-[3rem] border-2 border-slate-100 shadow-sm border-emerald-50">
                  <h3 className="text-slate-900 font-black text-sm mb-6 flex items-center gap-3 uppercase tracking-widest">
                    <CheckCircle size={24} className="text-emerald-600"/> Reconciled Audit Guide
                  </h3>
                  <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
                    <p className="text-xs leading-relaxed text-emerald-900 font-black uppercase mb-4">
                      Reconciled Condition:
                    </p>
                    <p className="text-sm font-mono font-black text-emerald-700 bg-white p-3 rounded-lg border border-emerald-200 text-center">
                      Actual ≤ (Potential + {riskThreshold}%)
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-4 italic">
                      *Potential is 0 if tobacco input is 0.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-10 animate-in slide-in-from-bottom-8 duration-500">
              
              {/* SEARCH & FILTERED SUMMARY BAR */}
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1 flex items-center gap-5 bg-white p-7 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
                  <Search className="text-slate-400" size={32}/>
                  <input 
                    className="w-full outline-none font-black text-2xl placeholder:text-slate-300" 
                    placeholder="Search Entity Name..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                  />
                </div>
                <div className="bg-slate-900 text-white px-12 py-7 rounded-[2.5rem] flex items-center gap-16 shadow-2xl">
                   <div className="text-center">
                     <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Aggregate Actual</p>
                     <p className="font-mono font-black text-emerald-400 text-3xl tabular-nums">
                       {Math.round(filteredSums.actual).toLocaleString()}
                     </p>
                   </div>
                   <div className="text-center">
                     <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Aggregate Potential</p>
                     <p className="font-mono font-black text-blue-400 text-3xl tabular-nums">
                       {Math.round(filteredSums.minPot).toLocaleString()}
                     </p>
                   </div>
                   <div className="text-center">
                     <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Total TX</p>
                     <p className="font-mono font-black text-white text-3xl tabular-nums">
                       {filteredSums.tx}
                     </p>
                   </div>
                </div>
              </div>

              {/* TARGET ENTITY TABLE */}
              <div className="bg-white border-2 border-slate-100 rounded-[3.5rem] overflow-hidden shadow-xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-900 text-white uppercase font-black text-xs tracking-[0.25em]">
                    <tr>
                      <th className="p-12">Entity Target</th>
                      <th className="p-12 text-center">TX</th>
                      <th className="p-12">Material Logistics</th>
                      <th className="p-12 text-right">Potential Cap</th>
                      <th className="p-12 text-right text-emerald-400">Actual Exports</th>
                      <th className="p-12 text-center">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-50">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/30 transition-all group">
                        <td className="p-12 font-black text-2xl text-slate-900 w-1/4 leading-tight group-hover:text-blue-700 transition-colors">
                          {e.name}
                        </td>
                        <td className="p-12 text-center font-mono font-black text-xl text-slate-400 group-hover:text-slate-900">
                          {e.tx}
                        </td>
                        <td className="p-12">
                          <div className="flex flex-wrap gap-5">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div 
                                key={m} 
                                className="group/calc relative flex items-center gap-4 bg-white border-2 border-slate-200 px-6 py-4 rounded-2xl hover:border-blue-500 hover:shadow-lg transition-all cursor-help"
                              >
                                {Icons[m]}
                                <span className="text-lg font-black text-slate-800">
                                  {Math.round(s.rawQty).toLocaleString()} <span className="text-xs text-slate-400">{s.unit}</span>
                                </span>
                                
                                {/* STICK CALCULATION HOVER TOOLTIP */}
                                <div className="invisible group-hover/calc:visible opacity-0 group-hover/calc:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-5 bg-slate-900 text-white p-6 rounded-2xl text-sm font-mono w-64 shadow-2xl z-50 transition-all pointer-events-none border border-slate-700">
                                  <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-2">
                                    <Calculator size={16} className="text-blue-400"/>
                                    <p className="text-blue-400 text-[10px] uppercase font-black tracking-widest">Stick Conversion</p>
                                  </div>
                                  <p className="text-white text-base leading-relaxed">
                                    {s.calc}
                                  </p>
                                  <p className="text-emerald-400 font-black mt-2 text-right">
                                    = {Math.round(s.sticks).toLocaleString()} Sticks
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-12 text-right font-mono text-xl font-bold text-slate-400">
                          {Math.round(e.minPot).toLocaleString()}
                        </td>
                        <td className="p-12 text-right font-mono text-3xl font-black text-slate-900 tabular-nums">
                          {Math.round(e.actual).toLocaleString()}
                        </td>
                        <td className="p-12 text-center">
                           <div className="group/note relative inline-block">
                              <span className={`px-10 py-4 rounded-full text-xs font-black tracking-[0.2em] border-2 transition-all shadow-sm ${
                                e.risk === 'CRITICAL' 
                                ? 'bg-red-50 text-red-700 border-red-200' 
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}>
                                {e.risk}
                              </span>
                              
                              {/* AUDIT MATH VERIFICATION HOVER TOOLTIP */}
                              <div className="invisible group-hover/note:visible opacity-0 group-hover/note:opacity-100 absolute bottom-full right-0 mb-8 w-[400px] bg-slate-900 text-white p-10 rounded-[2.5rem] text-left shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] z-50 transition-all border border-slate-700">
                                <h4 className="text-blue-400 text-[11px] font-black uppercase mb-6 tracking-[0.3em] flex items-center gap-3">
                                  <Calculator size={20}/> Forensic Verification Math
                                </h4>
                                <div className="space-y-4 mb-8 font-mono text-sm border-b border-slate-700 pb-6">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Actual Exports:</span>
                                    <span className="font-black tabular-nums">{Math.round(e.actual).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Precursor Capacity:</span>
                                    <span className="font-black tabular-nums">{Math.round(e.minPot).toLocaleString()}</span>
                                  </div>
                                  <div className={`flex justify-between font-black text-lg pt-4 border-t border-slate-800 ${e.actual > e.minPot ? 'text-red-400' : 'text-emerald-400'}`}>
                                    <span>Variance:</span>
                                    <span className="tabular-nums">
                                      {e.actual > e.minPot ? '+' : ''}{Math.round(e.actual - e.minPot).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-sm font-bold leading-relaxed text-slate-300 uppercase italic">
                                  {e.violationType === 'ZERO_TOBACCO' ? "VIOLATION DETECTED: Entity is exporting finished sticks while maintaining zero recorded legal tobacco imports." :
                                   e.violationType === 'OVER_CAP' ? `THRESHOLD BREACH: Production exceeds precursor cap by ${Math.round(e.actual - e.minPot).toLocaleString()} sticks (>${riskThreshold}% allowance).` :
                                   `AUDIT PASSED: Entity exports remain within verified legal precursor and threshold limits.`}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pb-32">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-100 p-12 rounded-[3.5rem] shadow-sm hover:shadow-2xl transition-all group relative border-b-8 border-b-slate-900">
                   <div className="flex justify-between mb-10">
                    <div className="bg-slate-100 p-6 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <History size={36}/>
                    </div>
                    <button 
                      onClick={() => {
                        const updated = reports.filter(x => x.id !== r.id);
                        setReports(updated);
                        localStorage.setItem('forensic_v14_reports', JSON.stringify(updated));
                      }} 
                      className="text-slate-300 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={28}/>
                    </button>
                  </div>
                  <h3 className="font-black text-3xl mb-3 text-slate-900">{r.title}</h3>
                  <p className="text-xs text-slate-400 font-bold mb-12 tracking-[0.2em] uppercase italic">{r.date}</p>
                  <button 
                    onClick={() => {setRawData(r.data); setActiveTab('country');}} 
                    className="w-full bg-slate-900 py-6 rounded-2xl text-white font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl active:scale-95"
                  >
                    Restore Report State
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

/**
 * COMPONENT: BalanceRow
 * Displays sidebar material totals
 */
function BalanceRow({ label, kg, sticks, unit, color }) {
  return (
    <div className="flex justify-between items-center group cursor-default">
      <div className="flex items-center gap-6">
        <div className={`w-3 h-14 rounded-full ${color} opacity-80 group-hover:opacity-100 transition-all`}/>
        <div>
          <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest mb-1">{label}</p>
          <p className="text-2xl font-black text-slate-900 tabular-nums leading-tight">
            {Math.round(kg).toLocaleString()} <span className="text-xs font-bold text-slate-300">{unit}</span>
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-base font-black text-blue-600 font-mono tracking-tighter tabular-nums">
          {Math.round(sticks).toLocaleString()}
        </p>
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Verified Sticks</p>
      </div>
    </div>
  );
}

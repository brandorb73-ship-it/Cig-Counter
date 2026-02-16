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
  Save, 
  History, 
  Search, 
  Info, 
  CheckCircle, 
  TrendingUp, 
  Eraser, 
  Layers 
} from 'lucide-react';

/**
 * GLOBAL CONVERSION CONSTANTS
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
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ForensicGradeV16() {
  // STATE MANAGEMENT
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  // LOAD ARCHIVES
  useEffect(() => {
    const saved = localStorage.getItem('forensic_v16_reports');
    if (saved) {
      setReports(JSON.parse(saved));
    }
  }, []);

  /**
   * DATA PROCESSING ENGINE
   */
  const auditResult = useMemo(() => {
    if (rawData.length === 0) return null;
    
    const registry = {};
    let nat = { 
      tobacco: 0, 
      tow: 0, 
      paper: 0, 
      rods: 0, 
      actual: 0, 
      tobaccoKg: 0, 
      towKg: 0, 
      paperKg: 0, 
      rodsUnits: 0 
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
        let sticks = (unit === 'MIL') 
          ? qty * 1000000 
          : (['KG', 'KGM', 'TON', 'MT'].includes(unit)) 
            ? convQty * CONVERSIONS.CIGARETTES_WT 
            : convQty;
            
        registry[entity].actual += sticks;
        nat.actual += sticks;

        if (!registry[entity].materials[mat]) {
          registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, calc: "" };
        }
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
        registry[entity].materials[mat].calc = `${qty.toLocaleString()} ${unit} × ${sticks/qty === 1000000 ? "1M" : "1,333"}`;
      } 
      else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        
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
        registry[entity].materials[mat].calc = `${qty.toLocaleString()} ${unit} × ${CONVERSIONS[mat].toLocaleString()}`;
      }
    });

    const entities = Object.values(registry).map(e => {
      const precursors = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPot = (e.tobacco === 0) ? 0 : Math.min(...precursors);
      const isZeroTobacco = e.actual > 0 && e.tobacco === 0;
      const isOverCap = e.actual > (minPot * (1 + riskThreshold / 100));
      
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
   * FILTER LOGIC
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

  /**
   * ACTION HANDLERS
   */
  const handleSync = () => {
    if (!url) return;
    setLoading(true);
    const csvUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(csvUrl, { 
      download: true, 
      header: true, 
      complete: (res) => { 
        setRawData(res.data); 
        setLoading(false); 
      } 
    });
  };

  const handleClear = () => {
    setRawData([]);
    setUrl('');
    setSearchTerm('');
  };

  const handleSave = () => {
    if (!reportTitle) return;
    const newReport = { 
      id: Date.now(), 
      title: reportTitle, 
      data: rawData, 
      date: new Date().toLocaleString() 
    };
    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v16_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  // BOTTLENECK LOGIC
  const nationalLimitingFactor = auditResult 
    ? (auditResult.nat.tobacco < auditResult.nat.tow ? 'Raw Tobacco' : 'Acetate Tow') 
    : '';

  const nationalPotential = auditResult 
    ? Math.min(
        auditResult.nat.tobacco || Infinity, 
        auditResult.nat.tow || Infinity, 
        auditResult.nat.paper || Infinity
      ) 
    : 0;

  // CORRECTED PERCENTAGE: If 1.2B Actual vs 1B Potential, show 20% Surplus
  const shadowMarketPercent = (nationalPotential > 0) 
    ? ((auditResult.nat.actual / nationalPotential) - 1) * 100 
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      
      {/* HEADER SECTION */}
      <header className="max-w-[1600px] mx-auto mb-10 flex flex-col lg:flex-row items-center gap-8 bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm">
        <div className="flex items-center gap-5 mr-auto">
          <div className="bg-slate-900 p-4 rounded-2xl">
            <ShieldAlert className="text-white" size={32}/>
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">
              Forensic Monitor <span className="text-blue-600">v9.16</span>
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-6 bg-slate-100 px-8 py-4 rounded-2xl border border-slate-200">
           <div className="flex flex-col">
             <span className="text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Risk Sensitivity</span>
             <div className="flex items-center gap-4">
               <input 
                type="range" min="0" max="100" step="5" 
                value={riskThreshold} 
                onChange={(e) => setRiskThreshold(parseInt(e.target.value))} 
                className="w-32 accent-blue-600 cursor-pointer" 
               />
               <span className="font-mono font-black text-blue-600">{riskThreshold}%</span>
             </div>
           </div>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto">
          <input 
            className="bg-slate-50 border border-slate-200 rounded-xl px-6 py-3 text-sm font-bold w-full lg:w-80 outline-none focus:border-blue-600 transition-all" 
            placeholder="Sheet URL..." 
            value={url} 
            onChange={e => setUrl(e.target.value)} 
          />
          <button 
            onClick={handleSync} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black text-xs uppercase transition-all shadow-md"
          >
            Run Audit
          </button>
          <button 
            onClick={handleClear} 
            className="p-3 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-xl transition-all shadow-sm"
          >
            <Eraser size={20}/>
          </button>
        </div>
      </header>

      {auditResult && (
        <main className="max-w-[1600px] mx-auto space-y-10">
          
          {/* TABS */}
          <nav className="flex gap-12 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 border-slate-200">
            <button 
              onClick={() => setActiveTab('country')} 
              className={`pb-5 transition-all ${activeTab === 'country' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400'}`}
            >
              Country Intel
            </button>
            <button 
              onClick={() => setActiveTab('entities')} 
              className={`pb-5 transition-all ${activeTab === 'entities' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400'}`}
            >
              Target Analysis
            </button>
            <button 
              onClick={() => setActiveTab('reports')} 
              className={`pb-5 transition-all ${activeTab === 'reports' ? 'text-blue-600 border-b-4 border-blue-600' : 'text-slate-400'}`}
            >
              Archives
            </button>
          </nav>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                
                {/* NATIONAL CHART */}
                <section className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-xs font-black uppercase mb-10 flex items-center gap-3 text-slate-400 tracking-widest">
                    <Activity size={20}/> National Precursor Supply
                  </h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Actual', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} />
                        <YAxis 
                          fontSize={10} 
                          fontWeight="900" 
                          axisLine={false} 
                          tickLine={false} 
                          tickFormatter={(v) => v.toLocaleString()} 
                        />
                        <Tooltip 
                          formatter={(v) => v.toLocaleString()} 
                          contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 'bold'}}
                        />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* SIDEBAR CONVERSION MATRIX */}
                <aside className="lg:col-span-4 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm flex flex-col">
                  <h2 className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b pb-6 mb-8">
                    Audit Conversion Matrix
                  </h2>
                  <div className="space-y-8 flex-1">
                    <BalanceRow 
                      label="Raw Tobacco" 
                      kg={auditResult.nat.tobaccoKg} 
                      sticks={auditResult.nat.tobacco} 
                      unit="KG" 
                      factor={CONVERSIONS.TOBACCO} 
                      color="bg-amber-500" 
                    />
                    <BalanceRow 
                      label="Acetate Tow" 
                      kg={auditResult.nat.towKg} 
                      sticks={auditResult.nat.tow} 
                      unit="KG" 
                      factor={CONVERSIONS.TOW} 
                      color="bg-sky-500" 
                    />
                    <BalanceRow 
                      label="Filter Rods" 
                      kg={auditResult.nat.rodsUnits} 
                      sticks={auditResult.nat.rods} 
                      unit="PCS" 
                      factor={CONVERSIONS.RODS} 
                      color="bg-purple-500" 
                    />
                  </div>
                  <div className="mt-8 pt-8 border-t-2 border-slate-50">
                     <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Global Surplus Volume</p>
                     <p className="text-4xl font-black text-red-700 font-mono tracking-tighter tabular-nums">
                       {Math.round(auditResult.nat.actual - auditResult.nat.tobacco).toLocaleString()}
                     </p>
                  </div>
                </aside>
              </div>

              {/* STRATEGIC FINDINGS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <section className="bg-slate-900 text-white p-10 rounded-[2rem] shadow-xl relative overflow-hidden group">
                  <TrendingUp className="mb-6 text-blue-400" size={32}/>
                  <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 text-slate-400">Strategic Assessment</h3>
                  <div className="space-y-4">
                    <p className="text-base font-bold text-slate-100">
                      National Bottleneck: <span className="text-blue-400 uppercase">{nationalLimitingFactor}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 leading-relaxed italic">
                      Acetate Tow is the limiting bottleneck when its import volume allows for fewer sticks than the available Tobacco. Legally, production cannot exceed the material with the lowest stick-potential.
                    </p>
                    <p className="text-3xl font-black text-emerald-400 font-mono tracking-tighter">
                      +{shadowMarketPercent.toFixed(2)}% <span className="text-xs text-white">Over Capacity</span>
                    </p>
                  </div>
                </section>

                <div className="bg-white p-10 rounded-[2rem] border border-slate-200">
                  <h3 className="text-slate-900 font-black text-[10px] mb-4 uppercase tracking-widest flex items-center gap-2">
                    <Info size={18} className="text-blue-600"/> The Tobacco Ceiling
                  </h3>
                  <p className="text-[11px] leading-relaxed text-slate-500 font-bold uppercase italic">
                    Tobacco is the anchor precursor. If a manufacturer has no recorded tobacco imports but exports finished cigarettes, they are utilizing shadow-market raw leaf.
                  </p>
                </div>

                <div className="bg-white p-10 rounded-[2rem] border border-slate-200 flex flex-col justify-between">
                  <div>
                    <h3 className="text-slate-900 font-black text-[10px] mb-4 uppercase tracking-widest flex items-center gap-2">
                      <Save size={18} className="text-emerald-600"/> Archive Current Audit
                    </h3>
                    <input 
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl mb-4 text-xs font-bold outline-none focus:border-blue-600 transition-all" 
                      placeholder="Report Title (e.g. Q1 National Audit)" 
                      value={reportTitle} 
                      onChange={e => setReportTitle(e.target.value)} 
                    />
                  </div>
                  <button 
                    onClick={handleSave} 
                    className="w-full bg-slate-900 hover:bg-blue-600 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95"
                  >
                    Save to Archives
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-8">
              
              {/* TARGET SEARCH BAR */}
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 flex items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <Search className="text-slate-400" size={24}/>
                  <input 
                    className="w-full outline-none font-bold text-base placeholder:text-slate-300" 
                    placeholder="Search Entity Name..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                  />
                </div>
                <div className="bg-slate-900 text-white px-10 py-5 rounded-2xl flex items-center gap-10 shadow-xl">
                   <div className="text-center">
                     <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Actual Sum</p>
                     <p className="font-mono font-black text-emerald-400 text-xl tabular-nums">
                       {Math.round(filteredSums.actual).toLocaleString()}
                     </p>
                   </div>
                   <div className="text-center">
                     <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Potential Sum</p>
                     <p className="font-mono font-black text-blue-400 text-xl tabular-nums">
                       {Math.round(filteredSums.minPot).toLocaleString()}
                     </p>
                   </div>
                </div>
              </div>

              {/* TARGET ENTITY TABLE */}
              <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left min-w-[1200px]">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-8">Target Entity</th>
                      <th className="p-8 text-center">TX</th>
                      <th className="p-8">Material Inventory (Sticks @ 1:1,333)</th>
                      <th className="p-8 text-right">Potential Cap</th>
                      <th className="p-8 text-right text-emerald-600">Actual Exports</th>
                      <th className="p-8 text-center">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold text-xs">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-all group">
                        <td className="p-8 font-black text-slate-900 text-sm w-1/5">{e.name}</td>
                        <td className="p-8 text-center font-mono text-slate-400 text-base">{e.tx}</td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-3">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div 
                                key={m} 
                                className="group/calc relative flex items-center gap-3 bg-white border border-slate-200 px-4 py-2.5 rounded-xl hover:border-blue-400 transition-all cursor-help"
                              >
                                {Icons[m]}
                                <span className="font-black text-slate-700 text-[11px]">
                                  {Math.round(s.rawQty).toLocaleString()} <span className="text-[9px] opacity-40 uppercase">{s.unit}</span>
                                </span>
                                
                                {/* TABLE HOVER CALCULATION */}
                                <div className="invisible group-hover/calc:visible opacity-0 group-hover/calc:opacity-100 absolute bottom-full left-0 mb-3 bg-slate-900 text-white p-4 rounded-xl text-[10px] font-mono w-56 shadow-2xl z-50 transition-all pointer-events-none border border-slate-700">
                                  <p className="text-blue-400 mb-1 uppercase font-black tracking-widest">Stick Conversion</p>
                                  {s.calc} = {Math.round(s.sticks).toLocaleString()} Sticks
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono text-slate-400 tabular-nums">
                          {Math.round(e.minPot).toLocaleString()}
                        </td>
                        <td className="p-8 text-right font-mono text-base text-slate-900 tabular-nums">
                          {Math.round(e.actual).toLocaleString()}
                        </td>
                        <td className="p-8 text-center">
                           <div className="group/note relative inline-block">
                              <span className={`px-6 py-2 rounded-full text-[9px] font-black tracking-widest border-2 transition-all ${
                                e.risk === 'CRITICAL' 
                                  ? 'bg-red-50 text-red-700 border-red-200' 
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}>
                                {e.risk}
                              </span>
                              
                              {/* STATUS MATH HOVER */}
                              <div className="invisible group-hover/note:visible opacity-0 group-hover/note:opacity-100 absolute bottom-full right-0 mb-6 w-72 bg-slate-900 text-white p-6 rounded-2xl text-left shadow-2xl z-50 transition-all border border-slate-700">
                                <p className="text-[10px] text-blue-400 font-black mb-4 uppercase tracking-widest flex items-center gap-2">
                                  <Calculator size={14}/> Forensic Check
                                </p>
                                <div className="space-y-3 mb-4 font-mono text-[11px] border-b border-slate-800 pb-4">
                                  <div className="flex justify-between text-slate-400">
                                    <span>Actual Exports:</span>
                                    <span className="text-white">{Math.round(e.actual).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between text-slate-400">
                                    <span>Legal Capacity:</span>
                                    <span className="text-white">{Math.round(e.minPot).toLocaleString()}</span>
                                  </div>
                                  <div className={`flex justify-between font-black pt-2 ${e.actual > e.minPot ? 'text-red-400' : 'text-emerald-400'}`}>
                                    <span>Variance:</span>
                                    <span>{Math.round(e.actual - e.minPot).toLocaleString()}</span>
                                  </div>
                                </div>
                                <p className="text-[10px] leading-relaxed text-slate-400 italic font-bold">
                                  {e.violationType === 'ZERO_TOBACCO' 
                                    ? "Export detected with zero recorded tobacco imports. Indicates shadow market leaf sourcing." 
                                    : "Production volume exceeds raw material input capacity."}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-100 p-10 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all group">
                   <div className="flex justify-between mb-8">
                    <div className="bg-slate-100 p-5 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <History size={28}/>
                    </div>
                    <button 
                      onClick={() => setReports(reports.filter(x => x.id !== r.id))} 
                      className="text-slate-200 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={22}/>
                    </button>
                  </div>
                  <h3 className="font-black text-xl mb-1 text-slate-900">{r.title}</h3>
                  <p className="text-[10px] text-slate-400 font-bold mb-10 uppercase tracking-widest italic">{r.date}</p>
                  <button 
                    onClick={() => {setRawData(r.data); setActiveTab('country');}} 
                    className="w-full bg-slate-900 py-4 rounded-xl text-white font-black text-[10px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-md active:scale-95"
                  >
                    Restore Audit
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
 * REUSABLE SIDEBAR COMPONENT
 */
function BalanceRow({ label, kg, sticks, unit, factor, color }) {
  return (
    <div className="group relative flex justify-between items-center py-2 cursor-help border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-4">
        <div className={`w-2 h-10 rounded-full ${color} opacity-80 group-hover:opacity-100`}/>
        <div>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-tight">{label}</p>
          <p className="text-base font-black text-slate-900 tabular-nums">
            {Math.round(kg).toLocaleString()} <span className="text-[9px] font-bold text-slate-300 uppercase">{unit}</span>
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-black text-blue-600 font-mono tracking-tighter tabular-nums">
          {Math.round(sticks).toLocaleString()}
        </p>
        <p className="text-[8px] font-black text-slate-300 uppercase">Sticks</p>
      </div>

      {/* MATRIX HOVER CALCULATION */}
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute top-full left-0 mt-2 bg-slate-900 text-white p-4 rounded-xl text-[10px] font-mono w-56 shadow-2xl z-50 transition-all pointer-events-none border border-slate-700">
        <div className="flex items-center gap-2 mb-2 border-b border-slate-800 pb-2">
          <Calculator size={12} className="text-blue-400"/>
          <span className="text-blue-400 uppercase font-black">Conversion Guide</span>
        </div>
        {Math.round(kg).toLocaleString()} {unit} × {factor.toLocaleString()} = {Math.round(sticks).toLocaleString()} Sticks
      </div>
    </div>
  );
}

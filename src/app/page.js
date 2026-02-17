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

export default function ForensicGradeV12() {
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
    if(window.confirm("CRITICAL: This will erase all current audit data. Proceed?")) {
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

  const saveReport = () => {
    if (!reportTitle || !auditResult) return;
    const newReport = { id: Date.now(), title: reportTitle, date: new Date().toLocaleString(), nat: auditResult.nat, gap: auditResult.productionGap, prob: auditResult.shadowProb };
    const updated = [newReport, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v12_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans selection:bg-blue-100">
      {/* HEADER SECTION */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg border-t border-slate-700"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black text-black uppercase tracking-tight">Forensic Monitor <span className="text-blue-700">Obsidian Prime</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1">Precursor & Shadow Market Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 text-blue-700"><Sliders size={18}/> <span className="text-[10px] font-black uppercase text-black">Risk Sensitivity</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full lg:w-80">
             <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
             <input className="bg-slate-50 border-2 border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm w-full outline-none font-bold focus:border-blue-700 transition-all" placeholder="Google Sheets URL..." value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <button onClick={sync} disabled={loading} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase transition-all shadow-md flex items-center gap-2 whitespace-nowrap">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Execute Audit'}
          </button>
          {rawData.length > 0 && <button onClick={clearSession} className="bg-red-50 text-red-600 p-2.5 rounded-xl border border-red-200 hover:bg-red-600 hover:text-white transition-all shadow-sm"><Trash2 size={20}/></button>}
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 transition-all ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>National Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-all ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Target Analysis</button>
            </div>
            <div className="flex gap-3 pb-4">
              <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black outline-none focus:border-blue-600" placeholder="Snapshot Name..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
              <button onClick={saveReport} className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase flex items-center gap-2 shadow-sm transition-all"><Save size={16}/> Archive</button>
            </div>
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              {/* TOP SUMMARY ROW */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <SummaryBox title="Tobacco Ceiling" val={auditResult.nat.tobacco} sub="MAX STICKS FROM LEAF" color="text-amber-700" />
                <SummaryBox title="Supply Bottleneck" val={auditResult.bottleneck.name} sub="STRICTEST PRECURSOR" color="text-blue-700" isText />
                <SummaryBox title="Production Gap" val={auditResult.productionGap} sub="UNSUPPORTED VOLUME" color="text-red-600" />
                <SummaryBox title="Tax Revenue Loss" val={`$${(auditResult.taxLoss/1e9).toFixed(2)}B`} sub="EST. EXCISE EVASION" color="text-emerald-700" isText />
                <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col justify-center relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1 text-red-400 font-black"><EyeOff size={14}/><p className="text-[10px] text-white uppercase tracking-widest">Shadow Market</p></div>
                        <p className="text-4xl font-black text-white">{Math.round(auditResult.shadowProb)}%</p>
                    </div>
                    <div className="absolute right-[-10px] bottom-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-500"><Zap size={100} className="text-red-500" /></div>
                </div>
              </div>

              {/* MATERIAL LEDGER */}
              <div className="bg-white border-2 border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
                <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8 flex justify-between items-center">
                  Material Balance Ledger
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
                  <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                  <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                  <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                  <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                </div>
              </div>

              {/* FORENSIC ANALYSIS SUMMARY GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl">
                  <h2 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Gavel size={20}/> National Forensic Analysis</h2>
                  <div className="space-y-6 text-sm leading-relaxed text-blue-50 font-medium">
                    <p>Total recorded exports stand at <span className="text-emerald-400 font-black">{Math.round(auditResult.nat.actual).toLocaleString()}</span> sticks. Based on raw material precursors, the maximum sustainable production is limited by <span className="text-blue-400 font-black underline uppercase">{auditResult.bottleneck.name}</span>.</p>
                    <p className="bg-red-950/30 p-4 border-l-4 border-red-500 rounded-r-xl">The production gap of <span className="text-red-400 font-black">{auditResult.productionGap.toLocaleString()}</span> sticks represents a potential fiscal leakage of <span className="text-red-400 font-black">${auditResult.taxLoss.toLocaleString()}</span> in unpaid excise duties (calculated at ${CONVERSIONS.TAX_PER_STICK}/stick).</p>
                    <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
                      <p className="text-xs font-bold text-slate-400 uppercase mb-2">Verdict Summary</p>
                      {auditResult.nat.actual > auditResult.nat.tobacco ? (
                        <p className="text-red-400 font-bold italic flex gap-2"><AlertTriangle size={18}/> High Risk: Production exceeds tobacco leaf availability by {Math.round((auditResult.nat.actual/auditResult.nat.tobacco - 1)*100)}%.</p>
                      ) : (
                        <p className="text-emerald-400 font-bold italic flex gap-2"><CheckCircle size={18}/> Reconciled: National production volumes are within the legal precursor envelope.</p>
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
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black uppercase text-slate-400">Bottleneck Severity</span>
                      <span className="text-[10px] font-black text-red-600 uppercase">Critical Impact</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full rounded-full" style={{ width: `${Math.min(100, (auditResult.productionGap / (auditResult.nat.actual || 1)) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-3xl border border-slate-200">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 pl-12 pr-4 text-sm font-bold focus:border-blue-600 outline-none transition-all" placeholder="Filter by Entity Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>

              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px]">
                    <tr>
                      <th className="p-8">Target Entity</th>
                      <th className="p-8 text-center">TX Count</th>
                      <th className="p-8 text-center">Reliability</th>
                      <th className="p-8">Materials Archive</th>
                      <th className="p-8 text-right">Potential Cap</th>
                      <th className="p-8 text-right text-emerald-400">Actual Exports</th>
                      <th className="p-8 text-center">Forensic Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 group/row transition-colors">
                        <td className="p-8 font-black text-black">{e.name}</td>
                        <td className="p-8 text-center font-mono font-bold">{e.tx}</td>
                        <td className="p-8 text-center">
                            <div className="group/rel relative inline-block cursor-help">
                                <span className="text-[10px] font-black font-mono border-2 border-slate-200 px-3 py-1 rounded-lg bg-slate-50">{e.reliability.toFixed(1)}%</span>
                                <div className="invisible group-hover/rel:visible opacity-0 group-hover/rel:opacity-100 absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100] w-64 bg-slate-900 text-white p-5 rounded-xl text-[10px] font-medium leading-relaxed shadow-2xl transition-all">
                                    Analyzes standard deviation between precursors. Low percentages indicate specific imports missing others, suggesting shadow factory support.
                                </div>
                            </div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
                                {Icons[m]} <span className="font-mono text-black font-bold text-[11px]">{Math.round(s.rawQty).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono font-bold text-slate-500">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                           <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                              {e.risk}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* DYNAMIC TOTALS FOOTER */}
                  <tfoot className="bg-slate-50 border-t-4 border-slate-900 sticky bottom-0 z-20">
                    <tr className="font-black text-black">
                      <td className="p-8 text-base uppercase">Total Filtered: {filteredEntities.length}</td>
                      <td className="p-8 text-center font-mono text-lg text-slate-600">
                        {filteredEntities.reduce((sum, e) => sum + e.tx, 0)}
                      </td>
                      <td className="p-8 text-center text-[10px] text-slate-400">AGGR. RELIABILITY</td>
                      <td className="p-8"></td>
                      <td className="p-8 text-right font-mono text-slate-500">
                        {filteredEntities.reduce((sum, e) => sum + e.minPot, 0).toLocaleString()}
                      </td>
                      <td className="p-8 text-right font-mono text-xl text-blue-700">
                        {filteredEntities.reduce((sum, e) => sum + e.actual, 0).toLocaleString()}
                      </td>
                      <td className="p-8 text-center">
                        <div className="text-[10px] bg-slate-900 text-white py-2 px-4 rounded-lg inline-block uppercase">Summary</div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
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
            <p className="text-xl font-black text-black">{Math.round(kg).toLocaleString()} <span className="text-[10px] font-bold text-slate-300 uppercase font-sans">{unit}</span></p>
          </div>
        </div>
        <div className="text-right">
            <p className="text-base font-black text-blue-700 font-mono tracking-tighter">{Math.round(sticks).toLocaleString()}</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase">Sticks Eq</p>
        </div>
      </div>
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute right-0 bottom-full mb-3 z-[60] bg-slate-900 text-white p-5 rounded-xl text-[10px] font-mono min-w-[240px] shadow-2xl transition-all border border-slate-700 pointer-events-none">
         <div className="flex items-center gap-2 text-blue-400 font-black uppercase mb-3 border-b border-slate-700 pb-2"><Calculator size={14}/> Forensic Conversion Engine</div>
         <div className="space-y-2">
            <div className="flex justify-between"><span>Registry Input:</span> <span>{Math.round(kg).toLocaleString()} {unit}</span></div>
            <div className="flex justify-between"><span>Material Factor:</span> <span>x {ratio}</span></div>
            <div className="flex justify-between pt-2 border-t border-slate-700 text-emerald-400 font-black text-[11px]"><span>Stick Potential:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
         </div>
      </div>
    </div>
  );
}

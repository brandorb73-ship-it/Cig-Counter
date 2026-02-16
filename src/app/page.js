"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, RefreshCcw, Save, History, Search, Info, Sliders, CheckCircle, Target, Gavel, Zap, Download, XCircle, HelpCircle, EyeOff, Fingerprint } from 'lucide-react';

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

export default function ForensicGradeV10() {
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
      const saved = localStorage.getItem('forensic_v10_reports');
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
      const variance = maxPot > 0 ? ((maxPot - minPot) / maxPot) * 100 : 0;
      const reliability = Math.max(0, 100 - variance);
      const isOverCap = e.actual > (minPot * (1 + (riskThreshold / 100)));
      const hasZeroTobacco = e.actual > 0 && e.tobacco === 0;

      return { 
        ...e, minPot, reliability,
        risk: (hasZeroTobacco || isOverCap) ? 'CRITICAL' : 'RECONCILED',
        violationType: hasZeroTobacco ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    const productionGap = Math.max(0, nat.actual - nat.tobacco);
    return { 
      entities, nat, productionGap, 
      taxLoss: productionGap * CONVERSIONS.TAX_PER_STICK,
      shadowProb: nat.actual > 0 ? Math.min(100, (productionGap / nat.actual) * 100) : 0,
      bottleneck: [{name: 'Tobacco', val: nat.tobacco}, {name: 'Tow', val: nat.tow}, {name: 'Paper', val: nat.paper}, {name: 'Rods', val: nat.rods}].filter(p => p.val > 0).reduce((p, c) => p.val < c.val ? p : c, {name: 'None', val: 0})
    };
  }, [rawData, riskThreshold]);

  const filteredEntities = useMemo(() => auditResult ? auditResult.entities.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())) : [], [auditResult, searchTerm]);

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
    const newR = { id: Date.now(), title: reportTitle, date: new Date().toLocaleString(), nat: auditResult.nat, shadow: auditResult.shadowProb };
    const updated = [newR, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v10_reports', JSON.stringify(updated));
    setReportTitle('');
  };

  const downloadCSV = () => {
    const csv = Papa.unparse(filteredEntities.map(e => ({ Entity: e.name, Reliability: e.reliability.toFixed(1), Potential: Math.round(e.minPot), Actual: Math.round(e.actual), Verdict: e.risk })));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `Audit_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      {/* HEADER SECTION */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black uppercase">Forensic Monitor <span className="text-blue-700">10.1</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1"><CheckCircle size={10} className="text-emerald-600"/> Full Forensic Integrity</p>
          </div>
        </div>
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 text-blue-700"><Sliders size={18}/> <span className="text-[10px] font-black uppercase text-black">Risk Sensitivity</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none font-bold" placeholder="Google Sheets URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} disabled={loading} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase transition-all shadow-md flex items-center gap-2">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Run Audit'}
          </button>
          {rawData.length > 0 && <button onClick={clearSession} className="bg-red-50 text-red-600 p-2.5 rounded-xl border border-red-200 hover:bg-red-600 hover:text-white transition-all"><Trash2 size={20}/></button>}
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Country Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Target Analysis</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 ${activeTab === 'reports' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Archived Reports</button>
            </div>
            {activeTab !== 'reports' && (
              <div className="flex gap-3 pb-4">
                <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black" placeholder="Snapshot Name..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                <button onClick={saveReport} className="bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase flex items-center gap-2"><Save size={16}/> Archive</button>
              </div>
            )}
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <SummaryBox title="Tobacco Ceiling" val={auditResult.nat.tobacco} sub="MAX STICKS FROM LEAF" color="text-amber-700" />
                <SummaryBox title="Supply Bottleneck" val={auditResult.bottleneck.name} sub="STRICTEST PRECURSOR" color="text-blue-700" isText />
                <SummaryBox title="Production Gap" val={auditResult.productionGap} sub="UNSUPPORTED VOLUME" color="text-red-600" />
                <SummaryBox title="Tax Revenue Loss" val={`$${(auditResult.taxLoss/1e9).toFixed(2)}B`} sub="EST. EXCISE EVASION" color="text-emerald-700" isText />
                <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-3xl shadow-lg flex flex-col justify-center relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1 text-red-400"><EyeOff size={14}/><p className="text-[10px] font-black text-white uppercase">Shadow Market</p></div>
                        <p className="text-3xl font-black text-white">{Math.round(auditResult.shadowProb)}%</p>
                    </div>
                    <div className="absolute right-[-20px] bottom-[-20px] opacity-10"><Zap size={80} className="text-red-500" /></div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> National Supply Matrix</h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(auditResult.nat.tobacco), fill: '#f59e0b' },
                        { name: 'Tow', val: Math.round(auditResult.nat.tow), fill: '#0ea5e9' },
                        { name: 'Paper', val: Math.round(auditResult.nat.paper), fill: '#64748b' },
                        { name: 'Rods', val: Math.round(auditResult.nat.rods), fill: '#a855f7' },
                        { name: 'Exports', val: Math.round(auditResult.nat.actual), fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} fontWeight="bold" />
                        <YAxis fontSize={11} fontWeight="bold" tickFormatter={(v) => `${(v/1e6).toFixed(0)}M`} />
                        <Tooltip />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                            { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="lg:col-span-4 bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm space-y-6">
                    <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b pb-5">Balance Table</h2>
                    <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                    <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                    <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                    <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-3xl border border-slate-200">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input className="w-full bg-slate-50 border rounded-xl py-2.5 pl-12 pr-4 text-sm font-bold" placeholder="Filter Entity..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <button onClick={downloadCSV} className="bg-slate-900 text-white p-2.5 rounded-xl px-4 flex items-center gap-2 uppercase text-[10px] font-black"><Download size={18}/> Export CSV</button>
                </div>
              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-visible shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px] sticky top-0 z-20">
                    <tr>
                      <th className="p-8">Entity Analysis</th>
                      <th className="p-8 text-center">TX Count</th>
                      <th className="p-8 text-center">Reliability</th>
                      <th className="p-8">Inventory</th>
                      <th className="p-8 text-right">Potential</th>
                      <th className="p-8 text-right text-emerald-400">Actual</th>
                      <th className="p-8 text-center">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50">
                        <td className="p-8 font-black text-black">{e.name}</td>
                        <td className="p-8 text-center font-mono font-bold">{e.tx}</td>
                        <td className="p-8 text-center">
                            <div className="group/rel relative inline-block cursor-help">
                                <span className="text-[10px] font-black font-mono border px-2 py-1 rounded bg-slate-50">{e.reliability.toFixed(1)}%</span>
                                <div className="invisible group-hover/rel:visible opacity-0 group-hover/rel:opacity-100 absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100] w-64 bg-slate-900 text-white p-4 rounded-xl text-[10px] font-medium leading-relaxed transition-all">
                                    <p className="text-blue-400 font-black uppercase mb-1 flex items-center gap-1"><Fingerprint size={12}/> Reliability Logic</p>
                                    Measures precursor variance. Low scores indicate entities over-balanced on specific materials while lacking others (indicates illicit sourcing risk).
                                </div>
                            </div>
                        </td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="bg-white border border-slate-200 rounded-xl px-3 py-1 flex items-center gap-2">
                                {Icons[m]} <span className="font-mono font-bold text-[11px]">{Math.round(s.rawQty).toLocaleString()}</span>
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
                              <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute top-full right-0 mt-2 z-[100] w-80 bg-white border-2 p-6 rounded-2xl shadow-2xl text-left transition-all border-slate-900">
                                  <p className="font-black text-xs mb-2 uppercase flex items-center gap-2 text-slate-900"><Info size={16}/> Evidence Log</p>
                                  <p className="text-xs text-black leading-relaxed font-bold">
                                    {e.risk === 'CRITICAL' ? (e.violationType === 'ZERO_TOBACCO' ? "CRITICAL: Entity is exporting finished sticks with zero matching tobacco leaf records. High illicit signal." : `CRITICAL: Exports exceed supply potential by ${Math.round((e.actual/e.minPot - 1)*100)}%, exceeding sensitivity threshold.`) : "RECONCILED: Exports balanced against precursors."}
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
                <div key={r.id} className="bg-white border-2 border-slate-200 p-8 rounded-[2rem] shadow-sm hover:border-blue-600 transition-all">
                   <div className="flex justify-between mb-6">
                    <div className="bg-slate-100 p-3 rounded-xl"><History size={24}/></div>
                    <button onClick={() => { setReports(reports.filter(x => x.id !== r.id)); localStorage.setItem('forensic_v10_reports', JSON.stringify(reports.filter(x => x.id !== r.id))); }} className="text-slate-300 hover:text-red-600"><Trash2 size={20}/></button>
                  </div>
                  <h3 className="font-black text-black text-lg">{r.title}</h3>
                  <p className="text-[10px] text-slate-500 font-bold mb-6 uppercase tracking-widest">{r.date}</p>
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-[10px] font-bold"><span>Actual Sticks</span> <span>{Math.round(r.nat.actual).toLocaleString()}</span></div>
                    <div className="flex justify-between text-[10px] font-bold"><span>Shadow Prob</span> <span className="text-red-600">{Math.round(r.shadow)}%</span></div>
                  </div>
                  <button onClick={() => setActiveTab('country')} className="w-full bg-slate-900 py-3 rounded-xl text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-700">View Data</button>
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
      <div className="flex justify-between items-end cursor-help border-b border-slate-50 pb-2">
        <div className="flex items-center gap-4">
          <div className={`w-1.5 h-10 rounded-full ${color}`}/>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
            <p className="text-lg font-black text-black">{Math.round(kg).toLocaleString()} <span className="text-[10px] font-bold text-slate-400 uppercase">{unit}</span></p>
          </div>
        </div>
        <div className="text-right"><p className="text-sm font-black text-blue-700 font-mono">{Math.round(sticks).toLocaleString()}</p></div>
      </div>
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute right-0 bottom-full mb-2 z-[60] bg-slate-900 text-white p-4 rounded-xl text-[10px] font-mono min-w-[200px] shadow-2xl transition-all">
         <p className="text-blue-400 font-black uppercase mb-1 border-b border-slate-700 pb-1">Audit Logic</p>
         <div className="flex justify-between"><span>Input:</span> <span>{Math.round(kg).toLocaleString()} {unit}</span></div>
         <div className="flex justify-between"><span>Factor:</span> <span>x {ratio}</span></div>
         <div className="flex justify-between pt-1 border-t border-slate-700 text-emerald-400 font-black"><span>Capacity:</span> <span>{Math.round(sticks).toLocaleString()}</span></div>
      </div>
    </div>
  );
}

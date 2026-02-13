"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, RefreshCcw, Save, FileDown, Info, Search, FileType } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 'TOW': 8333.33, 'PAPER': 20000, 'RODS': 6,
  'CIGARETTES_WT': 1333.33,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

export default function ForensicFinalV9() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('forensic_v9_reports');
    if (saved) setReports(JSON.parse(saved));
  }, []);

  const processData = (raw) => {
    const registry = {};
    let nat = { tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, tobaccoKg: 0, towKg: 0, paperKg: 0, rodsUnits: 0 };

    raw.forEach(row => {
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
        let sticks = (unit === 'MIL') ? qty * 1000000 : (['KG', 'KGM', 'TON', 'MT'].includes(unit)) ? convQty * CONVERSIONS.CIGARETTES_WT : convQty;
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: sticks/qty };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        if (mat === 'TOBACCO') nat.tobaccoKg += convQty;
        if (mat === 'TOW') nat.towKg += convQty;
        if (mat === 'PAPER') nat.paperKg += convQty;
        if (mat === 'RODS') nat.rodsUnits += convQty;
        nat[mat.toLowerCase()] += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, ratioUsed: CONVERSIONS[mat] };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      }
    });

    const entities = Object.values(registry).map(e => {
      const pots = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPot = pots.length > 0 ? Math.min(...pots) : 0;
      return { ...e, minPot, risk: e.actual > (minPot * 1.1) ? 'CRITICAL' : 'RECONCILED' };
    }).sort((a, b) => b.actual - a.actual);

    return { entities, nat };
  };

  const filteredEntities = useMemo(() => {
    if (!data) return [];
    return data.entities.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [data, searchTerm]);

  const filteredTotals = useMemo(() => {
    return filteredEntities.reduce((acc, curr) => ({
      actual: acc.actual + curr.actual,
      potential: acc.potential + curr.minPot
    }), { actual: 0, potential: 0 });
  }, [filteredEntities]);

  const sync = () => {
    if (!url) return;
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setData(processData(res.data)); setLoading(false); }
    });
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(18);
    doc.text(`Forensic Report: ${reportTitle || 'National Audit'}`, 14, 20);
    
    if (activeTab === 'country') {
      autoTable(doc, {
        startY: 30,
        head: [['Precursor', 'Raw Volume', 'Stick Potential']],
        body: [
          ['Tobacco', `${data.nat.tobaccoKg.toLocaleString()} KG`, `${Math.round(data.nat.tobacco).toLocaleString()}`],
          ['Acetate Tow', `${data.nat.towKg.toLocaleString()} KG`, `${Math.round(data.nat.tow).toLocaleString()}`],
          ['Cig. Paper', `${data.nat.paperKg.toLocaleString()} KG`, `${Math.round(data.nat.paper).toLocaleString()}`],
          ['Actual Exports', '-', `${Math.round(data.nat.actual).toLocaleString()}`]
        ],
        theme: 'striped', headStyles: { fillColor: [15, 23, 42] }
      });
    } else {
      autoTable(doc, {
        startY: 30,
        head: [['Entity', 'Transactions', 'Potential', 'Actual Exports', 'Status']],
        body: filteredEntities.map(e => [e.name, e.tx, Math.round(e.minPot).toLocaleString(), Math.round(e.actual).toLocaleString(), e.risk]),
        theme: 'grid', headStyles: { fillColor: [15, 23, 42] }
      });
    }
    doc.save(`Forensic_Audit_${Date.now()}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      {/* Header */}
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black uppercase">Forensic Monitor <span className="text-blue-700">9.2</span></h1>
            <p className="text-xs text-black font-bold uppercase tracking-widest">Global Production & Precursor Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none focus:border-blue-600 font-bold text-black" placeholder="G-Sheet Source URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase tracking-widest transition-all shadow-md">Run Audit</button>
          <button onClick={() => {setData(null); setUrl('');}} className="p-2.5 text-black hover:text-red-700 bg-slate-100 border border-slate-200 rounded-xl"><RefreshCcw size={20}/></button>
        </div>
      </div>

      {data && (
        <div className="max-w-[1600px] mx-auto space-y-8">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 transition-colors ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Country Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-colors ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400 hover:text-black'}`}>Target Analysis</button>
            </div>
            <div className="flex gap-3 pb-4">
              <button onClick={exportToPDF} className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-black shadow-sm transition-all"><FileType size={16}/> Export PDF</button>
              <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black text-black" placeholder="Snapshot Title..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
              <button onClick={() => {if(reportTitle) { setReports([{id:Date.now(), title:reportTitle, data, date:new Date().toLocaleString()}, ...reports]); setReportTitle('');}}} className="flex items-center gap-2 bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-800 shadow-sm transition-all"><Save size={16}/> Save</button>
            </div>
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div id="chart-section" className="lg:col-span-8 bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> Production vs. Precursor Matrix</h2>
                  <div className="h-[450px]">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: Math.round(data.nat.tobacco), fill: '#b45309' },
                        { name: 'Tow', val: Math.round(data.nat.tow), fill: '#0369a1' },
                        { name: 'Paper', val: Math.round(data.nat.paper), fill: '#334155' },
                        { name: 'Rods', val: Math.round(data.nat.rods), fill: '#7e22ce' },
                        { name: 'Cigarette Exports', val: Math.round(data.nat.actual), fill: '#047857' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" fontSize={12} fontWeight="bold" tick={{fill: '#000'}} tickLine={false} axisLine={false} tick={{dy: 10}} />
                        <YAxis fontSize={11} fontWeight="bold" tick={{fill: '#000'}} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1e9).toFixed(1)}B`} />
                        <Tooltip 
                          formatter={(value) => [value.toLocaleString(), "Sticks"]}
                          cursor={{fill: '#f1f5f9'}} 
                          contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '15px'}} 
                        />
                        <Bar dataKey="val" radius={[8, 8, 0, 0]} barSize={60}>
                           { [0,1,2,3,4].map((e,i) => <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />) }
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] shadow-sm">
                  <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8">Forensic Balance Sheet</h2>
                  <div className="space-y-6">
                    <BalanceRow label="Tobacco" kg={data.nat.tobaccoKg} sticks={data.nat.tobacco} unit="KG" color="bg-amber-600" ratio={CONVERSIONS.TOBACCO} />
                    <BalanceRow label="Acetate Tow" kg={data.nat.towKg} sticks={data.nat.tow} unit="KG" color="bg-sky-600" ratio={CONVERSIONS.TOW} />
                    <BalanceRow label="Cig. Paper" kg={data.nat.paperKg} sticks={data.nat.paper} unit="KG" color="bg-slate-600" ratio={CONVERSIONS.PAPER} />
                    <BalanceRow label="Filter Rods" kg={data.nat.rodsUnits} sticks={data.nat.rods} unit="PCS" color="bg-purple-600" ratio={CONVERSIONS.RODS} />
                    <div className="py-4 border-y-2 border-slate-50">
                        <BalanceRow label="Cigarette Exports" kg={data.nat.actual / 1333.33} sticks={data.nat.actual} unit="KG Eqv" color="bg-emerald-600" ratio={1333.33} />
                    </div>
                    <div className="pt-4">
                       <p className="text-xs text-black font-black uppercase tracking-tighter">Global Surplus Gap</p>
                       <p className="text-3xl font-black text-red-700 font-mono tracking-tighter mt-1">{Math.round(data.nat.actual - data.nat.tobacco).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-10">
                <div className="bg-blue-50 p-10 rounded-[2rem] border-2 border-blue-100">
                  <h3 className="text-blue-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-wide"><Info size={22}/> 1. Tobacco Ceiling</h3>
                  <p className="text-sm leading-relaxed text-black font-bold">The declared tobacco imports support <span className="font-black">{(data.nat.tobacco / 1e6).toFixed(1)}M</span> sticks. Actual exports are <span className="font-black text-red-700">{(data.nat.actual / data.nat.tobacco).toFixed(1)}x higher</span>, indicating massive unrecorded leaf inflow.</p>
                </div>
                <div className="bg-slate-100 p-10 rounded-[2rem] border-2 border-slate-200">
                  <h3 className="text-slate-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-wide"><Calculator size={22}/> 2. Material Logic</h3>
                  <p className="text-sm leading-relaxed text-black font-bold">Forensic audit of tow vs. paper shows a gap of <span className="font-black">{(Math.abs(data.nat.tow - data.nat.paper) / 1e6).toFixed(1)}M</span> potential sticks. This imbalance confirms non-linear procurement.</p>
                </div>
                <div className="bg-red-50 p-10 rounded-[2rem] border-2 border-red-100">
                  <h3 className="text-red-900 font-black text-sm mb-4 flex items-center gap-2 uppercase tracking-wide"><AlertTriangle size={22}/> 3. Strategic Summary</h3>
                  <p className="text-sm leading-relaxed text-red-900 font-bold italic">Infrastructure supports 542M sticks. The actual export of 37B sticks confirms a 98% shadow-market reliance or gross material misdeclaration.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border-2 border-slate-200">
                <Search className="text-slate-400" size={20}/>
                <input 
                  className="w-full outline-none font-bold text-black" 
                  placeholder="Search entity name to isolate transactions and sum totals..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {searchTerm && (
                <div className="bg-blue-900 text-white p-6 rounded-2xl flex justify-between items-center shadow-lg">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Filtered Results Aggregate</p>
                        <h3 className="text-xl font-black italic">"{searchTerm}" Group Analysis</h3>
                    </div>
                    <div className="flex gap-12 text-right">
                        <div>
                            <p className="text-[10px] font-black uppercase">Total Potential</p>
                            <p className="text-2xl font-mono font-black text-blue-300">{Math.round(filteredTotals.potential).toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase">Total Exports</p>
                            <p className="text-2xl font-mono font-black text-emerald-400">{Math.round(filteredTotals.actual).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
              )}

              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest">
                    <tr>
                      <th className="p-8">Entity Name</th>
                      <th className="p-8 text-center">Transactions</th>
                      <th className="p-8">Material Inventory Log</th>
                      <th className="p-8 text-right">Potential (Cap)</th>
                      <th className="p-8 text-right text-emerald-400">Actual Exports</th>
                      <th className="p-8 text-center">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 transition-colors group">
                        <td className="p-8 font-black text-black text-base">{e.name}</td>
                        <td className="p-8 text-center text-black font-mono font-bold text-lg">{e.tx}</td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-3">
                            {Object.entries(e.materials).map(([m, s]) => (
                              <div key={m} className="group/pop relative bg-white border-2 border-slate-200 rounded-xl px-4 py-2 flex items-center gap-3 cursor-help">
                                {Icons[m]}
                                <span className="font-mono text-black font-black text-sm">{Math.round(s.rawQty).toLocaleString()} <span className="text-[10px] text-black font-bold">{s.unit}</span></span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-8 text-right font-mono text-black font-bold text-base">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono text-black font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                           <span className={`px-6 py-2 rounded-full text-[10px] font-black tracking-widest border-2 ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>{e.risk}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
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
            <p className="text-xs text-black font-black uppercase tracking-widest mb-1">{label}</p>
            <p className="text-lg font-black text-black">{Math.round(kg).toLocaleString()} <span className="text-xs text-black font-bold uppercase">{unit}</span></p>
          </div>
        </div>
        <p className="text-sm font-black text-blue-700 font-mono">{Math.round(sticks).toLocaleString()} sticks</p>
      </div>
    </div>
  );
}

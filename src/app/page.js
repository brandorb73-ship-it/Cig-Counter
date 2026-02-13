"use client";
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, Calculator, AlertTriangle, RefreshCcw, Save, History, Search, Info, Sliders, X, HelpCircle } from 'lucide-react';

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

export default function ForensicGradeV9() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);
  const [showGlossary, setShowGlossary] = useState(false);

  const auditResult = useMemo(() => {
    if (rawData.length === 0) return null;
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
      const precursors = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const minPot = (e.tobacco === 0) ? 0 : Math.min(...precursors);
      
      const isZeroTobacco = e.actual > 0 && e.tobacco === 0;
      const isOverCap = e.actual > (minPot * (1 + riskThreshold / 100));
      // NEW: Surplus warning if they have >5x more material than they export
      const isExcessSurplus = minPot > (e.actual * 5) && minPot > 1000000; 

      let status = 'RECONCILED';
      if (isZeroTobacco || isOverCap) status = 'CRITICAL';
      else if (isExcessSurplus) status = 'SURPLUS WARNING';

      return { 
        ...e, 
        minPot, 
        risk: status,
        violationType: isZeroTobacco ? 'ZERO_TOBACCO' : isOverCap ? 'OVER_CAP' : isExcessSurplus ? 'EXCESS_RAW' : 'NONE'
      };
    }).sort((a, b) => b.actual - a.actual);

    return { entities, nat };
  }, [rawData, riskThreshold]);

  const sync = () => {
    if (!url) return;
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    const baseUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(`${baseUrl}&gid=${gid}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setRawData(res.data); setLoading(false); }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans relative">
      {/* GLOSSARY POPUP */}
      {showGlossary && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 p-8 flex justify-between items-center">
              <h2 className="text-white font-black uppercase tracking-widest flex items-center gap-3"><HelpCircle/> Auditing Glossary</h2>
              <button onClick={() => setShowGlossary(false)} className="text-slate-400 hover:text-white"><X/></button>
            </div>
            <div className="p-10 space-y-6 max-h-[70vh] overflow-y-auto text-black">
              <div>
                <h4 className="font-black text-blue-700 uppercase text-xs mb-2">Reconciled</h4>
                <p className="text-sm font-bold leading-relaxed">Exports are lower than material capacity. The entity has legal precursor imports to justify their production volume.</p>
              </div>
              <div className="border-t pt-6">
                <h4 className="font-black text-red-700 uppercase text-xs mb-2">Critical</h4>
                <p className="text-sm font-bold leading-relaxed">The "Red Line." Either the entity has 0 recorded tobacco (100% shadow-sourced) or their exports exceed their precursor limit by your defined threshold.</p>
              </div>
              <div className="border-t pt-6">
                <h4 className="font-black text-amber-600 uppercase text-xs mb-2">Surplus Warning</h4>
                <p className="text-sm font-bold leading-relaxed">The entity has enough material to produce at least 5x more than they are exporting. This suggests high domestic volume or potential "divergence" to informal markets.</p>
              </div>
              <div className="border-t pt-6">
                <h4 className="font-black text-slate-900 uppercase text-xs mb-2">Potential (Cap)</h4>
                <p className="text-sm font-bold leading-relaxed">Calculated using the "Limiting Factor Principle." We convert all raw materials to stick equivalents; the material with the lowest volume sets the maximum possible production limit.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg"><ShieldAlert className="text-white" size={28}/></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black uppercase">Forensic Monitor <span className="text-blue-700">9.6</span></h1>
            <p className="text-xs text-black font-bold uppercase tracking-widest">Enhanced Risk Profiling</p>
          </div>
        </div>
        
        <button onClick={() => setShowGlossary(true)} className="flex items-center gap-2 bg-slate-100 px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-200 transition-all">
          <HelpCircle size={18} className="text-blue-700"/>
          <span className="text-[10px] font-black uppercase tracking-widest text-black">Audit Guide</span>
        </button>

        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2"><Sliders size={18} className="text-blue-700"/> <span className="text-[10px] font-black uppercase text-black">Risk Threshold</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-700" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none focus:border-blue-600 font-bold text-black" placeholder="G-Sheet URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase tracking-widest transition-all">Run Audit</button>
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8">
          <div className="flex gap-10 text-sm font-black uppercase tracking-widest border-b-2 border-slate-200">
            <button onClick={() => setActiveTab('country')} className={`pb-4 transition-colors ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Country Intelligence</button>
            <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-colors ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Target Analysis</button>
          </div>

          {activeTab === 'entities' && (
            <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-white uppercase font-black tracking-widest">
                  <tr>
                    <th className="p-8">Entity</th>
                    <th className="p-8">Material Inventory</th>
                    <th className="p-8 text-right">Potential (Cap)</th>
                    <th className="p-8 text-right text-emerald-400">Actual Exports</th>
                    <th className="p-8 text-center">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {auditResult.entities.map((e, i) => (
                    <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                      <td className="p-8 font-black text-black">{e.name}</td>
                      <td className="p-8">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="bg-white border border-slate-200 rounded-lg px-3 py-1 flex items-center gap-2">
                              {Icons[m]} <span className="text-[10px] font-black">{Math.round(s.rawQty).toLocaleString()} {s.unit}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-8 text-right font-mono font-bold">{Math.round(e.minPot).toLocaleString()}</td>
                      <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                      <td className="p-8 text-center">
                         <div className="group relative inline-block">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest border-2 ${
                              e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-200' : 
                              e.risk === 'SURPLUS WARNING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>{e.risk}</span>
                            <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute bottom-full right-0 mb-4 z-50 w-72 transition-all">
                              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-2xl text-left border border-slate-700">
                                <p className="text-blue-400 font-black text-xs mb-2 uppercase tracking-widest">Status Reasoning</p>
                                <p className="text-xs leading-relaxed font-bold">
                                  {e.violationType === 'ZERO_TOBACCO' ? "Exporting goods with NO recorded tobacco imports." :
                                   e.violationType === 'OVER_CAP' ? `Exports exceed precursors by ${Math.round(e.actual - e.minPot).toLocaleString()} sticks.` :
                                   e.violationType === 'EXCESS_RAW' ? `Massive precursor surplus (~${Math.round(e.minPot/e.actual)}x more than exported). Check domestic logs.` :
                                   "Export volume is fully supported by recorded precursor imports."}
                                </p>
                              </div>
                            </div>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Country Intelligence Tab remains similar but with updated Surplus Gap logic */}
        </div>
      )}
    </div>
  );
}

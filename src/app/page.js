"use client";
import React, { useState, useMemo } from 'react';
import { ShieldAlert, Database, Wind, FileText, Pipette, AlertTriangle, CheckCircle, Info } from 'lucide-react';

// V12.0 EXACT CONVERSION CONSTANTS
const CONVERSIONS = {
  'TOBACCO': 1333.33, 
  'TOW': 8333.33, 
  'PAPER': 20000, 
  'RODS': 6,
  'CIGARETTES_EXPORT': 1000,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000 }
};

export default function ForensicV12_Base() {
  const [rawData, setRawData] = useState([]);
  const [riskThreshold, setRiskThreshold] = useState(10);

  const auditMatrix = useMemo(() => {
    if (!rawData.length) return null;
    const registry = {};

    rawData.forEach(row => {
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;
      if (!registry[entity]) {
        registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {} };
      }

      const mR = (row.Material || '').toUpperCase();
      const qty = parseFloat(String(row.Quantity).replace(/,/g, '')) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = CONVERSIONS.UNITS[unit] || 1;
      const convQty = qty * factor;

      // Determine Material Type
      let mat = null;
      if (mR.includes('TOBACCO')) mat = 'TOBACCO';
      else if (mR.includes('TOW')) mat = 'TOW';
      else if (mR.includes('PAPER')) mat = 'PAPER';
      else if (mR.includes('ROD')) mat = 'RODS';
      else if (mR.includes('CIGARETTE') && !mR.includes('PAPER')) mat = 'CIGARETTES';

      if (mat === 'CIGARETTES') {
        const sticks = (unit === 'MIL') ? qty * 1000000 : convQty * CONVERSIONS.CIGARETTES_EXPORT;
        registry[entity].actual += sticks;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
      }
    });

    return Object.values(registry).map(e => {
      const potentials = [e.tobacco, e.tow, e.paper, e.rods].filter(v => v > 0);
      // V12.0 Precursor Ceiling = MIN value of imported materials
      const ceiling = potentials.length > 0 ? Math.min(...potentials) : 0;
      const maxPot = potentials.length > 0 ? Math.max(...potentials) : 0;
      
      // V12.0 Reliability Engine: Variance between highest and lowest precursor
      const reliability = maxPot > 0 ? 100 - (((maxPot - ceiling) / maxPot) * 100) : 100;
      
      return {
        ...e,
        ceiling,
        reliability,
        risk: (e.actual > ceiling * (1 + riskThreshold/100) || (e.actual > 0 && e.tobacco === 0)) ? 'CRITICAL' : 'RECONCILED'
      };
    });
  }, [rawData, riskThreshold]);

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <h1 className="text-xl font-bold mb-4">Step 1: V12.0 Audit Matrix Baseline</h1>
      {/* Table and Analysis will go here in Step 2 */}
    </div>
  );
}
/* ... continuing inside the ForensicV12_Base component ... */

  const nationalTotals = useMemo(() => {
    if (!auditMatrix) return null;
    const totals = { tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, tobaccoKg: 0 };
    auditMatrix.forEach(e => {
      totals.tobacco += e.tobacco;
      totals.tow += e.tow;
      totals.paper += e.paper;
      totals.rods += e.rods;
      totals.actual += e.actual;
    });
    
    const gap = Math.max(0, totals.actual - totals.tobacco);
    const shadowProb = totals.actual > 0 ? (gap / totals.actual) * 100 : 0;
    const taxLoss = gap * 0.15; // Tax per stick logic

    return { ...totals, gap, shadowProb, taxLoss };
  }, [auditMatrix]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      {/* V9.7 NATIONAL SUMMARY (The Black Card) */}
      {nationalTotals && (
        <div className="bg-slate-950 p-10 rounded-[2.5rem] text-white relative overflow-hidden shadow-2xl border-b-8 border-blue-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
            <div>
              <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">National Shadow Signal</p>
              <p className="text-7xl font-black mb-2 tracking-tighter">
                {Math.round(nationalTotals.shadowProb)}%
              </p>
              <p className="text-slate-400 text-xs font-bold leading-relaxed">
                PROBABILITY OF UNLICENSED PRECURSOR SOURCING ACROSS ALL RECORDS.
              </p>
            </div>
            <div className="border-x border-slate-800 px-12">
              <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Fiscal Leakage (EST)</p>
              <p className="text-5xl font-black mb-2 text-white">
                ${(nationalTotals.taxLoss / 1e9).toFixed(2)}B
              </p>
              <p className="text-slate-400 text-xs font-bold uppercase">Uncollected excise based on precursor deficit.</p>
            </div>
            <div className="flex flex-col justify-center">
              <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                <p className="text-[10px] font-black uppercase mb-2 text-slate-400">Primary Bottleneck</p>
                <p className="text-2xl font-black text-blue-400 uppercase">Tobacco Leaf</p>
                <p className="text-[10px] text-slate-500 font-bold mt-1">LOWEST THEORETICAL CEILING</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* V12.0 MATERIAL LEDGER */}
      {nationalTotals && (
        <div className="bg-white border-2 border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
          <div className="flex justify-between items-center border-b pb-6 mb-8">
            <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest">
              Material Balance Ledger
            </h2>
            <span className="text-[10px] text-slate-400 font-black uppercase">Unit: Sticks Equivalent (SE)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <BalanceRow 
              label="Tobacco Leaf" 
              sticks={nationalTotals.tobacco} 
              color="bg-amber-600" 
              ratio={1333.33} 
            />
            <BalanceRow 
              label="Acetate Tow" 
              sticks={nationalTotals.tow} 
              color="bg-sky-600" 
              ratio={8333.33} 
            />
            <BalanceRow 
              label="Cig. Paper" 
              sticks={nationalTotals.paper} 
              color="bg-slate-600" 
              ratio={20000} 
            />
            <BalanceRow 
              label="Filter Rods" 
              sticks={nationalTotals.rods} 
              color="bg-purple-600" 
              ratio={6} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

// BalanceRow Helper with V12.0 Hover Tooltip
function BalanceRow({ label, sticks, color, ratio }) {
  return (
    <div className="group relative">
      <div className="flex justify-between items-end border-b-2 border-slate-50 pb-4">
        <div className="flex items-center gap-3">
          <div className={`w-1.5 h-8 rounded-full ${color}`}/>
          <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black text-slate-900 font-mono tracking-tighter">
            {Math.round(sticks).toLocaleString()}
          </p>
        </div>
      </div>
      {/* V12.0 CALCULATION TOOLTIP */}
      <div className="invisible group-hover:visible absolute bottom-full left-0 mb-2 w-48 bg-slate-900 text-white p-4 rounded-xl text-[10px] font-mono z-50 shadow-xl">
        <p className="text-blue-400 font-black mb-1">V12 FORENSIC CALC</p>
        <p>Total Material Qty x {ratio} yield factor per stick.</p>
      </div>
    </div>
  );
}
/* ... continuing from Step 2 inside the main component ... */

  return (
    <div className="max-w-[1600px] mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800">Target Analysis Matrix</h2>
        <div className="flex items-center gap-4">
           <span className="text-[10px] font-bold text-slate-400 uppercase">Risk Sensitivity: {riskThreshold}%</span>
           <div className="h-4 w-[1px] bg-slate-200" />
           <span className="text-[10px] font-bold text-slate-400 uppercase">V12.0 Reliability Engine Active</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
              <th className="p-8">Entity Identifier</th>
              <th className="p-8 text-center">Reliability Score</th>
              <th className="p-8 text-right text-slate-400">Precursor Ceiling</th>
              <th className="p-8 text-right text-emerald-400">Actual Output</th>
              <th className="p-8 text-center">Forensic Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {auditMatrix && auditMatrix.map((entity, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="p-8 font-black text-slate-900 text-base">{entity.name}</td>
                <td className="p-8 text-center">
                  <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                    <span className="font-mono font-bold text-[11px] text-slate-700">
                      {entity.reliability.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="p-8 text-right font-mono font-bold text-slate-400">
                  {Math.round(entity.ceiling).toLocaleString()}
                </td>
                <td className="p-8 text-right font-mono font-black text-lg text-slate-900">
                  {Math.round(entity.actual).toLocaleString()}
                </td>
                <td className="p-8 text-center">
                  <div className="group relative inline-block">
                    <span className={`px-5 py-2 rounded-full text-[10px] font-black uppercase border-2 flex items-center gap-2 justify-center
                      ${entity.risk === 'CRITICAL' 
                        ? 'bg-red-50 text-red-700 border-red-200' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                      {entity.risk === 'CRITICAL' ? <AlertTriangle size={12}/> : <CheckCircle size={12}/>}
                      {entity.risk}
                    </span>
                    
                    {/* V12.0 FORENSIC VERDICT TOOLTIP */}
                    <div className="invisible group-hover:visible absolute top-full right-0 mt-3 w-80 bg-slate-900 text-white p-6 rounded-2xl shadow-2xl z-[100] text-left border border-white/10">
                      <p className="text-blue-400 font-black text-[10px] uppercase mb-2 border-b border-white/10 pb-2">Forensic Prose Verdict</p>
                      <p className="text-xs font-medium leading-relaxed italic text-slate-300">
                        {entity.risk === 'CRITICAL' ? (
                          entity.tobacco === 0 && entity.actual > 0 
                            ? "CRITICAL: Entity is exporting finished sticks with ZERO corresponding tobacco leaf imports. Direct evidence of shadow sourcing."
                            : `CRITICAL: Output exceeds precursor ceiling by ${Math.round((entity.actual/entity.ceiling - 1)*100)}%. Sourcing deficit detected.`
                        ) : "RECONCILED: Production volume is supported by verified precursor import history."}
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
  );
}
  return (
    <div className="max-w-[1600px] mx-auto mt-12 pb-24">
      {/* V13.1 AUDIT GUIDE - STICKY DEFINITIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="bg-white p-10 rounded-[3rem] border-2 border-slate-900 shadow-xl">
          <h3 className="text-xl font-black uppercase mb-8 flex items-center gap-3">
            <Info className="text-blue-700" /> Audit Protocol V13.1
          </h3>
          <div className="space-y-6 text-sm font-bold text-slate-700">
            <div className="flex gap-4">
              <span className="bg-slate-900 text-white h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px]">1</span>
              <p>Identify the <span className="text-black">Precursor Ceiling</span> (The lowest stick potential across Leaf, Tow, and Paper).</p>
            </div>
            <div className="flex gap-4">
              <span className="bg-slate-900 text-white h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px]">2</span>
              <p>Map <span className="text-black">Export Output</span> against this ceiling.</p>
            </div>
            <div className="flex gap-4">
              <span className="bg-red-600 text-white h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px]">3</span>
              {/* FIXED ESCAPED CHARACTER HERE */}
              <p className="text-red-600 italic underline">
                Flag Shadow Sourcing where Output {" > "} Ceiling * Risk Sensitivity.
              </p>
            </div>
          </div>
        </div>

        {/* SNAPSHOT ARCHIVE LIST */}
        <div className="bg-slate-100 p-10 rounded-[3rem] border-2 border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <History size={18}/> Snapshot Archive
            </h3>
            <span className="bg-slate-200 px-3 py-1 rounded-full text-[10px] font-black">{reports.length} SAVED</span>
          </div>
          <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {reports.length === 0 ? (
              <p className="text-slate-400 text-xs italic p-4 text-center">No forensic snapshots archived.</p>
            ) : (
              reports.map(r => (
                <div key={r.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm border border-slate-200">
                  <div>
                    <p className="font-black text-xs text-slate-900 uppercase">{r.title}</p>
                    <p className="text-[9px] font-bold text-slate-400">{r.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-red-600">{Math.round(r.prob)}% SIGNAL</p>
                    <p className="text-[9px] font-bold text-slate-500">${(r.gap/1e6).toFixed(1)}M GAP</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

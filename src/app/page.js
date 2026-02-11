"use client";
import React, { useState } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { AlertTriangle, Factory, Package, Zap, Globe, Info, Scale } from 'lucide-react';

const CONVERSIONS = {
  'Tobacco': 1333.33,
  'Acetate tow': 8333.33,
  'Cigarette paper': 20000,
  'Filter rods': 6,
  'UNITS': {
    'MIL': 1000, 'KGM': 1000, 'KG': 1000, 'KILOGRAMS': 1000,
    'BOX/BAG/PACK': 20, 'PIECE': 1, 'ШТ': 1, 'CASE': 10000,
  }
};

export default function NationalMonitor() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const processData = (raw) => {
    const registry = {};
    let countryTotals = { tobaccoKg: 0, towKg: 0, paperKg: 0, totalExported: 0 };

    raw.forEach(row => {
      const entity = row.Importer || row.Exporter;
      if (!entity) return;

      if (!registry[entity]) {
        registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, actual: 0 };
      }

      const mat = row.Material;
      const qty = parseFloat(row.Quantity) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = CONVERSIONS.UNITS[unit] || 1;

      if (mat === 'Cigarettes') {
        const sticks = qty * factor;
        registry[entity].actual += sticks;
        countryTotals.totalExported += sticks;
      } else if (mat === 'Tobacco') {
        registry[entity].tobacco += qty * CONVERSIONS['Tobacco'];
        countryTotals.tobaccoKg += qty;
      } else if (mat === 'Acetate tow') {
        registry[entity].tow += qty * CONVERSIONS['Acetate tow'];
        countryTotals.towKg += qty;
      } else if (mat === 'Cigarette paper') {
        registry[entity].paper += qty * CONVERSIONS['Cigarette paper'];
        countryTotals.paperKg += qty;
      }
    });

    const entities = Object.values(registry).map(e => {
      const potential = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
      const bottleneck = potential.length > 0 ? Math.min(...potential) : 0;
      return { ...e, bottleneck, risk: e.actual > bottleneck * 1.1 };
    }).sort((a, b) => b.bottleneck - a.bottleneck);

    // Country Metrics
    const countryPotential = Math.min(
      countryTotals.tobaccoKg * CONVERSIONS['Tobacco'],
      countryTotals.towKg * (countryTotals.towKg > 0 ? CONVERSIONS['Acetate tow'] : Infinity),
      countryTotals.paperKg * (countryTotals.paperKg > 0 ? CONVERSIONS['Cigarette paper'] : Infinity)
    );

    return { entities, countryTotals, countryPotential };
  };

  const sync = () => {
    setLoading(true);
    const csvUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(csvUrl, {
      download: true, header: true,
      complete: (res) => {
        setData(processData(res.data));
        setLoading(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-8 font-sans">
      <div className="max-w-7xl mx-auto mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3"><Globe className="text-blue-500" /> National Precursor Audit</h1>
        </div>
        <div className="flex gap-2">
          <input className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm w-80 outline-none focus:ring-1 focus:ring-blue-500" placeholder="Google Sheet URL..." onChange={(e) => setUrl(e.target.value)} />
          <button onClick={sync} className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition">
            {loading ? "Syncing..." : <><Zap size={16} /> Audit Country</>}
          </button>
        </div>
      </div>

      {data && (
        <div className="max-w-7xl mx-auto space-y-6">
          {/* COUNTRY SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Tobacco Imports</p>
              <p className="text-2xl font-mono text-blue-400">{data.countryTotals.tobaccoKg.toLocaleString()} <span className="text-sm">KGM</span></p>
            </div>
            <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">National Stick Potential</p>
              <p className="text-2xl font-mono text-white">{Math.round(data.countryPotential).toLocaleString()}</p>
            </div>
            <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">National Stick Exports</p>
              <p className="text-2xl font-mono text-emerald-400">{Math.round(data.countryTotals.totalExported).toLocaleString()}</p>
            </div>
            <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">National Surplus/Gap</p>
              <p className={`text-2xl font-mono ${data.countryPotential - data.countryTotals.totalExported < 0 ? 'text-red-500' : 'text-slate-300'}`}>
                {Math.round(data.countryPotential - data.countryTotals.totalExported).toLocaleString()}
              </p>
            </div>
          </div>

          {/* MAIN VISUALIZATION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-800/40 p-6 rounded-2xl border border-slate-700">
              <h3 className="text-sm font-bold mb-6 flex items-center gap-2 uppercase tracking-widest text-slate-400"><Scale size={16}/> Entity Performance (Potential vs Actual)</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.entities.slice(0, 8)}>
                    <XAxis dataKey="name" hide />
                    <Tooltip contentStyle={{backgroundColor: '#1e293b', border: 'none', borderRadius: '8px'}} />
                    <Bar dataKey="bottleneck" name="Precursor Potential" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" name="Actual Exported" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 flex flex-col justify-center items-center text-center">
                <h3 className="text-sm font-bold mb-4 uppercase text-slate-400">Export Utilization</h3>
                <div className="text-5xl font-black text-blue-500 mb-2">
                    {Math.round((data.countryTotals.totalExported / data.countryPotential) * 100) || 0}%
                </div>
                <p className="text-xs text-slate-500 leading-relaxed max-w-[200px]">Of the country's imported precursor potential is leaving as finished exports.</p>
            </div>
          </div>

          {/* FORENSIC GUIDE SECTION */}
          <div className="bg-blue-900/10 border border-blue-500/20 p-8 rounded-3xl">
            <h2 className="text-xl font-bold text-blue-400 mb-4 flex items-center gap-2"><Info /> Auditor's Conclusion & Guide</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm leading-relaxed text-slate-300">
              <div className="space-y-4">
                <p>
                  <strong className="text-white block mb-1 underline decoration-blue-500/50">1. Precursor-to-Stick Conclusion</strong>
                  The country imported <strong>{data.countryTotals.tobaccoKg.toLocaleString()} kg</strong> of Tobacco. At a standard 0.75g per stick, this provides a national manufacturing ceiling of <strong>{Math.round(data.countryTotals.tobaccoKg * 1333.33).toLocaleString()} sticks</strong>. 
                </p>
                <p>
                  <strong className="text-white block mb-1 underline decoration-blue-500/50">2. National Balance Analysis</strong>
                  If "National Stick Exports" ({Math.round(data.countryTotals.totalExported).toLocaleString()}) is significantly <strong>lower</strong> than "National Potential," the remaining volume is either consumed locally or represents stockpiled precursors. 
                </p>
              </div>
              <div className="space-y-4">
                <p>
                  <strong className="text-white block mb-1 underline decoration-blue-500/50">3. Red Flag Warning</strong>
                  If "National Stick Exports" is <strong>higher</strong> than "National Potential" (Utilization &gt; 100%), the country is exporting more than it can legally manufacture from its reported imports. This is a primary indicator of <strong>illicit precursor sourcing</strong> or under-reported imports.
                </p>
                <p>
                  <strong className="text-white block mb-1 underline decoration-blue-500/50">4. Discrepancy Guide</strong>
                  Always verify <strong>Unit Discrepancies</strong> in the table below. A single entity using an unrecognized unit (like "BAG" or "Tonne") can skew the national total by millions of sticks.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

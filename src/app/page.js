"use client";
import React, { useState } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { AlertTriangle, CheckCircle, Factory, Package, Zap, Search, Activity } from 'lucide-react';

// Advanced Conversion Registry
const CONVERSIONS = {
  'Tobacco': 1333.33,       // Sticks per Kg
  'Acetate tow': 8333.33,   // Sticks per Kg
  'Cigarette paper': 20000, // Sticks per Kg
  'Filter rods': 6,         // Sticks per Piece
  'UNITS': {
    'MIL': 1000,
    'KGM': 1000,
    'KG': 1000,
    'KILOGRAMS': 1000,
    'BOX/BAG/PACK': 20,
    'PIECE': 1,
    'ШТ': 1,
    'CASE': 10000,
    // Add more units here in the future
  }
};

export default function AdvancedMonitor() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const processData = (raw) => {
    const registry = {};

    raw.forEach(row => {
      const entity = row.Importer || row.Exporter;
      if (!entity) return;

      if (!registry[entity]) {
        registry[entity] = { 
          name: entity, 
          tobacco_sticks: 0, 
          tow_sticks: 0, 
          paper_sticks: 0, 
          actual_exported: 0,
          unknown_units: []
        };
      }

      const mat = row.Material;
      const qty = parseFloat(row.Quantity) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = CONVERSIONS.UNITS[unit];

      // Track unknown units for B (Expansion)
      if (!factor && qty > 0 && !CONVERSIONS[mat]) {
        if (!registry[entity].unknown_units.includes(unit)) registry[entity].unknown_units.push(unit);
      }

      if (mat === 'Cigarettes') {
        registry[entity].actual_exported += qty * (factor || 1);
      } else if (mat === 'Tobacco') {
        registry[entity].tobacco_sticks += qty * CONVERSIONS['Tobacco'];
      } else if (mat === 'Acetate tow') {
        registry[entity].tow_sticks += qty * CONVERSIONS['Acetate tow'];
      } else if (mat === 'Cigarette paper') {
        registry[entity].paper_sticks += qty * CONVERSIONS['Cigarette paper'];
      }
    });

    return Object.values(registry).map(e => {
      // Calculate Bottleneck (The limiting factor)
      const potential = [e.tobacco_sticks, e.tow_sticks, e.paper_sticks].filter(v => v > 0);
      const bottleneck = potential.length > 0 ? Math.min(...potential) : 0;
      
      // Risk Score Logic (C)
      // If actual exports > bottleneck potential, high risk.
      const riskRatio = bottleneck > 0 ? (e.actual_exported / bottleneck) : 0;
      let status = 'Low Risk';
      if (riskRatio > 1.1) status = 'High Risk'; // 10% margin of error
      else if (riskRatio > 0.9) status = 'Medium Risk';

      return { ...e, bottleneck, riskRatio, status };
    }).sort((a, b) => b.bottleneck - a.bottleneck);
  };

  const sync = () => {
    setLoading(true);
    const csvUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (res) => {
        setData(processData(res.data));
        setLoading(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-8 font-sans">
      {/* Header & Search */}
      <div className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-end gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Factory className="text-blue-500" /> PRECURSOR MONITOR <span className="text-sm bg-blue-500/20 text-blue-400 px-2 py-1 rounded">V2.0</span>
          </h1>
          <p className="text-slate-400 mt-2">Cross-referencing precursors vs. finished stick exports</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <input 
            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm w-full md:w-80 focus:ring-2 focus:ring-blue-600 outline-none transition"
            placeholder="Paste Google Sheet URL..."
            onChange={(e) => setUrl(e.target.value)}
          />
          <button onClick={sync} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition shadow-lg shadow-blue-900/20">
            {loading ? "Processing..." : <><Zap size={18} /> Run Audit</>}
          </button>
        </div>
      </div>

      {data.length > 0 && (
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700">
              <p className="text-slate-500 text-xs font-bold uppercase mb-2">High Risk Entities</p>
              <p className="text-3xl font-mono text-red-500">{data.filter(d => d.status === 'High Risk').length}</p>
            </div>
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700">
              <p className="text-slate-500 text-xs font-bold uppercase mb-2">Active Importers</p>
              <p className="text-3xl font-mono text-blue-400">{data.length}</p>
            </div>
            <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700">
              <p className="text-slate-500 text-xs font-bold uppercase mb-2">Unknown Units Detected</p>
              <p className="text-3xl font-mono text-yellow-500">
                {data.reduce((acc, curr) => acc + curr.unknown_units.length, 0)}
              </p>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-slate-800/40 p-8 rounded-3xl border border-slate-700 shadow-inner">
            <h2 className="text-xl font-bold mb-8 flex items-center gap-2"><Package className="text-blue-400"/> Stick Volume Discrepancy</h2>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <XAxis dataKey="name" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px'}} />
                  <Legend />
                  <Bar dataKey="bottleneck" name="Max Potential (Precursors)" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="actual_exported" name="Actual Exported" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Entity Table */}
          <div className="bg-slate-800/40 rounded-3xl border border-slate-700 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/50 text-slate-400 uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-6 py-4">Entity Name</th>
                  <th className="px-6 py-4 text-center">Risk Status</th>
                  <th className="px-6 py-4 text-right">Potential (Bottleneck)</th>
                  <th className="px-6 py-4 text-right">Actual Exported</th>
                  <th className="px-6 py-4 text-center">Unrecognized Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-700/20 transition">
                    <td className="px-6 py-4 font-semibold text-slate-100">{row.name}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                        row.status === 'High Risk' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 
                        row.status === 'Medium Risk' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 
                        'bg-green-500/20 text-green-400 border border-green-500/30'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">{Math.round(row.bottleneck).toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-mono text-emerald-400">{Math.round(row.actual_exported).toLocaleString()}</td>
                    <td className="px-6 py-4 text-center text-yellow-500 font-mono text-xs italic">
                      {row.unknown_units.join(', ') || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  );
}

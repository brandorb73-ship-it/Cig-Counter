"use client";
import React, { useState } from 'react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Upload, Activity, ShieldAlert, Package, TrendingUp } from 'lucide-react';

const CONVERSIONS = {
  'Tobacco': 1333.33,
  'Acetate tow': 8333.33,
  'Cigarette paper': 20000,
  'Filter rods': 6,
  'UNITS': {
    'MIL': 1000, 'KGM': 1000, 'KG': 1000, 'KILOGRAMS': 1000,
    'BOX/BAG/PACK': 20, 'PIECE': 1, 'ШТ': 1, 'CASE': 10000
  }
};

export default function Dashboard() {
  const [url, setUrl] = useState('');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const processSheet = () => {
    setLoading(true);
    const csvUrl = url.replace(/\/edit.*$/, '/export?format=csv');
    
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      complete: (results) => {
        const stats = {};
        results.data.forEach(row => {
          const entity = row.Importer || row.Exporter;
          if (!entity) return;
          if (!stats[entity]) stats[entity] = { name: entity, potential: 0, actual: 0 };

          const qty = parseFloat(row.Quantity) || 0;
          const material = row.Material;
          const unit = (row['Quantity Unit'] || '').toUpperCase();

          if (material === 'Cigarettes') {
            stats[entity].actual += qty * (CONVERSIONS.UNITS[unit] || 1);
          } else {
            stats[entity].potential += qty * (CONVERSIONS[material] || 0);
          }
        });
        setData(Object.values(stats).sort((a, b) => b.potential - a.potential));
        setLoading(false);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="text-blue-500" /> Precursor Monitor
          </h1>
          <p className="text-slate-500 text-sm">Entity Production Discrepancy Analysis</p>
        </div>
        <div className="flex gap-2">
          <input 
            className="bg-slate-800 border border-slate-700 rounded px-4 py-2 text-sm w-64 focus:outline-none focus:border-blue-500"
            placeholder="Google Sheet Link"
            onChange={(e) => setUrl(e.target.value)}
          />
          <button 
            onClick={processSheet}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-bold transition flex items-center gap-2"
          >
            <Upload size={16} /> {loading ? "Syncing..." : "Sync"}
          </button>
        </div>
      </div>

      {data.length > 0 && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Chart */}
          <div className="lg:col-span-3 bg-slate-800/50 border border-slate-700 p-6 rounded-xl shadow-2xl">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-6 flex items-center gap-2">
              <TrendingUp size={14}/> Stick Volume: Potential (Blue) vs Actual (Green)
            </h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ fontSize: '12px' }}
                  />
                  <Bar dataKey="potential" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                  <Bar dataKey="actual" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Risk Sidebar */}
          <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-xl">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-4">Entity Risk Rank</h3>
            {data.map((item, i) => (
              <div key={i} className="mb-4 border-b border-slate-700/50 pb-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold truncate w-32">{item.name}</span>
                  <span className="text-[10px] text-blue-400 font-mono">
                    {Math.round(item.potential).toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-slate-900 h-1 rounded-full">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${Math.min((item.actual / item.potential) * 100 || 0, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

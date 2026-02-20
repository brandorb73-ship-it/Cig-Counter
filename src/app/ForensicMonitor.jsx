import React, { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { Upload, AlertTriangle, TrendingUp, Globe, Settings } from 'lucide-react';

/**
 * ForensicMonitor Component
 * Focus: Time-series analysis, Unit Normalization, and Revenue Simulation.
 */
const ForensicMonitor = () => {
  const [data, setData] = useState([]);
  const [wastage, setWastage] = useState(5); // Default 5% wastage
  const [selectedEntity, setSelectedEntity] = useState('All');
  const [taxRate, setTaxRate] = useState(0.02); // $0.02 per stick default

  // --- UNIT CONVERSION CONSTANTS ---
  const unitMap = {
    'kg': 1,
    'mt': 1000,
    'lb': 0.453,
    'bale': 250,   // Standard Acetate Tow bale
    'bobbin': 20,  // Standard Paper bobbin
    'unit': 1      // For pre-made filter rods
  };

  // --- PRODUCTION CONVERSION CONSTANTS ---
  const yieldConstants = {
    tobacco: 0.0007, // 0.7g per stick (in kg)
    tow: 20000,      // 20k sticks per 1kg of tow
    rods: 1,         // 1:1 ratio for pre-made rods
    paper: 40000     // 40k sticks per kg/unit of paper
  };

  // CSV Parsing Handler
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').slice(1); // Skip headers
      const formatted = rows.map(row => {
        const cols = row.split(',');
        return {
          entity: cols[0],
          month: cols[1],
          tobaccoVal: parseFloat(cols[2]) || 0,
          tobaccoUnit: cols[3]?.toLowerCase().trim() || 'kg',
          towVal: parseFloat(cols[4]) || 0,
          towUnit: cols[5]?.toLowerCase().trim() || 'kg',
          rodVal: parseFloat(cols[6]) || 0,
          paperVal: parseFloat(cols[7]) || 0,
          outflow: parseFloat(cols[8]) || 0,
          origin: cols[9] || 'Unknown',
          dest: cols[10] || 'Unknown'
        };
      }).filter(r => r.entity);
      setData(formatted);
    };
    reader.readAsText(file);
  };

  // --- FORENSIC CALCULATIONS ---
  const processedData = useMemo(() => {
    const wasteFactor = (100 - wastage) / 100;

    return data.map(item => {
      // 1. Normalize Units to KG
      const normTobacco = item.tobaccoVal * (unitMap[item.tobaccoUnit] || 1);
      const normTow = item.towVal * (unitMap[item.towUnit] || 1);

      // 2. Calculate Capacity per Precursor
      const capTobacco = (normTobacco * wasteFactor) / yieldConstants.tobacco;
      const capTow = (normTow * wasteFactor) * yieldConstants.tow;
      const capRods = (item.rodVal * wasteFactor) * yieldConstants.rods;
      const capPaper = (item.paperVal * wasteFactor) * yieldConstants.paper;

      // 3. The Bottleneck (Theoretical Max)
      // We consider the sum of Tow + Rods as the filter capacity
      const filterCap = capTow + capRods;
      const theoreticalMax = Math.min(capTobacco, filterCap, capPaper);
      
      const gap = theoreticalMax - item.outflow;
      const revenueLoss = gap < 0 ? Math.abs(gap) * taxRate : 0;

      return {
        ...item,
        theoreticalMax,
        gap: gap < 0 ? Math.abs(gap) : 0,
        revenueLoss
      };
    });
  }, [data, wastage, taxRate]);

  // Aggregate stats for Display
  const totalGap = processedData.reduce((acc, curr) => acc + curr.gap, 0);
  const totalLoss = processedData.reduce((acc, curr) => acc + curr.revenueLoss, 0);

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-sans">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="text-blue-600" /> Forensic Trend Monitor
        </h1>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition">
            <Upload size={18} /> Upload Trend Data
            <input type="file" className="hidden" onChange={handleFileUpload} accept=".csv" />
          </label>
        </div>
      </div>

      {/* --- SIMULATOR PANEL --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between mb-4">
            <span className="text-slate-500 font-medium">Wastage Tolerance</span>
            <span className="text-blue-600 font-bold">{wastage}%</span>
          </div>
          <input 
            type="range" min="0" max="30" value={wastage} 
            onChange={(e) => setWastage(e.target.value)}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <p className="text-xs text-slate-400 mt-2 italic">Standard factory loss: 2-7%</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <span className="text-slate-500 font-medium flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={16} /> Total Ghost Volume
          </span>
          <div className="text-3xl font-bold text-slate-800 mt-2">
            {totalGap.toLocaleString()} <span className="text-sm font-normal text-slate-400">sticks</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-red-100 bg-red-50/30">
          <span className="text-red-600 font-medium">Estimated Tax Leakage</span>
          <div className="text-3xl font-bold text-red-600 mt-2">
            ${totalLoss.toLocaleString(undefined, {minimumFractionDigits: 2})}
          </div>
        </div>
      </div>

      {/* --- TREND CHART --- */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
        <h3 className="text-lg font-semibold mb-6">National Mass-Balance Trend (6 Months)</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <AreaChart data={processedData}>
              <defs>
                <linearGradient id="colorMax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Legend verticalAlign="top" align="right" height={36}/>
              <Area 
                name="Production Ceiling" type="monotone" dataKey="theoreticalMax" 
                stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorMax)" 
              />
              <Area 
                name="Reported Exports" type="monotone" dataKey="outflow" 
                stroke="#ef4444" strokeWidth={3} fill="#fee2e2" fillOpacity={0.4} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- SOURCING INTELLIGENCE TABLE --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-4 font-semibold text-slate-600">Entity</th>
              <th className="p-4 font-semibold text-slate-600 text-center flex items-center gap-1">
                <Globe size={14}/> Sourcing Hubs
              </th>
              <th className="p-4 font-semibold text-slate-600">Theoretical (Sticks)</th>
              <th className="p-4 font-semibold text-slate-600">Declared (Sticks)</th>
              <th className="p-4 font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {processedData.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition">
                <td className="p-4 font-medium text-slate-700">{row.entity}</td>
                <td className="p-4 text-sm text-slate-500">
                  <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">{row.origin}</span>
                  <span className="mx-2">→</span>
                  <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs">{row.dest}</span>
                </td>
                <td className="p-4 font-mono">{Math.floor(row.theoreticalMax).toLocaleString()}</td>
                <td className="p-4 font-mono">{row.outflow.toLocaleString()}</td>
                <td className="p-4">
                  {row.outflow > row.theoreticalMax ? (
                    <span className="text-red-600 flex items-center gap-1 text-sm font-bold animate-pulse">
                      <AlertTriangle size={14} /> GHOST VOLUME
                    </span>
                  ) : (
                    <span className="text-emerald-600 text-sm font-medium">Compliant</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ForensicMonitor;

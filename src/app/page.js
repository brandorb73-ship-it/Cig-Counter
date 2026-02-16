"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import { 
  ShieldAlert, Activity, Database, Wind, FileText, Pipette, Trash2, 
  Calculator, Save, History, Search, Info, CheckCircle, TrendingUp, Eraser 
} from 'lucide-react';

const CONVERSIONS = {
  'TOBACCO': 1333.33, 
  'TOW': 8333.33, 
  'PAPER': 20000, 
  'RODS': 6,
  'CIGARETTES_WT': 1333.33,
  'UNITS': { 'MIL': 1000, 'KGM': 1, 'KG': 1, 'TON': 1000, 'MT': 1000, 'CASE': 10000, 'PIECE': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={16} />,
  'TOW': <Wind className="text-sky-700" size={16} />,
  'PAPER': <FileText className="text-slate-700" size={16} />,
  'RODS': <Pipette className="text-purple-700" size={16} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={16} />
};

export default function ForensicMonitorV94() {
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);

  useEffect(() => {
    const saved = localStorage.getItem('forensic_v94_archive');
    if (saved) setReports(JSON.parse(saved));
  }, []);

  const auditResult = useMemo(() => {
    if (rawData.length === 0) return null;
    const registry = {};
    let nat = { tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, tobaccoKg: 0, towKg: 0, paperKg: 0, rodsUnits: 0 };

    rawData.forEach(row => {
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;
      if (!registry[entity]) registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {}, tx: 0 };
      
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
        let sticks = (unit === 'MIL') ? qty * 1000000 : (['KG', 'KGM', 'TON', 'MT'].includes(unit)) ? convQty * CONVERSIONS.CIGARETTES_WT : convQty;
        registry[entity].actual += sticks;
        nat.actual += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, calc: "" };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
        registry[entity].materials[mat].calc = `${qty.toLocaleString()} ${unit} × ${sticks/qty === 1000000 ? "1M" : "1,333"}`;
      } else if (mat && CONVERSIONS[mat]) {
        const sticks = convQty * CONVERSIONS[mat];
        registry[entity][mat.toLowerCase()] += sticks;
        if (mat === 'TOBACCO') nat.tobaccoKg += convQty;
        if (mat === 'TOW') nat.towKg += convQty;
        if (mat === 'PAPER') nat.paperKg += convQty;
        if (mat === 'RODS') nat.rodsUnits += convQty;
        nat[mat.toLowerCase()] += sticks;
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit, calc: "" };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
        registry[entity].materials[mat].calc = `${qty.toLocaleString()} ${unit} × ${CONVERSIONS[mat].toLocaleString()}`;
      }
    });

    return { 
      entities: Object.values(registry).map(e => {
        const precursors = [e.tobacco, e.tow, e.paper].filter(v => v > 0);
        const minPot = (e.tobacco === 0) ? 0 : Math.min(...precursors);
        const isOver = e.actual > (minPot * (1 + riskThreshold / 100));
        return { ...e, minPot, risk: (e.actual > 0 && e.tobacco === 0) || isOver ? 'CRITICAL' : 'RECONCILED' };
      }).sort((a, b) => b.actual - a.actual),
      nat 
    };
  }, [rawData, riskThreshold]);

  const saveReport = () => {
    if (!reportTitle) return;
    const newR = { id: Date.now(), title: reportTitle, data: rawData, date: new Date().toLocaleString() };
    const updated = [newR, ...reports];
    setReports(updated);
    localStorage.setItem('forensic_v94_archive', JSON.stringify(updated));
    setReportTitle('');
  };

  const natPot = auditResult ? Math.min(auditResult.nat.tobacco || Infinity, auditResult.nat.tow || Infinity, auditResult.nat.paper || Infinity) : 0;
  const shadowPercent = (natPot > 0) ? ((auditResult.nat.actual / natPot) - 1) * 100 : 0;
  const bottleneck = auditResult ? (auditResult.nat.tobacco <= auditResult.nat.tow ? 'Tobacco' : 'Acetate Tow') : '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 font-sans">
      <header className="max-w-7xl mx-auto mb-6 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl"><ShieldAlert className="text-white" size={24}/></div>
          <h1 className="text-xl font-black uppercase tracking-tight">Forensic Monitor <span className="text-blue-600">v9.4</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <input className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold w-64 outline-none" placeholder="Sheet URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={() => {setLoading(true); Papa.parse(url.replace(/\/edit.*$/, '/export?format=csv'), { download: true, header: true, complete: (res) => { setRawData(res.data); setLoading(false); } });}} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-black text-xs uppercase">Sync</button>
          <button onClick={() => setRawData([])} className="p-2 text-slate-400 hover:text-red-600 border border-slate-200 rounded-lg"><Eraser size={18}/></button>
        </div>
      </header>

      {auditResult && (
        <main className="max-w-7xl mx-auto space-y-6">
          <nav className="flex gap-8 text-[10px] font-black uppercase tracking-widest border-b border-slate-200">
            <button onClick={() => setActiveTab('country')} className={`pb-3 ${activeTab === 'country' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Country Intelligence</button>
            <button onClick={() => setActiveTab('entities')} className={`pb-3 ${activeTab === 'entities' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Target Analysis</button>
            <button onClick={() => setActiveTab('reports')} className={`pb-3 ${activeTab === 'reports' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>Archives</button>
          </nav>

          {activeTab === 'country' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <section className="lg:col-span-8 bg-white border border-slate-200 p-6 rounded-2xl">
                  <h2 className="text-[10px] font-black uppercase text-slate-400 mb-6 flex items-center gap-2"><Activity size={14}/> Supply vs Export Balance</h2>
                  <div className="h-80">
                    <ResponsiveContainer>
                      <BarChart data={[
                        { name: 'Tobacco', val: auditResult.nat.tobacco, fill: '#f59e0b' },
                        { name: 'Tow', val: auditResult.nat.tow, fill: '#0ea5e9' },
                        { name: 'Paper', val: auditResult.nat.paper, fill: '#64748b' },
                        { name: 'Actual', val: auditResult.nat.actual, fill: '#10b981' }
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" fontSize={10} fontWeight="900" />
                        <YAxis fontSize={10} fontWeight="900" tickFormatter={(v) => v.toLocaleString()} />
                        <Tooltip formatter={(v) => v.toLocaleString()} />
                        <Bar dataKey="val" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <aside className="lg:col-span-4 bg-white border border-slate-200 p-6 rounded-2xl flex flex-col">
                  <h2 className="text-[10px] font-black text-blue-600 uppercase mb-6 tracking-widest">Audit Matrix</h2>
                  <div className="space-y-4 flex-1">
                    <BalanceRow label="Raw Tobacco" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" factor={1333.33} color="bg-amber-500" />
                    <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" factor={8333.33} color="bg-sky-500" />
                    <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" factor={6} color="bg-purple-500" />
                  </div>
                </aside>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 text-white p-6 rounded-2xl">
                  <h3 className="text-[9px] font-black text-blue-400 uppercase mb-2">Finding: Bottleneck</h3>
                  <p className="text-sm font-bold mb-1">Constraint: <span className="text-blue-300">{bottleneck}</span></p>
                  <p className="text-[10px] text-slate-400 leading-relaxed italic mb-4">Production is capped by the material with the lowest stick-potential ({bottleneck}).</p>
                  <p className="text-xl font-black text-emerald-400">+{shadowPercent.toFixed(2)}% <span className="text-[10px] text-white">Surplus</span></p>
                </div>
                <div className="bg-white p-6 border border-slate-200 rounded-2xl">
                  <h3 className="text-[9px] font-black uppercase mb-2 flex items-center gap-2"><Info size={14} className="text-blue-600"/> Tobacco Ceiling</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase italic leading-tight">Tobacco is the anchor. If exports exist without tobacco imports, shadow leaf is being used.</p>
                </div>
                <div className="bg-white p-6 border border-slate-200 rounded-2xl flex flex-col gap-2">
                  <input className="bg-slate-50 border p-2 rounded text-[10px] font-bold outline-none" placeholder="Report Title..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
                  <button onClick={saveReport} className="bg-slate-900 text-white py-2 rounded text-[9px] font-black uppercase flex items-center justify-center gap-2"><Save size={12}/> Save Audit</button>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-4">
              <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
                <Search size={16} className="text-slate-400"/><input className="w-full text-xs font-bold outline-none" placeholder="Search Target..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-500 border-b">
                    <tr>
                      <th className="p-4">Target Entity</th>
                      <th className="p-4 text-center">TX</th>
                      <th className="p-4">Inventory (Sticks @ 1:1,333)</th>
                      <th className="p-4 text-right">Potential</th>
                      <th className="p-4 text-right text-emerald-600">Actual</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold">
                    {auditResult.entities.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())).map((e, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-4 text-slate-900">{e.name}</td>
                        <td className="p-4 text-center text-slate-400">{e.tx}</td>
                        <td className="p-4 flex gap-2">
                          {Object.entries(e.materials).map(([m, s]) => (
                            <div key={m} className="group/calc relative flex items-center gap-1 bg-white border px-2 py-1 rounded">
                              {Icons[m]} <span className="text-[10px]">{Math.round(s.rawQty).toLocaleString()}</span>
                              <div className="invisible group-hover/calc:visible absolute bottom-full left-0 mb-2 bg-slate-900 text-white p-2 rounded text-[9px] w-40 z-50">{s.calc} = {Math.round(s.sticks).toLocaleString()} Sticks</div>
                            </div>
                          ))}
                        </td>
                        <td className="p-4 text-right text-slate-400">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-4 text-right text-slate-900">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black border ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>{e.risk}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reports.map(r => (
                <div key={r.id} className="bg-white border p-6 rounded-2xl group relative">
                  <button onClick={() => setReports(reports.filter(x => x.id !== r.id))} className="absolute top-4 right-4 text-slate-300 hover:text-red-600"><Trash2 size={16}/></button>
                  <h3 className="font-black text-sm mb-1">{r.title}</h3>
                  <p className="text-[9px] text-slate-400 uppercase mb-4">{r.date}</p>
                  <button onClick={() => {setRawData(r.data); setActiveTab('country');}} className="w-full bg-slate-100 py-2 rounded text-[9px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all">Restore</button>
                </div>
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  );
}

function BalanceRow({ label, kg, sticks, unit, factor, color }) {
  return (
    <div className="group relative flex justify-between items-center py-1">
      <div className="flex items-center gap-3">
        <div className={`w-1 h-6 rounded-full ${color}`}/>
        <div><p className="text-[8px] text-slate-400 font-black uppercase">{label}</p><p className="text-[11px] font-black leading-tight">{Math.round(kg).toLocaleString()} {unit}</p></div>
      </div>
      <p className="text-[11px] font-black text-blue-600 font-mono">{Math.round(sticks).toLocaleString()}</p>
      <div className="invisible group-hover:visible absolute top-full left-0 mt-2 bg-slate-900 text-white p-2 rounded text-[9px] w-48 z-50">
        Calculation: {Math.round(kg).toLocaleString()} {unit} × {factor.toLocaleString()} = {Math.round(sticks).toLocaleString()} Sticks
      </div>
    </div>
  );
}

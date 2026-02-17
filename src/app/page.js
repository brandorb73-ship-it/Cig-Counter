"use client";
import React, { useState, useEffect, useMemo } from 'react';
// ... other imports

// 1. Move static data outside the component
const DEFAULT_CONVERSIONS = {
  TOBACCO: 1333.33,
  TOW: 8333.33,
  PAPER: 20000,
  RODS: 6,
  CIGARETTES_EXPORT: 1000,
  CIGARETTES_MIL: 1000000,
  TAX_PER_STICK: 0.15,
  UNITS: { 'KG': 1, 'KGM': 1, 'TON': 1000, 'MT': 1000, 'LB': 0.4535, 'MIL': 1 }
};

const Icons = {
  'TOBACCO': <Database className="text-amber-700" size={18} />,
  'TOW': <Wind className="text-sky-700" size={18} />,
  'PAPER': <FileText className="text-slate-700" size={18} />,
  'RODS': <Pipette className="text-purple-700" size={18} />,
  'CIGARETTES': <Activity className="text-emerald-700" size={18} />
};

const formatValue = (value) => new Intl.NumberFormat('en-US', { 
  notation: "compact", 
  compactDisplay: "short" 
}).format(value);

// 2. Helper Components (Keep these outside too)
const SummaryBox = ({ title, val, sub, color, isText }) => (
  <div className="bg-white border-2 border-slate-100 p-6 rounded-3xl shadow-sm">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
    <p className={`text-2xl font-black ${color}`}>{val}</p>
    <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{sub}</p>
  </div>
);

const BalanceRow = ({ label, kg, sticks, unit, color, ratio }) => (
  <div className="group relative">
    <div className="flex justify-between items-end border-b border-slate-100 pb-3">
      <div className="flex items-center gap-4">
        <div className={`w-2 h-10 rounded-full ${color}`}/>
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase">{label}</p>
          <p className="text-xl font-black">{Math.round(kg || 0).toLocaleString()} <span className="text-[10px] text-slate-300">{unit}</span></p>
          <p className="text-[9px] font-black text-blue-600/60 uppercase">× {(ratio || 0).toLocaleString()} Yield</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-base font-black text-blue-700 font-mono">{Math.round(sticks || 0).toLocaleString()}</p>
        <p className="text-[8px] font-bold text-slate-400 uppercase">Sticks Eq</p>
      </div>
    </div>
  </div>
);

export default function ObsidianPrimeV12Final() {
  // 3. ALL HOOKS MUST BE AT THE TOP OF THE FUNCTION
  const [url, setUrl] = useState('');
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('country');
  const [reports, setReports] = useState([]);
  const [reportTitle, setReportTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [riskThreshold, setRiskThreshold] = useState(10);
  
  // SINGLE state definition for conversions
  const [localConversions, setLocalConversions] = useState(DEFAULT_CONVERSIONS);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('obsidian_prime_v12_final');
      if (saved) setReports(JSON.parse(saved));
    } catch (e) { setReports([]); }
  }, []);

  const clearSession = () => {
    if(window.confirm("CRITICAL: Wipe current audit?")) { setRawData([]); setUrl(''); }
  };

const auditResult = useMemo(() => {
    if (!rawData || rawData.length === 0) return null;
    
    const registry = {};
    // Initialize nat with trackers for both Sticks and raw Physical volume
    let nat = { 
      tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, 
      tobaccoKg: 0, towKg: 0, paperKg: 0, rodsUnits: 0 
    };

 // 1. Process Raw Data Loop
    rawData.forEach(row => {
      const entity = row.Entity || row.Importer || row.Exporter;
      if (!entity) return;
      if (!registry[entity]) {
        registry[entity] = { name: entity, tobacco: 0, tow: 0, paper: 0, rods: 0, actual: 0, materials: {}, tx: 0 };
      }
      
      const mR = (row.Material || '').toUpperCase();
      const mat = mR.includes('TOBACCO') ? 'TOBACCO' : mR.includes('TOW') ? 'TOW' : 
                  mR.includes('PAPER') ? 'PAPER' : mR.includes('ROD') ? 'RODS' : 
                  (mR.includes('CIGARETTE') && !mR.includes('PAPER')) ? 'CIGARETTES' : null;
      
      const qty = parseFloat(String(row.Quantity).replace(/,/g, '')) || 0;
      const unit = (row['Quantity Unit'] || '').toUpperCase().trim();
      const factor = localConversions.UNITS[unit] || 1;
      const convQty = qty * factor;
      registry[entity].tx += 1;

      // START OF CONDITIONAL BLOCK
      if (mat === 'CIGARETTES') {
        let sticks = (unit === 'MIL') 
          ? qty * localConversions.CIGARETTES_MIL 
          : (['KG', 'KGM', 'TON', 'MT'].includes(unit)) 
            ? convQty * localConversions.CIGARETTES_EXPORT 
            : convQty;
            
        registry[entity].actual += sticks;
        nat.actual += sticks;
        
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;

      } else if (mat && localConversions[mat]) {
        const sticks = convQty * localConversions[mat];
        const key = mat.toLowerCase();
        
        // Update Entity Registry
        registry[entity][key] += sticks;
        
        // Update National Ledger Weights
        if (mat === 'TOBACCO') { nat.tobaccoKg += convQty; nat.tobacco += sticks; }
        if (mat === 'TOW') { nat.towKg += convQty; nat.tow += sticks; }
        if (mat === 'PAPER') { nat.paperKg += convQty; nat.paper += sticks; }
        if (mat === 'RODS') { nat.rodsUnits += convQty; nat.rods += sticks; }

        // Populate materials for Target Analytics tab
        if (!registry[entity].materials[mat]) registry[entity].materials[mat] = { rawQty: 0, sticks: 0, unit };
        registry[entity].materials[mat].rawQty += qty;
        registry[entity].materials[mat].sticks += sticks;
      }
    }); // END of forEach
    // 2. National Logic
    const currentNatGap = Math.max(0, nat.actual - nat.tobacco);
    
    // Bottleneck logic: finds the material with the lowest stick potential
    const currentBottleneck = [
      { name: 'Tobacco', val: nat.tobacco },
      { name: 'Tow', val: nat.tow },
      { name: 'Paper', val: nat.paper },
      { name: 'Rods', val: nat.rods }
    ].filter(p => p.val > 0).reduce((prev, curr) => (prev.val < curr.val ? prev : curr), { name: 'No Precursors Found', val: 0 });

    // 3. Entity Mapping
    const entities = Object.values(registry).map(e => {
      const pots = [e.tobacco, e.tow, e.paper, e.rods].filter(v => v > 0);
      const minPot = pots.length > 0 ? Math.min(...pots) : 0;
      const productionGap = Math.max(0, e.actual - minPot);
      const isCritical = (e.actual > 0 && e.tobacco === 0) || (e.actual > (minPot * (1 + riskThreshold/100)));
      
      return { 
        ...e, 
        minPot, 
        productionGap,
        taxRisk: productionGap * localConversions.TAX_PER_STICK,
        reliability: pots.length > 0 ? Math.max(0, 100 - (((Math.max(...pots) - minPot) / Math.max(...pots)) * 100)) : 0,
        risk: isCritical ? 'CRITICAL' : 'RECONCILED'
      };
    }).sort((a, b) => b.actual - a.actual);

    // 4. Final Data Return
    return { 
      entities, 
      nat, 
      productionGap: currentNatGap, 
      leakageData: [
        { name: 'Tobacco Deficit', value: Math.max(0, nat.actual - nat.tobacco), fill: '#f59e0b' },
        { name: 'Tow Deficit', value: Math.max(0, nat.actual - nat.tow), fill: '#0ea5e9' },
        { name: 'Paper Deficit', value: Math.max(0, nat.actual - nat.paper), fill: '#64748b' },
        { name: 'Rod Deficit', value: Math.max(0, nat.actual - nat.rods), fill: '#a855f7' }
      ].filter(d => d.value > 0),
      shadowProb: nat.actual > 0 ? Math.min(100, (currentNatGap / nat.actual) * 100) : 0,
      bottleneck: currentBottleneck,
      taxLoss: currentNatGap * localConversions.TAX_PER_STICK 
    };
  }, [rawData, riskThreshold, localConversions]);
  
  const filteredEntities = useMemo(() => {
    return (auditResult?.entities || []).filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [auditResult, searchTerm]);

  const sync = () => {
    setLoading(true);
    const gid = url.match(/gid=([0-9]+)/)?.[1] || "0";
    Papa.parse(`${url.replace(/\/edit.*$/, '/export?format=csv')}&gid=${gid}`, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => { setRawData(res.data); setLoading(false); },
      error: () => setLoading(false)
    });
  };

  const downloadCSV = () => {
    if (!auditResult) return;
    const csv = Papa.unparse(auditResult.entities.map(e => ({
      Entity: e.name, Transactions: e.tx, Reliability: e.reliability.toFixed(2), 
      Precursor_Cap: Math.round(e.minPot), Actual_Exports: Math.round(e.actual), Tax_Risk: e.taxRisk, Risk: e.risk
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Forensic_Audit_V12_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const saveReport = () => {
    const newR = { id: Date.now(), title: reportTitle || 'Unnamed Audit', date: new Date().toLocaleString(), gap: auditResult.productionGap, prob: auditResult.shadowProb };
    const updated = [newR, ...reports];
    setReports(updated);
    localStorage.setItem('obsidian_prime_v12_final', JSON.stringify(updated));
    setReportTitle('');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-black p-6 lg:p-10 font-sans">
      <div className="max-w-[1600px] mx-auto mb-8 flex flex-col lg:flex-row items-center gap-6 bg-white border border-slate-300 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4 mr-auto">
          <div className="bg-slate-900 p-3 rounded-xl shadow-lg border-t border-slate-700"><ShieldAlert className="text-white" size={28}/></div>
          <div><h1 className="text-2xl font-black text-black uppercase tracking-tight">Obsidian <span className="text-blue-700">Prime</span></h1><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Forensic Intelligence V12.0</p></div>
        </div>
        
        {/* RISK SENSITIVITY SLIDER RESTORED */}
        <div className="flex items-center gap-6 bg-slate-100 px-6 py-3 rounded-2xl border-2 border-slate-200">
           <div className="flex items-center gap-2 text-blue-700"><Sliders size={18}/><span className="text-[10px] font-black uppercase text-black">Risk Threshold</span></div>
           <input type="range" min="0" max="100" step="5" value={riskThreshold} onChange={(e) => setRiskThreshold(parseInt(e.target.value))} className="w-32 h-1.5 accent-blue-700 cursor-pointer" />
           <span className="font-mono font-black text-blue-700 w-10 text-sm">{riskThreshold}%</span>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <input className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2.5 text-sm w-full lg:w-80 outline-none font-bold focus:border-blue-700" placeholder="Google Sheets URL..." value={url} onChange={e => setUrl(e.target.value)} />
          <button onClick={sync} disabled={loading} className="bg-blue-700 hover:bg-blue-800 px-8 py-2.5 rounded-xl font-black text-white text-xs uppercase flex items-center gap-2">
            {loading ? <RefreshCcw className="animate-spin" size={16}/> : 'Audit'}
          </button>
          {rawData.length > 0 && (
            <div className="flex gap-2">
                <button onClick={downloadCSV} className="bg-white text-slate-700 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 shadow-sm" title="Export CSV"><Download size={20}/></button>
                <button onClick={clearSession} className="bg-red-50 text-red-600 p-2.5 rounded-xl border border-red-200 hover:bg-red-600 hover:text-white transition-all"><Trash2 size={20}/></button>
            </div>
          )}
        </div>
      </div>

      {auditResult && (
        <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
          <div className="flex justify-between items-center border-b-2 border-slate-200">
            <div className="flex gap-10 text-sm font-black uppercase tracking-widest">
              <button onClick={() => setActiveTab('country')} className={`pb-4 transition-all ${activeTab === 'country' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>National Intel</button>
              <button onClick={() => setActiveTab('entities')} className={`pb-4 transition-all ${activeTab === 'entities' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Target Analytics</button>
              <button onClick={() => setActiveTab('reports')} className={`pb-4 transition-all ${activeTab === 'reports' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Archives</button>
            <button onClick={() => setActiveTab('guide')} className={`pb-4 transition-all ${activeTab === 'guide' ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-400'}`}>Audit Guide</button>
        </div>
            <div className="flex gap-3 pb-4">
              <input className="bg-white border-2 border-slate-200 rounded-xl px-4 py-1.5 text-xs font-black outline-none" placeholder="Snapshot Name..." value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
              <button onClick={saveReport} className="bg-emerald-700 text-white px-6 py-2 rounded-xl text-[11px] font-black uppercase flex items-center gap-2"><Save size={16}/> Save</button>
            </div>
          </div>

          {activeTab === 'country' ? (
            <div className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
  <SummaryBox 
    title="Tobacco Ceiling" 
    val={formatValue(auditResult.nat.tobacco)} 
    sub="MAX STICKS FROM LEAF" 
    color="text-amber-700" 
    isText 
  />
  <SummaryBox 
    title="Bottleneck" 
    val={auditResult.bottleneck.name} 
    sub="STRICTEST PRECURSOR" 
    color="text-blue-700" 
    isText 
  />
  <SummaryBox 
    title="Production Gap" 
    val={formatValue(auditResult.productionGap)} 
    sub="UNSUPPORTED VOLUME" 
    color="text-red-600" 
    isText 
  />
  <SummaryBox 
    title="Tax Leakage" 
    val={`$${formatValue(auditResult.taxLoss)}`} 
    sub="EST. EXCISE EVASION" 
    color="text-emerald-700" 
    isText 
  />
  <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-3xl shadow-xl flex flex-col justify-center overflow-hidden group relative">
    <div className="relative z-10">
      <p className="text-[10px] text-white uppercase tracking-widest font-black flex items-center gap-2">
        <EyeOff size={14}/> Shadow Market
      </p>
      <p className="text-4xl font-black text-white">{Math.round(auditResult.shadowProb)}%</p>
    </div>
    <Zap className="absolute right-[-10px] bottom-[-10px] opacity-10 text-red-500" size={100} />
  </div>
</div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
  <div className="bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
    <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Activity size={20} className="text-blue-700"/> National Supply vs Output</h2>
    <div className="h-[350px]">
      <ResponsiveContainer>
        <BarChart data={[
          { name: 'Leaf', val: auditResult.nat.tobacco, fill: '#f59e0b' },
          { name: 'Tow', val: auditResult.nat.tow, fill: '#0ea5e9' },
          { name: 'Paper', val: auditResult.nat.paper, fill: '#64748b' },
          { name: 'Rods', val: auditResult.nat.rods, fill: '#a855f7' },
          { name: 'Actual', val: auditResult.nat.actual, fill: '#10b981' }
        ]}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="name" fontSize={12} fontWeight="bold" axisLine={false} tickLine={false} />
          <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={formatValue} />
          <Tooltip cursor={{fill: '#f8fafc'}} formatter={(value) => formatValue(value)} />
          <Bar dataKey="val" radius={[8, 8, 0, 0]}>
            {[0, 1, 2, 3, 4].map((e, i) => (
              <Cell key={i} fill={['#f59e0b', '#0ea5e9', '#64748b', '#a855f7', '#10b981'][i]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>

  <div className="bg-white border border-slate-200 p-10 rounded-[2.5rem] shadow-sm">
    <h2 className="text-sm font-black text-black uppercase tracking-widest mb-10 flex items-center gap-2"><Target size={20} className="text-red-600"/> Leakage Origins</h2>
    <div className="h-[350px]">
      <ResponsiveContainer>
        <PieChart>
          <Pie 
            data={auditResult.leakageData} 
            innerRadius={80} 
            outerRadius={120} 
            paddingAngle={5} 
            dataKey="value" 
            stroke="none"
            label={({ name, value }) => `${name}: ${formatValue(value)}`}
          >
            {auditResult.leakageData.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
          </Pie>
          <Tooltip formatter={(value) => formatValue(value)} />
          <Legend verticalAlign="bottom" height={36}/>
        </PieChart>
      </ResponsiveContainer>
    </div>
  </div>
</div>

{/* UPDATED MATERIAL LEDGER WITH 5 COLUMNS */}
<div className="bg-white border-2 border-slate-100 p-10 rounded-[2.5rem] shadow-sm">
  <h2 className="text-xs font-black text-blue-700 uppercase tracking-widest border-b-2 border-slate-50 pb-5 mb-8">Precursor Conversion Ledger</h2>
  <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
    <BalanceRow label="Tobacco Leaf" kg={auditResult.nat.tobaccoKg} sticks={auditResult.nat.tobacco} unit="KG" color="bg-amber-600" ratio={localConversions.TOBACCO} />
    <BalanceRow label="Acetate Tow" kg={auditResult.nat.towKg} sticks={auditResult.nat.tow} unit="KG" color="bg-sky-600" ratio={localConversions.TOW} />
    <BalanceRow label="Cig. Paper" kg={auditResult.nat.paperKg} sticks={auditResult.nat.paper} unit="KG" color="bg-slate-600" ratio={localConversions.PAPER} />
    <BalanceRow label="Filter Rods" kg={auditResult.nat.rodsUnits} sticks={auditResult.nat.rods} unit="PCS" color="bg-purple-600" ratio={localConversions.RODS} />
    <BalanceRow label="Cigarettes" kg={auditResult.nat.actual / (localConversions.CIGARETTES_EXPORT || 1000)} sticks={auditResult.nat.actual} unit="KGM eq" color="bg-emerald-600" ratio={localConversions.CIGARETTES_EXPORT} />
  </div>
</div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl">
                  <h2 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-6 flex items-center gap-2"><Gavel size={20}/> Forensic Verdict</h2>
                  <div className="space-y-6 text-sm leading-relaxed text-blue-50 font-medium">
                    <p>National production stands at <span className="text-emerald-400 font-black">{Math.round(auditResult.nat.actual).toLocaleString()}</span> units. Maximum capacity based on leaf precursors is <span className="text-amber-400 font-black underline">{Math.round(auditResult.nat.tobacco).toLocaleString()}</span>.</p>
                    <p className="bg-red-950/30 p-4 border-l-4 border-red-500 rounded-r-xl font-bold">Unreconciled Gap: <span className="text-red-400">{auditResult.productionGap.toLocaleString()}</span> sticks. Total Tax at Risk: <span className="text-red-400">${Math.round(auditResult.taxLoss).toLocaleString()}</span>.</p>
                    <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
                      {auditResult.nat.actual > auditResult.nat.tobacco ? (
                        <p className="text-red-400 font-bold italic flex gap-2"><AlertTriangle size={18}/> CRITICAL: Exports exceed leaf supply by {Math.round((auditResult.nat.actual/auditResult.nat.tobacco - 1)*100)}%.</p>
                      ) : (
                        <p className="text-emerald-400 font-bold italic flex gap-2"><CheckCircle size={18}/> RECONCILED: National volumes confirmed within precursor limits.</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-white border-2 border-slate-200 p-10 rounded-[2.5rem] shadow-sm flex flex-col justify-center">
                   <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2"><Target size={18} className="text-blue-700"/> Compliance Metrics</h2>
                   <div className="grid grid-cols-2 gap-8">
                    <div className="border-l-2 border-slate-100 pl-6"><p className="text-[10px] font-black text-slate-400 uppercase">Resource Utilization</p><p className="text-2xl font-black text-black">{auditResult.nat.actual > 0 ? Math.min(100, (auditResult.nat.tobacco / auditResult.nat.actual) * 100).toFixed(1) : 0}%</p></div>
                    <div className="border-l-2 border-slate-100 pl-6"><p className="text-[10px] font-black text-slate-400 uppercase">Reliability Quotient</p><p className="text-2xl font-black text-blue-700">{auditResult.entities.filter(e => e.reliability > 85).length} / {auditResult.entities.length}</p></div>
                   </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'entities' ? (
            <div className="space-y-6">
                <div className="flex bg-white p-4 rounded-3xl border border-slate-200">
                    <div className="relative w-full md:w-96"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 pl-12 pr-4 text-sm font-bold focus:border-blue-600 outline-none transition-all" placeholder="Search Target Entity..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                </div>
              <div className="bg-white border-2 border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[10px]">
                    <tr><th className="p-8">Target Entity</th><th className="p-8 text-center">TX</th><th className="p-8 text-center">Reliability</th><th className="p-8">Forensic Breakdown</th><th className="p-8 text-right">Supply Cap</th><th className="p-8 text-right text-emerald-400">Actual Out</th><th className="p-8 text-center">Audit Evidence</th></tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-100">
                    {filteredEntities.map((e, i) => (
                      <tr key={i} className="hover:bg-blue-50/50 transition-colors group">
                        <td className="p-8 font-black text-black">{e.name}</td>
                        <td className="p-8 text-center font-mono font-bold text-slate-500">{e.tx}</td>
                        <td className="p-8 text-center">
                            <div className="group/rel relative inline-block cursor-help">
                                <span className="text-[10px] font-black font-mono border-2 border-slate-200 px-3 py-1 rounded-lg bg-slate-50">{e.reliability.toFixed(1)}%</span>
                                <div className="invisible group-hover/rel:visible opacity-0 group-hover/rel:opacity-100 absolute top-full left-1/2 -translate-x-1/2 mt-2 z-[100] w-64 bg-slate-900 text-white p-5 rounded-xl text-[10px] font-medium leading-relaxed shadow-2xl transition-all">
                                    <p className="text-blue-400 font-black uppercase mb-2 flex items-center gap-2 underline underline-offset-4"><Fingerprint size={12}/> Analysis Guide</p>
                                    Calculates material input balance. Discrepancies between tobacco imports and paper/tow suggest shadow sourcing.
                                </div>
                            </div>
                        </td>
                        <td className="p-8">
  <div className="flex flex-wrap gap-2">
    {Object.entries(e.materials).map(([m, s]) => {
      // 1. Determine the correct ratio to display based on material type and unit
      let ratioKey = m;
      if (m === 'CIGARETTES') {
        ratioKey = s.unit === 'MIL' ? 'CIGARETTES_MIL' : 'CIGARETTES_EXPORT';
      }
      const activeRatio = localConversions[ratioKey] || 0;

      return (
        <div key={m} className="group/pop relative bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2 cursor-help shadow-sm">
          {Icons[m]} 
          <span className="font-mono text-black font-bold text-[11px]">
            {Math.round(s.rawQty).toLocaleString()}
          </span>

          {/* Conversion Log Tooltip */}
          <div className="invisible group-hover/pop:visible opacity-0 group-hover/pop:opacity-100 absolute bottom-full left-0 mb-3 z-[60] bg-slate-950 text-white p-4 rounded-xl shadow-2xl min-w-[220px] border border-slate-800 transition-all">
            <p className="text-blue-400 font-black text-[10px] uppercase mb-2 flex items-center gap-2 border-b border-slate-700 pb-1">
              <Calculator size={12}/> Conversion Log
            </p>
            <div className="flex justify-between font-mono text-[10px] mb-1">
              <span>Raw Input:</span> 
              <span>{Math.round(s.rawQty).toLocaleString()} {s.unit}</span>
            </div>
            <div className="flex justify-between font-mono text-[10px] mb-1 text-slate-400">
              <span>Ratio Used:</span> 
              <span className="text-blue-400 font-bold">x {activeRatio.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-mono text-[11px] pt-1 border-t border-slate-700 text-emerald-400 font-bold">
              <span>Stick Equiv:</span> 
              <span>{Math.round(s.sticks).toLocaleString()}</span>
            </div>
          </div>
        </div>
      );
    })}
  </div>
</td>
                        <td className="p-8 text-right font-mono font-bold text-slate-500">{Math.round(e.minPot).toLocaleString()}</td>
                        <td className="p-8 text-right font-mono font-black text-lg">{Math.round(e.actual).toLocaleString()}</td>
                        <td className="p-8 text-center">
                            <div className="group/risk relative inline-block">
                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase cursor-help ${e.risk === 'CRITICAL' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>{e.risk}</span>
                                <div className="invisible group-hover/risk:visible opacity-0 group-hover/risk:opacity-100 absolute top-full right-0 mt-2 z-[100] w-80 bg-white border-2 border-red-600 p-6 rounded-2xl shadow-2xl text-left transition-all">
                                    <p className="font-black text-xs mb-3 uppercase border-b border-slate-100 pb-2 text-red-600 flex items-center gap-2"><AlertTriangle size={16}/> Evidence Log</p>
                                    <p className="text-xs text-black leading-relaxed font-bold mb-4">
                                        {e.risk === 'CRITICAL' ? 
                                          `CRITICAL: Actual exports exceed supply-chain potential by ${Math.round((e.actual/(e.minPot||1))*100)}%, surpassing the ${riskThreshold}% threshold.` 
                                          : "RECONCILED: Verified within legal precursor envelope."}
                                    </p>
                                    {e.risk === 'CRITICAL' && (
                                      <div className="pt-3 border-t flex justify-between items-center">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">Est. Tax Risk</span>
                                        <span className="text-red-600 font-black text-sm font-mono">${e.taxRisk.toLocaleString()}</span>
                                      </div>
                                    )}
                                </div>
                            </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-4 border-slate-900 sticky bottom-0 z-20">
                    <tr className="font-black text-black text-xs uppercase">
                      <td className="p-8">Total Filtered: {filteredEntities.length}</td>
                      <td className="p-8 text-center font-mono text-lg">{filteredEntities.reduce((sum, e) => sum + e.tx, 0)}</td>
                      <td className="p-8 text-center text-slate-400">Aggr Metrics</td>
                      <td className="p-8"></td>
                      <td className="p-8 text-right font-mono text-slate-500">{filteredEntities.reduce((sum, e) => sum + e.minPot, 0).toLocaleString()}</td>
                      <td className="p-8 text-right font-mono text-xl text-blue-700">{filteredEntities.reduce((sum, e) => sum + e.actual, 0).toLocaleString()}</td>
                      <td className="p-8 text-center"><div className="bg-slate-900 text-white py-2 px-4 rounded-lg">Summary View</div></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
         ) : activeTab === 'guide' ? (
            <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Header Section */}
              <div className="bg-blue-700 p-10 rounded-[2.5rem] text-white shadow-2xl">
                <h2 className="text-3xl font-black uppercase mb-4 flex items-center gap-3"><HelpCircle size={32}/> Forensic Field Manual</h2>
                <p className="text-blue-100 font-medium">This guide defines the logic, yield constants, and risk indicators used in the Obsidian Prime V12.0 engine to identify shadow market activities.</p>
              </div>
<div className="bg-white border-2 border-slate-200 p-8 rounded-[2.5rem] mb-12 shadow-sm">
  <h3 className="text-xs font-black text-blue-700 uppercase tracking-widest mb-6 flex items-center gap-2">
    <Sliders size={18}/> Live Yield Overrides
  </h3>
  <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
    {['TOBACCO', 'TOW', 'PAPER', 'RODS', 'CIGARETTES_EXPORT'].map((key) => (
      <div key={key} className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase">
          {key === 'CIGARETTES_EXPORT' ? 'CIG (KG) Ratio' : `${key} Ratio`}
        </label>
        <input 
          type="number" 
          className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 text-sm font-mono font-bold focus:border-blue-600 outline-none"
          value={localConversions[key]}
          onChange={(e) => setLocalConversions({...localConversions, [key]: parseFloat(e.target.value) || 0})}
        />
      </div>
    ))}
  </div>
  <p className="mt-4 text-[10px] text-slate-400 italic">*Note: "CIG (KG) Ratio" defines how many sticks are estimated per 1kg of finished product weight.</p>
</div>
              {/* Definitions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <section className="space-y-4">
                  <h3 className="text-blue-700 font-black uppercase text-xs tracking-widest flex items-center gap-2"><Target size={18}/> Primary Metrics</h3>
                  <div className="bg-white border-2 border-slate-200 p-6 rounded-3xl space-y-4 shadow-sm">
                    <div>
                      <p className="font-black text-black text-sm uppercase">Tobacco Ceiling</p>
                      <p className="text-xs text-slate-500 leading-relaxed font-bold">The theoretical maximum number of cigarettes producible from available leaf. Formula: Leaf (kg) × {CONVERSIONS.TOBACCO}.</p>
                    </div>
                    <div>
                      <p className="font-black text-black text-sm uppercase">Bottleneck</p>
                      <p className="text-xs text-slate-500 leading-relaxed font-bold">The single precursor with the lowest stick-equivalent volume. This represents the absolute legal limit of production.</p>
                    </div>
                    <div>
                      <p className="font-black text-black text-sm uppercase">Production Gap</p>
                      <p className="text-xs text-slate-500 leading-relaxed font-bold">The difference between recorded exports and the Precursor Ceiling. Any positive gap suggests shadow-sourced materials.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-red-600 font-black uppercase text-xs tracking-widest flex items-center gap-2"><Gavel size={18}/> Risk & Scoring</h3>
                  <div className="bg-white border-2 border-slate-200 p-6 rounded-3xl space-y-4 shadow-sm">
                    <div>
                      <p className="font-black text-black text-sm uppercase">Reliability Score</p>
                      <p className="text-xs text-slate-500 leading-relaxed font-bold">Measures supply chain consistency. Calculated by the variance between material potentials. A score &lt; 70% indicates "Fragmented Sourcing."</p>
                    </div>
                    <div>
                      <p className="font-black text-black text-sm uppercase">Tax Leakage</p>
                      <p className="text-xs text-slate-500 leading-relaxed font-bold">Estimated fiscal loss based on the Production Gap. Formula: Gap × ${CONVERSIONS.TAX_PER_STICK} (Excise Rate).</p>
                    </div>
                    <div>
                      <p className="font-black text-black text-sm uppercase">Shadow Market Index</p>
                      <p className="text-xs text-slate-500 leading-relaxed font-bold">Percentage of exports unsupported by precursors. 100% Shadow indicates "Ghost Production" (Exports with zero leaf records).</p>
                    </div>
                  </div>
                </section>
              </div>

              {/* Master Yield Table */}
              <div className="bg-slate-900 text-white p-10 rounded-[2.5rem] shadow-xl">
                <h3 className="text-blue-400 font-black uppercase text-xs tracking-widest mb-6 flex items-center gap-2"><Calculator size={18}/> Yield Constants (Master Table)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="text-slate-500 uppercase border-b border-slate-800">
                      <tr><th className="pb-4 text-left">Material</th><th className="pb-4 text-left">Multiplier</th><th className="pb-4 text-left">Logic</th></tr>
                    </thead>
<tbody className="divide-y divide-slate-100">
  <tr>
    <td className="py-4 font-black">Tobacco Leaf</td>
    <td className="py-4 text-blue-700 font-mono">x{localConversions.TOBACCO.toLocaleString()}</td>
    <td className="text-slate-500 text-sm">{localConversions.TOBACCO.toLocaleString()} sticks per 1kg of leaf.</td>
  </tr>
  <tr>
    <td className="py-4 font-black">Acetate Tow</td>
    <td className="py-4 text-blue-700 font-mono">x{localConversions.TOW.toLocaleString()}</td>
    <td className="text-slate-500 text-sm">{localConversions.TOW.toLocaleString()} sticks per 1kg of tow.</td>
  </tr>
  <tr>
    <td className="py-4 font-black">Cig. Paper</td>
    <td className="py-4 text-blue-700 font-mono">x{localConversions.PAPER.toLocaleString()}</td>
    <td className="text-slate-500 text-sm">{localConversions.PAPER.toLocaleString()} sticks per 1kg of paper rolls.</td>
  </tr>
  <tr>
    <td className="py-4 font-black">Filter Rods</td>
    <td className="py-4 text-blue-700 font-mono">x{localConversions.RODS.toLocaleString()}</td>
    <td className="text-slate-500 text-sm">Standard 1:{localConversions.RODS} rod-to-stick ratio.</td>
  </tr>
  
  {/* NEW DYNAMIC CIGARETTE CONSTANTS */}
  <tr className="bg-blue-50/50">
    <td className="py-4 font-black text-blue-700">Cigarettes (MIL)</td>
    <td className="py-4 text-blue-700 font-mono">x{localConversions.CIGARETTES_MIL.toLocaleString()}</td>
    <td className="text-slate-500 text-sm italic">Standard "Mille" unit override (Adjustable for regional variations).</td>
  </tr>
  <tr className="bg-blue-50/50">
    <td className="py-4 font-black text-blue-700">Cigarettes (KG)</td>
    <td className="py-4 text-blue-700 font-mono">x{localConversions.CIGARETTES_EXPORT.toLocaleString()}</td>
    <td className="text-slate-500 text-sm italic">Weight-to-Stick conversion (Approx. {1000 / localConversions.CIGARETTES_EXPORT}g per stick).</td>
  </tr>
</tbody>
                  </table>
                </div>
              </div>

              {/* User Guide Footer */}
              <div className="bg-emerald-50 border-2 border-emerald-200 p-10 rounded-[2.5rem]">
                <h3 className="text-emerald-900 font-black uppercase text-sm mb-6">Standard Operating Procedure (SOP)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-[11px] font-bold text-emerald-800">
                  <div className="space-y-2"><div className="bg-emerald-200 w-8 h-8 rounded-full flex items-center justify-center">1</div><p className="uppercase">Import Data</p><p className="font-medium text-emerald-700/80">Sync URL. The engine auto-cleans Quantity strings and normalizes Units (MT, TON, KGM, MIL).</p></div>
                  <div className="space-y-2"><div className="bg-emerald-200 w-8 h-8 rounded-full flex items-center justify-center">2</div><p className="uppercase">Set Threshold</p><p className="font-medium text-emerald-700/80">Adjust Risk Slider. A 10% threshold allows for standard industrial wastage before flagging.</p></div>
                  <div className="space-y-2"><div className="bg-emerald-200 w-8 h-8 rounded-full flex items-center justify-center">3</div><p className="uppercase">Investigate</p><p className="font-medium text-emerald-700/80">Targets with "CRITICAL" verdicts and &lt;50% Reliability are priority-one for forensic inspection.</p></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {reports.map((r) => (
                <div key={r.id} className="bg-white border-2 border-slate-200 p-8 rounded-[2rem] shadow-sm hover:border-blue-600 transition-all">
                   <div className="flex justify-between items-start mb-6"><div className="bg-slate-100 p-3 rounded-xl"><History size={24}/></div><button onClick={() => { const up = reports.filter(x => x.id !== r.id); setReports(up); localStorage.setItem('obsidian_prime_v12_final', JSON.stringify(up)); }} className="text-slate-300 hover:text-red-600"><Trash2 size={20}/></button></div>
                   <h3 className="font-black text-black text-xl mb-1">{r.title}</h3>
                   <p className="text-[10px] text-slate-500 font-bold mb-6 uppercase">{r.date}</p>
                   <div className="space-y-4 mb-8 border-y py-6 border-slate-50"><div className="flex justify-between text-xs font-bold"><span>Gap Volume</span> <span className="text-red-600 font-mono">{Math.round(r.gap).toLocaleString()}</span></div><div className="flex justify-between text-xs font-bold"><span>Shadow Index</span> <span className="text-blue-700 font-mono">{Math.round(r.prob)}%</span></div></div>
                   <button onClick={() => setActiveTab('country')} className="w-full bg-slate-900 py-3 rounded-xl text-white font-black text-[11px] uppercase tracking-widest hover:bg-blue-700 transition-all">Reload Analysis</button>
                </div>
              ))}
              {reports.length === 0 && <div className="col-span-full py-20 text-center bg-slate-100 border-2 border-dashed rounded-[2.5rem] text-slate-400 uppercase font-black text-xs tracking-widest">No Snapshots Found</div>}
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
  // Use 0 as fallback to prevent .toLocaleString() errors on undefined values
  const safeKg = kg || 0;
  const safeSticks = sticks || 0;
  const safeRatio = ratio || 0;

  return (
    <div className="group relative">
      <div className="flex justify-between items-end cursor-help border-b border-slate-100 pb-3 hover:border-blue-200 transition-colors">
        <div className="flex items-center gap-4">
          <div className={`w-2 h-10 rounded-full ${color}`}/>
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">{label}</p>
            <p className="text-xl font-black text-black">
              {Math.round(safeKg).toLocaleString()} 
              <span className="text-[10px] font-bold text-slate-300 uppercase ml-1">{unit}</span>
            </p>
            {/* Added this visual indicator so the factor is visible even without hover */}
            <p className="text-[9px] font-black text-blue-600/60 uppercase tracking-tighter">
              × {safeRatio.toLocaleString()} Yield
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-black text-blue-700 font-mono tracking-tighter">
            {Math.round(safeSticks).toLocaleString()}
          </p>
          <p className="text-[8px] font-bold text-slate-400 uppercase">Sticks Eq</p>
        </div>
      </div>

      {/* Forensic Tooltip on Hover */}
      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute left-0 bottom-full mb-3 z-[60] bg-slate-900 text-white p-5 rounded-2xl text-[10px] font-mono min-w-[240px] shadow-2xl transition-all border border-slate-700 pointer-events-none scale-95 group-hover:scale-100 origin-bottom-left">
         <div className="flex items-center gap-2 text-blue-400 font-black uppercase mb-3 border-b border-slate-800 pb-2">
           <Calculator size={14}/> Forensic Conversion
         </div>
         <div className="space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Input Physical:</span> 
              <span className="text-white font-bold">{Math.round(safeKg).toLocaleString()} {unit}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Material Factor:</span> 
              <span className="text-blue-400 font-bold">× {safeRatio.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-800 text-emerald-400 font-black text-[11px]">
              <span>Stick Potential:</span> 
              <span>{Math.round(safeSticks).toLocaleString()}</span>
            </div>
         </div>
      </div>
    </div>
  );
}

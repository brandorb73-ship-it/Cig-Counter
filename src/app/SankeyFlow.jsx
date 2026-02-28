import React, { useMemo } from "react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";

export default function ChartDashboard({ data }) {
 // 1. CLEAN + NORMALIZE DATA (Diagnostic Version)
  const cleanData = useMemo(() => {
    // DIAGNOSTIC LOG: Open your browser console (F12) to see this!
    console.log("Raw data received by Chart:", data);

    if (!data || !Array.isArray(data) || data.length === 0) {
      console.error("Data is either not an array or is empty.");
      return [];
    }

    const KG_PER_STICK = 0.0007;

    return data
      .map((d, index) => {
        // Fallback logic: if 'tobaccoOrigin' is missing, try 'origin' or 'Source'
        const tOrigin = d.tobaccoOrigin || d.tobacco_origin || d.origin || d.Source || "";
        const dest = d.destination || d.Destination || d.Target || "";
        
        // Material Keys
        const tKG = Number(d.tobacco || d.Tobacco || 0);
        const pKG = Number(d.paper || d.Paper || 0);
        const fKG = Number(d.filter || d.Filter || 0);
        const outKG = Number(d.outflow || d.Outflow || d.sticks || 0);

        const tobaccoSticks = tKG / KG_PER_STICK;
        const cigSticks = outKG > 1000 ? outKG : outKG / KG_PER_STICK; // Handle if input is already sticks

        return {
          ...d,
          id: index + 1,
          tobaccoOrigin: tOrigin.toString().trim() || "Missing Origin",
          destination: dest.toString().trim() || "Missing Destination",
          tobaccoSticks,
          paperSticks: (Number(d.paper || 0)) / KG_PER_STICK,
          filterSticks: (Number(d.filter || 0)) / KG_PER_STICK,
          towSticks: (Number(d.tow || 0)) / KG_PER_STICK,
          cigSticks,
          capacity: tobaccoSticks, // Simplified for diagnostic
          gap: cigSticks - tobaccoSticks
        };
      })
      .filter(d => {
          // Only show rows that have both a start and an end point
          const isValid = d.tobaccoOrigin !== "Missing Origin" && d.destination !== "Missing Destination";
          if (!isValid) console.warn(`Row ${d.id} filtered out: Missing origin or destination.`);
          return isValid;
      });
  }, [data]);

  // 2. SANKEY DATA + VALIDATION (LOOP-PROOF)
  const EMPTY_SANKEY = useMemo(() => ({ nodes: [], links: [] }), []);

  const { sankeyData, validationErrors } = useMemo(() => {
    if (!cleanData.length) return { sankeyData: EMPTY_SANKEY, validationErrors: [] };

    const nodes = [];
    const nodeMap = new Map();
    const links = [];
    const errors = [];

    const addNode = (name) => {
      if (!nodeMap.has(name)) {
        nodeMap.set(name, nodes.length);
        nodes.push({ name });
      }
      return nodeMap.get(name);
    };

    cleanData.forEach((d) => {
      const paths = [
        { label: "Tobacco", s: d.tobaccoOrigin, v: d.tobaccoSticks },
        { label: "Paper", s: d.paperOrigin, v: d.paperSticks },
        { label: "Filter", s: d.filterOrigin, v: d.filterSticks },
        { label: "Tow", s: d.towOrigin, v: d.towSticks }
      ];

      paths.forEach(({ label, s, v }) => {
        if (!s || !d.destination || s === "Unknown") return;

        // CRITICAL: Block circular loops to prevent Error #310
        if (s === d.destination) {
          errors.push(`Row ${d.id}: Circular path [${s} → ${d.destination}] skipped.`);
          return;
        }

        if (v > 0) {
          links.push({
            source: addNode(s),
            target: addNode(d.destination),
            value: v,
            type: label
          });
        }
      });
    });

    return {
      sankeyData: links.length > 0 ? { nodes, links } : EMPTY_SANKEY,
      validationErrors: errors
    };
  }, [cleanData, EMPTY_SANKEY]);

  // 3. SUMMARY CALCULATIONS
  const summary = useMemo(() => {
    if (!cleanData.length) return null;
    const totalSticks = cleanData.reduce((sum, d) => sum + d.cigSticks, 0);
    const totalCapacity = cleanData.reduce((sum, d) => sum + (d.capacity || 0), 0);
    const totalGap = totalSticks - totalCapacity;
    const taxLoss = (Math.max(0, totalGap) / 1000) * 350;

    return {
      totalSticks,
      taxLoss,
      riskGrade: taxLoss > 1000000 ? "Severe" : taxLoss > 50000 ? "Moderate" : "Low"
    };
  }, [cleanData]);

  // 4. CUSTOM TOOLTIP
  const SankeyTooltip = ({ payload }) => {
    if (!payload || !payload.length) return null;
    const { source, target, value } = payload[0].payload;
    return (
      <div className="bg-slate-950 border border-slate-700 p-3 text-xs shadow-xl rounded-md">
        <div className="text-blue-400 font-bold mb-1">{source.name} → {target.name}</div>
        <div className="text-white">Sticks: {Math.round(value).toLocaleString()}</div>
        <div className="text-gray-400">Weight: {(value * 0.0007).toFixed(2)} kg</div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-slate-950 min-h-screen space-y-6 text-slate-200">
      
      {/* 5. SUMMARY HEADER */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
            <p className="text-gray-400 text-xs uppercase">Total Production</p>
            <p className="text-2xl font-bold">{Math.round(summary.totalSticks).toLocaleString()} sticks</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 border-l-4 border-l-red-500">
            <p className="text-gray-400 text-xs uppercase">Tax Exposure</p>
            <p className="text-2xl font-bold text-red-400">${Math.round(summary.taxLoss).toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
            <p className="text-gray-400 text-xs uppercase">Risk Profile</p>
            <p className="text-2xl font-bold text-yellow-500">{summary.riskGrade}</p>
          </div>
        </div>
      )}

      {/* 6. VALIDATION ALERT */}
      {validationErrors.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-600/50 p-4 rounded-xl text-amber-200 text-xs">
          <strong className="block mb-1">⚠️ Supply Chain Anomalies Detected:</strong>
          <ul className="list-disc list-inside opacity-80">
            {validationErrors.slice(0, 3).map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* 7. SANKEY CHART */}
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 h-[500px]">
        {sankeyData.links.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={sankeyData}
              nodePadding={30}
              iterations={64}
              link={{ stroke: '#334155' }}
              node={{ fill: '#3b82f6', stroke: '#1e3a8a' }}
            >
              <Tooltip content={<SankeyTooltip />} />
            </Sankey>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 italic">
            <p>No valid supply chain links found.</p>
            <p className="text-xs">Ensure origins and destinations are distinct.</p>
          </div>
        )}
      </div>

      {/* 8. FORENSIC DATA TABLE */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50">
          <h3 className="text-sm font-bold">Forensic Raw Data Ledger</h3>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800 text-gray-400 sticky top-0">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Origin (Tobacco)</th>
                <th className="p-3">Destination</th>
                <th className="p-3 text-right">Outflow (Sticks)</th>
                <th className="p-3 text-right">Tax Gap</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {cleanData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 text-gray-500">{row.id}</td>
                  <td className="p-3 font-medium">{row.tobaccoOrigin}</td>
                  <td className="p-3">{row.destination}</td>
                  <td className="p-3 text-right">{Math.round(row.cigSticks).toLocaleString()}</td>
                  <td className={`p-3 text-right font-mono ${row.gap > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {row.gap > 0 ? `+${Math.round(row.gap).toLocaleString()}` : '0'}
                  </td>
                  <td className="p-3">
                    {row.tobaccoOrigin === row.destination ? (
                      <span className="text-red-500">● Circular</span>
                    ) : row.gap > 1000 ? (
                      <span className="text-amber-500">● High Gap</span>
                    ) : (
                      <span className="text-green-500">● Valid</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

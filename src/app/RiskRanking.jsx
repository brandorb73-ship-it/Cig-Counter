export default function RiskRanking({ processedData }) {
  const riskData = Object.entries(
    processedData.reduce((acc, d) => {
      acc[d.entity] =
        (acc[d.entity] || 0) +
        d.transitRiskScore +
        Math.abs(d.pdi);
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
      <h3 className="text-xs font-black uppercase text-red-400 tracking-widest mb-4">
        Entity Risk Ranking
      </h3>

      <div className="space-y-2">
        {riskData.map(([entity, score], i) => (
          <div
            key={i}
            className="flex justify-between items-center bg-red-950/20 p-3 rounded-lg border border-red-900/30"
          >
            <span className="text-xs text-red-300">{entity}</span>
            <span className="text-xs font-bold text-red-400">
              Risk Score: {Math.round(score)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800 mt-3 pt-3">
        <p className="text-[10px] text-slate-500 italic">
          High-risk entities exhibit abnormal export volumes relative to modeled input capacity.
        </p>
      </div>
    </div>
  );
}

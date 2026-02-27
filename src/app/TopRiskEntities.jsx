export default function TopRiskEntities({ processedData }) {
  const topEntities = Object.entries(
    processedData.reduce((acc, d) => {
      acc[d.entity] = (acc[d.entity] || 0) + d.transitRiskScore;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 mt-6">
      <h4 className="text-xs uppercase text-slate-400 mb-4">
        Top Risk Entities
      </h4>

      {topEntities.map(([name, score], i) => (
        <div key={i} className="flex justify-between text-xs mb-2">
          <span>{name}</span>
          <span className="text-red-400">{Math.round(score)}</span>
        </div>
      ))}

      <div className="border-t border-slate-800 mt-3 pt-3">
        <p className="text-[10px] text-slate-500 italic">
          High-risk entities show disproportionate export behavior relative to input capacity.
        </p>
      </div>
    </div>
  );
}

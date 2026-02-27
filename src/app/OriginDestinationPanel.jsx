export default function OriginDestinationPanel({ processedData }) {
  const originData = Object.entries(
    processedData.reduce((acc, d) => {
      acc[d.origin] = (acc[d.origin] || 0) + d.tobacco;
      return acc;
    }, {})
  );

  const destData = Object.entries(
    processedData.reduce((acc, d) => {
      acc[d.dest] = (acc[d.dest] || 0) + d.outflow;
      return acc;
    }, {})
  );

  return (
    <div className="grid grid-cols-2 gap-6 mt-6">

      {/* ORIGIN */}
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <h4 className="text-xs uppercase text-slate-400 mb-4">
          Origin Intelligence
        </h4>

        {originData.map(([k, v], i) => (
          <div key={i} className="flex justify-between text-xs mb-2">
            <span>{k}</span>
            <span>{Math.round(v)}</span>
          </div>
        ))}

        <p className="text-[10px] text-slate-500 mt-3 italic">
          Geographic concentration highlights sourcing dependencies and potential high-risk trade corridors.
        </p>
      </div>

      {/* DESTINATION */}
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <h4 className="text-xs uppercase text-slate-400 mb-4">
          Destination Intelligence
        </h4>

        {destData.map(([k, v], i) => (
          <div key={i} className="flex justify-between text-xs mb-2">
            <span>{k}</span>
            <span>{Math.round(v)}</span>
          </div>
        ))}

        <div className="border-t border-slate-800 mt-3 pt-3">
          <p className="text-[10px] text-slate-500 italic">
            Export distribution shows key destination markets and potential concentration risks.
          </p>
        </div>
      </div>

    </div>
  );
}

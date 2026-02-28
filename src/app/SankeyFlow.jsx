import React, { useMemo } from "react";
import {
  Sankey,
  Tooltip,
  ResponsiveContainer
} from "recharts";

// ---------- HELPERS ----------

// Fix comma numbers like "173,250.00"
const parseNum = (v) => {
  if (!v) return 0;
  return Number(String(v).replace(/,/g, ""));
};

const KG_TO_STICKS = 1000;

// Convert KG → sticks
const toSticks = (kg) => {
  if (!kg || isNaN(kg)) return 0;
  return kg * KG_TO_STICKS;
};

// ---------- TOOLTIP ----------

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;

  if (!data) return null;

  const sticks = Math.round(data.value);
  const kg = Math.round(data.value / KG_TO_STICKS);

  return (
    <div className="bg-black p-3 border border-gray-700 rounded text-xs">
      <div><strong>Flow:</strong> {data.source?.name} → {data.target?.name}</div>
      <div>Sticks: {sticks.toLocaleString()}</div>
      <div>KG: {kg.toLocaleString()}</div>
    </div>
  );
};

// ---------- MAIN COMPONENT ----------

export default function ForensicSankey({ rawData }) {

  const sankeyData = useMemo(() => {

    // ---------- CLEAN DATA ----------
    const cleanData = rawData.map((d, i) => ({
      id: i,
      hub: d.Entity || "Unknown Hub",

      tobaccoKG: parseNum(d.Tobacco),
      paperKG: parseNum(d.Paper),
      filterKG: parseNum(d.Filter),
      towKG: parseNum(d.Tow),
      cigKG: parseNum(d["Cigarette Exports"]),

      tobaccoOrigin: d["Tobacco Origin"] || "Unknown",
      paperOrigin: d["Paper Origin"] || "Unknown",
      filterOrigin: d["Filter Origin"] || "Unknown",
      towOrigin: d["Tow Origin"] || "Unknown",

      destination: d.Destination || "Unknown"
    }));

    console.log("✅ Clean Data:", cleanData);

    // ---------- BUILD LINKS ----------
    const links = [];

    cleanData.forEach(d => {

      const hub = d.hub;

      // Tobacco → Hub (PRIMARY DRIVER)
      const tobaccoSticks = toSticks(d.tobaccoKG);

      if (tobaccoSticks > 0) {
        links.push({
          source: d.tobaccoOrigin,
          target: hub,
          value: tobaccoSticks,
          type: "input"
        });
      }

      // Optional precursors (only if present)
      const extras = [
        { origin: d.paperOrigin, kg: d.paperKG },
        { origin: d.filterOrigin, kg: d.filterKG },
        { origin: d.towOrigin, kg: d.towKG }
      ];

      extras.forEach(e => {
        const val = toSticks(e.kg);
        if (val > 0 && e.origin !== "Unknown") {
          links.push({
            source: e.origin,
            target: hub,
            value: val,
            type: "input"
          });
        }
      });

      // Hub → Destination
      const output = toSticks(d.cigKG);

      if (output > 0) {
        links.push({
          source: hub,
          target: d.destination,
          value: output,
          type: "output"
        });
      }
    });

    console.log("✅ Raw Links:", links);

    // ---------- BUILD NODES ----------
    const nodeSet = new Set();

    links.forEach(l => {
      nodeSet.add(l.source);
      nodeSet.add(l.target);
    });

    const nodes = Array.from(nodeSet).map(name => ({ name }));

    const nodeIndex = new Map(nodes.map((n, i) => [n.name, i]));

    // ---------- SAFE LINKS ----------
    const finalLinks = links
      .filter(l => nodeIndex.has(l.source) && nodeIndex.has(l.target))
      .map(l => ({
        source: nodeIndex.get(l.source),
        target: nodeIndex.get(l.target),
        value: l.value
      }));

    console.log("✅ Final Links:", finalLinks);
    console.log("✅ Nodes:", nodes);

    return {
      nodes,
      links: finalLinks
    };

  }, [rawData]);

  // ---------- EMPTY STATE ----------
  if (!sankeyData.nodes.length || !sankeyData.links.length) {
    return (
      <div className="text-red-400 p-4">
        ⚠️ No valid Sankey data — check CSV mapping / parsing
      </div>
    );
  }

  // ---------- RENDER ----------
  return (
    <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
      <h3 className="text-sm text-white mb-2 font-bold">
        Forensic Flow (Origin → Entity → Destination)
      </h3>

      <ResponsiveContainer width="100%" height={500}>
        <Sankey
          data={sankeyData}
          nodePadding={20}
          margin={{ top: 20, right: 50, bottom: 20, left: 50 }}
        >
          <Tooltip content={<CustomTooltip />} />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

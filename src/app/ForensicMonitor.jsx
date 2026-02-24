// FULL ENTERPRISE FORENSIC ENGINE V3
// Includes: Entity Risk Ranking, Anomaly Detection, Benford Panel, Sankey, PDF Export

"use client";

import React, { useState, useMemo, useRef } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, ScatterChart, Scatter
} from "recharts";
import { Sankey, Tooltip as SankeyTooltip } from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function ForensicEngineV3() {
  const [data, setData] = useState([]);
  const [url, setUrl] = useState("");
  const [wastage, setWastage] = useState(5);
  const reportRef = useRef();

  const fetchCSV = async () => {
    const res = await fetch(url);
    const text = await res.text();
    const rows = text.split("\n").slice(1);

    const parsed = rows.map(r => {
      const c = r.split(",");
      return {
        entity: c[0],
        month: c[1],
        year: c[2],
        tobacco: parseFloat(c[3]) || 0,
        exports: parseFloat(c[15]) || 0,
        origin: c[5] || "Unknown",
        dest: c[14] || "Unknown"
      };
    });

    setData(parsed);
  };

  const processed = useMemo(() => {
    let inv = 0;
    let cumOut = 0;

    return data.map(d => {
      const cap = d.tobacco / 0.0007;
      inv = inv * 0.98 + cap;
      cumOut += d.exports;

      const gap = Math.max(0, cumOut - inv);
      const pdi = inv > 0 ? ((cumOut - inv) / inv) * 100 : 0;
      const risk = Math.min(100, Math.abs(pdi));

      return {
        ...d,
        inv,
        cumOut,
        gap,
        pdi,
        risk
      };
    });
  }, [data]);

  // ENTITY RANKING
  const entityRanking = useMemo(() => {
    const map = {};
    processed.forEach(d => {
      if (!map[d.entity]) map[d.entity] = { risk: 0, volume: 0 };
      map[d.entity].risk += d.risk;
      map[d.entity].volume += d.exports;
    });

    return Object.entries(map)
      .map(([k, v]) => ({ entity: k, ...v }))
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 10);
  }, [processed]);

  // SPIKE DETECTION
  const anomalies = useMemo(() => {
    return processed.filter((d, i, arr) => {
      if (i === 0) return false;
      return d.exports > arr[i - 1].exports * 2;
    });
  }, [processed]);

  // BENFORD
  const benford = useMemo(() => {
    const counts = Array(9).fill(0);
    processed.forEach(d => {
      const fd = String(Math.floor(d.exports))[0];
      if (fd) counts[fd - 1]++;
    });

    return counts.map((c, i) => ({ digit: i + 1, value: c }));
  }, [processed]);

  // SANKEY
  const sankeyData = useMemo(() => {
    const nodes = [];
    const links = [];
    const idx = {};

    const getIndex = name => {
      if (!(name in idx)) {
        idx[name] = nodes.length;
        nodes.push({ name });
      }
      return idx[name];
    };

    processed.forEach(d => {
      const o = getIndex(d.origin);
      const e = getIndex(d.entity);
      const dest = getIndex(d.dest);

      links.push({ source: o, target: e, value: d.exports });
      links.push({ source: e, target: dest, value: d.exports });
    });

    return { nodes, links };
  }, [processed]);

  const exportPDF = async () => {
    const canvas = await html2canvas(reportRef.current);
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF();
    pdf.addImage(img, "PNG", 0, 0, 210, 297);
    pdf.save("forensic-report.pdf");
  };

  return (
    <div className="p-6 space-y-6" ref={reportRef}>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="CSV URL" />
      <button onClick={fetchCSV}>Load</button>
      <button onClick={exportPDF}>Export PDF</button>

      {/* SMOKING GUN */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={processed}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Line dataKey="inv" stroke="#10b981" />
          <Line dataKey="cumOut" stroke="#ef4444" />
        </LineChart>
      </ResponsiveContainer>

      {/* ENTITY RANK */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={entityRanking}>
          <XAxis dataKey="entity" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="risk" />
        </BarChart>
      </ResponsiveContainer>

      {/* BENFORD */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={benford}>
          <XAxis dataKey="digit" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" />
        </BarChart>
      </ResponsiveContainer>

      {/* SANKEY */}
      <ResponsiveContainer width="100%" height={400}>
        <Sankey data={sankeyData} nodePadding={50} linkCurvature={0.5}>
          <SankeyTooltip />
        </Sankey>
      </ResponsiveContainer>

      {/* ANOMALIES */}
      <div>
        <h3>Anomalies</h3>
        {anomalies.map((a, i) => (
          <div key={i}>{a.entity} spike</div>
        ))}
      </div>
    </div>
  );
}

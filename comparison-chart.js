/* Browser chart for comparing one measurement at two locations.
 * Include this file with a <script> tag. Call ComparisonChart.draw(...)
 * after parsing data.csv and running trend-analysis.js.
 */
(function (root) {
  "use strict";

  function draw(canvas, rows, trends, options) {
    options = options || {};
    if (!canvas || typeof canvas.getContext !== "function") {
      throw new Error("ComparisonChart.draw needs a canvas element.");
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("Provide parsed CSV rows as an array.");
    }

    var dateKey = options.dateKey || "date";
    var placeKey = options.placeKey || "region";
    var valueKey = options.valueKey || "value";
    var places = options.locations || Array.from(new Set(rows.map(function (r) { return String(r[placeKey]); })));
    if (places.length !== 2) throw new Error("Exactly two location names are required or must be present in the data.");

    var points = rows.map(function (r) {
      var d = new Date(r[dateKey]);
      var v = Number(r[valueKey]);
      if (!Number.isFinite(d.getTime()) || !Number.isFinite(v)) return null;
      return { date: d, location: String(r[placeKey]), value: v };
    }).filter(Boolean).filter(function (p) { return places.indexOf(p.location) !== -1; });
    if (!points.length) throw new Error("No usable date/value rows found for the selected locations.");

    var series = places.map(function (name) {
      return { name: name, points: points.filter(function (p) { return p.location === name; }).sort(function (a, b) { return a.date - b.date; }) };
    });
    var all = series.reduce(function (acc, s) { return acc.concat(s.points); }, []);
    if (!all.length) throw new Error("No data points found for the selected locations.");
    var unit = options.unit || rows.find(function (r) { return r.unit; })?.unit || "";
    var measurement = options.measurement || "Measurement";
    var minX = Math.min.apply(null, all.map(function (p) { return p.date.getTime(); }));
    var maxX = Math.max.apply(null, all.map(function (p) { return p.date.getTime(); }));
    var minY = Math.min.apply(null, all.map(function (p) { return p.value; }));
    var maxY = Math.max.apply(null, all.map(function (p) { return p.value; }));
    if (minX === maxX) { minX -= 86400000; maxX += 86400000; }
    if (minY === maxY) { var bump = Math.abs(minY || 1) * 0.05; minY -= bump; maxY += bump; }
    var yPad = (maxY - minY) * 0.08;
    minY -= yPad; maxY += yPad;

    var dpr = root.devicePixelRatio || 1;
    var width = Math.max(320, canvas.clientWidth || 640);
    var height = Number(options.height) || 360;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = "100%"; canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var margin = { top: 28, right: 24, bottom: 58, left: 72 };
    var plotW = width - margin.left - margin.right;
    var plotH = height - margin.top - margin.bottom;
    function x(t) { return margin.left + (t - minX) / (maxX - minX) * plotW; }
    function y(v) { return margin.top + (maxY - v) / (maxY - minY) * plotH; }
    var colors = options.colors || ["#1769aa", "#d05a24"];

    ctx.font = "12px system-ui, sans-serif";
    ctx.fillStyle = "#30343b"; ctx.strokeStyle = "#d6dbe1"; ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var val = minY + (maxY - minY) * i / 4;
      var yy = y(val);
      ctx.beginPath(); ctx.moveTo(margin.left, yy); ctx.lineTo(width - margin.right, yy); ctx.stroke();
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(Number(val.toPrecision(4)).toString(), margin.left - 9, yy);
    }
    var firstYear = new Date(minX).getFullYear(), lastYear = new Date(maxX).getFullYear();
    var yearCount = Math.max(1, Math.min(6, lastYear - firstYear + 1));
    for (var j = 0; j < yearCount; j++) {
      var yr = firstYear + Math.round((lastYear - firstYear) * (yearCount === 1 ? 0 : j / (yearCount - 1)));
      var date = new Date(yr, 0, 1).getTime();
      var xx = x(Math.max(minX, Math.min(maxX, date)));
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(String(yr), xx, height - margin.bottom + 10);
    }
    ctx.strokeStyle = "#4a5058"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(margin.left, margin.top); ctx.lineTo(margin.left, height - margin.bottom); ctx.lineTo(width - margin.right, height - margin.bottom); ctx.stroke();

    series.forEach(function (s, idx) {
      if (!s.points.length) return;
      ctx.strokeStyle = colors[idx % colors.length]; ctx.fillStyle = colors[idx % colors.length]; ctx.lineWidth = 2.5;
      ctx.beginPath();
      s.points.forEach(function (p, k) { if (k === 0) ctx.moveTo(x(p.date.getTime()), y(p.value)); else ctx.lineTo(x(p.date.getTime()), y(p.value)); });
      ctx.stroke();
      s.points.forEach(function (p) { ctx.beginPath(); ctx.arc(x(p.date.getTime()), y(p.value), 3.2, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillRect(margin.left + idx * 170, 4, 14, 3);
      ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = "#20242a";
      ctx.fillText(s.name + " — trend: " + trendFor(trends, s.name), margin.left + idx * 170 + 20, 0);
    });

    ctx.save(); ctx.translate(18, margin.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#20242a";
    ctx.fillText(measurement + (unit ? " (" + unit + ")" : ""), 0, 0); ctx.restore();
    ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillStyle = "#20242a";
    ctx.fillText("Year", margin.left + plotW / 2, height - 4);

    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", measurement + " over time for " + places.join(" and ") + ". Units: " + (unit || "not specified") + ". Trends: " + places.map(function (n) { return n + " " + trendFor(trends, n); }).join("; "));
    return { locations: places.slice(), unit: unit, points: all.length };
  }

  function trendFor(results, location) {
    if (Array.isArray(results)) {
      var item = results.find(function (x) { return x.location === location || x.place === location; });
      return item ? trendLabel(item) : "not provided";
    }
    var item = results && results[location];
    if (typeof item === "string") return item;
    return item ? trendLabel(item) : "not provided";
  }

  function trendLabel(item) {
    if (typeof item === "number") return directionFromSlope(item);
    if (typeof item === "string") return item;
    var explicit = item.direction || item.trendDirection || item.directionLabel;
    if (explicit) return String(explicit);
    if (typeof item.slope === "number") return directionFromSlope(item.slope);
    if (typeof item.estimate === "number") return directionFromSlope(item.estimate);
    if (item.trend && typeof item.trend === "object") return trendLabel(item.trend);
    if (typeof item.trend === "string") return item.trend;
    return "not provided";
  }

  function directionFromSlope(slope) {
    return slope > 0 ? "increasing" : slope < 0 ? "decreasing" : "no change";
  }

  root.ComparisonChart = { draw: draw };
})(typeof window !== "undefined" ? window : this);

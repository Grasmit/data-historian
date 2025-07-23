const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const dayjs = require("dayjs");
const ExcelJS = require("exceljs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/telemetry.db");
const REPORT_DIR = process.env.REPORT_DIR || path.join(__dirname, "../reports");
const SAMPLE_WINDOW_HOURS = Number(process.env.SAMPLE_WINDOW_HOURS || 8);

fs.mkdirSync(REPORT_DIR, { recursive: true });

function openDb() {
  return new sqlite3.Database(DB_PATH);
}

function fetchWindow(db, since) {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT timestamp, temperature, pump_status, overheat, cycle_id FROM telemetry WHERE timestamp >= ? ORDER BY timestamp ASC",
      [since],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function computeKpis(rows, windowEnd) {
  if (rows.length === 0) return { avgTemp: null, downtimeMs: 0 };
  const temps = rows.map((r) => r.temperature);
  const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;

  let downtimeMs = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const curr = rows[i];
    if (prev.pump_status === 0) {
      downtimeMs += curr.timestamp - prev.timestamp;
    }
  }
  const last = rows[rows.length - 1];
  if (last.pump_status === 0) {
    downtimeMs += windowEnd - last.timestamp;
  }

  return { avgTemp, downtimeMs };
}

async function writeReport(rows, kpis, windowStart, windowEnd) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Shift Report");

  sheet.columns = [
    { header: "Timestamp", key: "timestamp", width: 22 },
    { header: "Temperature (°C)", key: "temperature", width: 18 },
    { header: "Pump On", key: "pump", width: 10 },
    { header: "Overheat", key: "overheat", width: 10 },
    { header: "Cycle ID", key: "cycle", width: 10 }
  ];

  rows.forEach((r) => {
    sheet.addRow({
      timestamp: dayjs(r.timestamp).format("YYYY-MM-DD HH:mm:ss"),
      temperature: r.temperature,
      pump: r.pump_status ? "Yes" : "No",
      overheat: r.overheat ? "Yes" : "No",
      cycle: r.cycle_id
    });
  });

  sheet.addRow({});
  sheet.addRow({ timestamp: "Summary" });
  sheet.addRow({ timestamp: "Window", temperature: `${dayjs(windowStart).format("HH:mm")} - ${dayjs(windowEnd).format("HH:mm")}` });
  sheet.addRow({ timestamp: "Average Temperature", temperature: kpis.avgTemp ? kpis.avgTemp.toFixed(2) : "N/A" });
  sheet.addRow({ timestamp: "Total Downtime (min)", temperature: (kpis.downtimeMs / 60000).toFixed(1) });

  const filename = path.join(
    REPORT_DIR,
    `shift_report_${dayjs(windowEnd).format("YYYYMMDD_HHmmss")}.xlsx`
  );
  await workbook.xlsx.writeFile(filename);
  console.log(`Report written to ${filename}`);
}

async function main() {
  const db = openDb();
  const windowEnd = Date.now();
  const windowStart = windowEnd - SAMPLE_WINDOW_HOURS * 3600 * 1000;
  const rows = await fetchWindow(db, windowStart);
  if (rows.length === 0) {
    console.log("No data available in the selected window.");
    return;
  }
  const kpis = computeKpis(rows, windowEnd);
  await writeReport(rows, kpis, windowStart, windowEnd);
  db.close();
}

main().catch((err) => {
  console.error("Report generation failed", err);
  process.exit(1);
});

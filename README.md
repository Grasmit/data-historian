# Factory Data Historian

Background service that subscribes to an OPC-UA machine, stores telemetry in SQLite, and generates Excel shift reports.

## Stack
- OPC-UA client with `node-opcua`
- SQLite for time-series storage
- ExcelJS for .xlsx reports
- Docker (compose runs simulator + historian)

## Quick start (Docker)
```bash
cd data-historian
docker compose up --build -d
# Wait while telemetry accumulates
# Generate a report (inside container)
docker compose exec historian node src/generate_report.js
```
- OPC-UA endpoint (host): opc.tcp://localhost:4841 (inside compose use `opc-sim:4840`)
- Data persisted under `./data`, reports under `./reports`.

## Local development
```bash
cd data-historian
npm install
npm run dev               # simulator + historian together
# later
npm run report            # write Excel into ./reports
```

## How it works
## Files
- `src/plc-simulator.js` exposes Temperature, PumpStatus, CleaningCycleID, Overheat_Alarm (same model as Project 1).
- `src/historian.js` subscribes to Temperature changes, snapshots other nodes, and writes rows into SQLite with timestamps.
- `src/generate_report.js` pulls the last 8 hours, computes average temperature and downtime, and emits a formatted Excel workbook.
- `docs/report-template.md` + `docs/images/*` provide a portfolio-ready explainer with an architecture SVG.

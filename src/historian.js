const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const {
  OPCUAClient,
  AttributeIds,
  TimestampsToReturn
} = require("node-opcua");

const OPC_ENDPOINT = process.env.OPC_ENDPOINT || "opc.tcp://localhost:4840";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../data/telemetry.db");

const nodeIds = {
  temperature: "ns=1;s=Temperature",
  pumpStatus: "ns=1;s=PumpStatus",
  cleaningCycleId: "ns=1;s=CleaningCycleID",
  overheatAlarm: "ns=1;s=Overheat_Alarm"
};

function ensureDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS telemetry (timestamp INTEGER, temperature REAL, pump_status INTEGER, overheat INTEGER, cycle_id INTEGER)"
    );
  });
  return db;
}

const db = ensureDb();

function insertRow({ timestamp, temperature, pumpStatus, overheat, cycleId }) {
  db.run(
    "INSERT INTO telemetry(timestamp, temperature, pump_status, overheat, cycle_id) VALUES (?, ?, ?, ?, ?)",
    [timestamp, temperature, pumpStatus ? 1 : 0, overheat ? 1 : 0, cycleId],
    (err) => {
      if (err) console.error("DB insert failed", err.message);
    }
  );
}

async function connectAndCollect() {
  const client = OPCUAClient.create({ endpointMustExist: false });
  await client.connect(OPC_ENDPOINT);
  console.log(`Historian connected to ${OPC_ENDPOINT}`);
  const session = await client.createSession();

  const subscription = await session.createSubscription2({
    requestedPublishingInterval: 250,
    requestedLifetimeCount: 100,
    requestedMaxKeepAliveCount: 10,
    maxNotificationsPerPublish: 50,
    publishingEnabled: true,
    priority: 1
  });

  const monitoredItem = await subscription.monitor(
    { nodeId: nodeIds.temperature, attributeId: AttributeIds.Value },
    { samplingInterval: 500, queueSize: 20, discardOldest: true },
    TimestampsToReturn.Both
  );

  monitoredItem.on("changed", async (dataValue) => {
    try {
      const temperature = dataValue.value.value;
      const timestamp = (dataValue.sourceTimestamp || new Date()).getTime();
      const snapshot = await readSnapshot(session);
      insertRow({
        timestamp,
        temperature,
        pumpStatus: snapshot.pumpStatus,
        overheat: snapshot.overheatAlarm,
        cycleId: snapshot.cleaningCycleId
      });
      console.log(
        `Logged T=${temperature.toFixed(1)}°C Pump=${snapshot.pumpStatus ? "ON" : "OFF"} Overheat=${snapshot.overheatAlarm}`
      );
    } catch (err) {
      console.error("Failed to process change event", err.message);
    }
  });

  client.on("close", () => console.warn("OPC-UA connection closed"));
}

async function readSnapshot(session) {
  const nodesToRead = [
    { nodeId: nodeIds.pumpStatus, attributeId: AttributeIds.Value },
    { nodeId: nodeIds.cleaningCycleId, attributeId: AttributeIds.Value },
    { nodeId: nodeIds.overheatAlarm, attributeId: AttributeIds.Value }
  ];
  const dataValues = await session.read(nodesToRead);
  return {
    pumpStatus: !!dataValues[0].value.value,
    cleaningCycleId: dataValues[1].value.value,
    overheatAlarm: !!dataValues[2].value.value
  };
}

connectAndCollect().catch((err) => {
  console.error("Historian startup failed", err);
  process.exit(1);
});

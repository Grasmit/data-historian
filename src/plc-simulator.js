const { OPCUAServer, Variant, DataType, StatusCodes } = require("node-opcua");

async function startServer() {
  const server = new OPCUAServer({
    port: 4840,
    resourcePath: "/UA/PartsCleaner",
    alternateHostname: ["opc-sim", "localhost"],
    buildInfo: {
      productName: "PartsCleanerSim",
      buildNumber: "1",
      buildDate: new Date()
    }
  });

  await server.initialize();

  const addressSpace = server.engine.addressSpace;
  const namespace = addressSpace.getOwnNamespace();
  const device = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: "MAFAC_PartsCleaner"
  });

  const state = {
    temperature: 30,
    pumpStatus: false,
    cleaningCycleId: 0,
    overheatAlarm: false,
    lastUpdate: new Date()
  };

  namespace.addVariable({
    componentOf: device,
    browseName: "Temperature",
    nodeId: "ns=1;s=Temperature",
    dataType: "Double",
    minimumSamplingInterval: 100,
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: state.temperature }),
      set: (variant) => {
        state.temperature = variant.value;
        state.lastUpdate = new Date();
        return StatusCodes.Good;
      }
    }
  });

  namespace.addVariable({
    componentOf: device,
    browseName: "PumpStatus",
    nodeId: "ns=1;s=PumpStatus",
    dataType: "Boolean",
    minimumSamplingInterval: 100,
    value: {
      get: () => new Variant({ dataType: DataType.Boolean, value: state.pumpStatus }),
      set: (variant) => {
        state.pumpStatus = !!variant.value;
        if (state.pumpStatus) state.cleaningCycleId += 1;
        state.lastUpdate = new Date();
        return StatusCodes.Good;
      }
    }
  });

  namespace.addVariable({
    componentOf: device,
    browseName: "CleaningCycleID",
    nodeId: "ns=1;s=CleaningCycleID",
    dataType: "Int32",
    minimumSamplingInterval: 100,
    value: {
      get: () => new Variant({ dataType: DataType.Int32, value: state.cleaningCycleId }),
      set: (variant) => {
        state.cleaningCycleId = variant.value;
        state.lastUpdate = new Date();
        return StatusCodes.Good;
      }
    }
  });

  namespace.addVariable({
    componentOf: device,
    browseName: "Overheat_Alarm",
    nodeId: "ns=1;s=Overheat_Alarm",
    dataType: "Boolean",
    minimumSamplingInterval: 100,
    value: {
      get: () => new Variant({ dataType: DataType.Boolean, value: state.overheatAlarm }),
      set: (variant) => {
        state.overheatAlarm = !!variant.value;
        state.lastUpdate = new Date();
        return StatusCodes.Good;
      }
    }
  });

  setInterval(() => {
    if (state.pumpStatus) {
      state.temperature += 1.2 + Math.random() * 1.4;
    } else {
      state.temperature = Math.max(26, state.temperature - 0.5);
    }

    if (state.temperature > 90) {
      state.overheatAlarm = true;
      state.pumpStatus = false;
    } else if (state.temperature < 70) {
      state.overheatAlarm = false;
    }

    state.lastUpdate = new Date();
  }, 1000);

  await server.start();
  const endpoint = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
  console.log(`OPC-UA simulator running at ${endpoint}`);
}

startServer().catch((err) => {
  console.error("Failed to start OPC-UA simulator", err);
  process.exit(1);
});

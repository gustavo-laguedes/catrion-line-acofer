const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const healthRoutes = require("./routes/health.routes");
const materialsRoutes = require("./routes/materials.routes");
const materialTypesRoutes = require("./routes/material-types.routes");
const locationsRoutes = require("./routes/locations.routes");
const machinesRoutes = require("./routes/machines.routes");
const operatorsRoutes = require("./routes/operators.routes");
const operatorRolesRoutes = require("./routes/operator-roles.routes");
const suppliersRoutes = require("./routes/suppliers.routes");
const technicalParametersRoutes = require("./routes/technical-parameters.routes");
const stockLossParametersRoutes = require("./routes/stock-loss-parameters.routes");
const stockRoutes = require("./routes/stock.routes");
const stockMovementsRoutes = require("./routes/stock-movements.routes");
const productionsRoutes = require("./routes/productions.routes");
const expeditionsRoutes = require("./routes/expeditions.routes");
const expeditionVehiclesRoutes = require("./routes/expedition-vehicles.routes");
const expeditionMaterialParametersRoutes = require("./routes/expedition-material-parameters.routes");
const traceabilityRoutes = require("./routes/traceability.routes");
const laboratoryRoutes = require("./routes/laboratory.routes");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3333);
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:8000";

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.use(healthRoutes);
app.use("/api/material-types", materialTypesRoutes);
app.use("/api/locations", locationsRoutes);
app.use("/api/materials", materialsRoutes);
app.use("/api/machines", machinesRoutes);
app.use("/api/operators", operatorsRoutes);
app.use("/api/operator-roles", operatorRolesRoutes);
app.use("/api/suppliers", suppliersRoutes);
app.use("/api/technical-parameters", technicalParametersRoutes);
app.use("/api/stock-loss-parameters", stockLossParametersRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/stock-movements", stockMovementsRoutes);
app.use("/api/productions", productionsRoutes);
app.use("/api/expeditions", expeditionsRoutes);
app.use("/api/expedition-vehicles", expeditionVehiclesRoutes);
app.use("/api/expedition-material-parameters", expeditionMaterialParametersRoutes);
app.use("/api/traceability", traceabilityRoutes);
app.use("/api/laboratory", laboratoryRoutes);

app.listen(port, () => {
  console.log(`Catrion Line API running on http://localhost:${port}`);
});

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

app.listen(port, () => {
  console.log(`Catrion Line API running on http://localhost:${port}`);
});

const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "catrion-line-api"
  });
});

router.get("/health/db", async (req, res, next) => {
  try {
    const result = await query("select now() as now");

    res.json({
      ok: true,
      database: "connected",
      now: result.rows[0]?.now
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require("express");
const { query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar parametros de perda de estoque." };

function normalizePercent(value, fallback = 10) {
  if (value === null || value === undefined || value === "") return fallback;

  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function normalizeMaterialLossPercents(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.entries(value).reduce((params, [key, percent]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return params;

    params[normalizedKey] = percent === "" || percent === null || percent === undefined
      ? ""
      : normalizePercent(percent, 10);

    return params;
  }, {});
}

function normalizeParameters(row) {
  return {
    globalLossPercent: normalizePercent(row?.global_loss_percent, 10),
    materialLossPercents: normalizeMaterialLossPercents(row?.material_loss_percents)
  };
}

function isValidParameters(parameters) {
  const values = [
    parameters.globalLossPercent,
    ...Object.values(parameters.materialLossPercents).filter((value) => value !== "")
  ];

  return values.every((value) => Number(value) >= 0 && Number(value) <= 100);
}

router.get("/", async (_req, res) => {
  try {
    const result = await query(`
      select global_loss_percent, material_loss_percents
      from public.stock_loss_parameters
      where is_global = true
        and status = 'ACTIVE'
      limit 1;
    `);

    if (!result.rows.length) {
      return res.json({
        globalLossPercent: 10,
        materialLossPercents: {}
      });
    }

    return res.json(normalizeParameters(result.rows[0]));
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

router.put("/", async (req, res) => {
  try {
    const payload = {
      globalLossPercent: normalizePercent(req.body?.globalLossPercent, 10),
      materialLossPercents: normalizeMaterialLossPercents(req.body?.materialLossPercents)
    };

    if (!isValidParameters(payload)) {
      return res.status(400).json({ error: "Percentuais devem estar entre 0 e 100." });
    }

    const result = await query(
      `
        update public.stock_loss_parameters
        set
          global_loss_percent = $1,
          material_loss_percents = $2::jsonb,
          updated_at = now()
        where id = (
          select id
          from public.stock_loss_parameters
          where is_global = true
            and status = 'ACTIVE'
          limit 1
        )
        returning global_loss_percent, material_loss_percents;
      `,
      [
        payload.globalLossPercent,
        JSON.stringify(payload.materialLossPercents)
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Parametro ativo de perda de estoque nao encontrado." });
    }

    return res.json(normalizeParameters(result.rows[0]));
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

module.exports = router;

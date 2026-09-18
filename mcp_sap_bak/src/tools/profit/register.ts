/**
 * 运营指标财务专家分析 — MCP 工具注册
 * SAP ACTION: GET_PROFIT
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  formatCaughtError,
  textResult,
} from "../../lib/mcp-result.js";
import type { SapClient } from "../../sap-client.js";
import { PROFIT_FIELD_GUIDE } from "./field-guide.js";
import type {
  GetProfitRequest,
  GetProfitResponse,
  PeriodType,
} from "./types.js";
import { isToolAllowed, type AllowedTools } from "../allowed.js";

const ACTION = "GET_PROFIT";

function validatePeriod(args: {
  period_type: PeriodType;
  monat?: number;
  quarter?: number;
}): string | null {
  if (args.period_type === "M" && args.monat == null) {
    return "月度查询（period_type=M）时 monat 必填";
  }
  if (args.period_type === "Q" && args.quarter == null) {
    return "季度查询（period_type=Q）时 quarter 必填";
  }
  return null;
}

function buildRequest(args: {
  bukrs: string;
  period_type: PeriodType;
  gjahr: string;
  monat?: number;
  quarter?: number;
}): GetProfitRequest {
  const body: GetProfitRequest = {
    bukrs: args.bukrs,
    period_type: args.period_type,
    gjahr: String(args.gjahr),
  };
  if (args.monat != null) body.monat = args.monat;
  if (args.quarter != null) body.quarter = args.quarter;
  return body;
}

export function registerProfitTools(
  server: McpServer,
  client: SapClient,
  allowed?: AllowedTools
): void {
  if (isToolAllowed("get_profit", allowed)) {
    server.registerTool(
      "get_profit",
      {
        title: "查询运营指标",
        description:
          "查询 SAP 运营指标财务专家分析数据（收入、成本、毛利率、期间费用、净利润、资产负债率、流动/速动比率、应收与存货周转等）。period_type: M=月度 Q=季度 Y=年度。",
        inputSchema: {
          bukrs: z.string().min(1).max(4).describe("公司代码，如 1100"),
          period_type: z
            .enum(["M", "Q", "Y"])
            .describe("期间类型：M 月度 / Q 季度 / Y 年度"),
          gjahr: z
            .string()
            .regex(/^\d{4}$/)
            .describe("会计年度，如 2025"),
          monat: z
            .number()
            .int()
            .min(1)
            .max(12)
            .optional()
            .describe("月（1–12），period_type=M 时必填"),
          quarter: z
            .number()
            .int()
            .min(1)
            .max(4)
            .optional()
            .describe("季度（1–4），period_type=Q 时必填"),
        },
      },
      async (args) => {
        const validationError = validatePeriod(args);
        if (validationError) {
          return errorResult(validationError);
        }

        try {
          const result = await client.postAction<GetProfitResponse>(
            ACTION,
            buildRequest(args)
          );
          const text = JSON.stringify(result, null, 2);

          if (result.type === "E") {
            return errorResult(
              `SAP 业务失败: ${result.message || "(无 message)"}\n${text}`
            );
          }

          return textResult(text);
        } catch (err) {
          return errorResult(formatCaughtError(err));
        }
      }
    );
  }

  if (
    isToolAllowed("sap_profit_schema", allowed) ||
    isToolAllowed("get_profit", allowed)
  ) {
    server.registerTool(
      "sap_profit_schema",
      {
        title: "运营指标字段说明",
        description:
          "返回「运营指标财务专家分析」接口的字段中文说明，便于解读 get_profit 结果。",
      },
      async () => textResult(PROFIT_FIELD_GUIDE)
    );
  }
}

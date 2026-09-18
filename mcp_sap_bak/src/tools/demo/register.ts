/**
 * DEV demo — 物料描述 / 库存
 * SAP ACTION: MCP_GET_MAKTX / MCP_GET_STOCK
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  errorResult,
  formatCaughtError,
  textResult,
} from "../../lib/mcp-result.js";
import type { SapClient } from "../../sap-client.js";
import { isToolAllowed, type AllowedTools } from "../allowed.js";
import type { GetMaktxResponse, GetStockResponse } from "./types.js";

const ACTION_MAKTX = "MCP_GET_MAKTX";
const ACTION_STOCK = "MCP_GET_STOCK";

function sapBizError(
  action: string,
  result: { type?: string; message?: string },
  text: string
) {
  if (String(result.type || "").toUpperCase() === "E") {
    return errorResult(
      `SAP 业务失败 [${action}]: ${result.message || "(无 message)"}\n${text}`
    );
  }
  return textResult(text);
}

export function registerDemoTools(
  server: McpServer,
  client: SapClient,
  allowed?: AllowedTools
): void {
  if (isToolAllowed("get_maktx", allowed)) {
    server.registerTool(
      "get_maktx",
      {
        title: "查询物料描述",
        description:
          "按物料号查询 SAP 物料描述（MAKT）。入参 matnr 为物料号，可带或不带前导零。",
        inputSchema: {
          matnr: z.string().min(1).describe("物料号，如 10000001"),
        },
      },
      async (args) => {
        try {
          const result = await client.postAction<GetMaktxResponse>(
            ACTION_MAKTX,
            { matnr: args.matnr }
          );
          return sapBizError(
            ACTION_MAKTX,
            result,
            JSON.stringify(result, null, 2)
          );
        } catch (err) {
          return errorResult(formatCaughtError(err));
        }
      }
    );
  }

  if (isToolAllowed("get_stock", allowed)) {
    server.registerTool(
      "get_stock",
      {
        title: "查询物料库存",
        description:
          "按物料号查询 SAP 库存地点库存（MARD：非限制/质检/冻结）。werks 工厂可选，不传则返回该物料全部工厂。",
        inputSchema: {
          matnr: z.string().min(1).describe("物料号，如 10000001"),
          werks: z
            .string()
            .max(4)
            .optional()
            .describe("工厂，如 1100；不传则查全部工厂"),
        },
      },
      async (args) => {
        try {
          const payload: { matnr: string; werks?: string } = {
            matnr: args.matnr,
          };
          if (args.werks) payload.werks = args.werks;
          const result = await client.postAction<GetStockResponse>(
            ACTION_STOCK,
            payload
          );
          return sapBizError(
            ACTION_STOCK,
            result,
            JSON.stringify(result, null, 2)
          );
        } catch (err) {
          return errorResult(formatCaughtError(err));
        }
      }
    );
  }
}

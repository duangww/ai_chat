/** 运营指标财务专家分析（ACTION=GET_PROFIT） */

export type PeriodType = "M" | "Q" | "Y";

export interface GetProfitRequest {
  /** 公司代码，如 1100 */
  bukrs: string;
  /** 期间类型：M 月度 / Q 季度 / Y 年度 */
  period_type: PeriodType;
  /** 年，如 2025 */
  gjahr: string;
  /** 月（月度查询必填），如 1 */
  monat?: number;
  /** 季度（季度查询必填），1–4 */
  quarter?: number;
}

export interface ProfitRow {
  bukrs: string;
  butxt: string;
  gjahr: number | string;
  monat: number;
  quarter: number;
  income: number;
  cost: number;
  gross_rate_str: string;
  qjfy: number;
  qjfy_rate_str: string;
  net: number;
  net_rate_str: string;
  net_zc_rate_str: string;
  zcfz_rate_str: string;
  current_ratio: number;
  quick_ratio: number;
  artr: number;
  ch_rate: number;
  artr_d: number;
  ch_rate_d: number;
}

export interface GetProfitResponse {
  /** S 成功 / E 失败 */
  type: string;
  message: string;
  data: ProfitRow[];
}

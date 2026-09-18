/** DEV demo REST（SICF zbak_mcp_demo） */

export interface GetMaktxRequest {
  matnr: string;
}

export interface GetMaktxResponse {
  type: string;
  message: string;
  matnr?: string;
  maktx?: string;
}

export interface GetStockRequest {
  matnr: string;
  werks?: string;
}

export interface StockRow {
  matnr: string;
  werks: string;
  lgort: string;
  labst: number | string;
  insme: number | string;
  speme: number | string;
}

export interface GetStockResponse {
  type: string;
  message: string;
  items?: StockRow[];
}

export const PROFIT_FIELD_GUIDE = `
# 运营指标财务专家分析接口字段说明

## 输入
| 字段 | 说明 | 必填 |
|------|------|------|
| bukrs | 公司代码，如 1100 | Y |
| period_type | 期间类型：M 月度 / Q 季度 / Y 年度 | Y |
| gjahr | 年，如 "2025" | Y |
| monat | 月（1–12），period_type=M 时必填 | 条件 |
| quarter | 季度（1–4），period_type=Q 时必填 | 条件 |

## 输出 data[]
| 字段 | 说明 |
|------|------|
| bukrs | 公司代码 |
| butxt | 公司名称 |
| gjahr | 年 |
| monat | 月 |
| quarter | 季度 |
| income | 收入 |
| cost | 成本 |
| gross_rate_str | 毛利率% |
| qjfy | 期间费用 |
| qjfy_rate_str | 期间费用率% |
| net | 净利润 |
| net_rate_str | 净利率% |
| net_zc_rate_str | 净资产收益率% |
| zcfz_rate_str | 资产负债率% |
| current_ratio | 流动比率 |
| quick_ratio | 速动比率 |
| artr | 应收账款周转率 |
| ch_rate | 存货周转率 |
| artr_d | 应收账款周转天数 |
| ch_rate_d | 存货周转天数 |

type=S 成功，type=E 失败（见 message）
`.trim();

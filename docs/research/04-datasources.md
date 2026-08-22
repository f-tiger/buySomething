# 第二轮调研 · 模块 A：数据源扩展盘点（中西两侧实时信号）

**背景**：SourceRadar 目前仅有 Google Trends（pytrends）每日管线。本报告调研中国侧 5 类、西方侧 7 类数据源，给出 V2 接入优先级。

**⚠️ P0 前置警报：pytrends 已死**——仓库 2025-04-17 归档，新装即遇 429（NID cookie 流程失效，见 [issue #602](https://github.com/GeneralMills/pytrends/issues/602)）。修复现有管线先于一切新源接入。替代：**trendspy**（维护中的继任库，免费）或 SerpApi Google Trends API（$75/月，商用稳定）；Google 官方 Trends API 仍是申请制 alpha。补充旁证：Wikipedia Pageviews API（完全免费、官方支持）。

---

## 中国侧数据源

| 源 | 独特信号 | 可行接入 | 成本 | 风险/难度 |
|---|---|---|---|---|
| **抖音电商榜单** | 中国爆品最前沿，领先西方 2–6 月 | 官方 API 不对第三方开放；蝉妈妈企业版 ¥7万+/年（无自助 API）；**TikHub.io API**（热搜/品牌榜，~$0.001/次） | TikHub <$5/月 | 自爬高风险；API 中转中低；TikHub 易实现 |
| **1688 热销/采购指数** | **唯一的供给侧工厂热度信号** | 官方开放平台不含榜单；阿里指数已并入付费生意参谋；第三方 Onebound（item_search 按销量排序近似热销榜） | ¥百元/月起 | 阿里反爬最强硬，自爬中高；第三方中；V3 候选 |
| **小红书热榜** | 种草/女性消费最早期 | 无官方 API；TikHub 或 Apify actors（月送 $5 额度） | ~$0.001/次 | 平台反爬激进、断供风险高；靠中转则易 |
| **百度指数** | 中国版 Google Trends，对比时间差的核心素材 | Cookie 非官方接口（开源库 spider-BaiduIndex）或站长之家 API | 免费/几分每次 | Cookie 续期痛点；封号为主，法律风险低中 |
| **微信指数** | 微信生态热度 | 小程序抓包短时效 search_key | — | **无人值守不可行，放弃** |
| **淘宝/天猫榜单** | 货架电商销量验证 | 第三方 API（Onebound/TMAPI） | ¥百元/月起 | 与抖音/1688 信号重叠且滞后，**缓接** |

## 西方侧数据源

| 源 | 独特信号 | 可行接入 | 成本 | 风险/难度 |
|---|---|---|---|---|
| **TikTok Creative Center** | 西方需求最早期（领先搜索数周） | 官方 Research API 排除商用；**网页公开 `creative_radar_api` JSON 端点**直连，或 Apify actor 兜底 | 免费 / $5–20月 | 公开广告主数据、低中风险；直连需逆向签名一次 |
| **Amazon 榜单** | 西方销量验证 + BSR 历史（辨真爆品 vs 刷榜） | 直爬不可行；PA-API 需联盟成交资格且 2026-05 弃用；**Keepa API €49/月** 或 Rainforest $23–83/月 | €49/月 | 经 API 后低；易实现 |
| **海关提单（ImportYeti）** | **B2B 真实成交验证（独家，无竞品趋势站在用）** | ImportYeti 付费 ~$50/月（年付）含 CSV/API；Panjiva 企业级 $1.5万+/年不考虑 | ~$50/月 | 政府公开数据，法律风险极低；月批次更新 |
| **Kickstarter** | 创新品最早期验证（领先 6–18 个月） | **Webrobots.io 免费月度全量数据集** + discover JSON 端点 | 免费 | 数据集完全合规；易 |
| **Reddit** | 卖家社区口碑/求源信号 | 官方 API 免费层 100 QPM（PRAW）；商业层 $12k/月不适用 | 免费 | ToS 灰色、低执法；2025 底起新应用需人工审核，尽早注册 |
| **Glimpse/Exploding Topics/Treendly** | 趋势预发现（与自建重叠） | 网页 SaaS；API 企业价不透明 | $39–299/月 | **不接**——是竞品与人工验证工具 |

---

## V2 接入优先级（信号独特性 × 可行性 ÷ 风险）

**P0：修复 Google Trends 管线**——pytrends → trendspy，加指数退避（429 时 60s→10min）、请求间隔 ≥30s、结果缓存、失败报警；被限流时降级代理或切 SerpApi。

1. **TikTok Creative Center**（西侧需求先导）：先 Apify actor 快速上线（US/UK/DE × 目标行业 top hashtags & trending products），再逆向直连省钱；加 schema 变更检测报警
2. **Keepa API**（西侧销量验证，€49/月）：每日拉目标类目 Best Sellers，新上榜 ASIN 拉 90 天 BSR 历史；做 token 预算器
3. **TikHub**（中侧抖音+小红书二合一，<$5/月）：每日 2 次拉热榜，原始 JSON 归档 + 降级策略（断供是常态）；中文词条 LLM 批量译
4. **Kickstarter**（Webrobots 免费数据集）：每月下载，过滤 Product Design/Gadgets 中 funding velocity 最高项目；数百 MB 需流式处理
5. **ImportYeti**（B2B 成交验证，护城河）：每月对收录品类查提单量趋势与 top 中国供应商——直接命中"找厂"动作，**建议作为付费功能核心数据**
6. **Reddit**（免费补充）：PRAW 每日拉 3 个 subreddit hot+new，做产品关键词提及计数作"卖家关注度"因子

**明确不接/缓接**：微信指数、淘宝/天猫、蝉妈妈/飞瓜直采（¥7万+/年）、Glimpse/Exploding Topics；1688 指数列 V3（先用 Onebound 小额验证）。

**架构备注**：所有源统一落地 `source, date, region, entity, rank, score, raw_json` 规范化表；每管线独立 workflow + 独立失败报警；逆向类 API 一律"原始响应归档 + 优雅降级"。

# 海报生成提示词

将以下提示词发送给 GPT-4o / DALL·E / Midjourney 等图像生成模型。

---

## 提示词（中文版）

```
请生成一张 A4 学术海报（竖版），用于课程项目期末展示。项目名称：SurgeScope —— 波士顿网约车动态溢价可视化分析。

海报整体风格：深色科技风，背景为深蓝到深灰渐变，有微弱的网格线和降雨粒子效果。标题区域用大号粗体白色字，重点数据用明亮色（蓝 #3B71F3、珊瑚橙 #E8613C）。

海报内容布局（自上而下）：

1. 顶部标题栏（占高度约 12%）：
   - 主标题"SurgeScope"（大号，白色粗体，字号约 48pt）
   - 副标题"波士顿网约车动态溢价可视化分析"（中号，浅灰）
   - 右下角标注"React · D3.js · Leaflet · TypeScript"

2. 左侧栏（占宽度约 55%）：
   - 区块 A：背景与问题
     * 波士顿冬季雨雪天气下，Uber 和 Lyft 的动态溢价如何变化？
     * 两家平台谁更贵？贵多少？什么时候贵？
     * 12 个核心区域之间人和车怎么流动？什么车型占主导？
   - 区块 B：数据来源
     * 2018.11–2018.12 波士顿 Uber/Lyft 行程数据（Kaggle）
     * 同期小时级天气数据（温度、降水、能见度等）
     * 共 1,464 小时级数据点，12 个核心区域，7+6 种 Uber/Lyft 车型
   - 区块 C：可视分析任务
     * 天气→溢价联动时序分析
     * Uber vs Lyft 多维对比
     * OD 流空间分布与车型构成
   - 区块 D：系统架构
     * 四模块：总览 → 平台对比 → 天气溢价 → 流向与车型
     * 跨视图联动交互（悬停/点击同步）

3. 右侧栏（占宽度约 45%）：
   - 三张核心可视化的缩略示意图（用简洁的 SVG 风格手绘线稿表示）：
     * 图 1：双线时序图（蓝=Uber，橙=Lyft），标注"天气—溢价时间河流图"
     * 图 2：六维差异对比条形图（蓝色向左/橙色向右），标注"平台六维差异图"
     * 图 3：弦图或飞线地图示意，标注"OD 流向弦图 & 飞线地图"
   - 关键发现摘要框（用高亮卡片展示）：
     * "Lyft 暴雪天比 Uber 贵 +18%"
     * "66% 的小时 Lyft 溢价高于 Uber"
     * "降水强度与溢价相关系数最高"

4. 底部信息栏（占高度约 8%）：
   - 课程名称：数据可视化，surgeScope组，日期 2026.06.17
```

---

## 提示词（英文版，Midjourney / DALL·E 适用）

```
Create an A4 academic poster (portrait, 8.27 x 11.69 inches) for a university project titled "SurgeScope — Dynamic Surge Pricing Visualization for Ride-hailing in Boston".

Style: Dark tech theme. Deep navy-to-slate gradient background with subtle road grid lines and rain particle effects. Title in large bold white sans-serif font (48pt). Key metrics highlighted in electric blue (#3B71F3) and coral orange (#E8613C). Clean, modern data-visualization aesthetic.

Layout from top to bottom:
- TOP (12%): Large title "SurgeScope" with subtitle "Boston Ride-hailing Dynamic Surge Pricing Visualization". Bottom-right corner: "React · D3.js · Leaflet · TypeScript" tech stack badge.

- LEFT COLUMN (55% width), 3 content blocks with clear headers:
  Block A "Background": How do Uber and Lyft surge prices respond to Boston winter storms? Who charges more and when? How do trips and vehicle types distribute across 12 city zones?
  Block B "Data": 1,464 hourly data points (Nov–Dec 2018), ride-hailing trip data from Kaggle + hourly weather data. 12 zones, 7 Uber + 6 Lyft vehicle types.
  Block C "Visual Analytics": Weather-surge time series analysis, Uber vs Lyft multi-dimensional comparison, OD flow spatial analysis with vehicle type breakdown.
  Block D "System": 4-module dashboard (Overview → Platform Compare → Weather Surge → OD Flow) with cross-view linked interaction.

- RIGHT COLUMN (45% width):
  Three simplified visualization thumbnails (hand-drawn SVG style line art):
  1. Dual-line time series chart (blue and orange lines) labeled "Time River Chart"
  2. Diverging horizontal bar chart (blue left, orange right) labeled "6D Platform Diff"
  3. Chord diagram or flow map sketch labeled "OD Flow"
  Below them, a highlighted "Key Findings" box:
  - "Lyft +18% pricier than Uber in snowstorms"
  - "Lyft surge > Uber in 66% of hours"
  - "Precipitation has strongest correlation with surge"

- BOTTOM (8%): Course name, team members, date (June 2026), GitHub link in small light gray text.

Color palette: Background #1a1a2e to #16213e, accent blue #3B71F3, accent coral #E8613C, text white and light gray. No photorealistic elements. Abstract geometric and data-viz style.
```

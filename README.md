# SurgeScope — 波士顿网约车动态溢价可视化

Uber vs Lyft 在雨雪天气下的定价策略差异分析。2018 年 11–12 月，波士顿大区，1,464 小时级数据。

## 功能模块

- **总览** — 全时段溢价走势、日历热力图、天气分布，快速了解这两个月的变化全貌
- **平台对比** — 密度曲线、热力矩阵、六维差异图、散点图，逐项拆解 Uber 和 Lyft 谁更贵、贵多少、什么时候贵
- **天气溢价** — 时间河流图、散点矩阵、箱线图、事件对齐响应曲线，还原一场暴风雪前后价格是怎么一步步涨上去的
- **流向与车型** — 弦图 + 飞线地图真实地理底图看波士顿 12 个区域之间的 OD 流量，车型分布看 UberX 到 Black SUV 各占多少

## 技术栈

React 19 · TypeScript · D3.js v7 · Leaflet + React-Leaflet v5 · Framer Motion · Vite 8

## 快速开始

```bash
# 安装依赖
npm install

# 生成 OD 流数据（如未生成）
npm run aggregate:od

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 数据说明

- `public/data/hourly_series.json` — 小时级天气与溢价数据
- `public/data/od-flow.json` — OD 流向与车型分布（由 `scripts/aggregate-od.mjs` 生成）
- 原始数据来源：rideshare_kaggle.csv（Uber/Lyft 波士顿 2018.11–12 行程数据）+ 对应时段天气数据

## 项目结构

```
src/
├── features/
│   ├── home/              # 总览页面
│   ├── platform-compare/  # 平台对比
│   ├── weather-surge/     # 天气溢价联动分析
│   ├── od-flow/           # OD 流向与车型分布
│   └── landing/           # 首页入场动画
├── context/               # React Context（导航、时间范围）
├── components/            # 通用组件
├── styles/                # CSS 样式
└── types/                 # TypeScript 类型定义
```

## License

MIT

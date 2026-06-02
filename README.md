# 山区水文监测站三维态势系统

一个基于 React、Vite 和 Three.js 构建的三维水文监测可视化项目。项目通过程序化山体地形、水流动画、河谷设备和可交互控制面板，展示山区水利监测、数字孪生和应急态势感知场景。

## 项目特点

- 三维山体与河谷地形：使用噪声算法生成连续起伏的山区地貌。
- 动态水流效果：河面沿谷底高度生成，并结合波浪、流向纹理、岸边泡沫和水雾表现山溪流动。
- 监测设备展示：包含水位监测站、流速传感器、雨量计和视频监控设备。
- 实时参数控制：支持调节水位高度、流速和浪高。
- 降雨情景与风险预警：支持调节降雨强度，并根据水位、流速和降雨量生成综合风险等级。
- 多视角切换：支持无人机巡航、近景细查、远景全景、正俯视和自由操作。
- React 状态管理：将 Three.js 场景与 React UI 状态结合，便于后续扩展数据面板和监测接口。

## 技术栈

- React
- Vite
- Three.js
- Simplex Noise
- WebGL Shader

## 快速开始

```bash
npm install
npm run dev
```

开发服务器启动后，访问：

```text
http://127.0.0.1:5173/
```

构建生产版本：

```bash
npm run build
```

## 目录结构

```text
.
├── index.html
├── package.json
├── vite.config.js
├── src
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
└── water-terrain.html
```

`water-terrain.html` 是早期单文件演示版本；当前 React 工程入口为 `src/main.jsx` 和 `src/App.jsx`。

## 应用场景

该项目可作为以下场景的参考实现：

- 水利监测可视化
- 山区河道与水文态势展示
- 数字孪生演示系统
- WebGL 与 React 结合的三维工程示例
- 应急管理、自然灾害预警和环境监测原型

## 后续可扩展方向

- 接入真实水位、流速、雨量和视频数据接口。
- 增加水流路径、淹没范围和风险区域分析。
- 加入地理坐标、站点详情和告警记录。
- 使用真实 DEM、卫星影像或 GIS 数据替换程序化地形。
- 增加性能监控、测试和安全检查。

---

# 3D Mountain Hydrological Monitoring Dashboard

A 3D hydrological monitoring visualization project built with React, Vite, and Three.js. It presents a mountainous river valley, dynamic water flow, monitoring devices, and an interactive dashboard for water management, digital twin, and emergency response scenarios.

## Features

- 3D mountain and river valley terrain generated with procedural noise.
- Dynamic river flow with valley-following water geometry, waves, flow streaks, bank foam, and mist.
- Monitoring devices including water level stations, flow sensors, rain gauges, and cameras.
- Real-time controls for water level, flow speed, and wave height.
- Rainfall scenario and risk warning: adjust rainfall intensity and generate a combined risk level from water level, flow speed, and rainfall.
- Multiple camera views: drone patrol, close inspection, wide overview, top view, and free navigation.
- React-driven UI state integrated with a Three.js rendering scene.

## Tech Stack

- React
- Vite
- Three.js
- Simplex Noise
- WebGL Shader

## Getting Started

```bash
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:5173/
```

Build for production:

```bash
npm run build
```

## Project Structure

```text
.
├── index.html
├── package.json
├── vite.config.js
├── src
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
└── water-terrain.html
```

`water-terrain.html` is the earlier single-file demo. The current React application entry points are `src/main.jsx` and `src/App.jsx`.

## Use Cases

This project can be used as a reference implementation for:

- Water management visualization
- Mountain river and hydrological situation displays
- Digital twin demo systems
- 3D engineering examples combining WebGL and React
- Emergency management, natural disaster warning, and environmental monitoring prototypes

## Future Improvements

- Connect real water level, flow speed, rainfall, and video data APIs.
- Add water path, flood area, and risk zone analysis.
- Add geographic coordinates, station details, and alert records.
- Replace procedural terrain with real DEM, satellite imagery, or GIS data.
- Add performance monitoring, testing, and security checks.

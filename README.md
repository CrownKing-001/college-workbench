<div align="center">

# 大学日程 · 桌面工作台

**课表 · 待办 · 作业 DDL · 重要事项 · 运动打卡 · 饮食记录 · 体重作息**

一个**不联网、不注册、数据全在本机**的大学生桌面工作台。
免安装绿色版，双击即用，整个文件夹拷进 U 盘就能带走。

![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white)

</div>

---

<div align="center">

## ⚠️ 非常非常不稳定，但我累了，自有后来人
使用反馈请发送邮件：wangguanjiezs@163.com

</div>

> 这个项目**能跑，但别指望它稳**。
>
> 最不稳的是**图片识别**：Windows 自带 OCR 会把课表里相邻的格子读成一整行、把小字表头整个丢掉。
> 我改了很多轮，也只压下去一部分 —— 所以两个识别页在界面上都直接标了「**不稳定 · 测试版**」。
>
> **绕开它的办法已经做出来了**：让 AI 把课表/校历整理成固定格式的文字再粘进来，
> 准确率远高于识图 → 见 [两条导入路径](#两条导入路径)。
>
> 已知问题都列在 [下面](#已知问题) 了。后面的路，交给后来人。

---

## 这是什么

一个给大学生用的本地桌面工作台。**空白模板** —— 首次启动不预置任何课程或记录，全部由你自己录入或导入。

| | |
|---|---|
| 🔒 **数据全在本机** | 不联网、不注册、不上传，照片也不出本机 |
| 📦 **免安装绿色版** | 不写注册表、不进开始菜单，文件夹拷走即可 |
| 🌙 **暗色主题** | 深灰蓝底 + 高对比文字，长时间盯屏不刺眼 |
| ⚡ **启动优化** | 视图按需加载，冷启动只解析首屏代码 |

## 快速开始

### 方式一 · 下载免安装版

1. 到 [**Releases**](https://github.com/CrownKing-001/college-workbench/releases/latest) 下载最新的便携版 exe（`college-desk-<版本>-portable.exe`）
2. 双击运行即可

> 本地 `npm run dist` 打包出的文件名是中文的 `大学日程-桌面工作台-<版本>-便携版.exe`；
> GitHub 的资源接口不接受中文文件名，所以 Release 附件用了英文名 —— 两者是同一个程序。

> **首次运行会被 Windows 拦一下**
>
> 弹出蓝色的「Windows 已保护你的电脑」是正常的 —— 程序没有代码签名证书，不是病毒。
> 点「**更多信息**」→「**仍要运行**」。
> 嫌每次都弹，可以先右键 exe → 属性 → 勾选底部的「**解除锁定**」（或在解压前对压缩包做这一步）。

3. 数据会自动建在 **exe 同级的 `data` 文件夹**里
4. **关窗口 ≠ 退出** —— 会收进右下角托盘继续运行（提醒照常触发）。要完全退出，右键托盘图标选「退出」

### 方式二 · 从源码跑

```bash
pnpm install
pnpm electron     # 构建后在 Electron 窗口里跑
pnpm dev          # 或在浏览器里热更新开发 → http://localhost:3000
```

## 两条导入路径

课表和校历都支持两种导入方式。**强烈建议用第二种。**

### 路径 A · 识别图片（不稳定）

「课表识别」/「校历识别」→ 选择图片或直接拖进去。
用 Windows 自带的 OCR 引擎**本地**识别，照片不出本机。

- 截图上最好带「星期一…星期日」**表头**和左侧**节次**，程序靠它们重建表格
- 没有表头的图会走保守估算，准确率明显下降
- 识别结果会列成一张可编辑的表，**逐条核对后**才写入

### 路径 B · 粘贴文字（推荐）

> 文字是确定的，不存在识别误差。

1. 打开「课表识别」→「粘贴课表文字」→ 点「**复制给 AI 的指令**」
2. 把指令 **+** 你的课表原文（或截图）发给豆包等 AI，让它按固定格式输出
3. 把 AI 输出的文字粘回来 → 点「**解析文字**」→ 核对后导入

指令里规定了严格的字段顺序（`课程名，节次（时间），地点，周次`），所以 AI 的输出一定能被解析。
校历同理 —— 而且校历文字里若**自带「第 N 周：9.7-9.13」周次表**，会直接得到学期起点与总周数。

## 功能一览

| 模块 | 一句话 |
| --- | --- |
| **总览** | 今日时间轴、关键指标、待办速览、作业倒计时 |
| **今日 / 周计划** | 按天或按教学周看课，进行中的课会高亮 |
| **待办清单** | 优先级 / 截止日 / 标签，逾期自动标红 |
| **作业 DDL** | 按课程登记作业与截止时间，倒计时提醒 |
| **重要事项** | 期末、竞赛、证书报名……带准备清单与提前提醒，可一键从校历添加 |
| **课表** | 增删改课程，周次支持 `2-16`、`2,4,6-8` 写法 |
| **课表识别 / 校历识别** | 图片 OCR + 文字解析两条路（见上） |
| **运动打卡** | 打卡类型、目标次数、起止日期全部自定义 |
| **饮食记录** | 拍照留档 + 食物库点选 / 打字识别营养 + 套餐复用 |
| **智能分析** | 基于你自己课表的空闲时段热力图与推荐 |
| **体重作息** | 体重曲线、睡眠、步数 |
| **设置** | 数据目录、备份导入导出、提醒、**当前第几周**、蛋白质目标 |

## 数据在哪

全部以**可读 JSON** 存在 `data/`，想手工改也行：

```
data/fitplan-courses.json      课表          data/fitplan-diet-logs.json    饮食记录
data/fitplan-todos.json        待办          data/fitplan-templates.json    自建套餐
data/fitplan-assignments.json  作业          data/fitplan-calendars.json    识别记录
data/fitplan-milestones.json   重要事项      data/fitplan-settings.json     设置
data/fitplan-run-logs.json     运动打卡      data/photos/年-月/*.jpg        饮食照片
data/fitplan-health-logs.json  体重 / 睡眠   data/calendars/*.jpg           课表原图
```

**备份**：把整个 `data/` 文件夹复制走即可；也可以用「设置 → 导出备份」生成单个 JSON。

> `data/profile/` 是可再生的 Chromium 运行缓存，**不用备份**。
> 程序刻意把缓存隔离进这个子目录，免得把它淹在要备份的 JSON 里。

## 开发

```bash
pnpm install       # 依赖用 pnpm 装（仓库只保留 pnpm-lock.yaml）

pnpm dev           # 浏览器热更新（http://localhost:3000）
pnpm electron      # 构建后在 Electron 里跑
pnpm dist          # 打包免安装便携 exe → release/
pnpm smoke         # 冒烟测试
pnpm dark          # 暗色主题校验（对比度 / WCAG）
```

> 用 `npm run <脚本>` 也可以 —— 脚本本身与包管理器无关。

改了解析规则请顺手跑一下自测：

```bash
node tools/check-timetable.cjs   # 课表网格重建 / 连堂 / 周次 / 教室解析（46 项）
node tools/check-textparse.ts    # 课表 + 校历的文字解析（18 项）
node tools/check-diet.cjs        # 饮食营养值与食物库一致性
```

### 项目结构

```
electron/            主进程：窗口 / 托盘 / IPC / 文件存储
  main.cjs           入口（含 GPU 兼容开关）
  ocr.cjs            Windows.Media.Ocr 封装（行级 / 词级两种输出）
  timetable.cjs      课表网格重建 + 课程抽取
  ocr-windows.ps1    OCR 的 PowerShell 实现
src/
  views/             14 个功能模块
  lib/textParse.ts   课表 / 校历「文字解析」
  lib/aiPrompts.ts   给 AI 的格式化指令
  store/store.tsx    全局状态 + 自动落盘
tools/               规则自测脚本
```

## 已知问题

- **图片识别不稳** —— 相邻格子被连成一行、小字表头丢失、周次串行。这是 Windows OCR 的固有限制，
  已尽量规避但**没有根治**。→ 建议改用[文字解析路径](#路径-b--粘贴文字推荐)。
- **没有代码签名** —— 首次运行会弹 SmartScreen，需手动放行。
- **只在 Windows 上测过** —— OCR 依赖 `Windows.Media.Ocr`，其他平台识别功能跑不起来。
- **托盘常驻容易误解** —— 关窗口不退出，第二次启动会因单实例锁「看起来没反应」。

## 技术栈

Electron 44 · React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 3

数据 100% 存本机，不联网上传。

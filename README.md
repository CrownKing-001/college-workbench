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
| **总览** | 今日时间轴、关键指标、待办速览、作业倒计时；把「重要事项」钉上来就能看倒计时 |
| **今日 / 周计划** | 按天或按教学周看课，进行中的课会高亮 |
| **待办清单** | 优先级 / 截止日 / 标签，逾期自动标红 |
| **作业 DDL** | 按课程登记作业与截止时间，倒计时提醒 |
| **重要事项** | 期末、竞赛、证书报名……带准备清单与提前提醒，可一键从校历添加；**图钉**决定哪些上总览 |
| **课表** | 增删改课程，周次支持 `2-16`、`2,4,6-8` 写法 |
| **课表识别 / 校历识别** | 图片 OCR + 文字解析两条路（见上） |
| **运动打卡** | 打卡类型、目标次数、起止日期全部自定义 |
| **饮食记录** | **全应用唯一的饮食入口**：拍照留档 + 193 种食物库点选 + 打字识别 + 套餐复用 + 手动记账 + 历史回顾 |
| **智能分析** | 基于你自己课表的空闲时段热力图与推荐 |
| **体重作息** | 体重 / 睡眠双曲线、步数、**训练打卡日历**（可补打卡、算连续天数） |
| **设置** | 数据目录、备份导入导出、提醒、**当前第几周**、蛋白质目标、**训练日** |

除了点左侧导航，视图也会写进地址栏（`#/diet`），刷新或分享链接都能回到同一页，
浏览器前进 / 后退也能在模块之间切换。

### 总览倒计时怎么用

总览首页绿色条上的倒计时卡片，**和「重要事项」是同一份数据**，不会两处各记一遍：

- 在「重要事项」里点**图钉 📌** → 该事项出现在总览绿色条上（列表里会标「已钉到总览」）
- 在总览点「**添加倒计时**」→ 从已有事项里挑一个（不会新建出重复数据）
- 卡片上悬停出现**铅笔 / ×**：就地改标题日期，或从总览移除（只是取消钉住，**事项本身不删**）

钉住多少个就显示多少个，条数多时卡片自动缩小并换行，不会被截断。

### 饮食记录 / 体重作息怎么分工

- **饮食记录** = 记吃的。蛋白质与热量统计、食物库、照片、套餐、历史回顾都在这里。
- **体重作息** = 记身体。体重、睡眠、步数、训练打卡日历。

「体重作息」里不再有饮食记录与统计（以前两页各记一份，容易对不上），
页面底部只留一个跳转入口。蛋白质目标两页共用同一个值（按最近体重 × 系数推算，可在设置里改）。

食物库内置 **193 种**常见食堂 / 外卖 / 家常食物，按肉类、蛋奶、水产、豆制品、主食、
蔬菜、水果、外卖快餐、零食饮料、补剂分类，支持按名称和别名搜索。

### 训练打卡日历怎么用

「体重作息」右侧是一张月历：有训练安排的日子浅绿底、打了卡实心填充、点任意日期即可补打卡。

先去「**设置 → 运动打卡 → 训练日**」点选一周里安排训练的日子（默认周一/三/五）。
连续打卡天数**只按训练日计算**，休息日不会打断连续记录；全部取消则不再区分训练日与休息日。


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
pnpm dist          # 打包自解压便携 exe → release/
pnpm dist:green    # 打包「免安装版」zip（解包目录，不做自解压）→ release/
pnpm dist:signed   # 同上但额外用自签名证书签名（默认不签，见下方「蓝框」一节）
pnpm sign:setup    # 建自签名证书并装入当前用户信任
pnpm sign:status   # 查看证书与产物签名状态
pnpm unblock       # 清除 release/ 下所有文件的「下载标记」
pnpm smoke         # 冒烟测试
pnpm dark          # 暗色主题校验（对比度 / WCAG）
pnpm lint          # ESLint
```

### UI 截图与主题校验（排查界面问题很有用）

Electron 在没有交互式桌面会话的环境里起不来（会以 `STATUS_BREAKPOINT` 退出），
所以界面截图走**系统自带 Edge 的 headless 模式**，渲染的是同一份 `dist/` 产物：

```bash
pnpm build
node tools/serve.cjs 4180              # 起一个静态服务器
node tools/shots-edge.cjs dark light   # 逐页截图 → .shots/
node tools/shot-full.cjs settings light # 整页截图（长页面用这个）
node tools/check-theme.cjs 4180        # 用 CDP 读真实计算样式，校验两套主题 + 对比度
```

`?theme=light` / `?theme=dark` 加到地址里可以临时覆盖主题（只影响本次显示，不写进设置），
截图和分享固定主题的链接都靠它。

改了解析规则请顺手跑一下自测：

```bash
node tools/check-timetable.cjs   # 课表网格重建 / 连堂 / 周次 / 教室解析（46 项）
node tools/check-textparse.ts    # 课表 + 校历的文字解析（18 项）
pnpm check:foods                 # 食物库完整性与文字识别回归（27 项）
```

> **打包报 `No JSON content found in output`？**
> 这是 electron-builder 找不到 `pnpm` 时的表现（它要跑 `pnpm list --json` 收集依赖树，
> 拿到空输出后错报成 JSON 解析失败）。本项目用 `tools/eb.cjs` 启动打包，
> 会自动在 `.tools-bin/` 里放一个转发到 `corepack pnpm` 的薄脚本并临时加进 PATH，
> 不需要管理员权限、也不用全局装 pnpm。直接 `npx electron-builder` 会绕过这层保护。
>
> 它还会在 Node 支持时加上 `--use-system-ca`：走镜像源 / 代理时 Node 自带 CA 可能
> 验不过证书链（`unable to verify the first certificate`），改用系统证书库即可。

### 关于 `node_modules` 不进安装包

这个应用**没有任何运行时 npm 依赖** —— Vite 已经把 React、Radix 等全部打进 `dist/`，
主进程只用 Electron 与 Node 内置模块（`fs` / `path` / `os` / `child_process` / `zlib`）。

所以 `package.json` 里没有 `dependencies`（全部归入 `devDependencies`，它们只是构建期依赖），
`build.files` 也显式排除了 `node_modules`：

```
"!node_modules/**/*"
```

效果是把 `app.asar` 从 **79.1 MB 压到 0.71 MB**，安装包体积与启动开销都明显下降。
**如果你以后新增了真正在运行时 `require()` 的包，必须把它放回 `dependencies`
并去掉那条排除规则**，否则打包后会出现「模块找不到」。

### 项目结构

```
electron/            主进程：窗口 / 托盘 / IPC / 文件存储
  main.cjs           入口（含 GPU 兼容开关与各测试模式分支）
  ocr.cjs            Windows.Media.Ocr 封装（行级 / 词级两种输出）
  timetable.cjs      课表网格重建 + 课程抽取
  ocr-windows.ps1    OCR 的 PowerShell 实现
  shots.cjs          逐页截图（UD_SHOTS=1 触发）
src/
  views/             14 个功能模块
  components/
    Panel.tsx        卡片 / 徽标 / 进度条 / 按钮等通用样式
    CheckinCalendar.tsx  训练打卡月历（连续天数、补打卡）
    TrendChart.tsx   体重 / 睡眠共用趋势曲线
  data/foods.ts      193 种食物营养库 + 文字识别解析
  lib/textParse.ts   课表 / 校历「文字解析」
  lib/aiPrompts.ts   给 AI 的格式化指令
  store/store.tsx    全局状态 + 自动落盘
tools/
  check-*.cjs        规则自测脚本
  serve.cjs          本地静态服务器（预览 / 截图用）
  shots-edge.cjs     用 Edge headless 逐页截图
  shot-full.cjs      整页截图
  check-theme.cjs    两套主题 + 对比度校验（CDP）
  make-green.cjs     打包免安装版 zip（含签名步骤）
  unblock.cjs        清除下载标记
  codesign.ps1       自签名证书：-Setup / -Sign / -Status / -Remove
```

## 已知问题

- **图片识别不稳** —— 相邻格子被连成一行、小字表头丢失、周次串行。这是 Windows OCR 的固有限制，
  已尽量规避但**没有根治**。→ 建议改用[文字解析路径](#路径-b--粘贴文字推荐)。
- **没有代码签名证书** —— 新打的 exe 第一次运行会弹 SmartScreen，需手动放行（见下）。
- **只在 Windows 上测过** —— OCR 依赖 `Windows.Media.Ocr`，其他平台识别功能跑不起来。
- **托盘常驻容易误解** —— 关窗口不退出，第二次启动会因单实例锁「看起来没反应」。

## 打开时弹「Windows 已保护你的电脑」怎么办

这是 **SmartScreen** 的例行拦截，**不是病毒**。根因是 **exe 没有代码签名**，
Windows 无法核验发布者，所以新文件第一次运行要你确认一次。

> 改 electron-builder 的任何选项都**没用** —— 这不是配置问题。
> 同一个文件被放行过一次之后就不再弹，所以会看到
> 「旧的那版不弹、新打的这版又弹」—— 差别只是旧文件已经被你放行过。

### 正常做法：放行一次

点「**更多信息**」→「**仍要运行**」。同一个 exe 之后不再弹。

如果**没有**「仍要运行」这个选项（只有「不运行」），说明系统的
「应用和浏览器控制 → 检查应用和文件」被设成了**阻止**：

```
Windows 安全中心 → 应用和浏览器控制 → 基于声誉的保护
  → 「检查应用和文件」改成「警告」（或关闭）
```

改完再运行一次即可。设成「阻止」时，普通双击一定打不开，
而**右键「以管理员身份运行」会绕过这项检查** —— 这就是「只有管理员才能打开」的原因。

### 自签名证书：**不要指望它解决这个问题**

仓库里带了 `tools/codesign.ps1`（自签名 + 签名 exe），但它**不能可靠消除 SmartScreen 拦截**，
这一点是实测踩过的坑：

- 自签名证书只能装进**当前用户**的受信任存储；
- 而 SmartScreen 的校验跑在**系统服务**上下文，看不到当前用户的根证书；
- 于是在它眼里，这个 exe 是「带了一个无法验证的签名」——**比完全不签名更容易被拦**。

所以**默认不签名**（`pnpm dist` / `pnpm dist:green` 产出的都是未签名 exe，
与你那个能正常打开的 1.6.1 同类）。要用签名请显式执行：

```bash
pnpm sign:setup      # 建自签名证书并装入当前用户信任（免管理员）
pnpm dist:signed     # 打包并签名
pnpm sign:status     # 查看证书与产物签名状态
pnpm sign:remove     # 撤销：删掉证书、信任记录与导出件
```

**真正的根治办法只有一张正规的代码签名证书**（OV/EV，需要购买与企业资质）。
自签名的含义只是「**你**为这个程序背书」，既不代表程序安全，
也不解决别人下载你的 exe 时的拦截。

### 其他降低摩擦的做法

| 做法 | 效果 |
| --- | --- |
| 右键 exe → 属性 → 勾「**解除锁定**」 | 清掉「下载标记」（只对下载来的文件有效） |
| `pnpm unblock` | 批量清除 `release/` 下所有文件的下载标记 |
| 改用 `pnpm dist:green` 的免安装版 | exe 直接运行、不做自解压，启动更快、AV 摩擦更小 |

程序**不申请管理员权限**（Electron 默认 `asInvoker`），所以不会弹 UAC 提权窗 ——
如果你看到的是「你要允许此应用对你的设备进行更改吗」，那是另一回事，请看事件日志。


## 技术栈

Electron 44 · React 19 · TypeScript 5.9 · Vite 7 · Tailwind CSS 3

数据 100% 存本机，不联网上传。

# GMGN 同名首发过滤器（GMGN Same-Name First Launch Filter）

用于 gmgn.ai 的 Chrome 扩展：在指定时间窗口内识别并标记同名代币的首发与非首发，并提供非首发一键跳转首发代币页面。

说明：本扩展尚未上架 Chrome 应用商店，请按下方步骤通过 GitHub 源码手动安装。

---

## 功能特性

- 同名匹配（可配置）：
  - Symbol 或 Name 任一相同
  - 仅 Symbol 相同
  - 仅 Name 相同
  - Symbol 和 Name 都相同
- 首发判断（在时间窗口内比较）：
  - 同组内 age 最大（最老）的代币视为首发
- 可视化标记：
  - 首发：绿色描边 + 首发/First 标签
  - 非首发：灰色遮罩 + 非首发/Not First 标签
- 非首发一键跳转首发：
  - 在“非首发”标签附近显示一个小按钮
  - 点击后直接打开首发代币的 token 页面（新标签页）
- 显示/过滤模式（可配置）：
  - 显示所有（仅标记）
  - 只显示首发（隐藏非首发）
  - 只显示非首发
  - 隐藏非同名组
- 双语言支持（中文 / English）：
  - 默认中文（可在设置页手动切换语言）

---

## GitHub 安装流程（手动安装 / Developer Mode）

### 1）下载源码

方式 A：git clone  
git clone https://github.com/wfce/gmgn-filter.git

方式 B：下载 ZIP  
点击 GitHub 页面右上角 Code → Download ZIP，下载后解压到本地文件夹。

---

### 2）确认目录结构

请确认扩展根目录包含 manifest.json，示例结构：

extension/
- manifest.json
- content.js
- styles.css
- options.html
- options.js
- icons/
  - icon16.png
  - icon48.png
  - icon128.png
- _locales/
  - en/
    - messages.json
  - zh_CN/
    - messages.json

---

### 3）在 Chrome 中加载扩展（开发者模式）

1. 打开 Chrome，进入 chrome://extensions/
2. 右上角开启 Developer mode（开发者模式）
3. 点击 Load unpacked（加载已解压的扩展程序）
4. 选择包含 manifest.json 的目录（扩展根目录）
5. 加载成功后，扩展会出现在扩展列表中

---

### 4）验证是否生效

1. 打开 https://gmgn.ai/
2. 进入代币列表/表格页面
3. 正常情况下你会看到：
   - 首发/非首发标签
   - 非首发行存在“跳转首发”按钮（点击会打开首发代币页面）

若没有显示：
- 刷新 gmgn.ai 页面
- 确保扩展已启用（chrome://extensions/）
- 确保加载的是包含 manifest.json 的正确目录

---

## 使用说明（设置/配置）

打开设置页方式：
1. 进入 chrome://extensions/
2. 找到本扩展 → 点击 Details（详情）
3. 点击 Extension options（扩展程序选项）

可配置项：
- 语言：中文 / English（默认中文）
- 时间窗口（分钟）
- 匹配模式（Symbol/Name 规则）
- 显示模式（过滤策略）
- 是否仅在时间窗口内比较

---

## 首发判定规则说明

在同名组内（由匹配模式决定），并且在时间窗口允许比较时：
- age 最大（最老）的 token 被认为是“首发”
- 其他同组 token 被认为是“非首发”

---

## 权限说明

- storage：用于保存扩展设置（语言、时间窗口、显示模式等）
- host_permissions: https://gmgn.ai/*：仅在 gmgn.ai 页面生效

---

## 开发/调试

修改代码后生效方式：
1) 打开 chrome://extensions/  
2) 点击扩展的 Reload（重新加载）  
3) 刷新 gmgn.ai 页面

---

## 免责声明

本项目为第三方扩展，与 gmgn.ai 无任何隶属关系。  
gmgn.ai 页面结构更新可能导致选择器失效，欢迎提交 Issue / PR。

---

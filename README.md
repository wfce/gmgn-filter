# GMGN 同名首发过滤器（GMGN Same-Name First Launch Filter）

用于 gmgn.ai 的 Chrome 扩展：在代币列表中标记同名代币的「首发 / 非首发」，并在非首发代币旁提供一键跳转到对应首发代币页面的按钮。

## Chrome 商店状态：审核中（In Review）

本扩展目前正在提交 Chrome Web Store 审核中，暂未正式上架。  
在上架前，你可以通过本仓库源码手动安装使用（下面有详细教程）。

---

## 功能简介

- 首发/非首发标记：默认按「仅 Symbol 相同」分组，在时间窗口内比较，同组内 age 最大（最老）的代币视为「首发」
- 非首发一键跳转：在「非首发」标签旁显示「跳转」按钮，点击直接打开对应首发代币 token 页面（新标签页）
- 时间窗口：可设置比较的时间范围
- 双语言：中文 / English（默认中文，可在设置中切换）
- 显示模式：当前仅支持「显示所有（标记首发/非首发）」；其他模式显示为「开发中」

---

## 安装（GitHub 手动安装，重点）

由于扩展仍在 Chrome 商店审核中，请按以下步骤手动安装。

### 方式 A：使用 git clone

1. 克隆仓库到本地
   git clone https://github.com/wfce/gmgn-filter.git

2. 进入项目目录（确认这里包含 manifest.json）
   cd gmgn-filter

### 方式 B：下载 ZIP

1. 打开本仓库页面，点击右上角 Code → Download ZIP
2. 解压到本地任意目录
3. 确保解压后的扩展根目录内包含 manifest.json

---

## 在 Chrome 中加载扩展（开发者模式）

1. 打开 Chrome，进入：
   chrome://extensions/

2. 打开右上角：
   Developer mode（开发者模式）

3. 点击：
   Load unpacked（加载已解压的扩展程序）

4. 选择扩展根目录（必须是包含 manifest.json 的那一层目录）

5. 加载成功后，扩展会出现在扩展列表中

提示：如果你选错目录（例如选到了外层或内层），Chrome 会提示找不到 manifest.json。请重新选择正确目录。

---

## 如何使用

1. 打开 gmgn.ai：
   https://gmgn.ai/

2. 在代币列表/表格中查看标记：
   - 首发：绿色描边 + “首发/First”
   - 非首发：灰色遮罩 + “非首发/Not First” + “跳转/Go” 按钮

3. 点击非首发行的「跳转」按钮：
   - 直接打开对应首发代币的 token 页面（新标签页）

---

## 设置（Options）

打开设置页：
1) 进入 chrome://extensions/  
2) 找到本扩展 → Details（详情）  
3) Extension options（扩展程序选项）

可配置项：
- 语言：中文 / English（默认中文）
- 时间窗口（分钟）
- 匹配模式（默认仅 Symbol 相同，可修改）
- 仅在时间窗口内比较

注意：显示模式目前锁定为「显示所有（标记首发/非首发）」，其他模式为开发中不可切换。

---

## 图标（Icon）

本扩展包含图标文件：
- icons/icon16.png
- icons/icon48.png
- icons/icon128.png

---

## 权限说明

- storage：用于保存扩展设置（语言、时间窗口、匹配模式等）
- host_permissions：https://gmgn.ai/*  
  用于在 gmgn.ai 页面注入脚本、读取页面中公开展示的代币列表信息并进行标记与跳转

本扩展不收集、不上传用户数据。详见隐私政策：PRIVACY.md

---

## 开发与调试

修改代码后生效步骤：
1) 打开 chrome://extensions/  
2) 点击本扩展的 Reload（重新加载）  
3) 刷新 gmgn.ai 页面

---

## 免责声明

本项目为第三方扩展，与 gmgn.ai 无任何隶属或合作关系。  
gmgn.ai 页面结构更新可能导致扩展选择器失效，欢迎提交 Issue 反馈问题。

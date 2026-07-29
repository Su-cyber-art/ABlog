# 默·博客

一册记录日常的随笔——古典衬线风格的个人博客系统,按 Claude Design 设计稿「默·博客」完整实现。

**零依赖**:只用 Node.js 内置模块(内置 http 服务 + 内置 SQLite),不需要 `npm install`,解压即可运行。

## Linux 二进制一键部署

支持使用 systemd 的 x86_64/ARM64 Linux,无需预装 Node.js。安装器会下载并校验最新 GitHub Release,创建独立服务用户,并把数据持久化到 `/var/lib/ablog`。默认进入交互式安装维护菜单:

```bash
curl -fsSL https://raw.githubusercontent.com/Su-cyber-art/ABlog/main/install.sh | sudo bash
```

菜单提供安装、升级、卸载、当前运行状态、当前版本和 GitHub 最新 Release 版本查看。首次显示菜单时会通过 HTTPS 查询一次最新版本；查询失败不会阻断安装或升级。首次安装会交互询问监听端口、监听范围、可自定义的后台路径（不固定为 `/mo`）、公网地址和后台密码，密码输入不会回显；密码留空时会自动生成，并在确认页提示、安装完成后显示。监听范围默认允许通过服务器 IP 直连，也可选择仅本机监听以配合 Nginx/Caddy。升级保留 `/etc/ablog/ablog.env` 与现有博客数据；旧配置缺少 `HOST` 时会按原有直连语义补为 `0.0.0.0`。后台路径请在登录后的「站点设置」中修改。完成页优先显示已设置的 `SITE_URL`，否则仅在允许直连时检测公网或网卡地址。卸载默认只停止服务并移除程序文件，保留数据、配置和服务账号；只有在二次确认后才会彻底删除它们。

也可以在终端直接指定动作:

```bash
curl -fsSL https://raw.githubusercontent.com/Su-cyber-art/ABlog/main/install.sh | sudo bash -s -- install
curl -fsSL https://raw.githubusercontent.com/Su-cyber-art/ABlog/main/install.sh | sudo bash -s -- upgrade
curl -fsSL https://raw.githubusercontent.com/Su-cyber-art/ABlog/main/install.sh | sudo bash -s -- uninstall
```

无人值守模式可通过环境变量传入动作与配置。未设置 `ABLOG_ACTION` 时会自动选择首次安装或升级:

```bash
curl -fsSL https://raw.githubusercontent.com/Su-cyber-art/ABlog/main/install.sh \
  | sudo env ABLOG_NONINTERACTIVE=1 \
      ABLOG_ACTION=install \
      PORT=3000 \
      HOST='0.0.0.0' \
      ADMIN_PATH='/manage_7f3a' \
      ADMIN_PASSWORD='换成至少8位的强密码' \
      SITE_URL='https://blog.example.com' \
      bash
```

无人值守安装的 `HOST` 默认为 `0.0.0.0`，可设为 `127.0.0.1` 仅供本机反向代理访问；未传 `ADMIN_PASSWORD` 时会自动生成随机密码并在完成时显示。交互安装也可以在密码提示处直接按 Enter 使用随机密码。随机密码只在终端显示，请立即保存并在首次登录后修改。无人值守卸载必须额外显式确认，彻底清除数据、配置和服务账号时再加上 `ABLOG_PURGE_DATA=1`:

```bash
curl -fsSL https://raw.githubusercontent.com/Su-cyber-art/ABlog/main/install.sh \
  | sudo env ABLOG_NONINTERACTIVE=1 \
      ABLOG_ACTION=uninstall \
      ABLOG_CONFIRM_UNINSTALL=1 \
      ABLOG_PURGE_DATA=1 \
      bash
```

`ADMIN_PATH` 只能是安全的单段路径,例如 `/admin` 或 `/manage_7f3a`;自定义路径不能替代强密码。

- 服务状态:`sudo systemctl status ablog`
- 实时日志:`sudo journalctl -u ablog -f`
- 环境配置:`/etc/ablog/ablog.env`
- 博客数据:`/var/lib/ablog/blog.db`

> 二进制包通过 `v*` 标签自动发布,支持 glibc Linux;Alpine Linux 暂不支持。

## 快速开始

1. 安装 [Node.js](https://nodejs.org)（支持 **22.13+ 的 22.x，或 23.4+**；建议直接安装最新 LTS）
2. 双击 `start.bat`(或在本目录执行 `node server.js`)
3. 浏览器打开:
   - 前台 <http://localhost:3000>
   - 后台 <http://localhost:3000/admin>

手工首次启动时，若未设置 `ADMIN_PASSWORD` 或将其设为空值，终端会生成并显示一条随机后台密码；使用一键安装器时，也可以在密码提示处直接按 Enter 自动生成。随机密码只在终端显示，请立即保存，并在登录后通过「站点设置」修改。手工启动的服务默认只监听 `127.0.0.1`；需要局域网或公网直连时可显式设置 `HOST=0.0.0.0`。直连使用普通 HTTP，正式公网部署应使用 HTTPS 反向代理。

## 功能

**前台**

- 首页:文章列表(分类·日期、摘要、阅读/独立访客/评论数)、分页、搜索/分类/标签/订阅侧栏
- 文章页:Markdown 正文、可点击标签、上一篇/下一篇导航、评论区、访客留言(提交后进入待审);原始阅读次数与独立访客数分开统计
- 归档:按年份分组,支持分类与标签两种筛选
- 全文搜索:`/search`,匹配标题/正文/标签(仅已发布)
- 关于:作者照片位 + 自述;照片可在后台「站点设置」上传,持久化到数据目录
- RSS 全文输出:`/feed.xml`(含 `content:encoded`);`sitemap.xml`、`robots.txt` SEO 三件套;移动端为响应式版式

**后台**(密码登录)

- 仪表盘:已发布/草稿/待审评论/总阅读/独立访客统计、最近文章、待审评论快捷处理
- 文章管理:全部/已发布/草稿筛选,查看/编辑/删除
- 写作:Markdown 双栏实时预览编辑器,支持 `# 标题`、`**粗体**`、`*斜体*`、`> 引用`、`- 列表`、`--- 分隔线`、`` `代码` ``、` ``` ` 围栏代码块、`![图片](url)`、`[链接](url)`;字数统计、存草稿/发布;**离开页面自动暂存,防止丢稿**
- 分类与标签:增删管理;使用中的分类不可删除;删除标签会同时清掉文章上的引用
- 评论管理:待审/已通过/垃圾,通过/标垃圾/删除
- 订阅者:名单查看、单条移除、一键导出 CSV
- 访客管理:独立访客列表、最后访问 IP、可信归属地与旗帜、访问次数、最后页面;支持单条或全部清理
- 站点设置:站点名称、副标题、作者署名、页脚文字、每页文章数、文章分类新增、关于页照片、站点图标裁切上传、修改后台密码、**JSON 数据备份导出/文件导入**、恢复示例数据

站点图标支持选择 SVG、JPEG、PNG 或 WebP（最大 5 MiB），在浏览器内自动居中裁切，可拖动、缩放并预览 32/16 px 效果；点击确认后统一转换为安全的 256 × 256 PNG，保存到数据目录并通过版本化 URL 立即刷新浏览器缓存。可随时恢复仓库内置的默认 `favicon.svg`。

**性能与安全**

- 响应 gzip 压缩、静态资源 304 协商缓存、HEAD 请求支持
- 安全响应头(CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy)
- 登录失败限速锁定、改密后其他设备会话立即失效、跨站 POST 拦截
- `/healthz` 健康检查、SIGTERM 优雅退出

### 访客统计与归属地

独立访客使用签名的第一方 Cookie 识别浏览器,而不是按 IP 去重;同一浏览器在 90 天保留窗口内重复阅读同一篇文章只计一次独立访客。清除 Cookie、无痕窗口或换设备会被视为新的匿名访客。系统不记录 User-Agent、来源页或完整浏览历史,仅保留最后一次 IP、最后页面、首次/最近访问时间和汇总次数;启动时与之后每 6 小时清理超过 90 天的记录，并同步滚动文章的近 90 天独立访客数。

后台 JSON 导出不会携带 IP、匿名访客标识或文章去重基线。因此，用 JSON 导入内容后，文章的“独立访客”从 0 重新统计；站点级访客记录仍留在本机，直到其按保留期自动清理或在后台手动清空。需要完整迁移时，请在停服后整体备份数据目录。

为了不把访客 IP 发送到第三方查询服务,国家/旗帜只读取**可信反向代理**提供的国家码。Cloudflare 可在 `/etc/ablog/ablog.env`（或启动环境）加入:

```bash
TRUST_PROXY=1
VISITOR_COUNTRY_HEADER=cf-ipcountry
```

只有当反向代理会覆盖客户端传入的 `X-Forwarded-For` 和国家头时才应设置 `TRUST_PROXY=1`。未配置可信代理时,后台会显示“未知”;本机/内网访问显示本地网络。旗帜使用浏览器原生国旗字符,无需外部图片服务。

## 测试

```bash
npm test        # 等价于 node --test,零依赖
```

覆盖前台、后台、单元和安装器场景:页面渲染、分页、草稿权限、搜索、归档筛选、评论审核、
分类标签、订阅、独立访客、可信归属地、照片与站点图标上传、安装器菜单、动作选择、监听范围、随机密码、旧配置迁移、最新版本校验与缓存、备份恢复、登录限速、改密下线、Markdown 渲染与安全。CI 见 `.github/workflows/test.yml`。

## 目录结构

```
Ablog/
├── server.js          入口(内置 http,零依赖)
├── start.bat          Windows 一键启动
├── install.sh         Linux 二进制一键部署
├── .github/workflows/
│   └── release-linux.yml  x64/ARM64 二进制包发布
├── scripts/
│   └── build-linux-bundle.sh  Linux 发布包构建与校验
├── lib/
│   ├── config.js      运行配置与后台 URL
│   ├── http.js        极简路由/静态文件框架
│   ├── db.js          node:sqlite 数据层 + 示例数据
│   ├── auth.js        密码哈希(scrypt)与会话签名(HMAC)
│   ├── visitors.js    匿名访客、文章去重阅读、可信代理归属地
│   ├── media.js       数据目录图片上传与校验
│   └── md.js          Markdown 渲染器(前后端共用,与设计稿一致)
├── lib/app.js        应用装配(路由/静态/中间件,可被测试直接加载)
├── routes/            前台/后台路由
├── views/             模板函数(纯 JS,无模板引擎)
├── test/              node:test 集成与单元测试
├── public/
│   ├── css/           设计令牌 + 组件样式(Classical 设计系统)+ 自托管字体声明
│   ├── fonts/         Cormorant Garamond / Lora / Noto Serif SC 字体子集(自托管,离线可用)
│   └── js/admin.js    后台交互(实时预览、确认框、自动暂存)
└── data/blog.db       SQLite 数据库(首次启动自动创建并写入示例数据)
```

## 常见操作

- **换端口**:Windows CMD 使用 `set PORT=8080 && node server.js`，PowerShell 使用 `$env:PORT=8080; node server.js`，Bash 使用 `PORT=8080 node server.js`
- **换监听范围**:Bash 使用 `HOST=0.0.0.0 node server.js` 允许局域网/公网直连，或使用 `HOST=127.0.0.1 node server.js` 仅供本机访问；PowerShell 对应设置 `$env:HOST='0.0.0.0'` 或 `$env:HOST='127.0.0.1'` 后运行 `node server.js`。Linux 一键部署请编辑 `/etc/ablog/ablog.env` 中的 `HOST`，然后执行 `sudo systemctl restart ablog`
- **换后台路径**:登录后台的「站点设置」输入新的单段路径并保存。Linux systemd 部署会自动重启；手工执行 `node server.js` 时请自行重启。首次手工部署也可使用 `ADMIN_PATH=/manage_7f3a node server.js`(PowerShell:`$env:ADMIN_PATH='/manage_7f3a'; node server.js`)。
- **备份**:运行中的 SQLite 使用 WAL，不能只复制 `blog.db`。优先用后台 JSON 导出内容；需要完整迁移时先停服务，再整体复制 `data/`（或 `ABLOG_DATA_DIR`）及其中的 `uploads/`，随后再启动服务。后台 JSON 不包含访客 IP、访客记录、密码、照片和站点图标文件
- **重置一切**:删除 `data/` 文件夹后重启（密码会重新随机生成并显示在终端）
- **忘记密码**:删除 `data/` 文件夹重启(会连数据一起重置,先备份 `blog.db`;或用 SQLite 工具删掉 `settings` 表里 `admin_pass` 那行再重启)
- **订阅邮箱**:访客提交的邮箱存在 `subscribers` 表里(系统不发信,导出后可自行群发)

## 部署到公网(可选)

Linux 服务器推荐使用上方的二进制一键部署。一键安装器默认选择 `HOST=0.0.0.0`，安装完成后可通过 `http://服务器IP:端口` 直连；选择“仅本机”时使用 `HOST=127.0.0.1`，供同机的 Nginx/Caddy 反向代理访问。手动部署时，使用 Node 22.13+（22.x）或 23.4+ 执行 `node server.js` 即可；服务默认监听 `127.0.0.1`，需要对外绑定时显式设置 `HOST=0.0.0.0`。

ABlog 自身只提供 HTTP。正式公网部署应使用 Nginx/Caddy 提供 HTTPS，并设置环境变量 `SITE_URL=https://你的域名`（仅允许协议、主机和可选端口）。`SITE_URL` 会用于 RSS、站点地图等绝对链接、跨站 POST 校验，并让会话 Cookie 启用 `Secure`；反向代理应覆盖客户端传入的转发头，并将 Node 端口限制为仅本机或可信网络可达。

首次部署前可同时设置监听地址、强密码和后台路径:`HOST=0.0.0.0 ADMIN_PASSWORD=你的密码 ADMIN_PATH=/manage_7f3a node server.js`。密码仅在数据库首次初始化时生效；不设置或设为空值时会随机生成。后台路径默认从环境变量读取，后台设置修改后会保存到数据目录并在下次启动时优先使用。数据默认在 `data/blog.db`，也可通过 `ABLOG_DATA_DIR` 指定独立的非静态数据目录；解析符号链接后的实际路径也不能位于 `public/` 内。

维护者推送 `v*` 标签后,GitHub Actions 会自动生成 Linux x64/ARM64 二进制包和 SHA-256 校验文件:

```bash
git tag v1.0.0
git push origin v1.0.0
```

# 默·博客

一册记录日常的随笔——古典衬线风格的个人博客系统,按 Claude Design 设计稿「默·博客」完整实现。

**零依赖**:只用 Node.js 内置模块(内置 http 服务 + 内置 SQLite),不需要 `npm install`,解压即可运行。

## Linux 二进制一键部署

支持使用 systemd 的 x86_64/ARM64 Linux,无需预装 Node.js。安装器会下载并校验最新 GitHub Release,创建独立服务用户,并把数据持久化到 `/var/lib/ablog`:

```bash
curl -fsSL https://raw.githubusercontent.com/Su-cyber-art/ABlog/main/install.sh | sudo bash
```

首次安装会交互询问监听端口、后台路径、公网地址和后台密码。密码输入不会回显;再次执行同一命令升级时会保留 `/etc/ablog/ablog.env` 和现有博客数据。

无人值守部署可通过环境变量传入全部配置:

```bash
curl -fsSL https://raw.githubusercontent.com/Su-cyber-art/ABlog/main/install.sh \
  | sudo env ABLOG_NONINTERACTIVE=1 \
      PORT=3000 \
      ADMIN_PATH='/manage_7f3a' \
      ADMIN_PASSWORD='换成至少8位的强密码' \
      SITE_URL='https://blog.example.com' \
      bash
```

无人值守模式未传 `ADMIN_PASSWORD` 时会自动生成随机密码并在完成时显示。`ADMIN_PATH` 只能是安全的单段路径,例如 `/admin` 或 `/manage_7f3a`;自定义路径不能替代强密码。

- 服务状态:`sudo systemctl status ablog`
- 实时日志:`sudo journalctl -u ablog -f`
- 环境配置:`/etc/ablog/ablog.env`
- 博客数据:`/var/lib/ablog/blog.db`

> 二进制包通过 `v*` 标签自动发布,支持 glibc Linux;Alpine Linux 暂不支持。

## 快速开始

1. 安装 [Node.js](https://nodejs.org)(需要 **22.5 或更高版本**,建议直接装 LTS)
2. 双击 `start.bat`(或在本目录执行 `node server.js`)
3. 浏览器打开:
   - 前台 <http://localhost:3000>
   - 后台 <http://localhost:3000/admin>

**后台初始密码:`mo-admin`** —— 登录后请在「站点设置」里改掉。

> 启动时若看到 `ExperimentalWarning: SQLite is an experimental feature` 属正常提示,不影响使用。

## 功能

**前台**

- 首页:文章列表(分类·日期、摘要、阅读/评论数)、分页、分类/标签/订阅侧栏
- 文章页:Markdown 正文、标签、评论区、访客留言(提交后进入待审)
- 归档:按年份分组,分类筛选
- 关于:作者照片位 + 自述(把 `portrait.jpg` 放进 `public/` 即显示照片)
- RSS 输出:`/feed.xml`;移动端为响应式版式(按设计稿移动端首页实现)

**后台**(密码登录)

- 仪表盘:已发布/草稿/待审评论/总阅读统计、最近文章、待审评论快捷处理
- 文章管理:全部/已发布/草稿筛选,查看/编辑/删除
- 写作:Markdown 双栏实时预览编辑器(`# 标题`、`**粗体**`、`*斜体*`、`> 引用`、`- 列表`、`--- 分隔线`、`` `代码` ``、`[链接](url)`)、字数统计、存草稿/发布
- 分类与标签:增删管理;使用中的分类不可删除;删除标签会同时清掉文章上的引用
- 评论管理:待审/已通过/垃圾,通过/标垃圾/删除
- 站点设置:站点名称、副标题、作者署名、页脚文字、每页文章数、修改后台密码、恢复示例数据

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
│   └── md.js          Markdown 渲染器(前后端共用,与设计稿一致)
├── routes/            前台/后台路由
├── views/             模板函数(纯 JS,无模板引擎)
├── public/
│   ├── css/           设计令牌 + 组件样式(Classical 设计系统)+ 自托管字体声明
│   ├── fonts/         Cormorant Garamond / Lora / Noto Serif SC 字体子集(自托管,离线可用)
│   └── js/admin.js    后台交互(实时预览、确认框)
└── data/blog.db       SQLite 数据库(首次启动自动创建并写入示例数据)
```

## 常见操作

- **换端口**:`set PORT=8080 && node server.js`(PowerShell:`$env:PORT=8080; node server.js`)
- **换后台路径**:`ADMIN_PATH=/manage_7f3a node server.js`(PowerShell:`$env:ADMIN_PATH='/manage_7f3a'; node server.js`)
- **备份**:复制 `data/blog.db` 即可(建议顺带备份 `public/portrait.jpg`)
- **重置一切**:删除 `data/` 文件夹后重启(密码也会重置为 `mo-admin`)
- **忘记密码**:删除 `data/` 文件夹重启(会连数据一起重置,先备份 `blog.db`;或用 SQLite 工具删掉 `settings` 表里 `admin_pass` 那行再重启)
- **订阅邮箱**:访客提交的邮箱存在 `subscribers` 表里(系统不发信,导出后可自行群发)

## 部署到公网(可选)

Linux 服务器推荐使用上方的二进制一键部署。手动部署时,任何能跑 Node ≥22.5 的主机都可以:`node server.js` 即可,数据默认在 `data/blog.db`;可通过 `ABLOG_DATA_DIR` 指定独立数据目录。
建议前面加一层 Nginx/Caddy 做 HTTPS,并设置环境变量 `SITE_URL=https://你的域名`(用于 RSS 链接)。
首次部署前可同时设置强密码和后台路径:`ADMIN_PASSWORD=你的密码 ADMIN_PATH=/manage_7f3a node server.js`。密码仅在数据库首次初始化时生效;后台路径每次启动都从环境变量读取。

维护者推送 `v*` 标签后,GitHub Actions 会自动生成 Linux x64/ARM64 二进制包和 SHA-256 校验文件:

```bash
git tag v1.0.0
git push origin v1.0.0
```

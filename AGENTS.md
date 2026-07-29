# ABlog Agent Guidelines

本文件适用于整个仓库。任何自动化编码代理在修改代码、文档、部署脚本或发布配置前，都必须先阅读并遵守本文件。

## 项目定位

ABlog（默·博客）是一个零第三方运行时依赖的个人博客：

- CommonJS JavaScript，最低 Node.js 版本为 22.13。
- HTTP 服务、密码学和 SQLite 分别使用 Node.js 内置的 `http`、`crypto`、`node:sqlite`。
- 页面由纯 JavaScript 模板函数服务端渲染，没有模板引擎、打包器或前端框架。
- 数据保存在单个 SQLite 数据库中，首次启动自动建表并写入示例数据。
- Linux Release 内置官方 Node.js 可执行文件，支持 glibc Linux x64 和 arm64。

“零依赖、解压即用、数据易迁移”是项目的核心特性。没有明确收益和维护方案时，不得新增 npm 运行时依赖、构建步骤或外部服务。

## 仓库结构

| 路径 | 职责 |
| --- | --- |
| `server.js` | 组合配置、HTTP 框架、前后台路由和静态资源 |
| `lib/http.js` | 路由、请求体、Cookie、静态文件和响应助手 |
| `lib/db.js` | SQLite schema、首次初始化、预编译查询和事务 |
| `lib/auth.js` | scrypt 密码哈希、HMAC 会话令牌、Cookie 解析 |
| `lib/config.js` | 环境配置校验和后台 URL 生成 |
| `lib/md.js` | Node 与浏览器共用的安全 Markdown 子集渲染器 |
| `lib/media.js` | 关于页照片与站点图标的校验、原子写入和移除 |
| `routes/front.js` | 前台页面、评论、订阅和 RSS |
| `routes/admin.js` | 登录保护及所有后台读写操作 |
| `views/*.js` | 纯 HTML 模板函数和共享 UI 片段 |
| `public/css/site.css` | 设计令牌、组件、页面和响应式样式 |
| `public/css/fonts.css` | 设计稿导出的自托管字体声明 |
| `public/js/admin.js` | 后台确认提示、Markdown 预览和字数统计 |
| `install.sh` | Linux 交互式/无人值守安装、升级和回滚 |
| `scripts/build-linux-bundle.sh` | 组装带 Node.js 的 Linux 发布包 |
| `.github/workflows/release-linux.yml` | `v*` 标签触发的双架构 Release |

`data/`、`dist/`、`node_modules/` 和日志是本地产物，不得提交。未跟踪的 `_to_delete/`、`design/` 以及其他用户素材默认视为用户所有，除非任务明确要求，否则不要读取后改写、删除或加入提交。

## 开始工作

1. 先查看 `git status -sb`，区分任务改动和用户已有改动。
2. 优先使用 FastCtx 的 `read`、`grep`、`glob` 检查本地文件；不可用时使用 `rg`、`rg --files` 和普通只读命令。
3. 修改前阅读完整调用链，而不是只看目标文件。例如后台页面通常同时涉及路由、视图、共享 UI、CSS 和配置。
4. 用 `apply_patch` 完成小型或语义化修改。机械替换可使用能够保留编码和换行的工具。
5. 只修改任务需要的文件，不顺手重构无关代码，也不覆盖用户未提交的改动。

## 运行配置

支持的环境变量如下：

| 变量 | 含义 |
| --- | --- |
| `PORT` | HTTP 监听端口，默认 `3000` |
| `HOST` | HTTP 监听地址；手工启动默认 `127.0.0.1`，安装器默认 `0.0.0.0` 并可选仅本机 |
| `SITE_URL` | 公网站点源，用于绝对链接、POST 来源校验和 HTTPS `Secure` Cookie |
| `ADMIN_PATH` | 后台根路径，默认 `/admin` |
| `ADMIN_PASSWORD` | 仅数据库首次初始化时使用的后台密码；手工启动为空或安装器未输入时随机生成 |
| `ABLOG_DATA_DIR` | 数据目录，默认仓库内的 `data/` |

配置约束：

- 应用未设置 `HOST` 时必须默认监听 `127.0.0.1`。安装器只提供 `0.0.0.0`（默认，允许服务器 IP 直连）和 `127.0.0.1`（仅本机，供反向代理使用）两种模式，完成页不得在仅本机模式下误报公网地址。
- 安装器升级或复用旧配置时必须保留已有环境值；旧 `/etc/ablog/ablog.env` 缺少 `HOST` 时只补写 `HOST=0.0.0.0`，保持旧版本的直连语义。
- `SITE_URL` 必须是仅含 HTTP(S) 协议、主机和可选端口的规范站点源。配置后同时作为 RSS/站点地图等绝对链接的根地址、POST `Origin` 校验基准，并在 HTTPS 下启用会话 Cookie 的 `Secure` 属性。
- 所有后台 URL 必须通过 `ADMIN_PATH` 或 `adminUrl()` 生成，禁止在路由、跳转、表单或导航中硬编码 `/admin`。
- `ADMIN_PATH` 是单段 ASCII 路径，允许字母、数字、下划线和连字符，最长 64 个路径字符。
- 后台「站点设置」修改路径时，将有效值原子写入 `ABLOG_DATA_DIR/admin-path.json`；该文件在后续启动时优先于首次部署的 `ADMIN_PATH` 环境变量。无效或损坏的覆盖文件必须安全回退到环境变量，Web 进程不得改写 `/etc/ablog/ablog.env`。
- 不得使用与前台和静态资源冲突的保留路径。修改保留路径时必须同步 `lib/config.js` 和 `install.sh`。
- `ADMIN_PASSWORD` 不是持续覆盖设置。已有数据库中的密码只能通过后台设置或明确的数据迁移修改。安装器交互留空或无人值守未传值时必须生成随机密码，并明确提示它会在本次安装结果中显示。
- `ABLOG_DATA_DIR` 解析符号链接后的实际路径不得位于 `public/` 静态目录内。
- 配置校验应在加载 `lib/db.js` 前完成，避免无效配置触发数据库创建和示例数据写入。

## 数据库规则

`lib/db.js` 在被 `require()` 时会创建目录、打开数据库、建表、生成会话密钥并可能写入示例数据。测试或脚本不得无意加载用户的正式数据库。

- 所有测试必须设置独立的临时 `ABLOG_DATA_DIR`，并在进程退出后清理。
- 不得把真实数据库、WAL/SHM 文件、密码哈希或会话密钥提交到 Git。
- SQL 参数必须使用预编译语句的占位符，不得拼接用户输入。
- 多表或多行的关联写入使用 `tx()`；失败时必须保持可回滚。
- schema 变更要兼容已有数据库。优先使用可重复执行的增量迁移，不能要求用户删除 `data/`。
- `seedAll()` 是破坏性操作。保持其“重置内容但保留登录密码与会话密钥”的现有语义，除非任务明确改变产品行为。
- 删除文章时保持文章与评论的一致性；修改分类、标签或状态时检查所有引用关系。

## HTTP 与路由规则

- 前台路由放在 `routes/front.js`，后台路由放在 `routes/admin.js`。
- 后台读取和写入都必须经过 `guard()`，登录和登出路由除外。
- 改变状态的操作使用 `POST`，不要用 `GET` 执行删除、审核、重置或设置更新。
- 动态 ID 先按十进制正整数校验，再访问数据库。
- 用户输入要做合理的长度限制、枚举校验和规范化。
- 路由处理器返回 `false` 表示未命中并落到 404；不要把它与普通空响应混用。
- 保留 `lib/http.js` 的按路由请求体限制（公开表单 64 KiB，站点图标 768 KiB，已登录编辑器 5 MiB，备份/头像 20 MiB）和静态路径穿越防护；编辑器业务层正文上限为 512 KiB UTF-8。
- 重定向目标应由可信的本地路径生成，不要直接信任请求头或用户输入。
- 新增公开路由或静态前缀时，检查它是否需要加入 `ADMIN_PATH` 的保留路径集合。

## 安全与输出

- 所有进入 HTML 的数据库值、查询参数和表单内容都必须经过 `views/_ui.js` 的 `esc()`。
- 只有经过 `lib/md.js` 处理的正文可以作为 HTML 插入。修改 Markdown 时必须保持“先转义，再解析有限语法”的边界。
- Markdown 链接只允许当前实现认可的协议；不得开放 `javascript:`、`data:` 或任意原始 HTML。
- 密码继续使用带随机盐的 scrypt，令牌继续使用密钥签名和恒定时间比较。
- 会话 Cookie 至少保持 `HttpOnly`、`SameSite=Lax` 和明确的有效期。除安装器为交付本次随机初始密码而在当前终端的完成或失败结果中一次性显示外，不要在日志、页面或错误信息中输出密码、哈希、会话密钥或完整令牌。
- 媒体上传必须按文件内容校验，不能只信任扩展名或 `Content-Type`。自定义 favicon 在浏览器内裁切并栅格化，服务端只接受不超过 512 KiB 的 256 × 256 PNG；不得持久化用户上传的原始 SVG。
- 安全相关失败对用户返回通用信息，具体错误只写入服务端日志。
- 新增写操作时同时考虑鉴权、CSRF、重复提交和输入上限，不以隐藏后台路径代替安全控制。

## 视图与前端

- 视图保持为无副作用的字符串模板函数；查询和写入留在路由/数据层。
- 复用 `head()`、`frontHeader()`、`frontFooter()`、`adminTop()` 和 `adminBottom()`，不要复制整套页面外壳。
- 可复用样式写入 `public/css/site.css`；沿用现有 CSS 变量、细边框、小圆角、衬线字体和克制的金色强调色。
- 同时维护桌面端和 `max-width: 740px` 移动端布局。表格、编辑器、侧栏和长文本不能溢出或互相遮挡。
- 可见文本默认使用简体中文，并保持现有安静、简洁的语气。
- 自定义 favicon 必须保存在 `ABLOG_DATA_DIR/uploads`，不能改写 Release 内的 `public/favicon.svg`。页面通过 `siteSettings()` 输出默认 SVG 或带随机版本号的自定义 PNG，替换后必须让当前页面和后续请求使用新 URL。
- `public/css/fonts.css` 和 `public/fonts/` 是配套的自托管字体资产。不要手工改动大量 `unicode-range`；字体变更必须同时验证声明、文件名和离线加载。
- `lib/md.js` 同时运行在 Node 和浏览器中，不能引入只存在于单一环境的 API。

## 安装与发布

- Shell 脚本保持 Bash、`set -Eeuo pipefail` 和 LF 换行；`start.bat` 保持 CRLF。
- 安装器升级时必须保留 `/var/lib/ablog` 和 `/etc/ablog/ablog.env` 中的已有配置值；只允许为兼容迁移补充缺失项，例如旧配置缺少的 `HOST=0.0.0.0`。
- 下载继续强制 HTTPS、校验 SHA-256，并在解压前验证归档路径。
- Release 安装采用新目录加原子符号链接切换；启动失败必须能够回滚到旧版本。
- systemd 服务继续使用独立的 `ablog` 用户和现有沙箱限制。新增可写目录时同步 `ReadWritePaths`。只有安装器写入的 `ABLOG_SYSTEMD_SERVICE=1` 能触发 ABlog 的自动重启；不得用通用 `INVOCATION_ID` 判断服务归属，因为 CI Runner 等 systemd 子进程也会继承它。涉及该分支时同时测试“继承 `INVOCATION_ID` 不重启”和“专用标记会重启”。
- 交互模式和 `ABLOG_NONINTERACTIVE=1` 都必须可用。新增配置项时同步提示、环境文件、结果输出、README 和应用端校验。
- 涉及监听配置时同时测试 `0.0.0.0` 与 `127.0.0.1`、仅本机模式的完成页，以及旧环境文件缺少 `HOST` 的升级迁移。涉及随机密码时同时覆盖交互留空、无人值守未传值、完成结果和失败提示，且不得写入 journal。
- `scripts/build-linux-bundle.sh` 必须只打包运行所需文件，并校验下载的官方 Node.js 归档。
- 发布工作流继续为 x64、arm64 同时生成 `.tar.gz` 和 `.sha256`；修改 Node.js 版本时同步 workflow 默认值和相关文档。

## 验证要求

验证范围应与风险相匹配，至少执行以下相关检查。

所有 JavaScript 改动：

```powershell
$files = rg --files -g '*.js'
foreach ($file in $files) { node --check $file }
```

Shell 或发布改动：

```bash
bash -n install.sh
bash -n scripts/build-linux-bundle.sh
```

运行时或数据库改动：

- 使用临时 `ABLOG_DATA_DIR`、非默认端口和测试密码启动服务。
- 检查首页、文章、404、后台登录、受保护跳转和至少一个相关写操作。
- 测试结束后停止服务并只清理已验证的临时目录。

后台路径改动：

- 分别测试默认 `/admin` 和一个自定义路径。
- 自定义路径下检查路由、重定向、导航、表单 action 和登录 Cookie。
- 确认旧 `/admin` 在自定义配置下不会意外暴露后台。

前端或样式改动：

- 在桌面和窄屏视口实际打开受影响页面。
- 检查布局溢出、文本截断、表单可用性、焦点样式和控制台错误。

安装器或 Release 改动：

```bash
bash scripts/build-linux-bundle.sh x64 24.15.0
bash scripts/build-linux-bundle.sh arm64 24.15.0
```

- 校验生成的 SHA-256。
- 检查归档中包含新增运行文件且不包含 `data/`、`dist/`、`.git/` 或开发素材。
- 至少从 x64 归档启动一次服务并完成 HTTP 冒烟测试。

仓库使用 Node 内置的 `node:test` 自动化测试，不引入第三方测试框架。不要把 `node --check` 当成功能测试；高风险改动必须补充可重复的回归测试或明确记录人工验证。

## 文档与 Git

- 用户可见行为、环境变量、目录、默认值、安装命令或发布方式发生变化时，同步更新 `README.md`。
- 文档命令必须可直接执行，区分 PowerShell、Windows CMD 和 Bash 语法。
- 提交前运行 `git diff --check` 并复查 `git diff --stat`。
- 混合工作树只暂存任务相关路径，不使用无差别的 `git add -A`。
- 不提交 `data/`、`dist/`、临时测试目录、日志、个人设计素材或密钥。
- 未经用户明确要求，不创建标签、GitHub Release、PR，也不直接推送默认分支。
- 提交信息应简短说明行为变化。发布标签使用 `v*` 形式，并在推送前确认双架构构建可用。

## 完成标准

任务只有在以下条件全部满足后才算完成：

- 行为与用户请求一致，并保持零依赖和现有架构边界。
- 安全、数据兼容性、自定义后台路径和升级流程没有退化。
- 相关语法检查、功能测试和视觉检查已通过。
- 文档与实现一致，生成物和用户文件未被误提交。
- 最终说明列出改动、验证结果、未执行的检查以及仍存在的风险。

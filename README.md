# The Vinyl

一个无框架的唱片收藏交互原型。桌面端以真实 3D 封套侧面构成横向唱片架，移动端改为纵向唱片堆叠；支持拖动、滚轮、键盘浏览。点击专辑后，封套会从侧视自然转正，黑胶从封套中滑出并持续旋转。

这版把封套正面、背面、左右脊背、上下厚度统一到同一套 CSS 3D 几何中，不再用独立的假脊背元素手工对位，因此侧面透视和厚度会始终跟随封套本体。

## 本地运行

先安装 Node.js 22 和项目依赖：

```bash
npm install
```

普通视觉开发可以使用项目自带的本地服务器，这样页面和 `/api/lyrics` 歌词接口都会生效：

```bash
python3 server.py --port 8000
```

然后访问 `http://127.0.0.1:8000/`。也可以换成其他空闲端口。

网易云扫码登录依赖 Vercel Functions，本地联调该功能时使用 `npx vercel dev`；部署到 Vercel 后无需额外进程。

## 音乐平台登录

右上角现在只有一个音乐平台按钮。未连接时点击会出现 Spotify、Apple Music、网易云音乐三个选项；连接成功后按钮只保留当前平台图标，旁边仍有退出按钮。一次只激活一个平台，切换平台时先退出当前平台。

### Spotify

Spotify 逻辑保持原实现：项目使用纯前端 Authorization Code with PKCE，不需要也不应该在网页里放 Client Secret。

Spotify Developer Dashboard 中只需要注册一次不带端口的 loopback Redirect URI：

```text
http://127.0.0.1/
```

Spotify 允许这个 loopback 地址在授权请求中使用动态端口，所以 `8000`、`4173`、`5173` 等端口都能登录。代码会根据当前页面自动生成回调地址；如果从 `http://localhost:端口` 打开，点击登录时会自动切换到同端口的 `127.0.0.1`。

公开部署时必须使用 HTTPS，并把完整部署地址加入 Spotify Dashboard 的 Redirect URIs；Spotify 不允许 `http://localhost`、普通局域网 IP 或通配符回调地址。

这个项目会根据正在访问的页面自动生成回调地址。部署到 Vercel 后，建议在 Spotify Developer Dashboard 中保留并添加以下地址（必须完整匹配，包含末尾 `/`）：

```text
http://127.0.0.1/
https://你的项目名.vercel.app/
https://vinyll.leoenchanted.top/
```

Vercel Preview 每次可能产生不同域名，而 Spotify 不支持通配符 Redirect URI，因此 Spotify 登录应在固定的 Production 域名或自定义域名上测试。Spotify Development Mode 还要求应用拥有者为 Premium 用户，登录账号需要加入应用的用户 allowlist；播放、暂停和切歌功能本身也需要 Spotify Premium。

授权完成后，页面读取收藏专辑并用真实专辑封面、标题和歌手替换演示数据。令牌仍存放在当前浏览器的 `localStorage`，支持自动刷新与主动退出。

### Apple Music

当前站主尚未加入付费 Apple Developer Program，因此网页中的 Apple Music 入口会以黑色“暂不可用”状态展示，不会加载 MusicKit 或尝试登录。下面的接入代码和配置说明保留，待站主具备官方开发者权限后即可启用。

Apple Music 使用官方 MusicKit。浏览器只取得短期 Developer Token 和 Music User Token，`.p8` 私钥只保存在 Vercel 服务端环境变量中，不会写进前端仓库。

1. 加入 [Apple Developer Program](https://developer.apple.com/programs/)，在 Certificates, Identifiers & Profiles 中创建支持 MusicKit 的 Media ID。
2. 创建 Media Services 私钥，下载 `.p8` 文件，并记下 Key ID；Team ID 可在 Membership 页面找到。
3. 在 Vercel 项目 Settings → Environment Variables 添加：

```text
APPLE_MUSIC_TEAM_ID=你的 Team ID
APPLE_MUSIC_KEY_ID=你的 Key ID
APPLE_MUSIC_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
APPLE_MUSIC_ORIGINS=https://vinyll.leoenchanted.top,https://你的项目名.vercel.app
```

`APPLE_MUSIC_PRIVATE_KEY` 可以直接粘贴多行 `.p8` 内容，也可以将换行写成 `\n`。`APPLE_MUSIC_ORIGINS` 必须列出实际访问页面的完整 Origin，不带末尾 `/`；使用 Vercel Preview 时需要把对应 Preview Origin 也显式加入。

4. 重新部署，在网站选择 Apple Music，浏览器会显示 Apple 官方授权窗口。

Apple Music 用户需要有效订阅才能访问个人资料库和完整播放。MusicKit 不使用 Spotify 那种 Redirect URI；这里真正决定网页能否调用的是 Developer Token 中的 Origin 白名单。

### 网易云音乐

网易云入口包含两项彼此独立的能力：

- **收藏唱片架：**使用网易云音乐 App 扫码登录，网页读取用户收藏的专辑、封面、歌手、发行时间和完整曲目列表。点击曲目不会在网页播放。
- **Windows / macOS 本地播放同步（可选）：**原生助手只读网易云桌面客户端当前歌曲、封面、进度和播放状态，Vinyll 据此展示当前黑胶和同步歌词。暂停、切歌和拖动进度始终在网易云 App 内完成。

收藏唱片架部署在 Vercel Functions 上，使用 `@neteasecloudmusicapienhanced/api` 访问对应的只读接口。登录 Cookie 仅保存在同源、`HttpOnly`、`SameSite=Lax` 的浏览器会话 Cookie 中，不写入 `localStorage`，前端也无法读取；项目不接触用户密码。请求按页读取、主动限速，并在当前标签页缓存收藏元数据 10 分钟，以减少重复请求和触发风控的概率。

需要当前歌曲和歌词的用户再安装对应系统的本地助手即可；只浏览收藏专辑不需要助手：

- Windows：[下载 Windows x64 助手](https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseBridge-win-x64.exe)，双击完成当前用户安装并启动。
- macOS：[下载 Universal 助手](https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseCompanion-macOS-universal.zip)，解压后拖入“应用程序”，首次启动右键选择“打开”。支持 macOS 15.4 及以上的 Apple Silicon 与 Intel Mac。
- 打开网易云音乐桌面客户端并播放歌曲，再回到网站；浏览器首次询问本地网络访问时选择允许。

扫码成功后网站会自动展示助手下载说明；之后也可以随时点击右上角已连接的网易云图标重新打开。桌面宽度下还会显示“下载播放助手”快捷入口。

线上网页不能直接调用桌面系统媒体 API，所以需要本地播放同步的访客必须在自己的电脑上运行助手。助手只监听 `127.0.0.1:17863`，只提供 `/health` 与 `/state` 两个 GET 接口，默认只接受本地网页和 `https://vinyll.leoenchanted.top`；它不读取扫码登录 Cookie，也不上传桌面播放信息。

macOS 助手读取网易云官方 Mac 客户端发布到系统“正在播放”中心的信息，不需要 Node.js、mpv、ncm-cli 或开放平台 App ID。它使用 macOS 的 MediaRemote 系统能力，系统大版本升级后可能需要跟随适配。Linux 暂不提供当前播放助手，但收藏专辑扫码和曲目浏览不受影响。完整安装、隐私和排错说明见 [`bridge/README.md`](bridge/README.md)。

## 代码结构

项目保持无框架、无打包步骤，同时按职责拆分代码：

- `assets/js/providers/`：Spotify、Apple Music、网易云适配器及平台注册
- `assets/js/albums/`：封面生成、专辑详情、唱片架交互
- `assets/js/playback/`：播放状态、控制与正在播放视图
- `assets/js/lyrics/` 和 `assets/js/services/`：歌词界面、同步与请求
- `assets/js/app/`：共享状态、事件绑定和页面启动
- `assets/css/`：按页面基础、平台、播放器、封套、黑胶、详情、歌词和响应式样式拆分
- `backend/lyrics/`：LRCLIB、QQ 音乐、网易云歌词源及聚合缓存
- `backend/netease/`：网易云会话安全、数据归一化与上游错误处理
- `api/`：Vercel 歌词、Apple Music Token 和网易云 Functions
- `bridge/`：Windows SMTC 与 macOS MediaRemote 原生助手

完整目录说明和常见修改入口见 [`docs/architecture.md`](docs/architecture.md)。

## 部署到 Vercel

1. 在 Vercel 中导入这个 GitHub 仓库。
2. Framework Preset 选择 `Other`；项目根目录保持仓库根目录。
3. 不需要填写 Build Command 或 Output Directory；Vercel 会按照 `package.json` 安装 Node 22 依赖。如果要启用 Apple Music，按上文添加四个 Apple Music 环境变量。
4. 部署完成后，把稳定的 Production 地址加入 Spotify Redirect URIs。
5. 绑定 `vinyll.leoenchanted.top` 后，再把 `https://vinyll.leoenchanted.top/` 加入 Spotify Redirect URIs。

根目录静态文件会由 Vercel CDN 托管，`api/lyrics.py` 会部署为 `/api/lyrics` Python Function，`api/apple-token.js` 和 `api/netease/` 会部署为 Node.js Functions。Spotify 使用纯前端 PKCE，因此不需要 Spotify Client Secret；网易云扫码登录也不需要开放平台 App ID 或额外 Vercel 环境变量。

`vercel.json` 将 Functions 固定在香港区域并给网易云接口设置 30 秒上限，以减少中国大陆访问延迟。第三方非官方接口仍可能受到网易云策略、账号状态或 Vercel 出口 IP 风控影响；代码会返回明确错误并允许用户稍后重试，但不能从技术上承诺永不触发风控。

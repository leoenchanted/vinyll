# The Vinyl

一个无框架的唱片收藏交互原型。桌面端以真实 3D 封套侧面构成横向唱片架，移动端改为纵向唱片堆叠；支持拖动、滚轮、键盘浏览。点击专辑后，封套会从侧视自然转正，黑胶从封套中滑出并持续旋转。

这版把封套正面、背面、左右脊背、上下厚度统一到同一套 CSS 3D 几何中，不再用独立的假脊背元素手工对位，因此侧面透视和厚度会始终跟随封套本体。

## 本地运行

使用项目自带的本地服务器运行，这样页面和 `/api/lyrics` 歌词接口都会生效：

```bash
python3 server.py --port 8000
```

然后访问 `http://127.0.0.1:8000/`。也可以换成其他空闲端口。

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

Windows 用户通过本地助手连接网易云音乐官方桌面客户端：下载并双击一个 EXE 即可，不需要 Node.js、mpv、ncm-cli、开放平台 App ID 或 Private Key。助手会随当前用户登录自动运行，优先通过 Windows SMTC 同步歌曲信息和播放控制。对于主动关闭 SMTC 的网易云 3.x，助手会自动切换到只针对 `cloudmusic.exe` 的本机兼容模式，继续同步歌名、歌手、专辑、封面、时长及播放状态。

1. 从 [GitHub Releases](https://github.com/leoenchanted/vinyll/releases/latest/download/Vinyll.NeteaseBridge-win-x64.exe) 下载 Windows 助手。
2. 双击一次完成当前用户安装并启动。
3. 在网易云音乐桌面客户端播放歌曲。
4. 回到网站选择“网易云音乐”，首次出现本地网络权限提示时选择允许。

线上网页仍然不能直接调用 Windows API，所以每位访客需要在自己的 Windows 电脑上运行助手。助手只监听 `127.0.0.1:17863`，默认只接受本地网页和 `https://vinyll.leoenchanted.top`，网易云登录信息始终留在官方客户端中。

macOS / Linux 暂时保留 `ncm-cli + mpv + node bridge/server.js` 方式。完整安装、隐私和排错说明见 [`bridge/README.md`](bridge/README.md)。

网易云连接暂不伪造收藏专辑；连接后保留现有唱片架内容，只同步桌面客户端当前歌曲和播放控制。

## 代码结构

项目保持无框架、无打包步骤，同时按职责拆分代码：

- `assets/js/providers/`：Spotify、Apple Music、网易云适配器及平台注册
- `assets/js/albums/`：封面生成、专辑详情、唱片架交互
- `assets/js/playback/`：播放状态、控制与正在播放视图
- `assets/js/lyrics/` 和 `assets/js/services/`：歌词界面、同步与请求
- `assets/js/app/`：共享状态、事件绑定和页面启动
- `assets/css/`：按页面基础、平台、播放器、封套、黑胶、详情、歌词和响应式样式拆分
- `backend/lyrics/`：LRCLIB、QQ 音乐、网易云歌词源及聚合缓存
- `api/`：Vercel 歌词和 Apple Music Token Functions
- `bridge/`：macOS / Linux CLI 桥接及 Windows SMTC 助手

完整目录说明和常见修改入口见 [`docs/architecture.md`](docs/architecture.md)。

## 部署到 Vercel

1. 在 Vercel 中导入这个 GitHub 仓库。
2. Framework Preset 选择 `Other`；项目根目录保持仓库根目录。
3. 不需要填写 Build Command 或 Output Directory；如果要启用 Apple Music，按上文添加四个 Apple Music 环境变量。
4. 部署完成后，把稳定的 Production 地址加入 Spotify Redirect URIs。
5. 绑定 `vinyll.leoenchanted.top` 后，再把 `https://vinyll.leoenchanted.top/` 加入 Spotify Redirect URIs。

根目录静态文件会由 Vercel CDN 托管，`api/lyrics.py` 会自动部署为 `/api/lyrics` Python Function，`api/apple-token.js` 会部署为 `/api/apple-token` Node.js Function。Spotify 使用纯前端 PKCE，因此不需要在 Vercel 中配置 Spotify Client Secret；网易云凭证也只配置在用户本机的官方 CLI 中。

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

网易云在 2026 年发布了官方 [`@music163/ncm-cli`](https://www.npmjs.com/package/@music163/ncm-cli)，它本身支持 macOS、Windows 和 Linux。Vercel 网页无法在任何桌面系统中直接启动本地 App 或 CLI，所以三个系统都需要用户主动运行本仓库的本地桥接；网页不能也不会静默安装本机软件。

1. 在[网易云音乐开放平台](https://developer.music.163.com/st/developer/apply/account?type=INDIVIDUAL)完成入驻，取得 App ID 和 Private Key。
2. 安装 Node.js 18+ 与 mpv。
3. 安装、配置并扫码登录官方 CLI：

```bash
npm install -g @music163/ncm-cli
ncm-cli configure
ncm-cli login
```

4. 在克隆下来的 Vinyll 仓库根目录运行：

```bash
node bridge/server.js
```

5. 保持终端窗口运行，回到网页再次选择“网易云音乐”。

macOS 可以用 `brew install mpv`；Windows 需要安装 Windows 版 mpv 并把 `mpv.exe` 所在目录加入 PATH。完整说明见 [`bridge/README.md`](bridge/README.md)。

桥接只监听 `127.0.0.1:17863`，默认只接受本地网页和 `https://vinyll.leoenchanted.top`，并且只允许播放、暂停、上一首、下一首等固定命令。App ID、Private Key 与网易云登录状态均由官方 CLI 保存在本机，不上传到 Vercel。

当前官方 CLI 可以稳定提供本机播放控制，但没有承诺供网页消费的收藏专辑 JSON 输出，所以网易云连接后会保留现有唱片架内容，并同步它能够识别的当前歌曲与播放控制；没有伪造收藏资料。后续官方若开放稳定的 Web OAuth / 收藏接口，可以在现有 provider 层中直接补上。

相关代码：

- `spotify.js`：Spotify PKCE、状态校验、令牌交换/刷新和 Web API 请求
- `apple-music.js`：Apple MusicKit 授权、资料库和网页播放
- `netease-music.js`：网易云本地桥接客户端
- `music-providers.js`：三个平台的单选状态与统一入口
- `app.js`：收藏专辑映射、拖动/滚轮/键盘浏览、选中动画
- `styles.css`：封套 3D 几何、黑胶材质、响应式布局
- `server.py`：本地静态服务器与歌词接口
- `api/lyrics.py`：Vercel 上的同源歌词 Function
- `api/apple-token.js`：在 Vercel 服务端签发短期 Apple Music Developer Token
- `bridge/server.js`：网易云官方 CLI 的跨平台本机桥接

## 部署到 Vercel

1. 在 Vercel 中导入这个 GitHub 仓库。
2. Framework Preset 选择 `Other`；项目根目录保持仓库根目录。
3. 不需要填写 Build Command 或 Output Directory；如果要启用 Apple Music，按上文添加四个 Apple Music 环境变量。
4. 部署完成后，把稳定的 Production 地址加入 Spotify Redirect URIs。
5. 绑定 `vinyll.leoenchanted.top` 后，再把 `https://vinyll.leoenchanted.top/` 加入 Spotify Redirect URIs。

根目录静态文件会由 Vercel CDN 托管，`api/lyrics.py` 会自动部署为 `/api/lyrics` Python Function，`api/apple-token.js` 会部署为 `/api/apple-token` Node.js Function。Spotify 使用纯前端 PKCE，因此不需要在 Vercel 中配置 Spotify Client Secret；网易云凭证也只配置在用户本机的官方 CLI 中。

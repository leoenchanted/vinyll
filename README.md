# The Vinyl

一个无框架的唱片收藏交互原型。桌面端以真实 3D 封套侧面构成横向唱片架，移动端改为纵向唱片堆叠；支持拖动、滚轮、键盘浏览。点击专辑后，封套会从侧视自然转正，黑胶从封套中滑出并持续旋转。

这版把封套正面、背面、左右脊背、上下厚度统一到同一套 CSS 3D 几何中，不再用独立的假脊背元素手工对位，因此侧面透视和厚度会始终跟随封套本体。

## 本地运行

使用项目自带的本地服务器运行，这样页面和 `/api/lyrics` 歌词接口都会生效：

```bash
python3 server.py --port 8000
```

然后访问 `http://127.0.0.1:8000/`。也可以换成其他空闲端口。

## Spotify 登录

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

右上角 Spotify 图标用于登录。授权完成后，页面读取收藏专辑并用真实专辑封面、标题和歌手替换演示数据；已连接时会出现退出图标。令牌仍存放在当前浏览器的 `localStorage`，支持自动刷新与主动退出。

相关代码：

- `spotify.js`：PKCE、状态校验、令牌交换/刷新和 Web API 请求（本次未改）
- `app.js`：收藏专辑映射、拖动/滚轮/键盘浏览、选中动画
- `styles.css`：封套 3D 几何、黑胶材质、响应式布局
- `server.py`：本地静态服务器与歌词接口
- `api/lyrics.py`：Vercel 上的同源歌词 Function

## 部署到 Vercel

1. 在 Vercel 中导入这个 GitHub 仓库。
2. Framework Preset 选择 `Other`；项目根目录保持仓库根目录。
3. 不需要填写 Build Command、Output Directory 或环境变量，直接部署。
4. 部署完成后，把稳定的 Production 地址加入 Spotify Redirect URIs。
5. 绑定 `vinyll.leoenchanted.top` 后，再把 `https://vinyll.leoenchanted.top/` 加入 Spotify Redirect URIs。

根目录静态文件会由 Vercel CDN 托管，`api/lyrics.py` 会自动部署为 `/api/lyrics` Python Function。Spotify 使用纯前端 PKCE，因此不需要在 Vercel 中配置 Spotify Client Secret。

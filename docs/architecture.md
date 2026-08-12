# 项目结构

The Vinyl 保持无框架、无打包步骤。`index.html` 按依赖顺序载入多个经典浏览器脚本，因此本地运行和 Vercel 部署都不需要构建命令。

```text
assets/
├── css/                    # 按视觉组件拆分的样式
│   ├── base.css            # 变量、reset、背景氛围
│   ├── providers.css       # 音乐平台选择与设置
│   ├── player.css          # 顶部迷你播放器
│   ├── layout.css          # 页面与唱片架舞台
│   ├── album.css           # 专辑对象和交互状态
│   ├── jacket.css          # 3D 封套结构
│   ├── vinyl.css           # 黑胶唱片材质和动画
│   ├── now-playing.css     # 正在播放的独立唱片层
│   ├── album-info.css      # 唱片架预览标题
│   ├── album-detail.css    # 专辑详情与曲目列表
│   ├── lyrics.css          # 歌词界面
│   ├── now-playing-detail.css
│   ├── controls.css        # 导航、光标和通知
│   └── responsive.css      # 移动端与无障碍适配
└── js/
    ├── albums/             # 封面、唱片架、专辑详情
    ├── app/                # 全局状态和事件启动
    ├── data/               # 未登录时的演示数据
    ├── lyrics/             # 歌词界面与同步
    ├── playback/           # 当前播放视图和播放控制
    ├── providers/          # Spotify、Apple Music、网易云适配器
    ├── services/           # 浏览器端歌词请求
    └── utils/              # 格式化、颜色和通知工具

backend/lyrics/
├── common.py               # 文本匹配和 HTTP 公共工具
├── service.py              # 并发查询、缓存和结果聚合
└── providers/              # LRCLIB、QQ 音乐、网易云歌词源

backend/netease/             # 网易云会话、数据归一化和上游错误处理

api/                        # Vercel Functions（歌词、Apple Token、网易云）
bridge/                     # 网易云 Windows / macOS 本地只读播放助手
index.html                  # 页面结构与前端资源载入顺序
server.py                   # 本地静态服务器入口
```

## 修改位置

- 调整封套立体结构：`assets/css/jacket.css`
- 调整黑胶材质或旋转：`assets/css/vinyl.css`
- 调整唱片架排布和拖动：`assets/js/albums/shelf.js`
- 调整专辑详情：`assets/js/albums/detail.js` 和 `assets/css/album-detail.css`
- 调整歌词同步：`assets/js/lyrics/view.js` 和 `backend/lyrics/`
- 调整平台登录或 API 映射：`assets/js/providers/`
- 调整播放状态轮询和控制边界：`assets/js/playback/controller.js`

网易云扫码会话只存在服务端设置的 HttpOnly Cookie 中。`api/netease/` 读取收藏库与专辑详情后，将数据归一化为前端共享专辑结构；Windows 与 macOS 本地助手是独立的只读播放状态来源，不参与账户登录或收藏读取。

新增前端文件后，要在 `index.html` 中按依赖顺序载入。共享状态定义在 `assets/js/app/state.js`，最后由 `assets/js/app/bootstrap.js` 绑定事件并启动页面。

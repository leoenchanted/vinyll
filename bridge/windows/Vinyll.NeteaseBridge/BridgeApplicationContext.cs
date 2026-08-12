namespace Vinyll.NeteaseBridge;

internal sealed class BridgeApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _notifyIcon;
    private readonly ToolStripMenuItem _statusItem;
    private readonly ToolStripMenuItem _autoStartItem;
    private readonly BridgeHttpServer _server;
    private readonly EventWaitHandle _shutdownEvent;
    private readonly System.Windows.Forms.Timer _shutdownTimer;

    internal BridgeApplicationContext()
    {
        _statusItem = new ToolStripMenuItem("正在启动…") { Enabled = false };
        _autoStartItem = new ToolStripMenuItem("开机自动启动")
        {
            Checked = Program.AutoStartEnabled,
            CheckOnClick = true,
        };
        _autoStartItem.CheckedChanged += (_, _) => Program.EnsureAutoStart(_autoStartItem.Checked);

        var menu = new ContextMenuStrip();
        menu.Items.Add(_statusItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("打开 Vinyll", null, (_, _) => Program.OpenWebsite());
        menu.Items.Add(_autoStartItem);
        menu.Items.Add("查看运行日志", null, (_, _) => Program.OpenLog());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出助手", null, (_, _) => ExitThread());

        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Information,
            Text = Program.ProductName,
            ContextMenuStrip = menu,
            Visible = true,
        };
        _notifyIcon.DoubleClick += (_, _) => Program.OpenWebsite();

        _server = new BridgeHttpServer(new SmtcService(), SetStatus);
        _ = StartServerAsync();

        _shutdownEvent = new EventWaitHandle(false, EventResetMode.AutoReset, Program.ShutdownEventName);
        _shutdownTimer = new System.Windows.Forms.Timer { Interval = 400 };
        _shutdownTimer.Tick += (_, _) =>
        {
            if (_shutdownEvent.WaitOne(0)) ExitThread();
        };
        _shutdownTimer.Start();
    }

    private async Task StartServerAsync()
    {
        try
        {
            await _server.StartAsync();
        }
        catch (Exception error)
        {
            Log.Write(error);
            SetStatus("启动失败：端口 17863 被占用");
            _notifyIcon.ShowBalloonTip(8000, Program.ProductName,
                "无法启动：端口 17863 被占用。请先退出正在运行的旧版 Vinyll 助手，再重新打开。",
                ToolTipIcon.Error);
        }
    }

    private void SetStatus(string message)
    {
        void Update()
        {
            _statusItem.Text = message.Length > 48 ? $"{message[..45]}…" : message;
            _notifyIcon.Text = message.Length > 60 ? Program.ProductName : message;
        }

        if (_notifyIcon.ContextMenuStrip?.InvokeRequired == true)
            _notifyIcon.ContextMenuStrip.BeginInvoke(Update);
        else
            Update();
    }

    protected override void ExitThreadCore()
    {
        _server.Dispose();
        _shutdownTimer.Stop();
        _shutdownTimer.Dispose();
        _shutdownEvent.Dispose();
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        Log.Write("Stopped");
        base.ExitThreadCore();
    }
}

using Microsoft.Win32;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;

namespace Vinyll.NeteaseBridge;

internal static class Program
{
    internal const string ProductName = "Vinyll 网易云连接助手";
    internal const string WebsiteUrl = "https://vinyll.leoenchanted.top";
    internal const string RunValueName = "Vinyll NetEase Bridge";
    internal const string MutexName = "Local\\Vinyll.NeteaseBridge.Instance";
    internal const string ShutdownEventName = "Local\\Vinyll.NeteaseBridge.Shutdown";

    internal static readonly string InstallDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Vinyll");
    internal static readonly string InstalledExecutable = Path.Combine(InstallDirectory, "Vinyll.NeteaseBridge.exe");
    internal static readonly string LogFile = Path.Combine(InstallDirectory, "bridge.log");

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Directory.CreateDirectory(InstallDirectory);
        var portable = args.Contains("--portable", StringComparer.OrdinalIgnoreCase);

        if (args.Contains("--uninstall", StringComparer.OrdinalIgnoreCase))
        {
            Uninstall();
            return;
        }

        if (!IsInstalledExecutable() && !portable)
        {
            InstallOrUpdate(args.Contains("--silent-install", StringComparer.OrdinalIgnoreCase));
            return;
        }

        using var instanceMutex = new Mutex(true, MutexName, out var ownsMutex);
        if (!ownsMutex)
        {
            if (!args.Contains("--background", StringComparer.OrdinalIgnoreCase))
                MessageBox.Show("Vinyll 网易云连接助手已经在运行。", ProductName,
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        if (!portable) EnsureAutoStart(true);
        Log.Write($"Starting {CurrentVersion} from {Environment.ProcessPath}");
        Application.Run(new BridgeApplicationContext());
    }

    internal static string CurrentVersion =>
        Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "1.0.0";

    internal static bool AutoStartEnabled
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
            return key?.GetValue(RunValueName) is string value
                && value.Contains(InstalledExecutable, StringComparison.OrdinalIgnoreCase);
        }
    }

    internal static void EnsureAutoStart(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
        if (enabled)
            key.SetValue(RunValueName, $"\"{InstalledExecutable}\" --background", RegistryValueKind.String);
        else
            key.DeleteValue(RunValueName, false);
    }

    internal static void OpenWebsite() => OpenPath(WebsiteUrl);
    internal static void OpenLog() => OpenPath(LogFile);

    private static void OpenPath(string path)
    {
        try
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            Log.Write(error);
        }
    }

    private static bool IsInstalledExecutable()
    {
        var current = Environment.ProcessPath ?? string.Empty;
        return string.Equals(Path.GetFullPath(current), Path.GetFullPath(InstalledExecutable),
            StringComparison.OrdinalIgnoreCase);
    }

    private static void InstallOrUpdate(bool silent)
    {
        try
        {
            SignalExistingInstance();
            Directory.CreateDirectory(InstallDirectory);

            for (var attempt = 0; attempt < 20; attempt++)
            {
                try
                {
                    File.Copy(Environment.ProcessPath!, InstalledExecutable, true);
                    break;
                }
                catch (IOException) when (attempt < 19)
                {
                    Thread.Sleep(150);
                }
            }

            EnsureAutoStart(true);
            Process.Start(new ProcessStartInfo(InstalledExecutable, "--background") { UseShellExecute = true });
            if (!silent)
            {
                MessageBox.Show(
                    "安装完成。助手已启动并设为开机自动运行。\n\n现在打开网易云音乐桌面客户端播放歌曲，再回到 Vinyll 连接网易云即可。",
                    ProductName, MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception error)
        {
            Log.Write(error);
            MessageBox.Show($"安装失败：{error.Message}", ProductName,
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void Uninstall()
    {
        try
        {
            SignalExistingInstance();
            EnsureAutoStart(false);
            MessageBox.Show("已关闭助手并取消开机启动。你现在可以删除 Vinyll 助手文件。",
                ProductName, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception error)
        {
            MessageBox.Show($"卸载失败：{error.Message}", ProductName,
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void SignalExistingInstance()
    {
        try
        {
            using var shutdownEvent = EventWaitHandle.OpenExisting(ShutdownEventName);
            shutdownEvent.Set();
            Thread.Sleep(500);
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            // No older instance is running.
        }
    }
}

internal static class Log
{
    private static readonly object Sync = new();

    internal static void Write(Exception error) => Write($"{error.GetType().Name}: {error.Message}\n{error.StackTrace}");

    internal static void Write(string message)
    {
        try
        {
            lock (Sync)
            {
                Directory.CreateDirectory(Program.InstallDirectory);
                File.AppendAllText(Program.LogFile, $"[{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss zzz}] {message}{Environment.NewLine}");
            }
        }
        catch
        {
            // Logging must never stop the bridge.
        }
    }
}

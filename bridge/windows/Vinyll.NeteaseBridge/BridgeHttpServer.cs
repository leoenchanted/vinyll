using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Vinyll.NeteaseBridge;

internal sealed class BridgeHttpServer : IDisposable
{
    private const int Port = 17863;
    private static readonly HashSet<string> AllowedOrigins = new(StringComparer.OrdinalIgnoreCase)
    {
        "https://vinyll.leoenchanted.top",
    };
    private static readonly Regex LocalOrigin = new(@"^http://(?:127\.0\.0\.1|localhost)(?::\d+)?$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly SmtcService _smtc;
    private readonly Action<string> _setStatus;
    private readonly CancellationTokenSource _cancellation = new();
    private TcpListener? _listener;

    internal BridgeHttpServer(SmtcService smtc, Action<string> setStatus)
    {
        _smtc = smtc;
        _setStatus = setStatus;
    }

    internal async Task StartAsync()
    {
        _listener = new TcpListener(IPAddress.Loopback, Port);
        _listener.Start();
        _setStatus("Vinyll 网易云助手 · 已运行");
        Log.Write($"Listening on http://127.0.0.1:{Port}");

        while (!_cancellation.IsCancellationRequested)
        {
            TcpClient client;
            try
            {
                client = await _listener.AcceptTcpClientAsync(_cancellation.Token);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            _ = Task.Run(() => HandleClientAsync(client));
        }
    }

    private async Task HandleClientAsync(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 7000;
                client.SendTimeout = 7000;
                var request = await ReadRequestAsync(client.GetStream(), _cancellation.Token);
                if (request is null) return;

                var origin = request.Headers.GetValueOrDefault("Origin", string.Empty).TrimEnd('/');
                if (!OriginAllowed(origin))
                {
                    await WriteJsonAsync(client.GetStream(), 403, new { error = "Origin not allowed" }, string.Empty);
                    return;
                }

                if (request.Method == "OPTIONS")
                {
                    await WriteResponseAsync(client.GetStream(), 204, [], origin);
                    return;
                }

                await RouteAsync(client.GetStream(), request, origin);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                Log.Write(error);
                try { await WriteJsonAsync(client.GetStream(), 500, new { error = error.Message }, string.Empty); }
                catch { }
            }
        }
    }

    private async Task RouteAsync(NetworkStream stream, HttpRequest request, string origin)
    {
        if (request.Method == "GET" && request.Path == "/health")
        {
            var (sessionFound, message) = await _smtc.ProbeAsync();
            await WriteJsonAsync(stream, 200, new
            {
                ok = true,
                ready = true,
                mode = "smtc",
                platform = "win32",
                version = Program.CurrentVersion,
                sessionFound,
                message,
            }, origin);
            return;
        }

        if (request.Method == "GET" && request.Path == "/state")
        {
            var state = await _smtc.GetStateAsync();
            _setStatus(state.Item is null
                ? "Vinyll 网易云助手 · 等待播放"
                : $"网易云 · {state.Item.Name}");
            await WriteJsonAsync(stream, 200, state, origin);
            return;
        }

        if (request.Method == "GET" && request.Path == "/library")
        {
            await WriteJsonAsync(stream, 200, new
            {
                profile = new { displayName = "网易云桌面端" },
                items = Array.Empty<object>(),
                total = 0,
            }, origin);
            return;
        }

        if (request.Method == "POST" && request.Path == "/command")
        {
            using var body = JsonDocument.Parse(string.IsNullOrWhiteSpace(request.Body) ? "{}" : request.Body);
            var command = body.RootElement.TryGetProperty("command", out var commandNode)
                ? commandNode.GetString() ?? string.Empty
                : string.Empty;
            var positionMs = body.RootElement.TryGetProperty("positionMs", out var positionNode)
                && positionNode.TryGetInt64(out var parsedPosition) ? parsedPosition : 0;
            if (command is not ("pause" or "resume" or "next" or "prev" or "seek"))
            {
                await WriteJsonAsync(stream, 400, new { error = "Unsupported playback command" }, origin);
                return;
            }

            var succeeded = await _smtc.ExecuteAsync(command, positionMs);
            await WriteJsonAsync(stream, succeeded ? 200 : 409,
                succeeded ? new { ok = true } : new { error = "网易云没有接受播放命令" }, origin);
            return;
        }

        await WriteJsonAsync(stream, 404, new { error = "Not found" }, origin);
    }

    private static bool OriginAllowed(string origin) => string.IsNullOrWhiteSpace(origin)
        || AllowedOrigins.Contains(origin)
        || LocalOrigin.IsMatch(origin);

    private static async Task<HttpRequest?> ReadRequestAsync(NetworkStream stream, CancellationToken token)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[2048];
        var headerEnd = -1;

        while (buffer.Length < 32_768 && headerEnd < 0)
        {
            var read = await stream.ReadAsync(chunk, token);
            if (read == 0) return null;
            buffer.Write(chunk, 0, read);
            headerEnd = FindHeaderEnd(buffer.GetBuffer(), (int)buffer.Length);
        }
        if (headerEnd < 0) return null;

        var allBytes = buffer.ToArray();
        var headerText = Encoding.ASCII.GetString(allBytes, 0, headerEnd);
        var lines = headerText.Split("\r\n", StringSplitOptions.None);
        var requestLine = lines[0].Split(' ', 3);
        if (requestLine.Length < 2) return null;

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines.Skip(1))
        {
            var separator = line.IndexOf(':');
            if (separator > 0) headers[line[..separator].Trim()] = line[(separator + 1)..].Trim();
        }

        var contentLength = headers.TryGetValue("Content-Length", out var rawLength)
            && int.TryParse(rawLength, out var parsedLength) ? Math.Clamp(parsedLength, 0, 65_536) : 0;
        var bodyStart = headerEnd + 4;
        using var body = new MemoryStream();
        if (allBytes.Length > bodyStart)
            body.Write(allBytes, bodyStart, Math.Min(allBytes.Length - bodyStart, contentLength));
        while (body.Length < contentLength)
        {
            var read = await stream.ReadAsync(chunk.AsMemory(0, Math.Min(chunk.Length, contentLength - (int)body.Length)), token);
            if (read == 0) break;
            body.Write(chunk, 0, read);
        }

        var path = requestLine[1].Split('?', 2)[0];
        return new HttpRequest(requestLine[0].ToUpperInvariant(), path, headers,
            Encoding.UTF8.GetString(body.ToArray()));
    }

    private static int FindHeaderEnd(byte[] bytes, int length)
    {
        for (var index = 0; index <= length - 4; index++)
        {
            if (bytes[index] == 13 && bytes[index + 1] == 10 && bytes[index + 2] == 13 && bytes[index + 3] == 10)
                return index;
        }
        return -1;
    }

    private static Task WriteJsonAsync(NetworkStream stream, int status, object payload, string origin) =>
        WriteResponseAsync(stream, status, JsonSerializer.SerializeToUtf8Bytes(payload, JsonOptions), origin);

    private static async Task WriteResponseAsync(NetworkStream stream, int status, byte[] body, string origin)
    {
        var reason = status switch { 200 => "OK", 204 => "No Content", 400 => "Bad Request", 403 => "Forbidden", 404 => "Not Found", 409 => "Conflict", _ => "Internal Server Error" };
        var headers = new StringBuilder()
            .Append($"HTTP/1.1 {status} {reason}\r\n")
            .Append("Content-Type: application/json; charset=utf-8\r\n")
            .Append($"Content-Length: {body.Length}\r\n")
            .Append("Cache-Control: no-store\r\n")
            .Append("Connection: close\r\n")
            .Append("Vary: Origin\r\n")
            .Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n")
            .Append("Access-Control-Allow-Headers: Content-Type\r\n")
            .Append("Access-Control-Allow-Private-Network: true\r\n");
        if (!string.IsNullOrWhiteSpace(origin)) headers.Append($"Access-Control-Allow-Origin: {origin}\r\n");
        headers.Append("\r\n");

        await stream.WriteAsync(Encoding.ASCII.GetBytes(headers.ToString()));
        if (body.Length > 0) await stream.WriteAsync(body);
        await stream.FlushAsync();
    }

    public void Dispose()
    {
        _cancellation.Cancel();
        _listener?.Stop();
        _cancellation.Dispose();
    }

    private sealed record HttpRequest(string Method, string Path, Dictionary<string, string> Headers, string Body);
}

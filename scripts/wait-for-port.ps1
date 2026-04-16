# Wait until TCP port accepts connections (e.g. Node server is listening).
param(
    [int] $Port = 3000,
    [string] $HostName = '127.0.0.1',
    [int] $TimeoutSec = 45
)
$deadline = [datetime]::UtcNow.AddSeconds($TimeoutSec)
while ([datetime]::UtcNow -lt $deadline) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect($HostName, $Port)
        $client.Close()
        exit 0
    } catch {
        Start-Sleep -Milliseconds 400
    }
}
exit 1

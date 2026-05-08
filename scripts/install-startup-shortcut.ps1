param(
    [Parameter(Mandatory = $true)]
    [string] $ProjectRoot
)

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$bat = Join-Path $ProjectRoot 'bat\start_kiosk.bat'
if (-not (Test-Path -LiteralPath $bat)) {
    Write-Host '[ERROR] start_kiosk.bat was not found:' $bat
    exit 1
}

$startup = [Environment]::GetFolderPath('Startup')
$linkPath = Join-Path $startup 'RestaurantKiosk.lnk'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($linkPath)
# .bat 를 직접 대상으로 두면 경로·연결 프로그램 이슈가 날 수 있어 cmd.exe /c 로 실행
$cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
$sc.TargetPath = $cmdExe
# nopause: 시작 프로그램 실행 시 런처가 pause 에서 멈추지 않도록
$sc.Arguments = '/c "' + $bat + '" nopause'
$sc.WorkingDirectory = $ProjectRoot
$sc.WindowStyle = 1
$sc.Description = 'Restaurant Kiosk'
$sc.Save()

Write-Host '[DONE] Startup shortcut created for the current Windows user:'
Write-Host $linkPath
Write-Host ''
Write-Host 'Note: This runs only after sign-in. If you need unattended launch, enable automatic sign-in.'

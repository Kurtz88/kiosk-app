param(
    [Parameter(Mandatory = $true)]
    [string] $ProjectRoot
)

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$bat = Join-Path $ProjectRoot 'bat\start_kiosk.bat'
if (-not (Test-Path -LiteralPath $bat)) {
    Write-Host '[오류] start_kiosk.bat 을 찾을 수 없습니다:' $bat
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
$sc.Description = '맛집 키오스크 (Restaurant Kiosk)'
$sc.Save()

Write-Host '[완료] 시작 프로그램에 등록했습니다 (로그인한 Windows 사용자 계정 한정):'
Write-Host $linkPath
Write-Host ''
Write-Host '※ PC 전원만 켜고 로그인하지 않으면 실행되지 않습니다. 키오스크는 [자동 로그인] 설정을 검토하세요.'

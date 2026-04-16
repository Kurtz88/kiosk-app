# 데스크톱에 "키오스크 시작하기" 바로가기 생성 (start_kiosk.bat, 재생/시작 아이콘)
param(
    [string] $ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$bat = Join-Path $ProjectRoot 'bat\start_kiosk.bat'
if (-not (Test-Path -LiteralPath $bat)) {
    Write-Host '[오류] start_kiosk.bat 을 찾을 수 없습니다:' $bat
    exit 1
}

$desktop = [Environment]::GetFolderPath('Desktop')
# ASCII-only source file 호환: "키오스크 시작하기.lnk" (UTF-16 코드포인트)
$linkName = -join @(
    [char]0xD0A4, [char]0xC624, [char]0xC2A4, [char]0xD06C,
    [char]0x20,
    [char]0xC2DC, [char]0xC791, [char]0xD558, [char]0xAE30
) + '.lnk'
$linkPath = Join-Path $desktop $linkName
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($linkPath)
$cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
$sc.TargetPath = $cmdExe
$sc.Arguments = '/c "' + $bat + '"'
$sc.WorkingDirectory = $ProjectRoot
$sc.WindowStyle = 1
$sc.Description = 'Kiosk: start_kiosk.bat (Node + Chrome kiosk)'
# shell32.dll 137 = 재생(▶) 스타일 아이콘 (Windows 기본)
$sc.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',137'
$sc.Save()

Write-Host '[완료] 바로가기를 만들었습니다:'
Write-Host $linkPath

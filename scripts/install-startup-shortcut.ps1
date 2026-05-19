param(
    [Parameter(Mandatory = $true)]
    [string] $ProjectRoot
)

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$bat = Join-Path $ProjectRoot 'bat\start_kiosk.bat'
if (-not (Test-Path -LiteralPath $bat)) {
<<<<<<< HEAD
    Write-Host '[ERROR] start_kiosk.bat not found:' $bat
=======
    Write-Host '[ERROR] start_kiosk.bat was not found:' $bat
>>>>>>> d2ee32d0bcd4d4b7804d1aa88e662fccf37eda6a
    exit 1
}

$startup = [Environment]::GetFolderPath('Startup')
$linkPath = Join-Path $startup 'RestaurantKiosk.lnk'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($linkPath)
# Avoid .bat as direct target (path / file association quirks); run via cmd.exe /c
$cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
$sc.TargetPath = $cmdExe
# nopause: do not block on pause when launched from Startup
$sc.Arguments = '/c "' + $bat + '" nopause'
$sc.WorkingDirectory = $ProjectRoot
$sc.WindowStyle = 1
$sc.Description = 'Restaurant Kiosk'
$sc.Save()

<<<<<<< HEAD
Write-Host '[OK] Startup shortcut created (current Windows user only):'
Write-Host $linkPath
Write-Host ''
Write-Host 'Note: The app will not run until someone signs in. Consider automatic sign-in for unattended kiosks.'
=======
Write-Host '[DONE] Startup shortcut created for the current Windows user:'
Write-Host $linkPath
Write-Host ''
Write-Host 'Note: This runs only after sign-in. If you need unattended launch, enable automatic sign-in.'
>>>>>>> d2ee32d0bcd4d4b7804d1aa88e662fccf37eda6a

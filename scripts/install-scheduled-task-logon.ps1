param(
    [string] $ProjectRoot = '',
    [switch] $Uninstall
)

$taskName = 'RestaurantKioskLogon'

if ($Uninstall) {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Host '[INFO] Task was not registered:' $taskName
        exit 0
    }
    try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
        Write-Host '[OK] Scheduled task removed:' $taskName
    } catch {
        Write-Host '[ERROR]' $_.Exception.Message
        exit 1
    }
    exit 0
}

if (-not $ProjectRoot) {
    Write-Host '[ERROR] -ProjectRoot is required (unless -Uninstall).'
    exit 1
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$bat = Join-Path $ProjectRoot 'bat\start_kiosk.bat'
if (-not (Test-Path -LiteralPath $bat)) {
    Write-Host '[ERROR] start_kiosk.bat not found:' $bat
    exit 1
}

$userId = (& whoami.exe 2>$null).Trim()
if (-not $userId) {
    Write-Host '[ERROR] Could not resolve current user (whoami).'
    exit 1
}

$argument = '/c "' + $bat + '" nopause'
$cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
$action = New-ScheduledTaskAction -Execute $cmdExe -Argument $argument -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
try {
    $trigger.Delay = 'PT20S'
} catch {
    # Older Windows: ignore if Delay is not supported on this trigger type
}

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Restaurant Kiosk: run start_kiosk.bat after Windows sign-in' `
    -Force | Out-Null

Write-Host '[OK] Scheduled task registered (runs after you sign in to Windows, ~20s delay):' $taskName
Write-Host ('      Task Scheduler: Task Scheduler Library\' + $taskName)
Write-Host ''
Write-Host 'Note: This does NOT run at the login screen. For unattended PCs turn on automatic sign-in'
Write-Host '      (Settings > Accounts > Sign-in options, or netplwiz).'
Write-Host '      If you also use shell:startup RestaurantKiosk shortcut, remove one method to avoid double launch.'

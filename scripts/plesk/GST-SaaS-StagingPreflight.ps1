# Read-only Windows/Plesk staging readiness check. Makes NO configuration changes.
# Run in an elevated PowerShell console on the intended Plesk Windows server.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Continue'
$report = [ordered]@{
  Timestamp = (Get-Date).ToString('s')
  Computer = $env:COMPUTERNAME
  OS = (Get-CimInstance Win32_OperatingSystem).Caption
  Node = (& node --version 2>$null | Select-Object -First 1)
  Npm = (& npm.cmd --version 2>$null | Select-Object -First 1)
  PostgreSQLService = @()
  Port5432Listening = @()
  Port4100Listening = @()
  ExistingNodeProcesses = @()
  FreeGB = @()
  PleskInstalled = (Test-Path 'C:\Program Files (x86)\Plesk\admin\bin\plesk.exe')
}
$report.PostgreSQLService = @(Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'postgres' } | Select-Object Name,Status,StartType)
$report.Port5432Listening = @(Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$report.Port4100Listening = @(Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
$report.ExistingNodeProcesses = @(Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId,Name)
$report.FreeGB = @(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue | Where-Object { $_.Free -ne $null } | ForEach-Object { [pscustomobject]@{ Drive=$_.Name; FreeGB=[math]::Round($_.Free/1GB,1) } })
$dir = 'D:\Extractlog'
if (-not (Test-Path -LiteralPath $dir)) {
  Write-Warning "Log directory $dir does not exist; not creating it because this script is read-only."
}
Write-Host '=== GST SaaS development staging preflight (READ ONLY) ==='
$report | ConvertTo-Json -Depth 5
Write-Host '=== No changes made; no database installed, no firewall/IIS/Plesk settings modified. ==='

<#
  Markenza AI — invoke the orchestrator manually for a one-off tick.
  Useful for testing without waiting for the cron schedule.
#>

param(
  [Parameter(Mandatory=$true)][string]$ProjectRef,
  [Parameter(Mandatory=$true)][string]$CronSecret
)

$ErrorActionPreference = "Stop"
$url = "https://$ProjectRef.supabase.co/functions/v1/orchestrator"
$res = Invoke-RestMethod -Method POST -Uri $url -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer $CronSecret" } `
  -Body (ConvertTo-Json @{ source = "manual" })
$res | ConvertTo-Json -Depth 8

<#
  Markenza AI — end-to-end smoke test against a deployed project.
  - Verifies orchestrator can be hit with the cron secret
  - Triggers a content research call
  - Triggers an outreach discover call with a known LinkedIn search URL
  - Prints the responses
#>

param(
  [Parameter(Mandatory=$true)][string]$ProjectRef,
  [Parameter(Mandatory=$true)][string]$CronSecret,
  [string]$TestSearchUrl = "https://www.linkedin.com/search/results/people/?keywords=ecommerce%20founder"
)

$ErrorActionPreference = "Stop"
$base = "https://$ProjectRef.supabase.co/functions/v1"
$headers = @{ Authorization = "Bearer $CronSecret"; "Content-Type" = "application/json" }

function Hit($name, $body) {
  Write-Host "==> $name" -ForegroundColor Cyan
  $r = Invoke-RestMethod -Method POST -Uri "$base/$name" -Headers $headers -Body (ConvertTo-Json $body)
  $r | ConvertTo-Json -Depth 8
  Write-Host ""
}

Hit orchestrator   @{ source = "smoke" }
Hit content-research @{ count = 2 }
Hit outreach-discover @{ searchUrls = @($TestSearchUrl); maxItems = 5 }

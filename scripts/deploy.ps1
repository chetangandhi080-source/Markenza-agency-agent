<#
  Markenza AI — one-shot deploy script (Windows / PowerShell).
  Prereqs: Supabase CLI on PATH, a Supabase project, and you are logged in
  via `supabase login`. Run from this directory.

  Usage:
    .\scripts\deploy.ps1 -ProjectRef <ref-from-supabase-dashboard>

  After this:
    - Migrations are applied
    - pg_cron is scheduled
    - All edge functions are deployed
    - Secrets are set in the remote project
#>

param(
  [Parameter(Mandatory=$true)][string]$ProjectRef,
  [string]$HermesBaseUrl = "https://hermes-agent.nousresearch.com",
  [string]$HermesModel   = "hermes-3-llama-3.1-405b",
  [string]$SmtpHost      = "smtp.gmail.com",
  [int]   $SmtpPort      = 465,
  [string]$SmtpUser      = "",
  [string]$SmtpPass      = "",
  [string]$SmtpFrom      = "",
  [string]$ApifyToken    = "",
  [string]$ApifyActor    = "bebity/linkedin-profile-scraper",
  [string]$HermesApiKey  = "",
  [string]$CronSecret    = ""
)

$ErrorActionPreference = "Stop"

if (-not $CronSecret) { $CronSecret = -join ((1..32) | ForEach-Object { [char](Get-Random -InputObject ([byte[]](33..126))) }) }
if (-not $SmtpUser)   { $SmtpUser   = Read-Host "SMTP user (Gmail address)" }
if (-not $SmtpPass)   { $SmtpPass   = Read-Host "SMTP app password" -AsSecureString | ConvertFrom-SecureString -AsPlainText }
if (-not $SmtpFrom)   { $SmtpFrom   = Read-Host "SMTP from address (e.g. Markenza <hi@markenza.ai>)" }
if (-not $ApifyToken) { $ApifyToken = Read-Host "Apify API token" }

Write-Host "Linking to project $ProjectRef ..." -ForegroundColor Cyan
supabase link --project-ref $ProjectRef | Out-Host

Write-Host "Pushing migrations ..." -ForegroundColor Cyan
supabase db push | Out-Host

Write-Host "Deploying edge functions ..." -ForegroundColor Cyan
$funcs = @("outreach-discover","outreach-generate","outreach-send","outreach-followup","content-research","content-generate","orchestrator","auth-bootstrap")
foreach ($f in $funcs) {
  Write-Host "  - $f"
  supabase functions deploy $f --project-ref $ProjectRef | Out-Null
}

Write-Host "Setting secrets ..." -ForegroundColor Cyan
supabase secrets set --project-ref $ProjectRef `
  HERMES_BASE_URL="$HermesBaseUrl" `
  HERMES_MODEL="$HermesModel" `
  HERMES_API_KEY="$HermesApiKey" `
  APIFY_TOKEN="$ApifyToken" `
  APIFY_LINKEDIN_ACTOR="$ApifyActor" `
  SMTP_HOST="$SmtpHost" `
  SMTP_PORT="$SmtpPort" `
  SMTP_USER="$SmtpUser" `
  SMTP_PASS="$SmtpPass" `
  SMTP_FROM="$SmtpFrom" `
  CRON_SECRET="$CronSecret"

Write-Host ""
Write-Host "All done. Save this CRON_SECRET for manual function calls:" -ForegroundColor Green
Write-Host "  $CronSecret" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "  1) Create your user:   .\scripts\create-user.ps1 -ProjectRef $ProjectRef -Email you@gmail.com -Password <pw>"
Write-Host "  2) (Optional) Run a manual discovery tick: see scripts\tick.ps1"
Write-Host "  3) Open Supabase Studio: https://app.supabase.com/project/$ProjectRef"

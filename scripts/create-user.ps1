<#
  Markenza AI — bootstrap the single auth user.
  Calls the auth-bootstrap edge function. Save the email + password.
#>

param(
  [Parameter(Mandatory=$true)][string]$ProjectRef,
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$Password,
  [string]$FullName = "Chetan"
)

$ErrorActionPreference = "Stop"
$url = "https://$ProjectRef.supabase.co/functions/v1/auth-bootstrap"
$body = @{ email = $Email; password = $Password; full_name = $FullName } | ConvertTo-Json

Write-Host "Creating user $Email ..." -ForegroundColor Cyan
$res = Invoke-RestMethod -Method POST -Uri $url -ContentType "application/json" -Body $body
$res | ConvertTo-Json -Depth 5
Write-Host ""
Write-Host "User created. Log in to Supabase Studio to start." -ForegroundColor Green

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Host "`n=== $Label ==="
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Import-LocalEnvironment {
  $environmentFile = Join-Path $projectRoot ".env.local"
  if (-not (Test-Path -LiteralPath $environmentFile)) {
    throw ".env.local is required for the real database, AI, verification, and HeAR checks."
  }

  Get-Content -LiteralPath $environmentFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]*)=(.*)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$Attempts = 90,
    [int]$TimeoutSeconds = 3
  )
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Timed out waiting for $Url"
}

function Wait-ForTcp {
  param([int]$Port, [int]$Attempts = 180)
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { return }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for TCP port $Port"
}

Import-LocalEnvironment
New-Item -ItemType Directory -Path (Join-Path $projectRoot ".artifacts") -Force | Out-Null

# The final suite runs the local HeAR service with a one-run server-only token.
# This validates real transport without writing or printing a secret.
if ([string]::IsNullOrWhiteSpace($env:HEAR_SERVICE_URL)) {
  $env:HEAR_SERVICE_URL = "http://127.0.0.1:8017"
}
if ([string]::IsNullOrWhiteSpace($env:HEAR_SERVICE_TOKEN)) {
  $tokenBytes = [byte[]]::new(32)
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($tokenBytes) } finally { $random.Dispose() }
  $env:HEAR_SERVICE_TOKEN = -join ($tokenBytes | ForEach-Object { $_.ToString("x2") })
}
if ([string]::IsNullOrWhiteSpace($env:HEAR_MODEL_PATH)) {
  $env:HEAR_MODEL_PATH = Join-Path $projectRoot ".artifacts\hear-model"
}
if ([string]::IsNullOrWhiteSpace($env:HEAR_CLASSIFIER_PATH)) {
  $env:HEAR_CLASSIFIER_PATH = Join-Path $projectRoot "hear-service\model\cough_classifier.json"
}

$appPort = 3019
$appUrl = "http://127.0.0.1:$appPort"
$env:APP_URL = $appUrl
$nextProcess = $null
$hearProcess = $null

try {
  Invoke-Checked "ESLint" "npm.cmd" @("run", "lint")
  Invoke-Checked "TypeScript" "npx.cmd" @("tsc", "--noEmit")
  Invoke-Checked "Production build" "npm.cmd" @("run", "build")

  Invoke-Checked "Clinical safety unit tests" "npm.cmd" @("run", "test:safety")
  Invoke-Checked "Fraud hash unit tests" "npm.cmd" @("run", "test:fraud-hash")
  Invoke-Checked "AI boundary unit tests" "npm.cmd" @("run", "test:ai")
  Invoke-Checked "Messaging security unit tests" "npm.cmd" @("run", "test:messaging")
  Invoke-Checked "HeAR model verification" "npm.cmd" @("run", "test:hear")

  $databaseTests = Get-ChildItem -LiteralPath (Join-Path $projectRoot "supabase\tests") -Filter "*.sql" | Sort-Object Name
  foreach ($databaseTest in $databaseTests) {
    Invoke-Checked "Database: $($databaseTest.Name)" "npx.cmd" @("supabase", "db", "query", "--linked", "--file", $databaseTest.FullName)
  }
  Invoke-Checked "Supabase schema lint" "npx.cmd" @("supabase", "db", "lint", "--linked", "--schema", "public,private", "--level", "warning", "--fail-on", "warning")
  Invoke-Checked "Supabase security advisor" "npx.cmd" @("supabase", "db", "advisors", "--linked", "--type", "security", "--level", "warn", "--fail-on", "warn")
  Invoke-Checked "Supabase performance advisor" "npx.cmd" @("supabase", "db", "advisors", "--linked", "--type", "performance", "--level", "warn", "--fail-on", "warn")

  $hearUrl = if ($env:HEAR_SERVICE_URL) { $env:HEAR_SERVICE_URL } else { "http://127.0.0.1:8017" }
  $hearUri = [Uri]$hearUrl
  $hearPort = $hearUri.Port
  if (-not (Get-NetTCPConnection -State Listen -LocalPort $hearPort -ErrorAction SilentlyContinue)) {
    $uvicorn = Join-Path $projectRoot ".artifacts\hear-venv\Scripts\uvicorn.exe"
    if (-not (Test-Path -LiteralPath $uvicorn)) { throw "HeAR virtual environment is missing: $uvicorn" }
    $hearProcess = Start-Process -FilePath $uvicorn `
      -ArgumentList @("hear-service.app:app", "--host", "127.0.0.1", "--port", "$hearPort") `
      -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $projectRoot ".artifacts\final-hear.stdout.log") `
      -RedirectStandardError (Join-Path $projectRoot ".artifacts\final-hear.stderr.log")
  }
  Wait-ForTcp -Port $hearPort
  # Loading HeAR can take about a minute on CPU. A long single request avoids
  # starting overlapping TensorFlow model loads after short client timeouts.
  Wait-ForHttp "$hearUrl/health" -Attempts 2 -TimeoutSeconds 180

  if (Get-NetTCPConnection -State Listen -LocalPort $appPort -ErrorAction SilentlyContinue) {
    throw "Port $appPort is already in use. Stop that process before running the final suite."
  }
  $node = (Get-Command node.exe).Source
  $nextProcess = Start-Process -FilePath $node `
    -ArgumentList @("node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "$appPort") `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $projectRoot ".artifacts\final-next.stdout.log") `
    -RedirectStandardError (Join-Path $projectRoot ".artifacts\final-next.stderr.log")
  Wait-ForHttp $appUrl

  $browserTests = @(
    "test:entries",
    "test:care",
    "test:care-persistence",
    "test:finder",
    "test:referral",
    "test:verify",
    "test:pharmacy",
    "test:dashboard",
    "test:community",
    "test:integration",
    "test:ai-browser",
    "test:ai-live",
    "test:assistant-browser",
    "test:medicines-browser",
    "test:hear-browser"
  )
  foreach ($browserTest in $browserTests) {
    Invoke-Checked "Browser: $browserTest" "npm.cmd" @("run", $browserTest)
  }
  Invoke-Checked "All-route responsive and typography sweep" "node.exe" @("scripts/check-ui.mjs")

  Write-Host "`nFINAL QUALITY SUITE PASSED"
} finally {
  if ($nextProcess -and -not $nextProcess.HasExited) { Stop-Process -Id $nextProcess.Id -Force }
  if ($hearProcess -and -not $hearProcess.HasExited) { Stop-Process -Id $hearProcess.Id -Force }
}

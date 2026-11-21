# 눈싸움 서버를 이 PC에서 켜고, Cloudflare 무료 터널로 친구가 들어올 주소를 만든다.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Pause-Exit($msg) {
  Write-Host ""
  Write-Host $msg -ForegroundColor Red
  Read-Host "엔터를 누르면 창이 닫혀요"
  exit 1
}

Write-Host ""
Write-Host "  눈싸움 서버 켜는 중..." -ForegroundColor Cyan
Write-Host ""

# 1. Node.js 확인
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Start-Process "https://nodejs.org/ko/download"
  Pause-Exit "Node.js가 설치돼 있지 않아요. 방금 열린 페이지에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행하세요."
}
Write-Host "[1/4] Node.js $(node -v) 확인"

# 2. 최신 코드 받기 (git이 있을 때만)
if ((Test-Path .git) -and (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "[2/4] 최신 코드 받는 중"
  git pull --ff-only
} else {
  Write-Host "[2/4] git이 없어서 최신 코드 받기는 건너뛰어요"
}

# 3. 설치와 빌드
Write-Host "[3/4] 설치하고 화면 빌드하는 중 (처음엔 1~2분 걸려요)"
npm install --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Pause-Exit "npm install 이 실패했어요. 위 오류를 캡처해서 보여 주세요." }
npm run build --silent
if ($LASTEXITCODE -ne 0) { Pause-Exit "빌드가 실패했어요. 위 오류를 캡처해서 보여 주세요." }

# cloudflared 준비 (없으면 한 번만 받는다)
$cf = Join-Path $root "tools\cloudflared.exe"
if (-not (Test-Path $cf)) {
  Write-Host "      Cloudflare 터널 프로그램 받는 중 (한 번만)"
  New-Item -ItemType Directory -Force (Join-Path $root "tools") | Out-Null
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cf
}

# 4. 서버와 터널 켜기
Write-Host "[4/4] 서버와 터널 켜는 중"
$env:PORT = "8080"
$env:HOST = "127.0.0.1"   # 내 PC 안에서만 열고, 바깥은 터널로만 들어오게 (방화벽 창이 안 뜬다)
$server = Start-Process node -ArgumentList "server/index.js" -NoNewWindow -PassThru
$log = Join-Path $env:TEMP "snowball-tunnel.log"
if (Test-Path $log) { Remove-Item $log -Force }
$tunnel = Start-Process $cf -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:8080" -NoNewWindow -PassThru -RedirectStandardError $log

try {
  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if ($server.HasExited) { Pause-Exit "서버가 꺼졌어요. 다른 프로그램이 8080 포트를 쓰고 있을 수 있어요." }
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
      if ($m) { $url = $m.Matches[0].Value }
    }
  }
  if (-not $url) { Pause-Exit "터널 주소를 못 받았어요. 인터넷 연결을 확인하고 다시 실행하세요. (로그: $log)" }

  Start-Sleep -Seconds 3
  Set-Clipboard -Value $url
  Write-Host ""
  Write-Host "  준비 완료! 게임 주소:" -ForegroundColor Green
  Write-Host ""
  Write-Host "     $url" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  주소는 클립보드에 복사됐고 브라우저로 열어 둘게요."
  Write-Host "  방을 만든 뒤 '초대 링크 복사'로 친구에게 보내면 돼요."
  Write-Host "  주소는 켤 때마다 바뀌어요. 이 창을 닫으면 서버가 꺼져요."
  Write-Host ""
  Start-Process $url
  Wait-Process -Id $server.Id
} finally {
  foreach ($p in @($server, $tunnel)) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
}

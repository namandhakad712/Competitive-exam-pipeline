# sign-release.ps1 — Create a signed release archive + checksums
# Usage: .\scripts\sign-release.ps1 -Version "1.0.0"
# Requires: GPG installed, git configured with signing key

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$GPG = "C:\Program Files\GnuPG\bin\gpg.exe"
$REPO = "C:\QUESTION-PIPELINE"
$OUTPUT = "$REPO\releases"

if (-not (Test-Path $OUTPUT)) {
    New-Item -ItemType Directory -Path $OUTPUT -Force | Out-Null
}

Write-Host "=== Signing Release v$Version ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create the archive
$archiveName = "question-pipeline-v$Version"
$archiveZip = "$OUTPUT\$archiveName.zip"
$archiveTar = "$OUTPUT\$archiveName.tar.gz"

Write-Host "Creating archives..." -ForegroundColor Yellow
git -C $REPO archive --format=zip --output=$archiveZip HEAD
git -C $REPO archive --format=tar.gz --output=$archiveTar HEAD

Write-Host "  $archiveZip"
Write-Host "  $archiveTar"

# Step 2: Compute SHA-256 checksums
Write-Host "`nComputing SHA-256 checksums..." -ForegroundColor Yellow
$zipHash = (Get-FileHash -Algorithm SHA256 $archiveZip).Hash.ToLower()
$tarHash = (Get-FileHash -Algorithm SHA256 $archiveTar).Hash.ToLower()

$checksumContent = @"
# question-pipeline v$Version — SHA-256 Checksums
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC")
# Verify: Get-FileHash -Algorithm SHA256 <filename>

$zipHash  $archiveName.zip
$tarHash  $archiveName.tar.gz
"@

$checksumFile = "$OUTPUT\$archiveName-sha256.txt"
$checksumContent | Out-File -FilePath $checksumFile -Encoding utf8
Write-Host "  $checksumFile"

# Step 3: GPG-sign the archives
Write-Host "`nGPG-signing archives..." -ForegroundColor Yellow
& $GPG --detach-sign --armor $archiveZip
& $GPG --detach-sign --armor $archiveTar
& $GPG --detach-sign --armor $checksumFile

Write-Host "  $archiveZip.asc"
Write-Host "  $archiveTar.asc"
Write-Host "  $checksumFile.asc"

# Step 4: Sign the checksum file itself
Write-Host "`nFiles in release:" -ForegroundColor Yellow
Get-ChildItem $OUTPUT -Filter "*$Version*" | ForEach-Object {
    Write-Host "  $($_.Name) ($( '{0:N2}' -f ($_.Length/1KB) ) KB)"
}

Write-Host ""
Write-Host "=== RELEASE FILES READY ===" -ForegroundColor Green
Write-Host "All files in: $OUTPUT"
Write-Host ""
Write-Host "=== VERIFICATION COMMANDS (for anyone) ===" -ForegroundColor Cyan
Write-Host "# Verify GPG signature:"
Write-Host "gpg --verify $archiveName.zip.asc $archiveName.zip"
Write-Host ""
Write-Host "# Verify checksum:"
Write-Host "Get-FileHash -Algorithm SHA256 $archiveName.zip"
Write-Host "# Compare with:"
Write-Host "Get-Content $archiveName-sha256.txt"
Write-Host ""
Write-Host "# Import your public key first (published on GitHub):"
Write-Host "gpg --recv-key YOUR_KEY_ID"
Write-Host ""
Write-Host "=== PUBLISH ON GITHUB ===" -ForegroundColor Cyan
Write-Host "1. Go to https://github.com/namandhakad712/Jee-Neet-PYQ/releases/new"
Write-Host "2. Tag: v$Version"
Write-Host "3. Upload all files from: $OUTPUT"
Write-Host "4. Publish release"

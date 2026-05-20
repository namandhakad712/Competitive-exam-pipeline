# setup-gpg.ps1 — Generate GPG key + configure git for signed commits
# Run this from PowerShell at the repo root

$GPG = "C:\Program Files\GnuPG\bin\gpg.exe"

Write-Host "=== Question-Pipeline: GPG Setup ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Generate GPG key (batch mode)
Write-Host "Step 1: Generating GPG key..." -ForegroundColor Yellow

$name = Read-Host "Enter your full name (e.g., Naman Dhakad)"
$email = Read-Host "Enter your GitHub email"

$batch = @"
Key-Type: RSA
Key-Length: 4096
Key-Usage: sign
Subkey-Type: RSA
Subkey-Length: 4096
Subkey-Usage: encrypt
Name-Real: $name
Name-Email: $email
Expire-Date: 0
%commit
"@

$batch | & $GPG --batch --gen-key 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED to generate key. Trying interactive mode..." -ForegroundColor Red
    & $GPG --full-generate-key
}

# Step 2: List keys and get key ID
Write-Host ""
Write-Host "Step 2: Your GPG keys:" -ForegroundColor Yellow
& $GPG --list-secret-keys --keyid-format LONG

$keyId = Read-Host "`nPaste the key ID from above (long hex, e.g., 3AA5C34371567BD2)"

# Step 3: Configure git
Write-Host ""
Write-Host "Step 3: Configuring git..." -ForegroundColor Yellow
git config user.signingkey $keyId
git config commit.gpgsign true
git config gpg.program $GPG

Write-Host "Git configured:"
git config --get user.signingkey
git config --get commit.gpgsign
git config --get gpg.program

# Step 4: Export public key for GitHub
Write-Host ""
Write-Host "Step 4: Exporting public key..." -ForegroundColor Yellow
$pubKey = & $GPG --armor --export $keyId
$pubKey | Set-Clipboard
Write-Host "Public key copied to clipboard!"

Write-Host ""
Write-Host "=== NEXT STEPS ===" -ForegroundColor Green
Write-Host "1. Go to https://github.com/settings/keys"
Write-Host "2. Click 'New GPG key'"
Write-Host "3. Paste the public key from clipboard"
Write-Host ""
Write-Host "Then make your first signed commit:"
Write-Host "  git add -A"
Write-Host "  git commit -S -m 'feat: signed commit test'"
Write-Host "  git push"
Write-Host ""
Write-Host "Look for the green 'Verified' badge on GitHub!" -ForegroundColor Cyan

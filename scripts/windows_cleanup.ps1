#Requires -RunAsAdministrator
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "⚠️  Please run this script as Administrator (right-click → Run as Administrator)" -ForegroundColor Red
    pause
    exit
}

$ErrorActionPreference = "SilentlyContinue"

# ── COLORS ──────────────────────────────────────────────────────
function log     { param($m) Write-Host "[INFO] $m" -ForegroundColor Cyan }
function success { param($m) Write-Host "[DONE] $m" -ForegroundColor Green }
function warn    { param($m) Write-Host "[WARN] $m" -ForegroundColor Yellow }
function section { param($m) Write-Host "`n══ $m ══" -ForegroundColor Blue }
function ask {
    param($m)
    $r = Read-Host "$m (y/n)"
    return $r -eq 'y' -or $r -eq 'Y'
}
function bytesToGB { param($b) return [math]::Round($b / 1GB, 2) }

# ── PROTECTED PROJECT FOLDERS (never delete node_modules here) ──
$PROTECTED = @(
    "trinity-symphony", "trinity-symphony-shared", "DealAppSeo",
    "trustshell", "nmgda", "trinexus", "aisocialmirror", "hyperdag"
)

# ═══════════════════════════════════════════════════════════════
section "STEP 1 — DISK STATUS"
# ═══════════════════════════════════════════════════════════════

$disk = Get-PSDrive C
$freeGB  = bytesToGB ($disk.Free)
$usedGB  = bytesToGB ($disk.Used)
$totalGB = bytesToGB ($disk.Free + $disk.Used)

Write-Host ""
Write-Host "  Drive C:  Total: ${totalGB}GB  |  Used: ${usedGB}GB  |  Free: ${freeGB}GB" -ForegroundColor White
if ($freeGB -lt 5) {
    Write-Host "  🔴 CRITICAL: Less than 5GB free. This is why Windows is crawling." -ForegroundColor Red
} elseif ($freeGB -lt 15) {
    Write-Host "  🟡 LOW: Under 15GB free. Recovery in progress." -ForegroundColor Yellow
}
Write-Host ""

# ── FIND WD PASSPORT ────────────────────────────────────────────
section "STEP 2 — FIND WD PASSPORT"

$WD = $null
Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -ne 'C' } | ForEach-Object {
    $label = (Get-Volume -DriveLetter $_.Name -ErrorAction SilentlyContinue).FileSystemLabel
    log "Found drive $($_.Name): — Label: $label — Free: $(bytesToGB $_.Free)GB"
    if ($label -like "*WD*" -or $label -like "*Passport*" -or $label -like "*Elements*") {
        $WD = $_.Name + ":"
        success "WD Passport found at $WD"
    }
}

if (-not $WD) {
    # Try all non-C drives as fallback
    $drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -ne 'C' }
    if ($drives.Count -eq 1) {
        $WD = $drives[0].Name + ":"
        warn "Could not confirm WD label. Using only external drive found: $WD"
    } else {
        Write-Host ""
        warn "Multiple external drives found. Which drive letter is your WD Passport?"
        $WD = Read-Host "Enter drive letter (e.g. D or E)"
        $WD = $WD.TrimEnd(':') + ":"
    }
}

log "Using WD Passport at: $WD"

# Create folders on WD if they don't exist
$folders = @("Videos", "Pictures", "Downloads_Offload", "Documents_Offload", "Old_Projects")
foreach ($f in $folders) {
    $path = "$WD\$f"
    if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
}

$totalRecovered = 0

# ═══════════════════════════════════════════════════════════════
section "STEP 3 — WINDOWS TEMP FILES (Safe to delete)"
# ═══════════════════════════════════════════════════════════════

$tempPaths = @(
    $env:TEMP,
    $env:TMP,
    "C:\Windows\Temp",
    "C:\Windows\SoftwareDistribution\Download",
    "$env:LOCALAPPDATA\Temp"
)

$tempSize = 0
foreach ($p in $tempPaths) {
    if (Test-Path $p) {
        $size = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $tempSize += $size
        log "  $p — $(bytesToGB $size)GB"
    }
}

Write-Host "  Temp files total: $(bytesToGB $tempSize)GB" -ForegroundColor White

if (ask "Delete all Windows temp files?") {
    foreach ($p in $tempPaths) {
        if (Test-Path $p) {
            Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        }
    }
    $totalRecovered += $tempSize
    success "Temp files cleared — recovered approx $(bytesToGB $tempSize)GB"
}

# ═══════════════════════════════════════════════════════════════
section "STEP 4 — BROWSER CACHES"
# ═══════════════════════════════════════════════════════════════

$cachePaths = @{
    "Chrome"  = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"
    "Edge"    = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"
    "Firefox" = "$env:APPDATA\Mozilla\Firefox\Profiles"
    "Brave"   = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Cache"
}

$cacheSize = 0
foreach ($browser in $cachePaths.Keys) {
    $p = $cachePaths[$browser]
    if (Test-Path $p) {
        $size = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $cacheSize += $size
        log "  $browser cache: $(bytesToGB $size)GB"
    }
}

if ($cacheSize -gt 0 -and (ask "Clear browser caches ($(bytesToGB $cacheSize)GB)?")) {
    foreach ($p in $cachePaths.Values) {
        if (Test-Path $p) {
            Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        }
    }
    $totalRecovered += $cacheSize
    success "Browser caches cleared"
}

# ═══════════════════════════════════════════════════════════════
section "STEP 5 — NPM / YARN / PIP CACHES"
# ═══════════════════════════════════════════════════════════════

$npmCache  = "$env:APPDATA\npm-cache"
$yarnCache = "$env:LOCALAPPDATA\Yarn\Cache"
$pipCache  = "$env:LOCALAPPDATA\pip\Cache"

$devCacheSize = 0
foreach ($p in @($npmCache, $yarnCache, $pipCache)) {
    if (Test-Path $p) {
        $size = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $devCacheSize += $size
        log "  $p — $(bytesToGB $size)GB"
    }
}

if ($devCacheSize -gt 0 -and (ask "Clear npm/yarn/pip caches ($(bytesToGB $devCacheSize)GB)? Safe — they rebuild automatically.")) {
    if (Test-Path $npmCache)  { Remove-Item $npmCache  -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $yarnCache) { Remove-Item $yarnCache -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $pipCache)  { Remove-Item $pipCache  -Recurse -Force -ErrorAction SilentlyContinue }
    $totalRecovered += $devCacheSize
    success "Dev caches cleared"
}

# ═══════════════════════════════════════════════════════════════
section "STEP 6 — STALE NODE_MODULES (skips protected projects)"
# ═══════════════════════════════════════════════════════════════

log "Scanning for node_modules folders (this may take a minute)..."

$nodeModuleFolders = Get-ChildItem -Path "C:\Users\$env:USERNAME" -Filter "node_modules" -Recurse -Directory -ErrorAction SilentlyContinue

$safeToDelete = @()
$nodeSize = 0

foreach ($nm in $nodeModuleFolders) {
    $parentName = $nm.Parent.Name.ToLower()
    $isProtected = $false
    foreach ($p in $PROTECTED) {
        if ($parentName -like "*$p*" -or $nm.FullName -like "*$p*") {
            $isProtected = $true
            break
        }
    }
    
    if (-not $isProtected) {
        $size = (Get-ChildItem $nm.FullName -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $nodeSize += $size
        $safeToDelete += [PSCustomObject]@{ Path = $nm.FullName; SizeGB = bytesToGB $size }
        log "  SAFE TO DELETE: $($nm.FullName) ($(bytesToGB $size)GB)"
    } else {
        warn "  PROTECTED (skipping): $($nm.FullName)"
    }
}

if ($safeToDelete.Count -gt 0) {
    Write-Host ""
    Write-Host "  Found $($safeToDelete.Count) non-protected node_modules totaling $(bytesToGB $nodeSize)GB" -ForegroundColor White
    if (ask "Delete these node_modules folders?") {
        foreach ($item in $safeToDelete) {
            Remove-Item $item.Path -Recurse -Force -ErrorAction SilentlyContinue
            success "Deleted: $($item.Path)"
        }
        $totalRecovered += $nodeSize
    }
} else {
    log "No non-protected node_modules found."
}

# ═══════════════════════════════════════════════════════════════
section "STEP 7 — VIDEOS TO WD PASSPORT"
# ═══════════════════════════════════════════════════════════════

$videoExts = @("*.mp4", "*.mov", "*.avi", "*.mkv", "*.wmv", "*.m4v", "*.webm")
$searchPaths = @(
    "$env:USERPROFILE\Videos",
    "$env:USERPROFILE\Downloads",
    "$env:USERPROFILE\Desktop",
    "$env:USERPROFILE\Documents"
)

$videos = @()
foreach ($sp in $searchPaths) {
    foreach ($ext in $videoExts) {
        $found = Get-ChildItem -Path $sp -Filter $ext -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 50MB }
        $videos += $found
    }
}

if ($videos.Count -gt 0) {
    $videoSize = ($videos | Measure-Object -Property Length -Sum).Sum
    Write-Host ""
    Write-Host "  Found $($videos.Count) video files over 50MB — total $(bytesToGB $videoSize)GB" -ForegroundColor White
    $videos | ForEach-Object { log "  $($_.FullName) ($(bytesToGB $_.Length)GB)" }
    
    if (ask "MOVE all these videos to $WD\Videos\?") {
        foreach ($v in $videos) {
            $dest = "$WD\Videos\$($v.Name)"
            Move-Item $v.FullName $dest -Force -ErrorAction SilentlyContinue
            success "Moved: $($v.Name)"
        }
        $totalRecovered += $videoSize
    }
} else {
    log "No large video files found in standard locations."
}

# ═══════════════════════════════════════════════════════════════
section "STEP 8 — LARGE IMAGES / PHOTOS TO WD PASSPORT"
# ═══════════════════════════════════════════════════════════════

$imageExts = @("*.jpg", "*.jpeg", "*.png", "*.psd", "*.raw", "*.tiff", "*.bmp", "*.heic")
$images = @()
foreach ($sp in $searchPaths) {
    foreach ($ext in $imageExts) {
        $found = Get-ChildItem -Path $sp -Filter $ext -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 5MB }
        $images += $found
    }
}

if ($images.Count -gt 0) {
    $imageSize = ($images | Measure-Object -Property Length -Sum).Sum
    Write-Host ""
    Write-Host "  Found $($images.Count) large image files — total $(bytesToGB $imageSize)GB" -ForegroundColor White
    
    if (ask "MOVE large images (>5MB each) to $WD\Pictures\?") {
        foreach ($img in $images) {
            $dest = "$WD\Pictures\$($img.Name)"
            Move-Item $img.FullName $dest -Force -ErrorAction SilentlyContinue
        }
        $totalRecovered += $imageSize
        success "Images moved to WD Passport"
    }
}

# ═══════════════════════════════════════════════════════════════
section "STEP 9 — LARGE DOWNLOADS CLEANUP"
# ═══════════════════════════════════════════════════════════════

$bigDownloads = Get-ChildItem "$env:USERPROFILE\Downloads" -File -ErrorAction SilentlyContinue | 
    Where-Object { $_.Length -gt 100MB } | 
    Sort-Object Length -Descending

if ($bigDownloads.Count -gt 0) {
    $dlSize = ($bigDownloads | Measure-Object -Property Length -Sum).Sum
    Write-Host ""
    Write-Host "  Large files in Downloads folder:" -ForegroundColor White
    $bigDownloads | ForEach-Object { log "  $($_.Name) — $(bytesToGB $_.Length)GB" }
    
    if (ask "MOVE these large downloads to $WD\Downloads_Offload\?") {
        foreach ($f in $bigDownloads) {
            Move-Item $f.FullName "$WD\Downloads_Offload\$($f.Name)" -Force -ErrorAction SilentlyContinue
        }
        $totalRecovered += $dlSize
        success "Large downloads moved to WD Passport"
    }
}

# ═══════════════════════════════════════════════════════════════
section "STEP 10 — .NEXT BUILD FOLDERS (old Next.js builds)"
# ═══════════════════════════════════════════════════════════════

$nextBuilds = Get-ChildItem -Path "C:\Users\$env:USERNAME" -Filter ".next" -Recurse -Directory -ErrorAction SilentlyContinue

$nextSize = 0
$safeNext = @()
foreach ($nb in $nextBuilds) {
    $parentName = $nb.Parent.Name.ToLower()
    $isProtected = $false
    foreach ($p in $PROTECTED) {
        if ($nb.FullName -like "*$p*") { $isProtected = $true; break }
    }
    if (-not $isProtected) {
        $size = (Get-ChildItem $nb.FullName -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $nextSize += $size
        $safeNext += $nb.FullName
        log "  $($nb.FullName) — $(bytesToGB $size)GB"
    }
}

if ($safeNext.Count -gt 0 -and (ask "Delete $($safeNext.Count) old .next build folders ($(bytesToGB $nextSize)GB)?")) {
    foreach ($p in $safeNext) {
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
    }
    $totalRecovered += $nextSize
    success "Old .next folders deleted"
}

# ═══════════════════════════════════════════════════════════════
section "STEP 11 — WINDOWS RECYCLE BIN"
# ═══════════════════════════════════════════════════════════════

if (ask "Empty the Recycle Bin?") {
    Clear-RecycleBin -Force -ErrorAction SilentlyContinue
    success "Recycle Bin emptied"
}

# ═══════════════════════════════════════════════════════════════
section "FINAL REPORT"
# ═══════════════════════════════════════════════════════════════

$diskAfter = Get-PSDrive C
$freeAfterGB = bytesToGB $diskAfter.Free

Write-Host ""
Write-Host "  ─────────────────────────────────────────" -ForegroundColor Green
Write-Host "  Space before:    ${freeGB}GB free" -ForegroundColor White
Write-Host "  Space after:     ${freeAfterGB}GB free" -ForegroundColor White
Write-Host "  Recovered:       $(bytesToGB $totalRecovered)GB" -ForegroundColor Green
Write-Host "  WD Passport:     $WD" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────" -ForegroundColor Green
Write-Host ""

if ($freeAfterGB -lt 10) {
    warn "Still under 10GB free. Consider moving old project folders to WD Passport manually."
    warn "Check: C:\Users\$env:USERNAME — look for old zip files, installers, project archives."
}

success "Cleanup complete. Restart Windows to apply all changes."
Write-Host ""
pause

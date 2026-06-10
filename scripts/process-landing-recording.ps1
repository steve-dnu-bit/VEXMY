# Trim and stylize screen recordings into landing-page clips.
# Requires FFmpeg on PATH (winget install Gyan.FFmpeg).
#
# Usage (stencil recording — e.g. Clipchamp export):
#   .\scripts\process-landing-recording.ps1 -Input "C:\Users\mrtat\Downloads\Video Project (1).mp4" -Mode stencil
#
# Usage (split schedule + stencil from one long recording):
#   .\scripts\process-landing-recording.ps1 -Input recording.mp4 -Mode split -ScheduleStart 0 -ScheduleEnd 12 -StencilStart 15 -StencilEnd 28
#
# Outputs:
#   public/marketing/videos/stencil.mp4, stencil-hero.mp4
#   public/marketing/screenshots/stencil-poster.jpg
#   (split mode also writes schedule.mp4)

param(
    [Parameter(Mandatory = $true)]
    [string]$Input,

    [ValidateSet("stencil", "split")]
    [string]$Mode = "stencil",

    [double]$ScheduleStart = 0,
    [double]$ScheduleEnd = 12,
    [double]$StencilStart = 0,
    [double]$StencilEnd = 24,
    [double]$HeroStart = 3.5,
    [double]$HeroEnd = 14.5,
    [double]$PosterAt = 18.5,

    [int]$Width = 1280,
    [int]$Height = 720
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $repoRoot "public\marketing\videos"

if (-not (Test-Path $Input)) {
    throw "Input file not found: $Input"
}

$size = (Get-Item $Input).Length
if ($size -lt 1KB) {
    throw "Input file is only $size bytes — recording likely failed. Re-export the screen capture and try again."
}

function Assert-Ffmpeg {
    if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
        throw "ffmpeg not found. Install with: winget install Gyan.FFmpeg"
    }
}

function Export-Clip {
    param(
        [string]$Name,
        [double]$Start,
        [double]$End,
        [switch]$KenBurns
    )

    if ($End -le $Start) {
        throw "Invalid range for ${Name}: $Start -> $End"
    }

    $duration = $End - $Start
    $outPath = Join-Path $outDir "$Name.mp4"
    $fadeOutStart = [math]::Max(0, $duration - 0.5)

    $vf = if ($KenBurns) {
        @(
            "scale=${Width}:${Height}:force_original_aspect_ratio=increase"
            "crop=${Width}:${Height}"
            "zoompan=z='min(zoom+0.0008,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${Width}x${Height}:fps=30"
            "fade=t=in:st=0:d=0.4"
            "fade=t=out:st=$fadeOutStart`:d=0.5"
        ) -join ","
    } else {
        "scale=${Width}:${Height},fade=t=in:st=0:d=0.35,fade=t=out:st=$fadeOutStart`:d=0.45"
    }

    Write-Host "Rendering $Name ($Start`s -> $End`s) -> $outPath"
    & ffmpeg -y -hide_banner -ss $Start -i $Input -t $duration -an -vf $vf `
        -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p `
        $outPath

    if ($LASTEXITCODE -ne 0) {
        throw "ffmpeg failed for $Name"
    }
}

Assert-Ffmpeg
$posterDir = Join-Path $repoRoot "public\marketing\screenshots"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $posterDir | Out-Null

if ($Mode -eq "split") {
    Export-Clip -Name "schedule" -Start $ScheduleStart -End $ScheduleEnd -KenBurns
}

Export-Clip -Name "stencil" -Start $StencilStart -End $StencilEnd

Write-Host "Cutting hero loop from stencil clip..."
$stencilPath = Join-Path $outDir "stencil.mp4"
$heroPath = Join-Path $outDir "stencil-hero.mp4"
$heroDuration = $HeroEnd - $HeroStart
& ffmpeg -y -hide_banner -ss $HeroStart -i $stencilPath -t $heroDuration -c copy $heroPath
if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for stencil-hero" }

Write-Host "Extracting poster frame..."
$posterPath = Join-Path $posterDir "stencil-poster.jpg"
& ffmpeg -y -hide_banner -ss $PosterAt -i $Input -frames:v 1 -update 1 -vf "scale=${Width}:${Height}" $posterPath
if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed for poster" }

Write-Host "Done. Clips written to $outDir"

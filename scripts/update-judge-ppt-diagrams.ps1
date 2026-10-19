Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$deckPath = Join-Path $PSScriptRoot '..\First_Signs_Judge_Presentation.pptx'
$deckPath = [System.IO.Path]::GetFullPath($deckPath)
$backupPath = Join-Path (Split-Path $deckPath) 'First_Signs_Judge_Presentation.before-diagrams.pptx'

function Rgb([int]$red, [int]$green, [int]$blue) {
  return $red + ($green -shl 8) + ($blue -shl 16)
}

function Set-ShapeStyle($shape, [int]$fill, [int]$line, [int]$radius = 5) {
  $shape.Fill.Visible = -1
  $shape.Fill.Solid()
  $shape.Fill.ForeColor.RGB = $fill
  $shape.Line.Visible = -1
  $shape.Line.ForeColor.RGB = $line
  $shape.Line.Weight = 1
}

function Add-Text($slide, [string]$text, [single]$left, [single]$top, [single]$width, [single]$height, [single]$size, [int]$color, [bool]$bold = $false, [int]$align = 1) {
  $shape = $slide.Shapes.AddTextbox(1, $left, $top, $width, $height)
  $shape.TextFrame.MarginLeft = 0
  $shape.TextFrame.MarginRight = 0
  $shape.TextFrame.MarginTop = 0
  $shape.TextFrame.MarginBottom = 0
  $shape.TextFrame.WordWrap = -1
  $shape.TextFrame.TextRange.Text = $text
  $shape.TextFrame.TextRange.Font.Name = 'Aptos'
  $shape.TextFrame.TextRange.Font.Size = $size
  $shape.TextFrame.TextRange.Font.Color.RGB = $color
  $shape.TextFrame.TextRange.Font.Bold = $(if ($bold) { -1 } else { 0 })
  $shape.TextFrame.TextRange.ParagraphFormat.Alignment = $align
  return $shape
}

function Add-Card($slide, [single]$left, [single]$top, [single]$width, [single]$height, [int]$fill, [int]$line, [string]$number, [string]$title, [string]$detail) {
  $card = $slide.Shapes.AddShape(5, $left, $top, $width, $height)
  Set-ShapeStyle $card $fill $line
  $badge = $slide.Shapes.AddShape(9, $left + 10, $top + 10, 25, 25)
  Set-ShapeStyle $badge (Rgb 15 35 55) (Rgb 15 35 55)
  $badge.TextFrame.TextRange.Text = $number
  $badge.TextFrame.TextRange.Font.Name = 'Aptos'
  $badge.TextFrame.TextRange.Font.Size = 11
  $badge.TextFrame.TextRange.Font.Bold = -1
  $badge.TextFrame.TextRange.Font.Color.RGB = (Rgb 255 255 255)
  $badge.TextFrame.TextRange.ParagraphFormat.Alignment = 2
  Add-Text $slide $title ($left + 12) ($top + 49) ($width - 24) 34 14 (Rgb 15 35 55) $true 2 | Out-Null
  Add-Text $slide $detail ($left + 12) ($top + 91) ($width - 24) 42 9.5 (Rgb 63 79 92) $false 2 | Out-Null
}

function Add-Arrow($slide, [single]$x1, [single]$y1, [single]$x2, [single]$y2, [int]$color) {
  $line = $slide.Shapes.AddLine($x1, $y1, $x2, $y2)
  $line.Line.ForeColor.RGB = $color
  $line.Line.Weight = 2
  $line.Line.EndArrowheadStyle = 3
  return $line
}

function Add-Pill($slide, [string]$text, [single]$left, [single]$top, [single]$width, [int]$fill, [int]$textColor) {
  $pill = $slide.Shapes.AddShape(5, $left, $top, $width, 28)
  Set-ShapeStyle $pill $fill $fill
  $pill.TextFrame.TextRange.Text = $text
  $pill.TextFrame.TextRange.Font.Name = 'Aptos'
  $pill.TextFrame.TextRange.Font.Size = 10
  $pill.TextFrame.TextRange.Font.Bold = -1
  $pill.TextFrame.TextRange.Font.Color.RGB = $textColor
  $pill.TextFrame.TextRange.ParagraphFormat.Alignment = 2
  return $pill
}

function New-NonTechnicalDiagram($presentation, [int]$index) {
  $slide = $presentation.Slides.Add($index, 12)
  $slide.FollowMasterBackground = 0
  $background = $slide.Shapes.AddShape(1, 0, 0, 960, 540)
  Set-ShapeStyle $background (Rgb 241 248 252) (Rgb 241 248 252)
  Add-Text $slide 'From concern to completed handoff' 48 29 864 35 26 (Rgb 15 35 55) $true 1 | Out-Null
  Add-Text $slide 'A clear, human journey - without diagnosing disease' 48 72 864 20 12 (Rgb 63 79 92) $false 1 | Out-Null

  Add-Pill $slide 'Self-use' 202 113 100 (Rgb 218 240 237) (Rgb 14 97 90) | Out-Null
  Add-Pill $slide 'Pharmacy-assisted' 322 113 132 (Rgb 228 236 252) (Rgb 43 82 148) | Out-Null
  Add-Text $slide 'Two accessible ways to begin' 208 147 238 16 10 (Rgb 63 79 92) $false 2 | Out-Null
  Add-Arrow $slide 328 159 328 182 (Rgb 91 119 140) | Out-Null

  $cardWidth = 136
  $cardHeight = 154
  $top = 190
  $lefts = @(32, 188, 344, 500, 656, 812)
  $fills = @((Rgb 255 255 255), (Rgb 238 249 247), (Rgb 255 255 255), (Rgb 238 246 255), (Rgb 255 255 255), (Rgb 247 242 255))
  $titles = @('Choose a concern', 'Consent + questions', 'Clear next step', 'Choose a facility', 'Referral ID + QR', 'Attend or follow up')
  $details = @('Pick the concern that best matches today.', 'Answer only what is needed for the pathway.', 'Understand what to do next - not a diagnosis.', 'See an appropriate listed care option.', 'Keep a private, portable handoff.', 'Attendance is recorded; missed visits get support.')
  for ($i = 0; $i -lt 6; $i++) {
    Add-Card $slide $lefts[$i] $top $cardWidth $cardHeight $fills[$i] (Rgb 205 220 230) ($i + 1).ToString() $titles[$i] $details[$i]
    if ($i -lt 5) {
      Add-Arrow $slide ($lefts[$i] + $cardWidth + 4) ($top + 76) ($lefts[$i + 1] - 7) ($top + 76) (Rgb 61 139 132) | Out-Null
    }
  }

  $banner = $slide.Shapes.AddShape(5, 115, 393, 730, 74)
  Set-ShapeStyle $banner (Rgb 15 35 55) (Rgb 15 35 55)
  Add-Text $slide 'One connected journey, with privacy and clear responsibilities at every handoff.' 138 412 684 22 15 (Rgb 255 255 255) $true 2 | Out-Null
  Add-Text $slide 'Screening guides care. It never confirms or rules out a disease.' 138 440 684 17 11 (Rgb 212 232 239) $false 2 | Out-Null
  Add-Text $slide 'FIRST SIGNS  |  HACKATHON PROTOTYPE' 48 500 360 16 9 (Rgb 91 119 140) $true 1 | Out-Null
  Add-Text $slide '4' 896 500 16 16 10 (Rgb 91 119 140) $true 3 | Out-Null
}

function New-TechnicalDiagram($presentation, [int]$index) {
  $slide = $presentation.Slides.Add($index, 12)
  $slide.FollowMasterBackground = 0
  $background = $slide.Shapes.AddShape(1, 0, 0, 960, 540)
  Set-ShapeStyle $background (Rgb 248 250 252) (Rgb 248 250 252)
  Add-Text $slide 'Simple for people. Deliberate underneath.' 48 28 864 35 26 (Rgb 15 35 55) $true 1 | Out-Null
  Add-Text $slide 'A safety-first architecture: the core care path works even when optional services do not.' 48 71 864 19 12 (Rgb 63 79 92) $false 1 | Out-Null

  $clientLabels = @('Web', 'Mobile', 'Telegram')
  $clientLefts = @(72, 180, 288)
  for ($i = 0; $i -lt 3; $i++) {
    $client = $slide.Shapes.AddShape(5, $clientLefts[$i], 128, 86, 48)
    Set-ShapeStyle $client (Rgb 232 242 250) (Rgb 174 202 219)
    $client.TextFrame.TextRange.Text = $clientLabels[$i]
    $client.TextFrame.TextRange.Font.Name = 'Aptos'
    $client.TextFrame.TextRange.Font.Size = 13
    $client.TextFrame.TextRange.Font.Bold = -1
    $client.TextFrame.TextRange.Font.Color.RGB = (Rgb 15 35 55)
    $client.TextFrame.TextRange.ParagraphFormat.Alignment = 2
    Add-Arrow $slide ($clientLefts[$i] + 43) 177 ($clientLefts[$i] + 43) 201 (Rgb 91 119 140) | Out-Null
  }
  Add-Text $slide 'People and access channels' 72 104 300 16 10 (Rgb 91 119 140) $true 1 | Out-Null

  $app = $slide.Shapes.AddShape(5, 56, 205, 390, 173)
  Set-ShapeStyle $app (Rgb 15 35 55) (Rgb 15 35 55)
  Add-Text $slide 'FIRST SIGNS  |  Next.js + React + TypeScript' 77 224 348 20 14 (Rgb 255 255 255) $true 2 | Out-Null
  $safety = $slide.Shapes.AddShape(5, 78, 266, 160, 82)
  Set-ShapeStyle $safety (Rgb 35 88 106) (Rgb 91 151 166)
  Add-Text $slide 'Fixed safety rules' 92 280 132 18 13 (Rgb 255 255 255) $true 2 | Out-Null
  Add-Text $slide 'pathways | validation | urgent-sign precedence' 91 306 134 28 9.5 (Rgb 219 240 245) $false 2 | Out-Null
  $care = $slide.Shapes.AddShape(5, 260, 266, 164, 82)
  Set-ShapeStyle $care (Rgb 17 115 105) (Rgb 93 177 163)
  Add-Text $slide 'Care navigation' 274 280 136 18 13 (Rgb 255 255 255) $true 2 | Out-Null
  Add-Text $slide 'facilities | referral | QR | follow-up' 273 306 138 28 9.5 (Rgb 224 247 241) $false 2 | Out-Null

  Add-Arrow $slide 250 379 250 411 (Rgb 61 139 132) | Out-Null
  $data = $slide.Shapes.AddShape(5, 90, 415, 320, 65)
  Set-ShapeStyle $data (Rgb 229 237 252) (Rgb 157 181 226)
  Add-Text $slide 'SUPABASE + POSTGRESQL' 108 428 284 18 14 (Rgb 33 64 121) $true 2 | Out-Null
  Add-Text $slide 'private care records | role-based access | scoped reporting' 108 452 284 15 9.5 (Rgb 55 79 125) $false 2 | Out-Null

  Add-Text $slide 'Optional extensions' 545 117 280 16 10 (Rgb 91 119 140) $true 1 | Out-Null
  $optionalLabels = @("Maps`nMapLibre", "AI explanations`nGemini", "Reminders`nResend", "Experimental audio`nGoogle HeAR")
  $optionalTops = @(142, 211, 280, 349)
  for ($i = 0; $i -lt 4; $i++) {
    $box = $slide.Shapes.AddShape(5, 545, $optionalTops[$i], 200, 50)
    Set-ShapeStyle $box (Rgb 255 255 255) (Rgb 193 207 216)
    $box.TextFrame.TextRange.Text = $optionalLabels[$i]
    $box.TextFrame.TextRange.Font.Name = 'Aptos'
    $box.TextFrame.TextRange.Font.Size = 11
    $box.TextFrame.TextRange.Font.Bold = -1
    $box.TextFrame.TextRange.Font.Color.RGB = (Rgb 29 56 70)
    $box.TextFrame.TextRange.ParagraphFormat.Alignment = 2
    $line = Add-Arrow $slide 545 ($optionalTops[$i] + 25) 452 292 (Rgb 169 188 199)
    $line.Line.DashStyle = 4
  }
  $note = $slide.Shapes.AddShape(5, 515, 425, 366, 54)
  Set-ShapeStyle $note (Rgb 239 249 247) (Rgb 157 211 199)
  Add-Text $slide 'Optional services can explain or extend the journey. They cannot change the safety outcome.' 533 440 330 25 11 (Rgb 15 97 90) $true 2 | Out-Null

  Add-Pill $slide 'Fixed rules decide care guidance' 48 496 187 (Rgb 223 241 239) (Rgb 15 97 90) | Out-Null
  Add-Pill $slide 'Roles are kept separate' 250 496 163 (Rgb 230 237 252) (Rgb 43 82 148) | Out-Null
  Add-Pill $slide 'Grouped broad-area reporting' 428 496 190 (Rgb 243 239 253) (Rgb 93 62 142) | Out-Null
  Add-Text $slide '5' 896 500 16 16 10 (Rgb 91 119 140) $true 3 | Out-Null
}

if (-not (Test-Path -LiteralPath $backupPath)) {
  Copy-Item -LiteralPath $deckPath -Destination $backupPath
}
$powerPoint = New-Object -ComObject PowerPoint.Application
$presentation = $null
try {
  $presentation = $powerPoint.Presentations.Open($deckPath, 0, 0, 0)
  $presentation.Slides.Item(4).Delete()
  New-NonTechnicalDiagram $presentation 4
  $presentation.Slides.Item(5).Delete()
  New-TechnicalDiagram $presentation 5
  $presentation.Save()
}
finally {
  if ($null -ne $presentation) { $presentation.Close() }
  $powerPoint.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint)
}

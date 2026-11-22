<#
.SYNOPSIS
    Guest-side automation and screen-recording script executed inside Windows Sandbox.
    Seeds clean demo fixtures, launches WinFinder, drives an interactive tour via
    Windows UI Automation + Win32 mouse/keyboard input, and records the WinFinder
    client area to C:\demo-work\demo.mp4 via ffmpeg gdigrab.
#>
[CmdletBinding()]
param(
    [string]$WorkDir = "C:\demo-work",
    [string]$FfmpegPath = "C:\ffmpeg\ffmpeg.exe"
)

$ErrorActionPreference = "Stop"
$logFile = Join-Path $WorkDir "guest.log"
$statusFile = Join-Path $WorkDir "guest-exitcode.txt"

function Write-Log {
    param([string]$Message)
    $ts = (Get-Date).ToString("HH:mm:ss.fff")
    $line = "[$ts] $Message"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Host $line
}

Set-Content -Path $logFile -Value "" -Encoding UTF8
if (Test-Path $statusFile) { Remove-Item $statusFile -Force }

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName Microsoft.VisualBasic

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class DemoWin32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    public static IntPtr FindVisibleMainWindow(uint targetPid) {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == targetPid && IsWindowVisible(hWnd)) {
                RECT r;
                if (GetClientRect(hWnd, out r)) {
                    int w = r.Right - r.Left;
                    int h = r.Bottom - r.Top;
                    if (w >= 600 && h >= 400) {
                        found = hWnd;
                        return false;
                    }
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
    public const uint KEYEVENTF_KEYUP      = 0x0002;

    public const byte VK_CONTROL = 0x11;
    public const byte VK_RETURN  = 0x0D;
    public const byte VK_ESCAPE  = 0x1B;
    public const byte VK_F2      = 0x71;
    public const byte VK_TAB     = 0x09;
    public const byte VK_T       = 0x54;
    public const byte VK_F       = 0x46;

    public static void LeftClick() {
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(45);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    public static void PressKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(40);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static void PressCtrlKey(byte vk) {
        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(35);
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(45);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        System.Threading.Thread.Sleep(35);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
}
"@

function Move-MouseSmooth {
    param(
        [int]$TargetX,
        [int]$TargetY,
        [int]$Steps = 14,
        [int]$DurationMs = 240
    )
    $pt = New-Object DemoWin32+POINT
    [DemoWin32]::GetCursorPos([ref]$pt) | Out-Null
    $startX = $pt.X
    $startY = $pt.Y
    $stepDelay = [Math]::Max(8, [int]($DurationMs / $Steps))
    for ($i = 1; $i -le $Steps; $i++) {
        $t = $i / [double]$Steps
        # Ease-out cubic
        $ease = 1.0 - [Math]::Pow(1.0 - $t, 3)
        $x = [int][Math]::Round($startX + ($TargetX - $startX) * $ease)
        $y = [int][Math]::Round($startY + ($TargetY - $startY) * $ease)
        [DemoWin32]::SetCursorPos($x, $y) | Out-Null
        Start-Sleep -Milliseconds $stepDelay
    }
}

function Click-Point {
    param(
        [int]$X,
        [int]$Y,
        [int]$PauseAfterMs = 450
    )
    Move-MouseSmooth -TargetX $X -TargetY $Y
    Start-Sleep -Milliseconds 60
    [DemoWin32]::LeftClick()
    if ($PauseAfterMs -gt 0) {
        Start-Sleep -Milliseconds $PauseAfterMs
    }
}

function Find-UiaElement {
    param(
        [System.Windows.Automation.AutomationElement]$Root,
        [string]$Name,
        [string]$NameContains = $null,
        [System.Windows.Automation.ControlType]$ControlType = $null,
        [int]$TimeoutMs = 3000
    )
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    while ((Get-Date) -lt $deadline) {
        try {
            if ($Name -and -not $NameContains) {
                $cond = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::NameProperty,
                    $Name
                )
                if ($ControlType) {
                    $ctCond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        $ControlType
                    )
                    $cond = New-Object System.Windows.Automation.AndCondition($cond, $ctCond)
                }
                $el = $Root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
                if ($el) { return $el }
            } else {
                $cond = [System.Windows.Automation.Condition]::TrueCondition
                if ($ControlType) {
                    $cond = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                        $ControlType
                    )
                }
                $all = $Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
                for ($i = 0; $i -lt $all.Count; $i++) {
                    $item = $all.Item($i)
                    $itemName = $item.Current.Name
                    if ($itemName -and $itemName.IndexOf($NameContains, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                        $rect = $item.Current.BoundingRectangle
                        if (-not $rect.IsEmpty -and $rect.Width -gt 2 -and $rect.Height -gt 2) {
                            return $item
                        }
                    }
                }
            }
        } catch {
            # Retry until timeout
        }
        Start-Sleep -Milliseconds 120
    }
    return $null
}

function Click-UiaElement {
    param(
        [System.Windows.Automation.AutomationElement]$Root,
        [string]$Name = $null,
        [string]$NameContains = $null,
        [System.Windows.Automation.ControlType]$ControlType = $null,
        [int]$TimeoutMs = 3500,
        [int]$PauseAfterMs = 600,
        [int]$OffsetX = 0,
        [int]$OffsetY = 0
    )
    $label = if ($Name) { $Name } else { "*$NameContains*" }
    $el = Find-UiaElement -Root $Root -Name $Name -NameContains $NameContains -ControlType $ControlType -TimeoutMs $TimeoutMs
    if (-not $el) {
        Write-Log "WARN: UIA element not found: $label"
        return $false
    }
    $rect = $el.Current.BoundingRectangle
    if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0) {
        Write-Log "WARN: UIA element has empty rect: $label"
        return $false
    }
    $cx = [int][Math]::Round($rect.Left + $rect.Width / 2.0) + $OffsetX
    $cy = [int][Math]::Round($rect.Top + $rect.Height / 2.0) + $OffsetY
    Write-Log "Click UIA '$label' at ($cx, $cy)"
    Click-Point -X $cx -Y $cy -PauseAfterMs $PauseAfterMs
    return $true
}

function New-DemoDiagramPng {
    param([string]$Path)
    $w = 880
    $h = 540
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Rich macOS-style indigo/blue gradient background
    $bgRect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $bgRect,
        [System.Drawing.Color]::FromArgb(255, 18, 42, 92),
        [System.Drawing.Color]::FromArgb(255, 12, 118, 188),
        35.0
    )
    $g.FillRectangle($bgBrush, $bgRect)

    # Decorative soft glowing orbs
    $orb1 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(48, 96, 188, 255))
    $orb2 = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 148, 120, 255))
    $g.FillEllipse($orb1, -80, -60, 380, 380)
    $g.FillEllipse($orb2, 560, 240, 420, 420)

    # Glass header card
    $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(228, 255, 255, 255))
    $cardPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 255, 255), 1.5)
    $g.FillRectangle($cardBrush, 56, 48, 768, 444)
    $g.DrawRectangle($cardPen, 56, 48, 768, 444)

    # macOS traffic lights inside diagram
    $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 95, 86))), 80, 72, 14, 14)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 189, 46))), 102, 72, 14, 14)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 39, 201, 63))), 124, 72, 14, 14)

    $titleFont = New-Object System.Drawing.Font("Segoe UI", 24, [System.Drawing.FontStyle]::Bold)
    $subFont   = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Regular)
    $boxTitle  = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
    $boxBody   = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Regular)

    $darkText  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 24, 34, 52))
    $mutedText = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 92, 106, 128))
    $whiteText = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

    $g.DrawString("WinFinder Architecture", $titleFont, $darkText, 80, 108)
    $g.DrawString("Native Tauri v2 + Rust filesystem backend with React 19 Finder UI", $subFont, $mutedText, 82, 152)

    # 3 architectural pillar cards
    $cards = @(
        @{ X = 80;  Title = "React 19 UI";     Desc = "Icons, List, Columns,`nGallery & Tabs";       Color = [System.Drawing.Color]::FromArgb(255, 10, 132, 255) },
        @{ X = 326; Title = "Tauri v2 IPC";    Desc = "Async commands &`nAsset protocol";           Color = [System.Drawing.Color]::FromArgb(255, 88, 86, 214) },
        @{ X = 572; Title = "Rust Backend";    Desc = "Win32 shell, Search`n& Everything CLI";      Color = [System.Drawing.Color]::FromArgb(255, 48, 176, 112) }
    )
    foreach ($c in $cards) {
        $b = New-Object System.Drawing.SolidBrush($c.Color)
        $g.FillRectangle($b, $c.X, 206, 224, 156)
        $g.DrawString($c.Title, $boxTitle, $whiteText, ($c.X + 18), 228)
        $g.DrawString($c.Desc, $boxBody, $whiteText, ($c.X + 18), 268)
    }

    # Footer bar inside diagram
    $footBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 241, 245, 250))
    $g.FillRectangle($footBrush, 80, 392, 716, 66)
    $g.DrawString("Gallery View Inline Preview  |  PNG  •  Markdown  •  Syntax Highlighted Code  •  Text", $boxBody, $darkText, 104, 415)

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

function Seed-DemoWorkspace {
    $docsDir = [Environment]::GetFolderPath("MyDocuments")
    Write-Log "Seeding demo workspace in: $docsDir"

    # Clean existing items in Documents inside disposable sandbox
    Get-ChildItem -Path $docsDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    # Clean persisted WinFinder config so app starts fresh in Light mode
    $wfConfig = Join-Path $env:USERPROFILE ".winfinder"
    if (Test-Path $wfConfig) {
        Remove-Item -Path $wfConfig -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Subfolders for List expansion & Miller Columns
    $designDir = Join-Path $docsDir "Design Assets"
    $codeDir   = Join-Path $docsDir "Source Code"
    New-Item -ItemType Directory -Force -Path $designDir, $codeDir | Out-Null

    New-DemoDiagramPng -Path (Join-Path $designDir "hero-banner.png")
    Set-Content -Path (Join-Path $designDir "brand-palette.txt") -Value @"
WinFinder Color Tokens
----------------------
Accent Blue:   #0063E1 / #0A84FF
Sidebar Light: #ECECEF
Canvas Light:  #FFFFFF
Canvas Dark:   #1E1E1E
"@ -Encoding UTF8

    Set-Content -Path (Join-Path $codeDir "fileTree.ts") -Value @"
export interface TreeNode {
  name: string;
  path: string;
  expanded: boolean;
  children?: TreeNode[];
}

export function countNodes(nodes: TreeNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);
}
"@ -Encoding UTF8

    Set-Content -Path (Join-Path $codeDir "theme.css") -Value @"
:root[data-theme="dark"] {
  --bg-canvas: #1e1e1e;
  --bg-sidebar-start: #262628;
  --accent-blue: #0a84ff;
}
"@ -Encoding UTF8

    # Top-level files in Documents (ordered nicely for Gallery View previews)
    New-DemoDiagramPng -Path (Join-Path $docsDir "01-Architecture.png")

    Set-Content -Path (Join-Path $docsDir "02-README.md") -Value @"
# WinFinder

A macOS Finder-inspired desktop file manager for Windows, built with **Tauri v2**, **Rust**, and **React 19**.

## Highlights

- **Four View Modes:** Icons, expandable List, Miller Columns, and rich Gallery previews.
- **Multi-Tab Browsing:** Open folders in tabs with ``Ctrl+T`` or middle-click.
- **Fast Search:** Instant filename search with full **Path** column & Everything CLI support.
- **Light & Dark Themes:** Switch themes seamlessly from Settings.

``````rust
#[tauri::command]
pub fn list_directory(path: String) -> Result<DirectoryListing, String> {
    fs::read_entries(&path)
}
``````
"@ -Encoding UTF8

    Set-Content -Path (Join-Path $docsDir "03-explorer.ts") -Value @"
// WinFinder navigation controller
export interface DirectoryEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
}

export async function openFolder(path: string, inNewTab = false): Promise<DirectoryEntry[]> {
  const normalized = path.trim();
  if (!normalized) {
    throw new Error("Path cannot be empty");
  }
  const mode = inNewTab ? "tab" : "current";
  console.log("Opening", normalized, "in", mode);
  return [];
}
"@ -Encoding UTF8

    Set-Content -Path (Join-Path $docsDir "04-WinFinder.csproj") -Value @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0-windows</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <AssemblyName>WinFinder.ShellBridge</AssemblyName>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Windows.CsWin32" Version="0.3.106" />
    <PackageReference Include="System.Text.Json" Version="9.0.0" />
  </ItemGroup>
</Project>
"@ -Encoding UTF8

    Set-Content -Path (Join-Path $docsDir "05-Notes.txt") -Value @"
WinFinder Release Checklist
===========================

1. Verify Icons, List, Columns, and Gallery views.
2. Confirm inline previews for PNG, Markdown, TypeScript, XML, and plain text.
3. Test multi-tab browsing (Ctrl+T, tab switching, closing tabs).
4. Verify Search results show the Path column cleanly.
5. Check Settings dialog fixed size across General & Sidebar tabs.
6. Toggle Light / Dark mode and confirm crisp contrast everywhere.
"@ -Encoding UTF8

    # Send one file to the Recycle Bin so Trash view shows a real item
    $trashSample = Join-Path $env:TEMP "Old-Draft-Notes.txt"
    Set-Content -Path $trashSample -Value "Archived draft notes." -Encoding UTF8
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
        $trashSample,
        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )

    return $docsDir
}

$wfProc = $null
$ffmpegProc = $null

try {
    $docsDir = Seed-DemoWorkspace
    $exePath = Join-Path $WorkDir "winfinder.exe"
    $mp4Path = Join-Path $WorkDir "demo.mp4"

    if (-not (Test-Path $exePath)) { throw "winfinder.exe not found at $exePath" }
    if (-not (Test-Path $FfmpegPath)) { throw "ffmpeg.exe not found at $FfmpegPath" }

    Write-Log "Launching WinFinder at $docsDir ..."
    $wfProc = Start-Process -FilePath $exePath -ArgumentList "`"$docsDir`"" -WorkingDirectory $WorkDir -PassThru

    # Wait for the real visible WinFinder window (tauri.conf.json starts with visible: false)
    $hwnd = [IntPtr]::Zero
    for ($i = 0; $i -lt 120; $i++) {
        if ($wfProc.HasExited) {
            throw "WinFinder exited prematurely with code $($wfProc.ExitCode)."
        }
        $candidate = [DemoWin32]::FindVisibleMainWindow([uint32]$wfProc.Id)
        if ($candidate -ne [IntPtr]::Zero) {
            $hwnd = $candidate
            break
        }
        Start-Sleep -Milliseconds 250
    }
    if ($hwnd -eq [IntPtr]::Zero) {
        throw "Visible WinFinder window (>=600x400) did not appear within 30s."
    }

    # Wait for WebView2 initial render & UIA tree hydration
    Start-Sleep -Seconds 2
    [DemoWin32]::ShowWindow($hwnd, 9) | Out-Null
    [DemoWin32]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Milliseconds 800

    # Compute exact client area screen coordinates
    $clientRect = New-Object DemoWin32+RECT
    [DemoWin32]::GetClientRect($hwnd, [ref]$clientRect) | Out-Null
    $pt = New-Object DemoWin32+POINT
    $pt.X = 0
    $pt.Y = 0
    [DemoWin32]::ClientToScreen($hwnd, [ref]$pt) | Out-Null

    $capX = $pt.X
    $capY = $pt.Y
    $capW = $clientRect.Right - $clientRect.Left
    $capH = $clientRect.Bottom - $clientRect.Top
    # Ensure even dimensions for yuv420p / libx264
    if ($capW % 2 -ne 0) { $capW -= 1 }
    if ($capH % 2 -ne 0) { $capH -= 1 }
    Write-Log "WinFinder visible hwnd=$hwnd client area: X=$capX Y=$capY W=$capW H=$capH"
    if ($capW -lt 600 -or $capH -lt 400) {
        throw "Invalid WinFinder client area: ${capW}x${capH}"
    }

    $rootEl = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)

    # Park cursor near center-left before recording starts
    [DemoWin32]::SetCursorPos($capX + 360, $capY + 260) | Out-Null
    Start-Sleep -Milliseconds 250

    # Start ffmpeg gdigrab recording
    $ffmpegArgs = "-y -loglevel error -f gdigrab -framerate 15 -offset_x $capX -offset_y $capY -video_size ${capW}x${capH} -draw_mouse 1 -i desktop -c:v libx264 -preset ultrafast -crf 16 -pix_fmt yuv420p `"$mp4Path`""
    Write-Log "Starting ffmpeg: $ffmpegArgs"
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FfmpegPath
    $psi.Arguments = $ffmpegArgs
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardError = $false
    $psi.CreateNoWindow = $true
    $ffmpegProc = [System.Diagnostics.Process]::Start($psi)
    Start-Sleep -Milliseconds 700
    if ($ffmpegProc.HasExited) {
        throw "ffmpeg exited immediately (code $($ffmpegProc.ExitCode))."
    }

    # ============================================================
    # SCENE 1: Icons View + Inline Rename (F2)
    # ============================================================
    Write-Log "Scene 1: Icons View & Inline Rename"
    Start-Sleep -Milliseconds 900
    $clickedNotes = Click-UiaElement -Root $rootEl -NameContains "05-Notes.txt" -PauseAfterMs 450
    if ($clickedNotes) {
        [DemoWin32]::PressKey([DemoWin32]::VK_F2)
        Start-Sleep -Milliseconds 450
        [System.Windows.Forms.SendKeys]::SendWait("05-Release-Notes")
        Start-Sleep -Milliseconds 450
        [DemoWin32]::PressKey([DemoWin32]::VK_RETURN)
        Start-Sleep -Milliseconds 950
    }

    # ============================================================
    # SCENE 2: List View + Expandable Folder
    # ============================================================
    Write-Log "Scene 2: List View & Expandable Folder"
    Click-UiaElement -Root $rootEl -Name "List view" -PauseAfterMs 700 | Out-Null
    # Click the disclosure arrow button to expand Design Assets
    $expanded = Click-UiaElement -Root $rootEl -NameContains "Expand Design Assets" -PauseAfterMs 1100
    if (-not $expanded) {
        $expanded = Click-UiaElement -Root $rootEl -NameContains "Expand" -ControlType ([System.Windows.Automation.ControlType]::Button) -PauseAfterMs 1100
    }

    # ============================================================
    # SCENE 3: Miller Columns View
    # ============================================================
    Write-Log "Scene 3: Miller Columns View"
    Click-UiaElement -Root $rootEl -Name "Columns view" -PauseAfterMs 700 | Out-Null
    Click-UiaElement -Root $rootEl -NameContains "Source Code" -PauseAfterMs 1150 | Out-Null

    # ============================================================
    # SCENE 4: Gallery View Rich Previews (PNG, Markdown, TS, csproj, TXT)
    # ============================================================
    Write-Log "Scene 4: Gallery View Rich Previews"
    Click-UiaElement -Root $rootEl -Name "Gallery view" -PauseAfterMs 650 | Out-Null

    Click-UiaElement -Root $rootEl -NameContains "01-Architecture.png" -PauseAfterMs 1350 | Out-Null
    Click-UiaElement -Root $rootEl -NameContains "02-README.md" -PauseAfterMs 1450 | Out-Null
    Click-UiaElement -Root $rootEl -NameContains "03-explorer.ts" -PauseAfterMs 1350 | Out-Null
    Click-UiaElement -Root $rootEl -NameContains "04-WinFinder.csproj" -PauseAfterMs 1250 | Out-Null
    Click-UiaElement -Root $rootEl -NameContains "05-Release-Notes.txt" -PauseAfterMs 1100 | Out-Null

    # Switch back to List view briefly before tabs/search so the view is crisp
    Click-UiaElement -Root $rootEl -Name "Icons view" -PauseAfterMs 400 | Out-Null

    # ============================================================
    # SCENE 5: Multi-Tab Browsing & Trash Sidebar Navigation
    # ============================================================
    Write-Log "Scene 5: Multi-Tab Browsing & Trash"
    [DemoWin32]::PressCtrlKey([DemoWin32]::VK_T)
    Start-Sleep -Milliseconds 650
    Click-UiaElement -Root $rootEl -Name "Trash" -PauseAfterMs 1150 | Out-Null
    # Switch back to first tab (Documents) via Ctrl+Tab
    [DemoWin32]::PressCtrlKey([DemoWin32]::VK_TAB)
    Start-Sleep -Milliseconds 800

    # ============================================================
    # SCENE 6: Search with Path Column (in List View)
    # ============================================================
    Write-Log "Scene 6: Search with Path Column"
    Click-UiaElement -Root $rootEl -Name "List view" -PauseAfterMs 350 | Out-Null
    $clickedSearch = Click-UiaElement -Root $rootEl -Name "Search" -PauseAfterMs 300
    if (-not $clickedSearch) {
        [DemoWin32]::PressCtrlKey([DemoWin32]::VK_F)
        Start-Sleep -Milliseconds 300
    }
    [System.Windows.Forms.SendKeys]::SendWait(".ts")
    Start-Sleep -Milliseconds 300
    [DemoWin32]::PressKey([DemoWin32]::VK_RETURN)
    # Wait until search results actually render (with Path column) before holding
    $foundSearchResult = Find-UiaElement -Root $rootEl -NameContains "fileTree.ts" -TimeoutMs 10000
    if ($foundSearchResult) {
        Write-Log "Search results rendered (found fileTree.ts)"
        Start-Sleep -Milliseconds 1800
    } else {
        Write-Log "WARN: Search result fileTree.ts did not appear within 10s"
        Start-Sleep -Milliseconds 1200
    }
    [DemoWin32]::PressKey([DemoWin32]::VK_ESCAPE)
    Start-Sleep -Milliseconds 450

    # ============================================================
    # SCENE 7: Settings Dialog via "..." Actions Menu, Fixed Size & Dark Mode
    # ============================================================
    Write-Log "Scene 7: Settings Dialog & Dark Mode"
    Click-UiaElement -Root $rootEl -Name "More actions" -PauseAfterMs 650 | Out-Null
    Click-UiaElement -Root $rootEl -NameContains "Settings" -PauseAfterMs 1000 | Out-Null

    # Switch to Sidebar tab to show fixed dialog size & visibility toggles
    Click-UiaElement -Root $rootEl -Name "Sidebar" -ControlType ([System.Windows.Automation.ControlType]::TabItem) -PauseAfterMs 1100 | Out-Null

    # Switch back to General tab
    Click-UiaElement -Root $rootEl -Name "General" -ControlType ([System.Windows.Automation.ControlType]::TabItem) -PauseAfterMs 600 | Out-Null

    # Toggle Dark mode
    Click-UiaElement -Root $rootEl -Name "Dark" -PauseAfterMs 1100 | Out-Null

    # Close Settings to show WinFinder in Dark mode
    Click-UiaElement -Root $rootEl -Name "Done" -PauseAfterMs 700 | Out-Null

    # Show Gallery view with syntax-highlighted code in Dark mode as the finale!
    Click-UiaElement -Root $rootEl -Name "Gallery view" -PauseAfterMs 500 | Out-Null
    Click-UiaElement -Root $rootEl -NameContains "03-explorer.ts" -PauseAfterMs 1400 | Out-Null

    Write-Log "Tour complete. Stopping ffmpeg cleanly..."
    if ($ffmpegProc -and -not $ffmpegProc.HasExited) {
        $ffmpegProc.StandardInput.WriteLine("q")
        $ffmpegProc.StandardInput.Flush()
        if (-not $ffmpegProc.WaitForExit(10000)) {
            $ffmpegProc.Kill()
        }
    }

    if (-not (Test-Path $mp4Path)) {
        throw "Recorded MP4 was not created at $mp4Path"
    }
    $mp4Size = (Get-Item $mp4Path).Length
    Write-Log "Recorded MP4 successfully: $mp4Path ($mp4Size bytes)"
    Set-Content -Path $statusFile -Value "0" -Encoding ASCII
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    Write-Log "$($_.ScriptStackTrace)"
    Set-Content -Path $statusFile -Value "1" -Encoding ASCII
    throw
} finally {
    if ($ffmpegProc -and -not $ffmpegProc.HasExited) {
        try { $ffmpegProc.Kill() } catch {}
    }
    if ($wfProc -and -not $wfProc.HasExited) {
        try { $wfProc.CloseMainWindow() | Out-Null; Start-Sleep -Milliseconds 400 } catch {}
        if (-not $wfProc.HasExited) {
            try { $wfProc.Kill() } catch {}
        }
    }
}

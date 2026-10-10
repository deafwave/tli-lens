# Drive Torchlight: Infinite. Coordinates are game-window pixels (the client is 3440x1440 here).
#   game.ps1 shot  <out.png> [x y w h] [scale]   screenshot of the window (or a window-relative crop)
#   game.ps1 key   <K> [K...]                    scancode key presses (ESC B I TAB ENTER SPACE A-Z 0-9)
#   game.ps1 click <x> <y>                       left click
#   game.ps1 move  <x> <y>                       hover (tooltips)
#   game.ps1 wheel <x> <y> <notches>             mouse wheel, negative = down
# The game ignores SendInput mouse clicks and VK-only keys: clicks use legacy mouse_event, keys use scancodes.
param([Parameter(Position = 0)][string]$cmd, [Parameter(Position = 1, ValueFromRemainingArguments)][string[]]$rest)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class TG {
  public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct KI { public ushort vk, scan; public uint flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUT { [FieldOffset(0)] public uint type; [FieldOffset(8)] public KI k; [FieldOffset(8)] public long pad1; [FieldOffset(16)] public long pad2; [FieldOffset(24)] public long pad3; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int x, int y, int d, IntPtr e);
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] i, int size);
  public static void Key(ushort scan, bool up) { var i = new INPUT[1]; i[0].type = 1; i[0].k.scan = scan; i[0].k.flags = 8u | (up ? 2u : 0u); SendInput(1, i, Marshal.SizeOf(typeof(INPUT))); }
}
'@
$p = Get-Process -Name torchlight_infinite -ErrorAction Stop | Select-Object -First 1
$r = New-Object TG+RECT; [TG]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
function Focus { [TG]::SetForegroundWindow($p.MainWindowHandle) | Out-Null; Start-Sleep -Milliseconds 250 }
function Point([int]$x, [int]$y) { Focus; [TG]::SetCursorPos($r.L + $x - 10, $r.T + $y) | Out-Null; Start-Sleep -Milliseconds 100
  [TG]::SetCursorPos($r.L + $x, $r.T + $y) | Out-Null; Start-Sleep -Milliseconds 150 }
$scan = @{ ESC = 1; TAB = 15; ENTER = 28; SPACE = 57; Q = 16; W = 17; E = 18; R = 19; T = 20; Y = 21; U = 22; I = 23; O = 24; P = 25
  A = 30; S = 31; D = 32; F = 33; G = 34; H = 35; J = 36; K = 37; L = 38; Z = 44; X = 45; C = 46; V = 47; B = 48; N = 49; M = 50 }
1..9 | ForEach-Object { $scan["$_"] = $_ + 1 }; $scan['0'] = 11

switch ($cmd) {
  'shot' {
    $out = $rest[0]
    $x = 0; $y = 0; $w = $r.R - $r.L; $h = $r.B - $r.T; $scale = 0.5
    if ($rest.Count -ge 5) { $x = [int]$rest[1]; $y = [int]$rest[2]; $w = [int]$rest[3]; $h = [int]$rest[4] }
    if ($rest.Count -ge 6) { $scale = [double]$rest[5] }
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($r.L + $x, $r.T + $y, 0, 0, $bmp.Size)
    $small = New-Object System.Drawing.Bitmap ([int]($w * $scale)), ([int]($h * $scale))
    $g = [System.Drawing.Graphics]::FromImage($small); $g.InterpolationMode = 'HighQualityBicubic'
    $g.DrawImage($bmp, 0, 0, $small.Width, $small.Height); $small.Save($out)
    "saved $out ($($small.Width)x$($small.Height), window $($r.R - $r.L)x$($r.B - $r.T), crop $x,$y $($w)x$h, scale $scale)"
  }
  'key' { Focus; foreach ($k in $rest) { $s = [uint16]$scan[$k.ToUpper()]; if (!$s) { throw "unknown key $k" }
      [TG]::Key($s, $false); Start-Sleep -Milliseconds 200; [TG]::Key($s, $true); Start-Sleep -Milliseconds 500 } }
  'click' { Point $rest[0] $rest[1]; [TG]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 150
    [TG]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 700 }
  'move' { Point $rest[0] $rest[1]; Start-Sleep -Milliseconds 500 }
  'wheel' { Point $rest[0] $rest[1]; $n = [int]$rest[2]
    for ($i = 0; $i -lt [math]::Abs($n); $i++) { [TG]::mouse_event(0x800, 0, 0, [math]::Sign($n) * 120, [IntPtr]::Zero); Start-Sleep -Milliseconds 200 }
    Start-Sleep -Milliseconds 400 }
  'measure' {
    # measure <out.png> [seconds=32] [key every-N-seconds, e.g. SPACE 4]: Recount on the dummy panel, wait, shoot the panel
    $out = $rest[0]; $secs = if ($rest.Count -ge 2) { [int]$rest[1] } else { 32 }
    $k = if ($rest.Count -ge 4) { [uint16]$scan[$rest[2].ToUpper()] } else { 0 }; $every = if ($rest.Count -ge 4) { [double]$rest[3] } else { 0 }
    # the Recount button is blue when idle and grey ("Stop recounting") while counting: stop first if needed
    $px = New-Object System.Drawing.Bitmap 1, 1
    function Idle { [System.Drawing.Graphics]::FromImage($px).CopyFromScreen($r.L + 415, $r.T + 545, 0, 0, $px.Size)
      $c = $px.GetPixel(0, 0); $c.B -gt $c.R + 60 }
    function Press { Point 308 545; [TG]::mouse_event(2, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 150
      [TG]::mouse_event(4, 0, 0, 0, [IntPtr]::Zero); Start-Sleep -Milliseconds 1200 }
    for ($i = 0; $i -lt 3 -and -not (Idle); $i++) { Press }
    if (-not (Idle)) { throw "could not stop the running count" }
    for ($i = 0; $i -lt 3 -and (Idle); $i++) { Press }
    if (Idle) { throw "could not start a count" }
    # park the cursor on the character (screen centre-ish) so Blink-type keys stay in place
    [TG]::SetCursorPos($r.L + 1720, $r.T + 680) | Out-Null
    $t0 = Get-Date; $next = $every
    while (((Get-Date) - $t0).TotalSeconds -lt $secs) {
      if ($k -and ((Get-Date) - $t0).TotalSeconds -ge $next) { [TG]::Key($k, $false); Start-Sleep -Milliseconds 60; [TG]::Key($k, $true); $next += $every }
      Start-Sleep -Milliseconds 200
    }
    $bmp = New-Object System.Drawing.Bitmap 680, 440
    [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($r.L, $r.T + 140, 0, 0, $bmp.Size); $bmp.Save($out)
    "measured $secs s -> $out"
  }
  'burst' {
    # burst <out.png> <frames> <interval-ms> <x y w h> [cols=6] [scale=0.5]: timestamped contact sheet (count throws/ticks)
    $out = $rest[0]; $n = [int]$rest[1]; $ms = [int]$rest[2]
    $x = [int]$rest[3]; $y = [int]$rest[4]; $w = [int]$rest[5]; $h = [int]$rest[6]
    $cols = if ($rest.Count -ge 8) { [int]$rest[7] } else { 6 }; $scale = if ($rest.Count -ge 9) { [double]$rest[8] } else { 0.5 }
    $tw = [int]($w * $scale); $th = [int]($h * $scale); $rows = [math]::Ceiling($n / $cols)
    $sheet = New-Object System.Drawing.Bitmap ($tw * $cols), ($th * $rows); $sg = [System.Drawing.Graphics]::FromImage($sheet)
    $frame = New-Object System.Drawing.Bitmap $w, $h; $fg = [System.Drawing.Graphics]::FromImage($frame)
    $font = New-Object System.Drawing.Font 'Arial', 14; $sw = [Diagnostics.Stopwatch]::StartNew()
    for ($i = 0; $i -lt $n; $i++) {
      $t = $sw.ElapsedMilliseconds
      $fg.CopyFromScreen($r.L + $x, $r.T + $y, 0, 0, $frame.Size)
      $sg.DrawImage($frame, ($i % $cols) * $tw, [math]::Floor($i / $cols) * $th, $tw, $th)
      $sg.DrawString("$t", $font, [System.Drawing.Brushes]::Yellow, ($i % $cols) * $tw + 4, [math]::Floor($i / $cols) * $th + 4)
      $wait = ($i + 1) * $ms - $sw.ElapsedMilliseconds; if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
    }
    $sheet.Save($out); "burst $n frames over $($sw.ElapsedMilliseconds) ms -> $out"
  }
  default { throw "usage: game.ps1 shot|key|click|move|wheel|measure|burst ..." }
}

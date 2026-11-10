param([string]$Output = "desktop-native-check.png")
# Read-only native smoke check: captures only the overlay window's bounds.
Add-Type -AssemblyName System.Drawing
if (-not ("PresenceCheck" -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class PresenceCheck {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int n);
}
'@
}
$p = Get-Process -Name agent-presence -ErrorAction Stop | Select-Object -First 1
$r = New-Object PresenceCheck+RECT
if (-not [PresenceCheck]::GetWindowRect($p.MainWindowHandle,[ref]$r)) { throw "Overlay window unavailable" }
$bmp = New-Object System.Drawing.Bitmap (($r.R-$r.L),($r.B-$r.T))
$g = [System.Drawing.Graphics]::FromImage($bmp)
try { $g.CopyFromScreen($r.L,$r.T,0,0,$bmp.Size); $bmp.Save([System.IO.Path]::GetFullPath($Output)) }
finally { $g.Dispose(); $bmp.Dispose() }
$ex = [PresenceCheck]::GetWindowLongPtr($p.MainWindowHandle,-20).ToInt64()
[pscustomobject]@{ Process = $p.Id; Responding = $p.Responding; Title = $p.MainWindowTitle; X = $r.L; Y = $r.T; Width = $r.R-$r.L; Height = $r.B-$r.T; Topmost = [bool]($ex -band 8); ToolWindow = [bool]($ex -band 128); Layered = [bool]($ex -band 524288); ClickThroughNow = [bool]($ex -band 32); Screenshot = $Output } | ConvertTo-Json

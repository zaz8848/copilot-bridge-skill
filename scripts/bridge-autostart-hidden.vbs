' bridge-autostart-hidden.vbs
' Wraps bridge-autostart.ps1 with WScript.Shell.Run windowStyle=0 (truly hidden),
' so the scheduled task does not show a PowerShell console on the user's desktop.
'
' Invoked by scheduled task CopilotBridgeCore.
' Resolves bridge-autostart.ps1 as a sibling file in the same scripts/ folder.

Dim shell, fso, scriptDir, psScript, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
psScript = fso.BuildPath(scriptDir, "bridge-autostart.ps1")

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """"
' 0 = hidden window, True = wait for completion (so the task keeps the wrapper alive)
shell.Run cmd, 0, True

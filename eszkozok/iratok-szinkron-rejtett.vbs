' IngatlanPro iratok szinkron - ablak nelkul (a Feladatutemezo ezt inditja)
Set sh = CreateObject("WScript.Shell")
mappa = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c node """ & mappa & "\iratok-szinkron.js""", 0, False

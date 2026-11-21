; Inno Setup script for the offline Tidal Studio installer (built by packaging/windows/build.sh).
; Installs everything into C:\TidalStudio (fixed: GHC and Cabal store absolute paths) and adds
; Start menu and desktop shortcuts that open the studio in its own window, with no console.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F1C2B0E-6C4B-4C7E-9B55-7A1D2E3F4A51}
AppName=Tidal Studio
AppVersion={#AppVersion}
AppVerName=Tidal Studio {#AppVersion}
AppPublisher=Tidal Studio
AppPublisherURL=https://vsalesa.github.io/tidal-studio/
DefaultDirName=C:\TidalStudio
DisableDirPage=yes
DefaultGroupName=Tidal Studio
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutDir}
OutputBaseFilename=TidalStudio-{#AppVersion}-Windows-x64-Setup
SetupIconFile={#SourceDir}\bin\TidalStudio.ico
UninstallDisplayIcon={app}\bin\TidalStudio.ico
Compression=lzma2/fast
SolidCompression=no
LZMAUseSeparateProcess=yes
DiskSpanning=no
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Tidal Studio"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\bin\launcher.py"""; WorkingDir: "{app}"; IconFilename: "{app}\bin\TidalStudio.ico"; Comment: "Tidal Studio"
Name: "{autodesktop}\Tidal Studio"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\bin\launcher.py"""; WorkingDir: "{app}"; IconFilename: "{app}\bin\TidalStudio.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\bin\launcher.py"""; Description: "{cm:LaunchProgram,Tidal Studio}"; Flags: nowait postinstall skipifsilent unchecked

[UninstallDelete]
Type: filesandordirs; Name: "{app}\app"

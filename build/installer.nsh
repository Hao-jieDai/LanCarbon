!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER

Var LanCarbonRootLabel
Var LanCarbonRootInput
Var LanCarbonRootBrowseButton

Function LanCarbonChooseRoot
  ${NSD_GetText} $LanCarbonRootInput $0
  nsDialogs::SelectFolderDialog "Choose the LanCarbon folder" "$0"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $LanCarbonRootInput "$0"
  ${EndIf}
FunctionEnd

Function LanCarbonDirectoryIsEmpty
  Exch $0
  Push $1
  Push $2
  StrCpy $2 "1"
  IfFileExists "$0\*.*" 0 done
  FindFirst $1 $0 "$0\*.*"
  loop:
    StrCmp $0 "" close
    StrCmp $0 "." next
    StrCmp $0 ".." next
    StrCpy $2 "0"
    Goto close
  next:
    FindNext $1 $0
    Goto loop
  close:
    FindClose $1
  done:
    StrCpy $0 $2
    Pop $2
    Pop $1
    Exch $0
FunctionEnd

Function LanCarbonRootPage
  StrCpy $2 ""
  StrCpy $3 ""
  ReadRegStr $2 HKCU "Software\${APP_GUID}" InstallLocation
  ReadRegStr $3 HKLM "Software\${APP_GUID}" InstallLocation
  StrCmp "$INSTDIR" "$2" root_path_ready
  StrCmp "$INSTDIR" "$3" root_path_ready

  StrCmp "$INSTDIR" "$LOCALAPPDATA\Programs\${APP_FILENAME}" use_lancarbon_default
  StrCmp "$INSTDIR" "$PROGRAMFILES\${APP_FILENAME}" use_lancarbon_default
  StrCmp "$INSTDIR" "$PROGRAMFILES64\${APP_FILENAME}" use_lancarbon_default
  Goto root_path_ready

  use_lancarbon_default:
    IfFileExists "D:\*.*" 0 no_d_drive_for_page
      StrCpy $INSTDIR "D:\LanCarbon"
      Goto root_path_ready
    no_d_drive_for_page:
      StrCpy $INSTDIR "$LOCALAPPDATA\LanCarbon"

  root_path_ready:
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 == "Application"
    ${GetParent} "$INSTDIR" $INSTDIR
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 42u "Choose LanCarbon's home folder. Its final name must be LanCarbon and it must be empty for a first installation."
  Pop $LanCarbonRootLabel
  ${NSD_CreateText} 0 52u 78% 14u "$INSTDIR"
  Pop $LanCarbonRootInput
  ${NSD_CreateBrowseButton} 80% 51u 20% 16u "Browse..."
  Pop $LanCarbonRootBrowseButton
  ${NSD_OnClick} $LanCarbonRootBrowseButton LanCarbonChooseRoot
  ${NSD_CreateLabel} 0 78u 100% 52u "LanCarbon creates Application, Data, Config, Cache, Temp, Builds, Exports and Tools inside this folder. Existing LanCarbon Data is accepted for migration."
  Pop $LanCarbonRootLabel
  nsDialogs::Show
FunctionEnd

Function LanCarbonRootLeave
  ${NSD_GetText} $LanCarbonRootInput $INSTDIR
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "LanCarbon"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Choose a folder whose final name is LanCarbon."
    Abort
  ${EndIf}
  Push "$INSTDIR"
  Call LanCarbonDirectoryIsEmpty
  Pop $0
  ${If} $0 != "1"
    IfFileExists "$INSTDIR\Data\notes.json" valid_existing
    IfFileExists "$INSTDIR\Application\LanCarbon.exe" valid_existing
    MessageBox MB_OK|MB_ICONEXCLAMATION "This folder is not empty and does not contain recognizable LanCarbon data. Choose an empty LanCarbon folder."
    Abort
  ${EndIf}
  valid_existing:
  StrCpy $INSTDIR "$INSTDIR\Application"
FunctionEnd

!macro customInit
  !insertmacro GetDParameter $1
  ${If} $1 != ""
    StrCpy $INSTDIR "$1"
  ${Else}
    ${GetFileName} "$INSTDIR" $0
    ${If} $0 != "Application"
      IfFileExists "D:\*.*" 0 no_d_drive
        StrCpy $INSTDIR "D:\LanCarbon"
        Goto root_selected
      no_d_drive:
        StrCpy $INSTDIR "$LOCALAPPDATA\LanCarbon"
      root_selected:
    ${EndIf}
  ${EndIf}
  ${If} ${Silent}
    ${GetFileName} "$INSTDIR" $0
    ${If} $0 != "Application"
      StrCpy $INSTDIR "$INSTDIR\Application"
    ${EndIf}
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom LanCarbonRootPage LanCarbonRootLeave
!macroend

!macro customInstall
  CreateDirectory "$INSTDIR\..\Data"
  CreateDirectory "$INSTDIR\..\Config"
  CreateDirectory "$INSTDIR\..\Cache"
  CreateDirectory "$INSTDIR\..\Temp"
  CreateDirectory "$INSTDIR\..\Builds"
  CreateDirectory "$INSTDIR\..\Exports"
  CreateDirectory "$INSTDIR\..\Tools"
!macroend

!endif

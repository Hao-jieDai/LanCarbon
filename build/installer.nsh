!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER

Var LanCarbonRootLabel

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
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 == "Application"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 58u "LanCarbon will use the selected folder as its home. The folder name must be LanCarbon and it must be empty for a first installation. Application, Data, Config, Cache, Temp, Builds and Exports will be created inside it. Existing LanCarbon Data is accepted for migration."
  Pop $LanCarbonRootLabel
  ${NSD_CreateLabel} 0 68u 100% 32u "Program location:$\r$\n$INSTDIR\Application"
  Pop $LanCarbonRootLabel
  nsDialogs::Show
FunctionEnd

Function LanCarbonRootLeave
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
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "Application"
    IfFileExists "D:\*.*" 0 no_d_drive
      StrCpy $INSTDIR "D:\LanCarbon"
      Goto root_selected
    no_d_drive:
      StrCpy $INSTDIR "$LOCALAPPDATA\LanCarbon"
    root_selected:
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
!macroend

!endif

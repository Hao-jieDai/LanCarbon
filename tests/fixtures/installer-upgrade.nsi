Unicode true
RequestExecutionLevel user
SilentInstall silent
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!define APP_EXECUTABLE_FILENAME "LanCarbon.exe"
!include "..\..\build\upgrade-in-place.nsh"
Var installationDir
OutFile "${TEST_OUTPUT}"
Function TryUpgrade
  !insertmacro LanCarbonTryInPlaceUpgrade
  FileOpen $0 "$INSTDIR\old-uninstaller-was-called" w
  FileClose $0
FunctionEnd
Section
  StrCpy $INSTDIR "${TEST_TARGET}"
  StrCpy $installationDir "${TEST_REGISTERED}"
  Call TryUpgrade
SectionEnd

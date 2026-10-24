Unicode true
RequestExecutionLevel user
SilentInstall silent
!define BUILD_UNINSTALLER
!include "..\..\build\installer.nsh"
OutFile "${TEST_OUTPUT}"
Section
  StrCpy $INSTDIR "${TEST_TARGET}"
  !insertmacro customRemoveFiles
SectionEnd

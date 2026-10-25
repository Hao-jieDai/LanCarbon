; Same-location upgrades must not run legacy uninstallers that rename the
; Application directory: Windows link tracking can move pinned targets with it.
; New installations and moves to another location retain electron-builder's path.
!macro LanCarbonTryInPlaceUpgrade
  ${If} $installationDir == $INSTDIR
    ${GetFileName} "$INSTDIR" $R8
    ${If} $R8 == "Application"
      IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 lancarbon_upgrade_done
      ; Only the bundled Python runtime needs stale-file cleanup. Never rename
      ; Application or its executable, and never touch sibling user directories.
      ClearErrors
      RMDir /r "$INSTDIR\resources\paperqa-runtime"
      ${If} ${Errors}
        Abort "Cannot replace the bundled runtime. Close LanCarbon and try again."
      ${EndIf}
      ClearErrors
      StrCpy $R0 0
      Return
    ${EndIf}
  ${EndIf}
  lancarbon_upgrade_done:
!macroend
